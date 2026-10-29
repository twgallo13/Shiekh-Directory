import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { DocumentReference, GeoPoint, Timestamp, type Firestore, type Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import type { AuditLogEntry } from '../src/types';
import { assertPersonTransitionActor, readPersonTransitionAuthority } from './personTransitionAuthority';

import { LeadershipPlanError } from './organizationLeadershipPlanner';
import { normalizeLocationLifecycleIntent } from './locationLifecyclePlanner';
import type { LocationLifecycleIntent } from '../src/lib/locationLifecycleContract';
import { readLocationLifecyclePlan } from './locationLifecycleSource';
import { LOCATION_LIFECYCLE_TOMBSTONE_COLLECTION } from './locationLifecycleIdentity';

export const LOCATION_LIFECYCLE_OPERATION_COLLECTION = 'location_lifecycle_operations';
export const LOCATION_LIFECYCLE_ADMISSION_COLLECTION = 'location_lifecycle_admission';
export const LOCATION_LIFECYCLE_REVIEW_TTL_MS = 10 * 60_000;
export const LOCATION_LIFECYCLE_PENDING_LIMIT = 100;
const operationId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
type Plan = Awaited<ReturnType<typeof readLocationLifecyclePlan>>['plan'];
interface Receipt {
  schemaVersion: 1;
  actorUid: string;
  operationId: string;
  state: 'prepared' | 'committed' | 'cancelled';
  createdAt: number;
  expiresAt: number;
  updatedAt: number;
  intent?: LocationLifecycleIntent;
  intentHash?: string;
  review?: Plan['review'];
  preconditions?: Plan['preconditions'];
  sourceFingerprint?: string;
  reviewHash?: string;
  auditId?: string;
  changes?: { collection: 'locations'; id: string; operation: 'set'|'delete'; version: number|null }[];
}
function canonical(value: unknown, depth = 0): string {
  if (depth > 30) throw new Error('Location review nesting exceeds capacity.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + Array.from(value, v => canonical(v, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k], depth + 1)).join(',') + '}';
  throw new Error('Location review requires finite JSON values.');
}
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const conflict = (message: string): never => { throw new LeadershipPlanError('conflict', message); };
const keyFor = (actorUid: string, operationId: string) => hash(['location-lifecycle-v1', actorUid, operationId]);
export function normalizeLocationLifecycleMarker(raw: unknown): { operationId: string; reviewHash?: string } {
  if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype || !Object.hasOwn(raw, 'operationId') || Object.keys(raw).some(k => !['operationId', 'reviewHash'].includes(k))
    || !operationId((raw as any).operationId) || (Object.hasOwn(raw, 'reviewHash') && !/^[a-f0-9]{64}$/.test((raw as any).reviewHash))) throw new LeadershipPlanError('invalid_input', 'Invalid Location operation marker.');
  return raw as { operationId: string; reviewHash?: string };
}
function instant(clock: () => Date) {
  const value = clock().getTime();
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + LOCATION_LIFECYCLE_REVIEW_TTL_MS) || !Number.isFinite(new Date(value + LOCATION_LIFECYCLE_REVIEW_TTL_MS).getTime())) throw new Error('Location operation clock is unavailable.');
  return value;
}
function receipt(data: unknown, actor: Account, operationId: string): Receipt {
  const r = data as Receipt;
  if (!r || r.schemaVersion !== 1 || r.actorUid !== actor.uid || r.operationId !== operationId || !['prepared', 'committed', 'cancelled'].includes(r.state)
    || ![r.createdAt, r.expiresAt, r.updatedAt].every(Number.isSafeInteger) || r.createdAt < 0 || r.expiresAt !== r.createdAt + LOCATION_LIFECYCLE_REVIEW_TTL_MS || r.updatedAt < r.createdAt) throw new Error('Invalid Location operation receipt.');
  if (r.intent) {
    const intent = normalizeLocationLifecycleIntent(r.intent);
    if (intent.operationId !== operationId || hash(intent) !== r.intentHash || (!r.review || typeof r.review !== 'object' || Array.isArray(r.review)) || !r.preconditions || !/^[a-f0-9]{64}$/.test(r.sourceFingerprint??'') || hash([r.intentHash, r.review, r.preconditions,r.sourceFingerprint]) !== r.reviewHash) throw new Error('Invalid Location review binding.');
  } else if (r.state !== 'cancelled') throw new Error('Location receipt has no reviewed intent.');
  if (r.state === 'committed' && (r.auditId !== `location-lifecycle-${keyFor(actor.uid, operationId)}` || !Array.isArray(r.changes) || r.changes.length!==1||r.changes[0].collection!=='locations'||r.changes[0].id!==r.intent?.locationId||r.changes[0].operation!==(r.intent.action==='remove'?'delete':'set')||r.changes[0].version!==(r.intent.action==='remove'?null:r.intent.expectedVersion+1))) throw new Error('Incomplete committed Location receipt.');
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
  if (depth > 100) throw new Error('Location document nesting exceeds capacity.');
  if (typeof value === 'string') return Buffer.byteLength(value) + 32;
  if (value === null || typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean') return 32;
  if (value instanceof Timestamp || value instanceof GeoPoint || value instanceof Date) return 64;
  if (value instanceof Uint8Array) return value.byteLength + 64;
  if (value instanceof DocumentReference) return Buffer.byteLength(value.path) + 512;
  if (Array.isArray(value)) return 32 + value.reduce((size, item) => size + 32 + savedBytes(item, depth + 1), 0);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) return 32 + Object.entries(value).reduce((size, [key, item]) => size + Buffer.byteLength(key) + 32 + savedBytes(item, depth + 1), 0);
  throw new Error('Unsupported saved Location document value.');
}
async function readReceipt(db: Firestore, tx: Transaction, actor: Account, operationId: string) {
  await readPersonTransitionAuthority(db, tx, actor);
  const reference = db.collection(LOCATION_LIFECYCLE_OPERATION_COLLECTION).doc(keyFor(actor.uid, operationId));
  const doc = await tx.get(reference);
  if (doc.ref.path !== reference.path || doc.exists && !doc.updateTime) throw new Error('Invalid Location receipt source.');
  return { reference, current: doc.exists ? receipt(doc.data(), actor, operationId) : undefined };
}

