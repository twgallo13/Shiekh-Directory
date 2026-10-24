import type { Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import type { AuditLogEntry } from '../src/types';
import { assertPersonTransitionActor as actorGate, readPersonTransitionAuthority as authority } from './personTransitionAuthority';
import type { PersonTransitionReviewSigner } from './personTransitionReviewEnvelope';
import {
  TRANSITION_OPERATION_COLLECTION, assertTransitionReviewMatches, cancelledTransitionReceipt, newPreparedTransitionReceipt,
  normalizeTransitionPreparation, readTransitionReceipt, storedTransitionReview,
  transitionOperationIdentity, transitionOperationKey, transitionRecoveryOutcome,
  type TransitionOperationIdentity, type TransitionOperationReceipt,
} from './personTransitionOperation';

function now(clock: () => Date) {
  const value = clock().getTime();
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Transition recovery clock is unavailable.');
  return value;
}
async function receipt(firestore: Firestore, transaction: Transaction, identity: TransitionOperationIdentity) {
  const reference = firestore.collection(TRANSITION_OPERATION_COLLECTION).doc(transitionOperationKey(identity));
  const doc = await transaction.get(reference);
  if (doc.ref.path !== reference.path) throw new Error('Invalid transition receipt source.');
  return { reference, current: doc.exists ? readTransitionReceipt(doc.data(), identity) : null };
}

/** Internal recovery behind separate disabled-by-default Store/HTTP gates.
 * Callers MUST authenticate the Firebase session first. These transactional checks do not
 * replace token verification. Only minimal recovery metadata can be changed here.
 */
export async function preparePersonTransitionRecovery(firestore: Firestore, raw: unknown, actor: Account, signer: PersonTransitionReviewSigner | undefined, clock = () => new Date()) {
  actorGate(actor);
  const command = normalizeTransitionPreparation(raw, actor.uid);
  if (!signer) throw new Error('Transition review signing is unavailable.');
  const expected = { actorUid: actor.uid, personId: command.identity.personId, intentHash: command.intentHash };
  // Binding is checked even for terminal replay, which may legitimately outlive preview expiry.
  const claims = signer.verifySignature(command.reviewEnvelope, expected);
  const review = storedTransitionReview(claims, command.envelopeHash);
  return firestore.runTransaction(async transaction => {
    await authority(firestore, transaction, actor);
    const { reference, current } = await receipt(firestore, transaction, command.identity);
    if (current?.state === 'cancelled') throw new Error('Transition operation was cancelled.');
    if (current) assertTransitionReviewMatches(current, review);
    if (current?.state === 'committed') return transitionRecoveryOutcome(command.identity, current);
    const timestamp = now(clock);
    if (timestamp < claims.issuedAt) throw new Error('Transition review is not yet valid.');
    signer.verify(command.reviewEnvelope, expected, timestamp);
    if (current) return transitionRecoveryOutcome(command.identity, current);
    const prepared = newPreparedTransitionReceipt(command.identity, review, timestamp);
    transaction.create(reference, prepared);
    return transitionRecoveryOutcome(command.identity, prepared);
  });
}

/** Status requires current actor authority and immutable marker identity, not the original key/token. */
export async function readPersonTransitionRecovery(firestore: Firestore, marker: unknown, actor: Account) {
  actorGate(actor); const identity = transitionOperationIdentity(marker, actor.uid);
  return firestore.runTransaction(async transaction => {
    await authority(firestore, transaction, actor);
    return transitionRecoveryOutcome(identity, (await receipt(firestore, transaction, identity)).current);
  }, { readOnly: true });
}

/** Seal absent/prepared operations against late prepare. Never undo or overwrite a terminal outcome. */
export async function cancelPersonTransitionRecovery(firestore: Firestore, marker: unknown, actor: Account, clock = () => new Date()) {
  actorGate(actor); const identity = transitionOperationIdentity(marker, actor.uid);
  return firestore.runTransaction(async transaction => {
    await authority(firestore, transaction, actor);
    const { reference, current } = await receipt(firestore, transaction, identity);
    if (current?.state === 'committed' || current?.state === 'cancelled') return transitionRecoveryOutcome(identity, current);
    const cancelled = cancelledTransitionReceipt(identity, current, now(clock));
    // One create-only deterministic audit and receipt mutation in the same SDK transaction.
    // No raw command, token, reason, private contact or before/after document is persisted.
    const audit = {
      id: cancelled.auditId, timestamp: new Date(cancelled.updatedAt).toISOString(), userId: actor.uid,
      userName: actor.name, action: 'Person Transition Submission Cancelled', entityType: 'Person', entityId: identity.personId,
      entityName: 'Unconfirmed Person transition',
      operationId: identity.operationId, commandDigest: identity.commandDigest,
      details: 'Uncommitted Directory transition sealed against late preparation; no staffing or external access change.',
    } satisfies AuditLogEntry & { operationId: string; commandDigest: string };
    transaction.create(firestore.collection('audit_logs').doc(cancelled.auditId!), audit);
    if (current) transaction.update(reference, { state: cancelled.state, updatedAt: cancelled.updatedAt, auditId: cancelled.auditId });
    else transaction.create(reference, cancelled);
    return transitionRecoveryOutcome(identity, cancelled);
  });
}

/** Own unresolved preparations only. Overflow is an error, never a truncated recovery list. */
export async function listPersonTransitionPreparations(firestore: Firestore, actor: Account) {
  actorGate(actor);
  return firestore.runTransaction(async transaction => {
    await authority(firestore, transaction, actor);
    const rows = await transaction.get(firestore.collection(TRANSITION_OPERATION_COLLECTION).where('actorUid', '==', actor.uid).where('state', '==', 'prepared').limit(51));
    if (rows.size > 50) throw new Error('Transition recovery inventory capacity exceeded.');
    const found = new Set<string>();
    const operations = rows.docs.map(doc => {
      const value = doc.data();
      const identity = transitionOperationIdentity({ schemaVersion: value.schemaVersion, operationId: value.operationId, personId: value.personId, commandDigest: value.commandDigest }, actor.uid);
      const key = transitionOperationKey(identity);
      if (found.has(key) || doc.id !== key || doc.ref.path !== `${TRANSITION_OPERATION_COLLECTION}/${key}`) throw new Error('Invalid transition recovery inventory.');
      found.add(key);
      const stored: TransitionOperationReceipt = readTransitionReceipt(value, identity);
      if (stored.state !== 'prepared') throw new Error('Invalid transition recovery state.');
      return transitionRecoveryOutcome(identity, stored);
    }).sort((a, b) => a.operationId.localeCompare(b.operationId));
    return { schemaVersion: 1 as const, operations, complete: true as const, canCommit: false as const };
  }, { readOnly: true });
}
