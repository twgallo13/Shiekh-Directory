import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DocumentReference, GeoPoint, Timestamp, type Firestore, type Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import type { AuditLogEntry } from '../src/types';
import { assertPersonTransitionActor, readPersonTransitionAuthority } from './personTransitionAuthority';
import { canonicalId } from './personnelProjection';
import { LeadershipPlanError, normalizeOrganizationLeadershipIntent, type OrganizationLeadershipIntent } from './organizationLeadershipPlanner';
import { readOrganizationLeadershipPlan } from './organizationLeadershipSource';

export const ORGANIZATION_OPERATION_COLLECTION = 'organization_leadership_operations';
export const ORGANIZATION_ADMISSION_COLLECTION = 'organization_leadership_admission';
export const ORGANIZATION_REVIEW_TTL_MS = 10 * 60_000;
export const ORGANIZATION_PENDING_LIMIT = 100;
type Plan = Awaited<ReturnType<typeof readOrganizationLeadershipPlan>>['plan'];
interface Receipt {
  schemaVersion: 1;
  actorUid: string;
  operationId: string;
  state: 'prepared' | 'committed' | 'cancelled';
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
  intent?: OrganizationLeadershipIntent;
  intentHash?: string;
  review?: Plan['review'];
  preconditions?: Plan['preconditions'];
  reviewHash?: string;
  auditId?: string;
  changes?: { collection: string; id: string; version: number }[];
}
function canonical(value: unknown, depth = 0): string {
  if (depth > 30) throw new Error('Leadership review nesting exceeds capacity.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, v => canonical(v, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k], depth + 1)).join(',') + '}';
  throw new Error('Leadership review requires finite JSON values.');
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
// Roster selections are sets. Preserve stored review order and legacy receipt hashes,
// but compare retry intent independently of unit/member insertion order.
const leadershipIntentHash = (intent: OrganizationLeadershipIntent) => hash({ ...intent, units: intent.units.map(unit => ({ ...unit, memberPersonIds: [...unit.memberPersonIds].sort() })).sort((a,b) => { const left=`${a.unitType}/${a.unitId}`,right=`${b.unitType}/${b.unitId}`; return left<right?-1:left>right?1:0; }) });
const legacyLeadershipIntentHash = (intent: OrganizationLeadershipIntent) => hash({ ...intent, units: intent.units.map(unit=>({...unit,memberPersonIds:[...unit.memberPersonIds].sort()})).sort((a,b)=>`${a.unitType}/${a.unitId}`.localeCompare(`${b.unitType}/${b.unitId}`)) });
const conflict = (message: string): never => { throw new LeadershipPlanError('conflict', message); };
const keyFor = (actorUid: string, operationId: string) => hash(['organization-leadership-v1', actorUid, operationId]);
export function normalizeOrganizationOperationMarker(raw: unknown): { operationId: string; reviewHash?: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(k => !['operationId', 'reviewHash'].includes(k))
    || !canonicalId((raw as any).operationId) || (Object.hasOwn(raw, 'reviewHash') && !/^[a-f0-9]{64}$/.test((raw as any).reviewHash))) throw new LeadershipPlanError('invalid_input', 'Invalid leadership operation marker.');
  return raw as { operationId: string; reviewHash?: string };
}
function instant(clock: () => Date) {
  const value = clock().getTime();
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + ORGANIZATION_REVIEW_TTL_MS) || !Number.isFinite(new Date(value + ORGANIZATION_REVIEW_TTL_MS).getTime())) throw new Error('Leadership operation clock is unavailable.');
  return value;
}
function receipt(data: unknown, actor: Account, operationId: string): Receipt {
  const r = data as Receipt;
  if (!r || r.schemaVersion !== 1 || r.actorUid !== actor.uid || r.operationId !== operationId || !['prepared', 'committed', 'cancelled'].includes(r.state)
    || ![r.createdAt, r.expiresAt, r.updatedAt].every(Number.isSafeInteger) || r.createdAt < 0 || r.expiresAt !== r.createdAt + ORGANIZATION_REVIEW_TTL_MS || r.updatedAt < r.createdAt) throw new Error('Invalid leadership operation receipt.');
  if (r.intent) {
    const intent = normalizeOrganizationLeadershipIntent(r.intent);
    if (intent.operationId !== operationId || ![hash(intent),leadershipIntentHash(intent),legacyLeadershipIntentHash(intent)].includes(r.intentHash!) || !Array.isArray(r.review) || !r.preconditions || hash([r.intentHash, r.review, r.preconditions]) !== r.reviewHash) throw new Error('Invalid leadership review binding.');
  } else if (r.state !== 'cancelled') throw new Error('Leadership receipt has no reviewed intent.');
  if (r.state === 'committed' && (r.auditId !== `organization-${keyFor(actor.uid, operationId)}` || !Array.isArray(r.changes) || !r.changes.length)) throw new Error('Incomplete committed leadership receipt.');
  return r;
}
function outcome(r: Receipt) {
  return { schemaVersion: 1 as const, operationId: r.operationId, state: r.state, updatedAt: new Date(r.updatedAt).toISOString(),
    ...(r.state === 'committed' ? { auditId: r.auditId!, changedRecords: r.changes!.length } : {}) };
}
function prepared(r: Receipt) {
  return { ...outcome(r), ...(r.state === 'prepared' ? { reviewHash: r.reviewHash!, expiresAt: new Date(r.expiresAt).toISOString(), review: structuredClone(r.review!) } : {}) };
}
/** Strict upper bound for full preserved SDK records. Unsupported native values reject, never disappear. */
function savedBytes(value: unknown, depth = 0): number {
  if (depth > 100) throw new Error('Leadership document nesting exceeds capacity.');
  if (typeof value === 'string') return Buffer.byteLength(value) + 32;
  if (value === null || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') return 32;
  if (value instanceof Timestamp || value instanceof GeoPoint || value instanceof Date) return 64;
  if (value instanceof Uint8Array) return value.byteLength + 64;
  if (value instanceof DocumentReference) return Buffer.byteLength(value.path) + 512;
  if (Array.isArray(value)) return 32 + value.reduce((size, item) => size + 32 + savedBytes(item, depth + 1), 0);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return 32 + Object.entries(value).reduce((size, [key, item]) => size + Buffer.byteLength(key) + 32 + savedBytes(item, depth + 1), 0);
  throw new Error('Unsupported saved leadership document value.');
}
async function readReceipt(db: Firestore, tx: Transaction, actor: Account, operationId: string) {
  await readPersonTransitionAuthority(db, tx, actor);
  const reference = db.collection(ORGANIZATION_OPERATION_COLLECTION).doc(keyFor(actor.uid, operationId));
  const doc = await tx.get(reference);
  if (doc.ref.path !== reference.path) throw new Error('Invalid leadership receipt source.');
  return { reference, current: doc.exists ? receipt(doc.data(), actor, operationId) : undefined };
}

async function readOutstanding(db: Firestore, tx: Transaction, actor: Account) {
  const rows = await tx.get(db.collection(ORGANIZATION_OPERATION_COLLECTION).where('actorUid', '==', actor.uid).where('state', '==', 'prepared')
    .select('schemaVersion', 'actorUid', 'operationId', 'state', 'createdAt', 'expiresAt', 'updatedAt').limit(ORGANIZATION_PENDING_LIMIT + 1));
  if (rows.size !== rows.docs.length || rows.size > ORGANIZATION_PENDING_LIMIT) throw new LeadershipPlanError('capacity', 'Outstanding reviews exceed recovery capacity.');
  return rows.docs.map(doc => {
    const r = doc.data();
    if (!doc.exists || !doc.updateTime || !r || r.schemaVersion !== 1 || r.actorUid !== actor.uid || r.state !== 'prepared' || !canonicalId(r.operationId)
      || doc.ref.path !== `${ORGANIZATION_OPERATION_COLLECTION}/${keyFor(actor.uid, r.operationId)}`
      || ![r.createdAt, r.expiresAt, r.updatedAt].every(Number.isSafeInteger) || r.createdAt < 0 || r.expiresAt !== r.createdAt + ORGANIZATION_REVIEW_TTL_MS || r.updatedAt < r.createdAt
      || !Number.isFinite(new Date(r.expiresAt).getTime())) throw new Error('Invalid outstanding leadership review metadata.');
    return { operationId: r.operationId as string, state: 'prepared' as const, updatedAt: new Date(r.updatedAt).toISOString(), expiresAt: new Date(r.expiresAt).toISOString() };
  }).sort((a, b) => a.operationId.localeCompare(b.operationId));
}

/** Private actor-only recovery list includes expired prepared reviews so they can be cancelled.
 * A preview has no business effect; cancellation retains its receipt and never undoes a commit. */
export async function listOrganizationLeadershipOperations(db: Firestore, actor: Account) {
  assertPersonTransitionActor(actor);
  return db.runTransaction(async tx => {
    await readPersonTransitionAuthority(db, tx, actor);
    return { schemaVersion: 1 as const, complete: true as const, operations: await readOutstanding(db, tx, actor) };
  }, { readOnly: true });
}

/** Internal service behind disabled-by-default HTTP/Store admission. Trusted callers MUST authenticate Firebase first. Live authority is
 * rechecked in every transaction. A private server-written preparation binds actor + exact review;
 * no signing secret, caller-provided patches or browser completeness claims are accepted.
 * Keep production admission off until the maintained plan's workflow, compatibility and release gates pass.
 */
export async function prepareOrganizationLeadership(db: Firestore, raw: unknown, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const intent = normalizeOrganizationLeadershipIntent(raw), intentHash = leadershipIntentHash(intent), started = instant(clock);
  return db.runTransaction(async tx => {
    const { reference, current } = await readReceipt(db, tx, actor, intent.operationId);
    if (current) {
      if (current.state === 'cancelled') return outcome(current);
      if (!current.intent || leadershipIntentHash(current.intent) !== intentHash) conflict('This operation ID belongs to a different review.');
      if (current.state === 'prepared') {
        const now = instant(clock);
        if (now < current.createdAt || now >= current.expiresAt) conflict('This review expired or its clock is inconsistent. Start a new operation.');
      }
      return prepared(current);
    }
    // A shared actor document serializes distinct concurrent preparations, including empty-query
    // phantoms. Query size checks alone are not the cross-request admission barrier.
    const admission = db.collection(ORGANIZATION_ADMISSION_COLLECTION).doc(hash(['organization-leadership-admission-v1', actor.uid]));
    const admissionDoc = await tx.get(admission), admissionData = admissionDoc.data();
    if (admissionDoc.ref.path !== admission.path || admissionDoc.exists && (!admissionDoc.updateTime || admissionData?.schemaVersion !== 1 || admissionData.actorUid !== actor.uid || !Number.isSafeInteger(admissionData?.version) || admissionData.version < 1 || admissionData.version >= Number.MAX_SAFE_INTEGER)) throw new Error('Invalid leadership admission source.');
    if ((await readOutstanding(db, tx, actor)).length >= ORGANIZATION_PENDING_LIMIT) throw new LeadershipPlanError('capacity', 'Cancel an outstanding review before preparing another.');
    const { plan } = await readOrganizationLeadershipPlan(db, tx, intent, new Date(started).toISOString());
    const now = instant(clock);
    if (now < started || now >= started + ORGANIZATION_REVIEW_TTL_MS) conflict('The review expired while loading. Nothing was prepared.');
    const r: Receipt = { schemaVersion: 1, actorUid: actor.uid, operationId: intent.operationId, state: 'prepared', createdAt: started, expiresAt: started + ORGANIZATION_REVIEW_TTL_MS, updatedAt: started,
      intent, intentHash, review: plan.review, preconditions: plan.preconditions, reviewHash: hash([intentHash, plan.review, plan.preconditions]) };
    if (savedBytes(r) >= 900_000) throw new LeadershipPlanError('capacity', 'Leadership review receipt exceeds capacity.');
    if (admissionDoc.exists) tx.update(admission, { version: admissionData!.version + 1 }, { lastUpdateTime: admissionDoc.updateTime! });
    else tx.create(admission, { schemaVersion: 1, actorUid: actor.uid, version: 1 });
    tx.create(reference, r);
    return prepared(r);
  });
}

export async function commitOrganizationLeadership(db: Firestore, raw: unknown, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const command = normalizeOrganizationOperationMarker(raw);
  if (!command.reviewHash) throw new LeadershipPlanError('invalid_input', 'Confirm the exact prepared review.');
  return db.runTransaction(async tx => {
    const { reference, current } = await readReceipt(db, tx, actor, command.operationId);
    if (!current) conflict('Prepare this operation before saving.');
    if (current.state === 'cancelled') return outcome(current);
    if (current.reviewHash !== command.reviewHash) conflict('The confirmed review does not match this operation.');
    // Recover immutable success even after expiry or later business changes, with fresh live authority.
    if (current.state === 'committed') return outcome(current);
    const now = instant(clock);
    if (now < current.createdAt || now >= current.expiresAt) conflict('This review expired. Start a new operation.');
    const { plan, native } = await readOrganizationLeadershipPlan(db, tx, current.intent, new Date(now).toISOString());
    if (!isDeepStrictEqual(plan.preconditions, current.preconditions) || !isDeepStrictEqual(plan.review, current.review)) conflict('Directory data changed. Review again before saving.');
    const docs = await tx.getAll(...plan.writes.map(w => db.collection(w.collection).doc(w.id)));
    if (docs.length !== plan.writes.length || new Set(docs.map(d => d.ref.path)).size !== docs.length) throw new Error('Incomplete full-document reads.');
    const byPath = new Map(docs.map(d => [d.ref.path, d]));
    let bytes = 0;
    const changes = plan.writes.map(patch => {
      const path = `${patch.collection}/${patch.id}`, doc = byPath.get(path);
      if (!doc) throw new Error('Wrong full-document identity.');
      const before = doc.data(), expected = native.get(path);
      if (patch.expectedVersion === null) {
        if (doc.exists || expected) conflict('An assignment already exists. Reconcile its operation first.');
      } else {
        if (!doc.exists || !doc.updateTime || !expected || !before || Object.hasOwn(before, 'id') && before.id !== patch.id
          || (before.version ?? 0) !== patch.expectedVersion || String(doc.updateTime.seconds) !== expected.updateTime.seconds || doc.updateTime.nanoseconds !== expected.updateTime.nanoseconds) conflict('A changed record no longer matches its reviewed source.');
        for (const [key, value] of Object.entries(expected.data)) if (!Object.hasOwn(before, key) || !isDeepStrictEqual(before[key], value)) conflict('Inconsistent full-document projection.');
      }
      const size = savedBytes({ ...before, ...patch.set }) + 1024;
      if (size >= 900_000) throw new LeadershipPlanError('capacity', 'A full saved record exceeds conservative document capacity.');
      bytes += size;
      return { doc, patch, change: { collection: patch.collection, id: patch.id, version: patch.set.version as number } };
    });
    const auditId = `organization-${keyFor(actor.uid, command.operationId)}`;
    const committed: Receipt = { ...current, state: 'committed', updatedAt: now, auditId, changes: changes.map(c => c.change) };
    const audit = { id: auditId, timestamp: new Date(now).toISOString(), userId: actor.uid, userName: actor.name,
      action: 'Organization Leadership Updated', entityType: 'Setting' as const, entityId: command.operationId,
      entityName: 'Organization leadership', details: 'Reviewed Primary/Additional manager assignments.',
      operationId: command.operationId, review: plan.review, changes: committed.changes } satisfies AuditLogEntry & { operationId: string; review: unknown; changes: unknown };
    if (bytes > 4 * 1024 * 1024 || savedBytes(audit) >= 900_000 || savedBytes(committed) >= 900_000 || bytes + savedBytes(audit) + savedBytes(committed) > 6 * 1024 * 1024) throw new LeadershipPlanError('capacity', 'Full saved records, audit or receipt exceed conservative atomic capacity.');
    const finished = instant(clock);
    if (finished < now || finished >= current.expiresAt) conflict('The review expired while checking records. Nothing was saved.');
    for (const { doc, patch } of changes) {
      if (patch.expectedVersion === null) tx.create(doc.ref, patch.set);
      else tx.update(doc.ref, patch.set, { lastUpdateTime: doc.updateTime! });
    }
    tx.create(db.collection('audit_logs').doc(auditId), audit);
    tx.update(reference, { state: committed.state, updatedAt: now, auditId, changes: committed.changes });
    return outcome(committed);
  });
}

export async function readOrganizationLeadershipOperation(db: Firestore, raw: unknown, actor: Account) {
  assertPersonTransitionActor(actor);
  const command = normalizeOrganizationOperationMarker(raw);
  return db.runTransaction(async tx => {
    const { current } = await readReceipt(db, tx, actor, command.operationId);
    return current ? outcome(current) : { schemaVersion: 1 as const, operationId: command.operationId, state: 'missing' as const };
  }, { readOnly: true });
}

export async function cancelOrganizationLeadershipOperation(db: Firestore, raw: unknown, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const command = normalizeOrganizationOperationMarker(raw);
  return db.runTransaction(async tx => {
    const { reference, current } = await readReceipt(db, tx, actor, command.operationId);
    if (current && current.state !== 'prepared') return outcome(current);
    const now = instant(clock);
    if (current && now < current.updatedAt) conflict('Leadership operation clock moved backwards.');
    const r: Receipt = current ? { ...current, state: 'cancelled', updatedAt: now }
      : { schemaVersion: 1, actorUid: actor.uid, operationId: command.operationId, state: 'cancelled', createdAt: now, expiresAt: now + ORGANIZATION_REVIEW_TTL_MS, updatedAt: now };
    if (current) tx.update(reference, { state: 'cancelled', updatedAt: now }); else tx.create(reference, r);
    return outcome(r);
  });
}