async function readOutstanding(db: Firestore, tx: Transaction, actor: Account) {
  const rows = await tx.get(db.collection(LOCATION_LIFECYCLE_OPERATION_COLLECTION).where('actorUid', '==', actor.uid).where('state', '==', 'prepared')
    .select('schemaVersion', 'actorUid', 'operationId', 'state', 'createdAt', 'expiresAt', 'updatedAt').limit(LOCATION_LIFECYCLE_PENDING_LIMIT + 1));
  if (rows.size !== rows.docs.length || rows.size > LOCATION_LIFECYCLE_PENDING_LIMIT) throw new LeadershipPlanError('capacity', 'Outstanding reviews exceed recovery capacity.');
  return rows.docs.map(doc => {
    const r = doc.data();
    if (!doc.exists || !doc.updateTime || !r || r.schemaVersion !== 1 || r.actorUid !== actor.uid || r.state !== 'prepared' || !operationId(r.operationId)
      || doc.ref.path !== `${LOCATION_LIFECYCLE_OPERATION_COLLECTION}/${keyFor(actor.uid, r.operationId)}`
      || ![r.createdAt, r.expiresAt, r.updatedAt].every(Number.isSafeInteger) || r.createdAt < 0 || r.expiresAt !== r.createdAt + LOCATION_LIFECYCLE_REVIEW_TTL_MS || r.updatedAt < r.createdAt
      || !Number.isFinite(new Date(r.expiresAt).getTime())) throw new Error('Invalid outstanding Location review metadata.');
    return { operationId: r.operationId as string, state: 'prepared' as const, updatedAt: new Date(r.updatedAt).toISOString(), expiresAt: new Date(r.expiresAt).toISOString() };
  }).sort((a, b) => a.operationId.localeCompare(b.operationId));
}

