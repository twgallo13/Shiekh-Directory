import type { SessionState } from './authSession';
import { ORGANIZATION_RECOVERY_PREFIX, ORGANIZATION_MOVE_RECOVERY_PREFIX } from './organizationLeadershipRecovery';

export const TRANSITION_RECOVERY_PREFIX = 'shiekh_person_transition_v1:';
/** Remove obsolete record caches, never unresolved-operation identities. Explicit sign-out
 * still uses clearProtectedStorage to remove all protected keys, including these markers.
 */
export function clearLegacyDirectoryCaches(storage: Storage) {
  for (const key of Object.keys(storage)) if (key.startsWith('shiekh_') && key !== 'shiekh_theme_preference' && !key.startsWith(TRANSITION_RECOVERY_PREFIX) && !key.startsWith(ORGANIZATION_RECOVERY_PREFIX) && !key.startsWith(ORGANIZATION_MOVE_RECOVERY_PREFIX)) storage.removeItem(key);
}
const AUDIENCE = 'directory-person-transition-operation-v1';
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
function fail(): never { throw new Error('Transition recovery could not be confirmed. Keep the original operation.'); }

export interface TransitionRecoveryMarker { schemaVersion: 1; operationId: string; personId: string; commandDigest: string }
export interface TransitionRecoveryOutcome extends TransitionRecoveryMarker {
  state: 'unknown' | 'prepared' | 'committed' | 'cancelled'; canCommit: false;
  createdAt: string | null; preparedAt: string | null; resolvedAt: string | null; auditId: string | null;
  changes: { collection: 'people' | 'districts' | 'locations'; id: string; version: number }[];
}
export function parseTransitionRecoveryMarker(value: unknown): TransitionRecoveryMarker {
  if (!exact(value, ['schemaVersion', 'operationId', 'personId', 'commandDigest']) || value.schemaVersion !== 1 || !uuid(value.operationId) || !id(value.personId) || !digest(value.commandDigest)) fail();
  return { schemaVersion: 1, operationId: value.operationId, personId: value.personId, commandDigest: value.commandDigest };
}
const markerOf = (value: TransitionRecoveryMarker) => parseTransitionRecoveryMarker({ schemaVersion: value.schemaVersion, operationId: value.operationId, personId: value.personId, commandDigest: value.commandDigest });
const same = (a: TransitionRecoveryMarker, b: TransitionRecoveryMarker) => a.operationId === b.operationId && a.personId === b.personId && a.commandDigest === b.commandDigest;
function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const time = Date.parse(value); return Number.isFinite(time) && time >= 0 && new Date(time).toISOString() === value;
}
/** Fixed response allowlist only. Never accept raw record payloads, private fields or a mismatched operation. */
export function parseTransitionRecoveryOutcome(value: unknown, expected?: TransitionRecoveryMarker): TransitionRecoveryOutcome {
  if (!exact(value, ['schemaVersion', 'operationId', 'personId', 'commandDigest', 'state', 'canCommit', 'createdAt', 'preparedAt', 'resolvedAt', 'auditId', 'changes'])
    || !['unknown', 'prepared', 'committed', 'cancelled'].includes(value.state) || value.canCommit !== false
    || ![value.createdAt, value.preparedAt, value.resolvedAt].every(v => v === null || date(v)) || !Array.isArray(value.changes) || value.changes.length > 90) fail();
  const marker = markerOf(value as TransitionRecoveryMarker);
  if (expected && !same(marker, parseTransitionRecoveryMarker(expected))) fail();
  if (value.preparedAt !== null && value.preparedAt !== value.createdAt) fail();
  if (value.resolvedAt !== null && (value.createdAt === null || value.resolvedAt < value.createdAt)) fail();
  if (value.state === 'unknown' ? value.createdAt !== null || value.preparedAt !== null || value.resolvedAt !== null || value.auditId !== null || value.changes.length
    : value.state === 'prepared' ? value.createdAt === null || value.preparedAt === null || value.resolvedAt !== null || value.auditId !== null || value.changes.length
      : value.state === 'committed' ? value.preparedAt === null || value.resolvedAt === null || !/^aud-person-transition-[a-f0-9]{64}$/.test(value.auditId) || !value.changes.length
        : value.createdAt === null || value.resolvedAt === null || !/^aud-person-transition-cancel-[a-f0-9]{64}$/.test(value.auditId) || value.changes.length) fail();
  const seen = new Set<string>();
  for (const change of value.changes) {
    if (!exact(change, ['collection', 'id', 'version']) || !['people', 'districts', 'locations'].includes(change.collection) || !id(change.id) || !Number.isSafeInteger(change.version) || change.version < 1 || seen.has(`${change.collection}/${change.id}`)) fail();
    seen.add(`${change.collection}/${change.id}`);
  }
  return structuredClone(value) as TransitionRecoveryOutcome;
}
export function parseTransitionPreparations(value: unknown) {
  if (!exact(value, ['schemaVersion', 'operations', 'complete', 'canCommit']) || value.schemaVersion !== 1 || value.complete !== true || value.canCommit !== false || !Array.isArray(value.operations) || value.operations.length > 50) fail();
  const operations = value.operations.map(v => parseTransitionRecoveryOutcome(v));
  if (operations.some(v => v.state !== 'prepared') || new Set(operations.map(v => v.operationId)).size !== operations.length) fail();
  return operations;
}

