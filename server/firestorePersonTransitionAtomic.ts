import { DocumentReference, GeoPoint, Timestamp, type Firestore } from '@google-cloud/firestore';
import { isDeepStrictEqual } from 'node:util';
import type { Account } from './authAuthority';
import type { AuditLogEntry } from '../src/types';
import { DirectoryConflict } from './firestoreDirectory';
import { LEADERSHIP_POSITION_FIELDS } from '../src/lib/personPositions';
import { object } from './personTransitionIntent';
import { assertPersonTransitionActor, readPersonTransitionAuthority } from './personTransitionAuthority';
import { readPersonTransitionCommandPlan } from './personTransitionCommandPreview';
import type { PersonTransitionReviewSigner } from './personTransitionReviewEnvelope';
import { conservativeDocumentBytes } from './conservativeDocumentSize';
import {
  TRANSITION_OPERATION_COLLECTION, normalizeTransitionPreparation, readTransitionReceipt, assertTransitionReviewMatches,
  storedTransitionReview, transitionOperationKey, transitionCommitAuditId, transitionRecoveryOutcome,
} from './personTransitionOperation';

const allowed = {
  people: new Set(['positionIds', 'status', 'activeStatus', 'primaryLocationId', 'supportedLocationIds']),
  districts: new Set(['districtManagerId']),
  locations: new Set([...Object.keys(LEADERSHIP_POSITION_FIELDS), 'storeManagerName', 'districtManagerName', 'regionalManagerName', 'assistantStoreManagerNames', 'keyHolderNames', 'storeManagerPhone', 'storeManagerPhonePrivacy']),
};
/** Conservatively size full saved documents without serializing private data into audits/logs.
 * Common native Firestore values are retained; unsupported values fail closed, never dropped.
 */
function savedBytes(value: unknown, depth = 0): number {
  if (depth > 100) throw new Error('Transition document capacity is unavailable.');
  if (typeof value === 'string') return Buffer.byteLength(value) + 32;
  if (value === null || ['number', 'boolean', 'bigint'].includes(typeof value)) return 32;
  if (value instanceof Timestamp || value instanceof GeoPoint || value instanceof Date) return 64;
  if (value instanceof Uint8Array) return value.byteLength + 64;
  if (value instanceof DocumentReference) return Buffer.byteLength(value.path) + 512;
  if (Array.isArray(value)) return 32 + value.reduce((size, item) => size + 32 + savedBytes(item, depth + 1), 0);
  if (object(value)) return 32 + Object.entries(value).reduce((size, [key, item]) => size + Buffer.byteLength(key) + 32 + savedBytes(item, depth + 1), 0);
  throw new Error('Unsupported saved transition document value.');
}

/** Unwired internal writer. No route or DirectoryStore method invokes this module.
 * Future HTTP callers MUST authenticate Firebase before calling it. No arbitrary patches/paths,
 * account/provider calls or generic/District-only guard bypass. All business writes are derived
 * from the fixed intent and fresh coherent plan, and occur with audit + receipt in one transaction.
 */