/** Private actor-only recovery list includes expired prepared reviews so they can be cancelled.
 * A preview has no business effect; cancellation retains its receipt and never undoes a commit. */
export async function listLocationLifecycleOperations(db: Firestore, actor: Account) {
  assertPersonTransitionActor(actor);
  return db.runTransaction(async tx => {
    await readPersonTransitionAuthority(db, tx, actor);
    return { schemaVersion: 1 as const, complete: true as const, operations: await readOutstanding(db, tx, actor) };
  }, { readOnly: true });
}

/** Read-only dependency review. A blocked review creates no operation/admission records. */
export async function previewLocationLifecycle(db:Firestore,raw:unknown,actor:Account,clock=()=>new Date()){
  assertPersonTransitionActor(actor);const now=instant(clock);
  return db.runTransaction(async tx=>({schemaVersion:1 as const,review:(await readLocationLifecyclePlan(db,tx,raw,actor,new Date(now).toISOString())).plan.review}),{readOnly:true});
}

/** Internal service only; no HTTP/Store adapter or production activation path is added here. Trusted callers MUST authenticate Firebase first. Live authority is
 * rechecked in every transaction. A private server-written preparation binds actor + exact review;
 * no signing secret, caller-provided patches or browser completeness claims are accepted.
 * Keep production admission off until the maintained plan's workflow, compatibility and release gates pass.
 */
export async function prepareLocationLifecycle(db: Firestore, raw: unknown, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const intent = normalizeLocationLifecycleIntent(raw), intentHash = hash(intent), started = instant(clock);
  return db.runTransaction(async tx => {
    const { reference, current } = await readReceipt(db, tx, actor, intent.operationId);
    if (current) {
      if (current.state === 'cancelled') return outcome(current);
      if (current.intentHash !== intentHash) conflict('This operation ID belongs to a different review.');
      if (current.state === 'prepared') {
        const now = instant(clock);
        if (now < current.createdAt || now >= current.expiresAt) conflict('This review expired or its clock is inconsistent. Start a new operation.');
      }
      return prepared(current);
    }
    // A shared actor document serializes distinct concurrent preparations, including empty-query
    // phantoms. Query size checks alone are not the cross-request admission barrier.
    const admission = db.collection(LOCATION_LIFECYCLE_ADMISSION_COLLECTION).doc(hash(['location-lifecycle-admission-v1', actor.uid]));
    const admissionDoc = await tx.get(admission), admissionData = admissionDoc.data();
    if (admissionDoc.ref.path !== admission.path || admissionDoc.exists && (!admissionDoc.updateTime || admissionData?.schemaVersion !== 1 || admissionData.actorUid !== actor.uid || !Number.isSafeInteger(admissionData?.version) || admissionData.version < 1 || admissionData.version >= Number.MAX_SAFE_INTEGER)) throw new Error('Invalid Location admission source.');
    if ((await readOutstanding(db, tx, actor)).length >= LOCATION_LIFECYCLE_PENDING_LIMIT) throw new LeadershipPlanError('capacity', 'Cancel an outstanding review before preparing another.');
    const { plan,sourceFingerprint } = await readLocationLifecyclePlan(db, tx, intent, actor, new Date(started).toISOString());
    if(!plan.review.ready||plan.writes.length!==1)conflict('Resolve the linked dependencies and review this Location again before preparing.');
    const now = instant(clock);
    if (now < started || now >= started + LOCATION_LIFECYCLE_REVIEW_TTL_MS) conflict('The review expired while loading. Nothing was prepared.');
    const r: Receipt = { schemaVersion: 1, actorUid: actor.uid, operationId: intent.operationId, state: 'prepared', createdAt: started, expiresAt: started + LOCATION_LIFECYCLE_REVIEW_TTL_MS, updatedAt: started,
      intent, intentHash, review: plan.review, preconditions: plan.preconditions,sourceFingerprint, reviewHash: hash([intentHash, plan.review, plan.preconditions,sourceFingerprint]) };
    if (savedBytes(r) >= 900_000) throw new LeadershipPlanError('capacity', 'Location review receipt exceeds capacity.');
    if (admissionDoc.exists) tx.update(admission, { version: admissionData!.version + 1 }, { lastUpdateTime: admissionDoc.updateTime! });
    else tx.create(admission, { schemaVersion: 1, actorUid: actor.uid, version: 1 });
    tx.create(reference, r);
    return prepared(r);
  });
}