/** Pure reconciliation, not permission to submit. Absent status/list entries never clear uncertainty. */
export function reconcileTransitionRecovery(local: unknown[], remoteList: unknown, localStatuses: unknown[]) {
  if (!Array.isArray(local) || local.length > 50 || !Array.isArray(localStatuses) || localStatuses.length !== local.length) fail();
  const markers = local.map(parseTransitionRecoveryMarker), remote = parseTransitionPreparations(remoteList);
  if (new Set(markers.map(v => v.operationId)).size !== markers.length) fail();
  const expected = new Map(markers.map(v => [v.operationId, v])), results = new Map<string, { marker: TransitionRecoveryMarker; outcome: TransitionRecoveryOutcome; source: 'local' | 'server' | 'both' }>();
  for (const raw of localStatuses) {
    const outcome = parseTransitionRecoveryOutcome(raw), marker = expected.get(outcome.operationId);
    if (!marker || results.has(outcome.operationId) || !same(marker, outcome)) fail();
    results.set(marker.operationId, { marker, outcome, source: 'local' });
  }
  for (const outcome of remote) {
    const previous = results.get(outcome.operationId);
    if (previous && !same(previous.marker, outcome)) fail();
    if (previous && previous.outcome.state !== 'unknown' && (previous.outcome.createdAt !== outcome.createdAt || previous.outcome.preparedAt !== outcome.preparedAt)) fail();
    // Different read times are possible. A matching terminal status wins over an older prepared list.
    results.set(outcome.operationId, previous ? { ...previous, outcome: previous.outcome.state === 'unknown' ? outcome : previous.outcome, source: 'both' } : { marker: markerOf(outcome), outcome, source: 'server' });
  }
  if (results.size > 50) fail();
  const operations = [...results.values()].sort((a, b) => a.marker.operationId.localeCompare(b.marker.operationId));
  return { operations, canSubmit: false as const,
    unresolvedPersonIds: [...new Set(operations.filter(v => ['unknown', 'prepared'].includes(v.outcome.state)).map(v => v.marker.personId))].sort(),
    refreshPersonIds: [...new Set(operations.filter(v => v.outcome.state === 'committed').map(v => v.marker.personId))].sort() };
}