export async function commitPersonTransitionAtomic(firestore: Firestore, raw: unknown, actor: Account, signer: PersonTransitionReviewSigner | undefined, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const command = normalizeTransitionPreparation(raw, actor.uid);
  if (!signer) throw new Error('Transition review signing is unavailable.');
  const expected = { actorUid: actor.uid, personId: command.identity.personId, intentHash: command.intentHash };
  const claims = signer.verifySignature(command.reviewEnvelope, expected);
  const review = storedTransitionReview(claims, command.envelopeHash);
  const receiptKey = transitionOperationKey(command.identity);
  return firestore.runTransaction(async transaction => {
    await readPersonTransitionAuthority(firestore, transaction, actor);
    const receiptReference = firestore.collection(TRANSITION_OPERATION_COLLECTION).doc(receiptKey);
    const doc = await transaction.get(receiptReference);
    if (!doc.exists) throw new DirectoryConflict('Prepare this exact operation before committing.');
    if (doc.ref.path !== receiptReference.path) throw new Error('Invalid transition receipt source.');
    const current = readTransitionReceipt(doc.data(), command.identity);
    if (current.state === 'cancelled') throw new DirectoryConflict('This operation was cancelled. Review a new preview.');
    assertTransitionReviewMatches(current, review);
    // Recover the original immutable result before clock or later staffing inventory checks.
    if (current.state === 'committed') return transitionRecoveryOutcome(command.identity, current);
    const now = clock().getTime();
    signer.verify(command.reviewEnvelope, expected, now);
    const plan = await readPersonTransitionCommandPlan(firestore, transaction, command.intent);
    if (!plan.ready || !plan.internal || plan.intentHash !== claims.intentHash || plan.stateHash !== claims.stateHash || plan.planHash !== claims.planHash) throw new DirectoryConflict('Reviewed Directory data changed. Obtain a fresh preview; no changes were made.');
    const patches = plan.internal.patches;
    if (!patches.length || patches.length > 90) throw new DirectoryConflict('Transition exceeds atomic capacity.');
    const seen = new Set<string>();
    for (const patch of patches) {
      const path = `${patch.collection}/${patch.id}`;
      if (!Object.hasOwn(allowed, patch.collection) || seen.has(path) || !object(patch.set) || !Object.keys(patch.set).length || Object.keys(patch.set).some(key => !allowed[patch.collection].has(key))) throw new Error('Invalid server-derived transition patch.');
      seen.add(path);
    }
    // Read whole changed documents for final capacity and native preconditions, preserving all unrelated fields.
    const full = await transaction.getAll(...patches.map(p => firestore.collection(p.collection).doc(p.id)));
    if (full.length !== patches.length || new Set(full.map(d => d.ref.path)).size !== patches.length) throw new Error('Incomplete changed-document reads.');
    const byPath = new Map(full.map(d => [d.ref.path, d]));
    const timestamp = Math.max(now, current.updatedAt), updatedAt = new Date(timestamp).toISOString();
    let businessBytes = 0;
    const writes = patches.map(patch => {
      const document = byPath.get(`${patch.collection}/${patch.id}`), before = document?.data();
      const source = plan.internal!.preconditions[patch.collection].find(d => d.id === patch.id);
      if (!document?.exists || !document.updateTime || !object(before) || !source?.data || source.updateTime?.seconds !== String(document.updateTime.seconds) || source.updateTime?.nanoseconds !== document.updateTime.nanoseconds
        || Object.hasOwn(before, 'id') && before.id !== patch.id
        || Object.hasOwn(before, 'version') !== Object.hasOwn(source.data, 'version') || !isDeepStrictEqual(before.version, source.data.version)) throw new DirectoryConflict('Changed-document identity or native metadata differs. Obtain a fresh preview.');
      for (const [key, value] of Object.entries(source.data)) if (!Object.hasOwn(before, key) || !isDeepStrictEqual(before[key], value)) throw new Error('Inconsistent changed-document projection.');
      const version = (before.version ?? 0) + 1;
      if (!Number.isSafeInteger(version) || version < 1) throw new DirectoryConflict('Resolve this record version before saving.');
      const data = { ...patch.set, version, updatedAt };
      businessBytes += savedBytes({ ...before, ...data }) + 1024;
      return { reference: document.ref, updateTime: document.updateTime, data, change: { collection: patch.collection, id: patch.id, version } };
    });
    if (businessBytes > 4 * 1024 * 1024) throw new DirectoryConflict('Full saved records exceed conservative atomic capacity.');
    const auditId = transitionCommitAuditId(command.identity);
    const committed = readTransitionReceipt({ ...current, state: 'committed', updatedAt: timestamp, auditId, changes: writes.map(w => w.change) }, command.identity);
    const { excluded: _dryRunDisclaimer, counts: _projectedCounts, ...reviewProjection } = plan.review;
    const subject = plan.internal.preconditions.people.find(d => d.id === command.intent.personId);
    const audit = {
      id: auditId, timestamp: updatedAt, userId: actor.uid, userName: actor.name,
      action: 'Person Positions and Assignments Updated', entityType: 'Person' as const, entityId: command.intent.personId,
      entityName: subject!.data!.fullName as string, details: command.intent.reason,
      operationId: command.identity.operationId, commandDigest: command.identity.commandDigest,
      review: { ...reviewProjection, counts: { businessDocuments: writes.length, businessBytesEstimate: businessBytes } }, changes: committed.changes,
    } satisfies AuditLogEntry & { operationId: string; commandDigest: string; review: unknown; changes: unknown };
    if (conservativeDocumentBytes(audit) >= 900_000 || conservativeDocumentBytes(committed) >= 900_000) throw new DirectoryConflict('Transition audit or receipt exceeds conservative capacity.');
    // Recheck time after all reads. Expiry never extends during a slow read or transaction retry.
    signer.verify(command.reviewEnvelope, expected, clock().getTime());
    for (const write of writes) transaction.update(write.reference, write.data, { lastUpdateTime: write.updateTime });
    transaction.create(firestore.collection('audit_logs').doc(auditId), audit);
    transaction.update(receiptReference, { state: committed.state, updatedAt: committed.updatedAt, auditId, changes: committed.changes });
    return transitionRecoveryOutcome(command.identity, committed);
  });
}
