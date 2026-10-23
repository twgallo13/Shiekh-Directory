import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalTransitionId, normalizePersonTransitionIntent, object } from './personTransitionIntent';
import { personTransitionIntentHash } from './personTransitionPlanner';
import { TRANSITION_REVIEW_TTL_MS, type TransitionReviewClaims } from './personTransitionReviewEnvelope';

export const TRANSITION_OPERATION_COLLECTION = 'person_transition_operations';
export const TRANSITION_OPERATION_AUDIENCE = 'directory-person-transition-operation-v1';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const commandHash = (actorUid: string, personId: string, intentHash: string, envelopeHash: string) => hash(JSON.stringify([TRANSITION_OPERATION_AUDIENCE, actorUid, personId, intentHash, envelopeHash]));
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export const transitionActorUid = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f]/.test(value);
const exact = (value: unknown, keys: string[]): value is Record<string, any> => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const time = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000;
function invalid(): never { throw new Error('Invalid transition recovery identity or receipt.'); }

/** Minimal recovery marker; no token, reason, raw intent, names or contacts. Not authorization. */
export interface TransitionRecoveryMarker { schemaVersion: 1; operationId: string; personId: string; commandDigest: string }
export interface TransitionOperationIdentity extends TransitionRecoveryMarker { actorUid: string }
export interface TransitionStoredReview { intentHash: string; envelopeHash: string; stateHash: string; planHash: string; issuedAt: number; expiresAt: number }
export interface TransitionChangedRecord { collection: 'people' | 'districts' | 'locations'; id: string; version: number }
export interface TransitionOperationReceipt extends TransitionOperationIdentity {
  audience: typeof TRANSITION_OPERATION_AUDIENCE; state: 'prepared' | 'committed' | 'cancelled';
  createdAt: number; updatedAt: number; preparedAt: number | null;
  review: TransitionStoredReview | null; auditId: string | null; changes: TransitionChangedRecord[];
}
export function normalizeTransitionRecoveryMarker(value: unknown): TransitionRecoveryMarker {
  if (!exact(value, ['schemaVersion', 'operationId', 'personId', 'commandDigest']) || value.schemaVersion !== 1 || !uuid(value.operationId) || !canonicalTransitionId(value.personId) || !digest(value.commandDigest)) invalid();
  return { schemaVersion: 1, operationId: value.operationId, personId: value.personId, commandDigest: value.commandDigest };
}
export function transitionOperationIdentity(marker: unknown, actorUid: string): TransitionOperationIdentity {
  if (!transitionActorUid(actorUid)) invalid();
  return { ...normalizeTransitionRecoveryMarker(marker), actorUid };
}
export function transitionOperationKey(identity: TransitionOperationIdentity): string {
  const current = transitionOperationIdentity({ schemaVersion: identity.schemaVersion, operationId: identity.operationId, personId: identity.personId, commandDigest: identity.commandDigest }, identity.actorUid);
  // Content is deliberately NOT part of the key: same actor/UUID with new content must conflict.
  return hash(JSON.stringify([TRANSITION_OPERATION_AUDIENCE, current.actorUid, current.operationId]));
}
export const transitionCancellationAuditId = (identity: TransitionOperationIdentity) => `aud-person-transition-cancel-${transitionOperationKey(identity)}`;
export const transitionCommitAuditId = (identity: TransitionOperationIdentity) => `aud-person-transition-${transitionOperationKey(identity)}`;
export function normalizeTransitionPreparation(value: unknown, actorUid: string) {
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { invalid(); }
  if (!encoded || Buffer.byteLength(encoded) > 128 * 1024) invalid();
  if (!exact(value, ['schemaVersion', 'operationId', 'intent', 'reviewEnvelope']) || value.schemaVersion !== 1 || !uuid(value.operationId)
    || typeof value.reviewEnvelope !== 'string' || !value.reviewEnvelope || value.reviewEnvelope.length > 4096 || !transitionActorUid(actorUid)) invalid();
  const intent = normalizePersonTransitionIntent(value.intent), intentHash = personTransitionIntentHash(intent), envelopeHash = hash(value.reviewEnvelope);
  const commandDigest = commandHash(actorUid, intent.personId, intentHash, envelopeHash);
  return { intent, reviewEnvelope: value.reviewEnvelope as string, intentHash, envelopeHash,
    identity: transitionOperationIdentity({ schemaVersion: 1, operationId: value.operationId, personId: intent.personId, commandDigest }, actorUid) };
}
export function storedTransitionReview(claims: TransitionReviewClaims, envelopeHash: string): TransitionStoredReview {
  const review = { intentHash: claims.intentHash, envelopeHash, stateHash: claims.stateHash, planHash: claims.planHash, issuedAt: claims.issuedAt, expiresAt: claims.expiresAt };
  if (!validReview(review)) invalid();
  return review;
}
function validReview(value: unknown): value is TransitionStoredReview {
  return exact(value, ['intentHash', 'envelopeHash', 'stateHash', 'planHash', 'issuedAt', 'expiresAt'])
    && ['intentHash', 'envelopeHash', 'stateHash', 'planHash'].every(k => digest(value[k])) && time(value.issuedAt) && time(value.expiresAt) && value.expiresAt - value.issuedAt === TRANSITION_REVIEW_TTL_MS;
}
/** Strict persisted shape. Unknown/private fields or corrupted outcomes fail closed. */
export function readTransitionReceipt(value: unknown, identity: TransitionOperationIdentity): TransitionOperationReceipt {
  if (!exact(value, ['schemaVersion', 'operationId', 'personId', 'commandDigest', 'actorUid', 'audience', 'state', 'createdAt', 'updatedAt', 'preparedAt', 'review', 'auditId', 'changes'])
    || value.audience !== TRANSITION_OPERATION_AUDIENCE || !['prepared', 'committed', 'cancelled'].includes(value.state)
    || !time(value.createdAt) || !time(value.updatedAt) || value.updatedAt < value.createdAt || !(value.preparedAt === null || time(value.preparedAt) && value.preparedAt === value.createdAt)
    || !(value.review === null || validReview(value.review)) || !(value.auditId === null || canonicalTransitionId(value.auditId)) || !Array.isArray(value.changes) || value.changes.length > 90) invalid();
  if (Object.entries(identity).some(([key, v]) => value[key] !== v)) throw new Error('Transition operation identity conflict.');
  if (value.review && commandHash(identity.actorUid, identity.personId, value.review.intentHash, value.review.envelopeHash) !== identity.commandDigest) invalid();
  if (value.state === 'prepared' ? value.preparedAt === null || value.review === null || value.auditId !== null || value.changes.length !== 0 || value.updatedAt !== value.createdAt
    : value.state === 'committed' ? value.preparedAt === null || value.review === null || value.auditId !== transitionCommitAuditId(identity) || !value.changes.length
      : value.auditId !== transitionCancellationAuditId(identity) || value.changes.length !== 0 || (value.preparedAt === null) !== (value.review === null)) invalid();
  if (value.preparedAt !== null && (value.preparedAt < value.review.issuedAt || value.preparedAt >= value.review.expiresAt)) invalid();
  const seen = new Set<string>();
  for (const change of value.changes) {
    if (!exact(change, ['collection', 'id', 'version']) || !['people', 'districts', 'locations'].includes(change.collection) || !canonicalTransitionId(change.id) || !Number.isSafeInteger(change.version) || change.version < 1 || seen.has(`${change.collection}/${change.id}`)) invalid();
    seen.add(`${change.collection}/${change.id}`);
  }
  return structuredClone(value) as TransitionOperationReceipt;
}
export function newPreparedTransitionReceipt(identity: TransitionOperationIdentity, review: TransitionStoredReview, now: number): TransitionOperationReceipt {
  if (!time(now) || !validReview(review) || now < review.issuedAt || now >= review.expiresAt) throw new Error('Transition review is not fresh.');
  return readTransitionReceipt({ ...identity, audience: TRANSITION_OPERATION_AUDIENCE, state: 'prepared', createdAt: now, updatedAt: now, preparedAt: now, review, auditId: null, changes: [] }, identity);
}
export function assertTransitionReviewMatches(receipt: TransitionOperationReceipt, review: TransitionStoredReview) {
  if (!isDeepStrictEqual(receipt.review, review)) throw new Error('Transition operation review conflict.');
}
export function cancelledTransitionReceipt(identity: TransitionOperationIdentity, previous: TransitionOperationReceipt | null, now: number): TransitionOperationReceipt {
  if (previous) previous = readTransitionReceipt(previous, identity);
  if (previous?.state === 'committed' || previous?.state === 'cancelled') return readTransitionReceipt(previous, identity);
  if (!time(now)) invalid();
  // Cancellation is recovery, not new command admission. Preserve monotonic receipt time across hosts.
  const timestamp = Math.max(now, previous?.updatedAt ?? now);
  return readTransitionReceipt({ ...identity, audience: TRANSITION_OPERATION_AUDIENCE, state: 'cancelled', createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp,
    preparedAt: previous?.preparedAt ?? null, review: previous?.review ?? null, auditId: transitionCancellationAuditId(identity), changes: [] }, identity);
}
/** No review hashes or tokens are exported. A missing receipt is UNKNOWN, never cancellation. */
export function transitionRecoveryOutcome(identity: TransitionOperationIdentity, receipt: TransitionOperationReceipt | null) {
  if (receipt) receipt = readTransitionReceipt(receipt, identity);
  return { schemaVersion: 1 as const, operationId: identity.operationId, personId: identity.personId, commandDigest: identity.commandDigest,
    state: receipt?.state ?? 'unknown', canCommit: false as const,
    createdAt: receipt ? new Date(receipt.createdAt).toISOString() : null,
    preparedAt: receipt?.preparedAt != null ? new Date(receipt.preparedAt).toISOString() : null,
    resolvedAt: receipt && receipt.state !== 'prepared' ? new Date(receipt.updatedAt).toISOString() : null,
    auditId: receipt?.auditId ?? null, changes: receipt?.changes ?? [] };
}