type RecoveryLocks = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };
type RecoveryCrypto = Pick<SubtleCrypto, 'digest'>;
async function sha256(value: string, subtle: RecoveryCrypto) {
  return [...new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
function currentActor(session: SessionState) {
  const a = session.account;
  if (session.status !== 'authorized' || !session.user || !a || a.uid !== session.user.uid || a.role !== 'System Administrator' || a.status !== 'Active' || a.accessScope !== 'Company-wide'
    || typeof a.uid !== 'string' || !a.uid.length || a.uid.length > 128 || /[\u0000-\u001f]/.test(a.uid)) throw new Error('Current administrator sign-in is required for transition recovery.');
  return a.uid;
}

/** Unwired client storage adapter. App-level session/namespace isolation, not encryption or XSS protection.
 * No network calls, tokens, raw intents, expiry-based eviction or automatic retry.
 * Existing clearProtectedStorage removes this shiekh_-prefixed data on explicit sign-out.
 */
export async function openTransitionRecoveryVault(storage: Storage, getSession: () => SessionState, locks: RecoveryLocks, subtle: RecoveryCrypto, getSessionGeneration: () => number) {
  const actorUid = currentActor(getSession());
  if (!locks?.request || !subtle?.digest || typeof getSessionGeneration !== 'function') throw new Error('Protected transition recovery storage is unavailable.');
  const generation = getSessionGeneration();
  if (!Number.isSafeInteger(generation) || generation < 0) throw new Error('Protected transition recovery session is unavailable.');
  const namespace = TRANSITION_RECOVERY_PREFIX + await sha256(JSON.stringify([AUDIENCE, actorUid]), subtle) + ':';
  const check = () => { if (currentActor(getSession()) !== actorUid || getSessionGeneration() !== generation) throw new Error('The transition recovery session changed.'); };
  check();
  const key = (m: TransitionRecoveryMarker) => namespace + m.operationId;
  const read = () => {
    check(); const markers: TransitionRecoveryMarker[] = [];
    const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((v): v is string => !!v && v.startsWith(namespace));
    if (keys.length > 50 || new Set(keys).size !== keys.length) fail();
    for (const storedKey of keys) {
      const value = storage.getItem(storedKey); if (!value || value.length > 1024) fail();
      let parsed: unknown; try { parsed = JSON.parse(value); } catch { fail(); }
      const marker = parseTransitionRecoveryMarker(parsed);
      if (storedKey !== key(marker)) fail(); markers.push(marker);
    }
    check(); return markers.sort((a, b) => a.operationId.localeCompare(b.operationId));
  };
  const verifyTerminalAudit = async (outcome: TransitionRecoveryOutcome) => {
    check();
    if (outcome.state === 'committed' || outcome.state === 'cancelled') {
      const operationKey = await sha256(JSON.stringify([AUDIENCE, actorUid, outcome.operationId]), subtle);
      check();
      if (outcome.auditId !== `aud-person-transition-${outcome.state === 'cancelled' ? 'cancel-' : ''}${operationKey}`) fail();
    }
  };
  return {
    read,
    /** Actor-bound reconciliation; the standalone pure parser checks shape, not audit ownership. */
    async reconcile(remoteList: unknown, localStatuses: unknown[]) {
      check(); const local = read();
      if (!Array.isArray(localStatuses) || localStatuses.length > 50) fail();
      const statuses = localStatuses.map(v => parseTransitionRecoveryOutcome(v));
      for (const outcome of statuses) await verifyTerminalAudit(outcome);
      check(); return reconcileTransitionRecovery(local, remoteList, statuses);
    },
    /** Derivation only, NOT validation of an approved/current server preview or admission to submit. */
    async markerForReviewedCommand(value: { operationId: string; personId: string; intentHash: string; reviewEnvelope: string }) {
      check();
      if (!exact(value, ['operationId', 'personId', 'intentHash', 'reviewEnvelope']) || !uuid(value.operationId) || !id(value.personId) || !digest(value.intentHash) || typeof value.reviewEnvelope !== 'string' || !value.reviewEnvelope || value.reviewEnvelope.length > 4096) fail();
      const { operationId, personId, intentHash, reviewEnvelope } = value;
      const envelopeHash = await sha256(reviewEnvelope, subtle);
      const commandDigest = await sha256(JSON.stringify([AUDIENCE, actorUid, personId, intentHash, envelopeHash]), subtle);
      check(); return parseTransitionRecoveryMarker({ schemaVersion: 1, operationId, personId, commandDigest });
    },
    /** Preserve every unresolved operation, including multiple recovered preparations for one Person. */
    async persist(value: unknown) {
      const marker = parseTransitionRecoveryMarker(value); check();
      await locks.request(namespace, async () => {
        check(); const existing = read(), previous = existing.find(v => v.operationId === marker.operationId);
        if (previous && !same(previous, marker) || !previous && existing.length >= 50) fail();
        const encoded = JSON.stringify(marker); storage.setItem(key(marker), encoded);
        if (storage.getItem(key(marker)) !== encoded) fail(); check();
      });
      check();
      return structuredClone(marker);
    },
    /** Terminal proof only. Refresh saved Directory state BEFORE forgetting a committed operation. */
    async resolve(value: unknown, rawOutcome: unknown, refreshSavedDirectory?: () => Promise<void>) {
      const marker = parseTransitionRecoveryMarker(value), outcome = parseTransitionRecoveryOutcome(rawOutcome, marker); check();
      if (!['committed', 'cancelled'].includes(outcome.state)) fail();
      await verifyTerminalAudit(outcome);
      if (outcome.state === 'committed') {
        if (!refreshSavedDirectory) fail();
        await refreshSavedDirectory(); check();
      }
      await locks.request(namespace, async () => {
        check(); const previous = read().find(v => v.operationId === marker.operationId);
        if (previous && !same(previous, marker)) fail();
        storage.removeItem(key(marker)); if (storage.getItem(key(marker)) !== null) fail(); check();
      });
      check();
      return outcome;
    },
  };
}