export async function commitLocationLifecycle(db: Firestore, raw: unknown, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const command = normalizeLocationLifecycleMarker(raw);
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
    const { plan, native,sourceFingerprint } = await readLocationLifecyclePlan(db, tx, current.intent, actor, new Date(now).toISOString());
    if (!plan.review.ready||sourceFingerprint!==current.sourceFingerprint||!isDeepStrictEqual(plan.preconditions, current.preconditions) || !isDeepStrictEqual(plan.review, current.review)) conflict('Directory data changed. Review again before saving.');
    const allowed=new Set(['locationLifecycleModelVersion','type','hierarchyApplicability','district','districtId','regionId','districtManagerId','districtManagerName','regionalManagerId','regionalManagerName','storeManagerId','storeManagerName','storeManagerPhone','assistantStoreManagerIds','assistantStoreManagerNames','keyHolderIds','keyHolderNames','version','updatedAt']);
    if(plan.writes.length!==1||plan.writes.some(w=>w.collection!=='locations'||w.id!==current.intent!.locationId||w.expectedVersion!==current.intent!.expectedVersion||!Number.isSafeInteger(w.expectedVersion)||w.expectedVersion<0
      ||(current.intent!.action==='remove'?w.operation!=='delete'||w.set!==null:w.operation!=='set'||!w.set||w.expectedVersion>=Number.MAX_SAFE_INTEGER||w.set.version!==w.expectedVersion+1||w.set.updatedAt!==new Date(now).toISOString()||Object.keys(w.set).length!==allowed.size||Object.keys(w.set).some(k=>!allowed.has(k)))))throw new Error('Invalid server-derived Location patch.');
    const docs = await tx.getAll(...plan.writes.map(w => db.collection(w.collection).doc(w.id)));
    const tombstoneRef=db.collection(LOCATION_LIFECYCLE_TOMBSTONE_COLLECTION).doc(current.intent!.locationId),tombstone=await tx.get(tombstoneRef);
    if(tombstone.ref.path!==tombstoneRef.path||tombstone.exists)conflict('This Location identity has already been removed or requires reconciliation.');
    if (docs.length !== plan.writes.length || new Set(docs.map(d => d.ref.path)).size !== docs.length) throw new Error('Incomplete full-document reads.');
    const byPath = new Map(docs.map(d => [d.ref.path, d]));
    let bytes = 0;
    const changes = plan.writes.map(patch => {
      const path = `${patch.collection}/${patch.id}`, doc = byPath.get(path);
      if (!doc) throw new Error('Wrong full-document identity.');
      const before = doc.data(), expected = native.get(path);
      if (!doc.exists || !doc.updateTime || !expected || !before || Object.hasOwn(before, 'id') && before.id !== patch.id
        || (before.version ?? 0) !== patch.expectedVersion || String(doc.updateTime.seconds) !== expected.updateTime.seconds || doc.updateTime.nanoseconds !== expected.updateTime.nanoseconds) conflict('A changed record no longer matches its reviewed source.');
      for (const [key, value] of Object.entries(expected.data)) {
        const actual=key==='storeManagerPhone'&&typeof before[key]==='string'&&before[key]?'[present]':before[key];
        if(!Object.hasOwn(before,key)||!isDeepStrictEqual(actual,value))conflict('Inconsistent full-document projection.');
      }
      const size = savedBytes(patch.operation==='delete'?before:{ ...before, ...patch.set }) + 1024;
      if (size >= 900_000) throw new LeadershipPlanError('capacity', 'A full saved record exceeds conservative document capacity.');
      bytes += size;
      return { doc, patch, change: { collection: patch.collection, id: patch.id,operation:patch.operation, version: patch.operation==='delete'?null:patch.set!.version as number } };
    });
    const auditId = `location-lifecycle-${keyFor(actor.uid, command.operationId)}`;
    const committed: Receipt = { ...current, state: 'committed', updatedAt: now, auditId, changes: changes.map(c => c.change) };
    const audit = { id: auditId, timestamp: new Date(now).toISOString(), userId: actor.uid, userName: actor.name,
      action: current.intent!.action==='remove'?'Location Removed':'Location Use Converted', entityType: 'Location' as const, entityId: current.intent!.locationId,
      entityName: plan.review.name, details: 'Reviewed Location use, hierarchy, staffing and linked dependencies. Account access and People records unchanged.',
      operationId: command.operationId, review: plan.review, changes: committed.changes } satisfies AuditLogEntry & { operationId: string; review: unknown; changes: unknown };
    if (bytes > 4 * 1024 * 1024 || savedBytes(audit) >= 900_000 || savedBytes(committed) >= 900_000 || bytes + savedBytes(audit) + savedBytes(committed) > 6 * 1024 * 1024) throw new LeadershipPlanError('capacity', 'Full saved records, audit or receipt exceed conservative atomic capacity.');
    const finished = instant(clock);
    if (finished < now || finished >= current.expiresAt) conflict('The review expired while checking records. Nothing was saved.');
    for (const { doc, patch } of changes) {
      if(patch.operation==='delete')tx.delete(doc.ref,{lastUpdateTime:doc.updateTime!});
      else tx.update(doc.ref,patch.set!,{lastUpdateTime:doc.updateTime!});
    }
    tx.create(db.collection('audit_logs').doc(auditId), audit);
    if(current.intent!.action==='remove')tx.create(tombstoneRef,{schemaVersion:1,locationId:current.intent!.locationId,operationId:command.operationId,auditId,removedAt:new Date(now).toISOString()});
    tx.update(reference, { state: committed.state, updatedAt: now, auditId, changes: committed.changes });
    return outcome(committed);
  });
}

export async function readLocationLifecycleOperation(db: Firestore, raw: unknown, actor: Account) {
  assertPersonTransitionActor(actor);
  const command = normalizeLocationLifecycleMarker(raw);
  return db.runTransaction(async tx => {
    const { current } = await readReceipt(db, tx, actor, command.operationId);
    return current ? outcome(current) : { schemaVersion: 1 as const, operationId: command.operationId, state: 'missing' as const };
  }, { readOnly: true });
}

export async function cancelLocationLifecycleOperation(db: Firestore, raw: unknown, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  const command = normalizeLocationLifecycleMarker(raw);
  return db.runTransaction(async tx => {
    const { reference, current } = await readReceipt(db, tx, actor, command.operationId);
    if (current && current.state !== 'prepared') return outcome(current);
    const now = instant(clock);
    if (current && now < current.updatedAt) conflict('Location operation clock moved backwards.');
    const r: Receipt = current ? { ...current, state: 'cancelled', updatedAt: now }
      : { schemaVersion: 1, actorUid: actor.uid, operationId: command.operationId, state: 'cancelled', createdAt: now, expiresAt: now + LOCATION_LIFECYCLE_REVIEW_TTL_MS, updatedAt: now };
    if (current) tx.update(reference, { state: 'cancelled', updatedAt: now }); else tx.create(reference, r);
    return outcome(r);
  });
}
