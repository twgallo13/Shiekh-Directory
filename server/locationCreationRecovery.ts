import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied } from './firestoreDirectory';
import type { LocationCreationCommand } from '../src/lib/locationCreationContract';
export type { LocationCreationCommand } from '../src/lib/locationCreationContract';
import { requireOrganizationLeadershipAdmission } from './organizationLeadershipConfiguration';

export const LOCATION_CREATION_RECEIPTS = 'location_creation_operations';
export const LOCATION_CREATION_ADMISSION = 'location_creation_admission';
export const LOCATION_CREATION_TTL = 600_000;
export const LOCATION_CREATION_PENDING_LIMIT = 100;
export interface LocationCreationReceipt {
  schemaVersion: 1; actorUid: string; locationId: string; state: 'prepared' | 'committed' | 'cancelled';
  createdAt: number; expiresAt: number; updatedAt: number; intentHash?: string; pendingActorKey?: string; auditId?: string; createdVersion?: number;
}
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const invalid = (message: string): never => { throw new DirectoryValidationError(message); };
const conflict = (message: string): never => { throw new DirectoryConflict(message); };
function canonical(v: unknown, depth = 0): string {
  if (depth > 20) return invalid('Creation nesting exceeds capacity.');
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + Array.from(v, item => canonical(item, depth + 1)).join(',') + ']';
  if (object(v)) return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k], depth + 1)).join(',') + '}';
  return invalid('Creation requires finite JSON values.');
}
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
const actorKey = (actor: Account) => hash(['location-creation-actor-v1', actor.uid]);
export const locationCreationKey = (actor: Account, locationId: string) => hash(['location-creation-v1', actor.uid, locationId]);
export const locationCreationAuditId = (actor: Account, locationId: string) => `location-creation-${locationCreationKey(actor, locationId)}`;
export function normalizeLocationCreationMarker(v: unknown): { locationId: string } {
  if (!object(v) || Object.keys(v).length !== 1 || !id(v.locationId)) return invalid('Invalid creation identity.');
  return { locationId: v.locationId };
}
export function normalizeLocationCreationCommand(v: unknown): LocationCreationCommand {
  if (!object(v) || Object.keys(v).length !== 1 || !object(v.write)) return invalid('A single create-only Location is required.');
  const w = v.write, keys = ['collection','id','operation','expectedVersion','data','expectedCustomMetadata','locationInboxAcknowledgment'];
  if (Object.keys(w).some(k => !keys.includes(k)) || w.collection !== 'locations' || w.operation !== 'set' || !id(w.id) || w.expectedVersion !== null || !object(w.data)
    || Object.hasOwn(w.data, 'id') && w.data.id !== w.id || Object.hasOwn(w, 'expectedCustomMetadata') && !object(w.expectedCustomMetadata)) return invalid('Use the exact create-only Location draft.');
  if (Object.hasOwn(w, 'locationInboxAcknowledgment')) {
    const a = w.locationInboxAcknowledgment;
    if (!object(a) || Object.keys(a).some(k => !['normalizedEmail','conflictDigest'].includes(k)) || typeof a.normalizedEmail !== 'string' || !a.normalizedEmail.length || a.normalizedEmail.length > 254 || typeof a.conflictDigest !== 'string' || !a.conflictDigest.length || a.conflictDigest.length > 20_000) return invalid('Invalid shared inbox acknowledgment.');
  }
  const encoded = canonical(v);
  if (Buffer.byteLength(encoded) > 200_000) return invalid('Creation exceeds its review size limit.');
  return JSON.parse(encoded) as LocationCreationCommand;
}
const allowed = (a: Pick<Account, 'role' | 'status' | 'accessScope'>) => ['System Administrator','Directory Data Steward','Editor'].includes(a.role) && a.status === 'Active' && a.accessScope === 'Company-wide';
export function assertLocationCreationActor(actor: Account) {
  if (!allowed(actor) || typeof actor.uid !== 'string' || !actor.uid.length || actor.uid.length > 128 || /[\u0000-\u001f\u007f]/.test(actor.uid)) throw new DirectoryWriteDenied('Current Company-wide Location write authority is required.');
}
async function authority(db: Firestore, tx: Transaction, actor: Account) {
  assertLocationCreationActor(actor);
  const rows = await tx.get(db.collection('users').where('firebaseUid','==',actor.uid).select('role','status','accessScope').limit(2));
  if (rows.size !== 1 || rows.docs.length !== 1 || !rows.docs[0].exists || !rows.docs[0].updateTime || !allowed(rows.docs[0].data() as Account) || rows.docs[0].data().role !== actor.role) throw new DirectoryWriteDenied('Refresh current Location write authority before continuing.');
}
function instant(clock: () => Date) {
  const now = clock().getTime();
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(now + LOCATION_CREATION_TTL) || !Number.isFinite(new Date(now + LOCATION_CREATION_TTL).getTime())) throw new Error('Creation clock is unavailable.');
  return now;
}
function receipt(v: unknown, actor: Account, locationId: string): LocationCreationReceipt {
  if (!object(v) || Object.keys(v).some(k=>!['schemaVersion','actorUid','locationId','state','createdAt','expiresAt','updatedAt','intentHash','pendingActorKey','auditId','createdVersion'].includes(k)) || v.schemaVersion !== 1 || v.actorUid !== actor.uid || v.locationId !== locationId || !['prepared','committed','cancelled'].includes(v.state)
    || ![v.createdAt,v.expiresAt,v.updatedAt].every(n=>Number.isSafeInteger(n) && Number.isFinite(new Date(n).getTime())) || v.createdAt < 0 || v.updatedAt < v.createdAt || v.expiresAt !== v.createdAt + LOCATION_CREATION_TTL
    || v.state !== 'cancelled' && !/^[a-f0-9]{64}$/.test(v.intentHash) || v.intentHash !== undefined && !/^[a-f0-9]{64}$/.test(v.intentHash)
    || (v.state === 'prepared' ? v.pendingActorKey !== actorKey(actor) : Object.hasOwn(v,'pendingActorKey'))
    || (v.state === 'committed' ? v.auditId !== locationCreationAuditId(actor,locationId) || v.createdVersion !== 1 : Object.hasOwn(v,'auditId') || Object.hasOwn(v,'createdVersion'))) throw new Error('Invalid creation receipt.');
  return v as LocationCreationReceipt;
}
function outcome(r: LocationCreationReceipt) {
  return { schemaVersion: 1 as const, locationId: r.locationId, state: r.state, updatedAt: new Date(r.updatedAt).toISOString(), ...(r.state === 'prepared' ? {expiresAt:new Date(r.expiresAt).toISOString()} : {}), ...(r.state === 'committed' ? {auditId:r.auditId!,createdVersion:1 as const} : {}) };
}
async function admission(db: Firestore, tx: Transaction, actor: Account, complete = false) {
  const ref = db.collection(LOCATION_CREATION_ADMISSION).doc(actorKey(actor)), saved = await tx.get(ref);
  const data = saved.data(), count = saved.exists ? data?.pending : 0, version = saved.exists ? data?.version : 0;
  if (saved.exists && (data?.schemaVersion !== 1 || data?.actorUid !== actor.uid || !Number.isSafeInteger(count) || count < 0 || count > LOCATION_CREATION_PENDING_LIMIT || !Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER)) throw new Error('Creation admission is unavailable.');
  const receipts:LocationCreationReceipt[]=[];
  if (complete) {
    const pending = await tx.get(db.collection(LOCATION_CREATION_RECEIPTS).where('pendingActorKey','==',actorKey(actor)).limit(LOCATION_CREATION_PENDING_LIMIT + 1));
    if (pending.size !== pending.docs.length || pending.size !== count || pending.size > LOCATION_CREATION_PENDING_LIMIT) throw new Error('Creation pending inventory is incomplete.');
    for (const doc of pending.docs) { const r=receipt(doc.data(),actor,String(doc.data().locationId)); if (!id(r.locationId) || doc.id !== locationCreationKey(actor,r.locationId) || r.state !== 'prepared' || !doc.updateTime) throw new Error('Invalid pending creation.'); receipts.push(r); }
  }
  return {ref,count:count as number,version:version as number,receipts};
}
function changeAdmission(tx: Transaction, a: Awaited<ReturnType<typeof admission>>, actor: Account, delta: 1 | -1) {
  if (a.count + delta < 0 || a.count + delta > LOCATION_CREATION_PENDING_LIMIT) return conflict('Resolve an existing creation before starting another.');
  tx.set(a.ref,{schemaVersion:1,actorUid:actor.uid,pending:a.count+delta,version:a.version+1});
}
export async function prepareLocationCreation(db: Firestore, input: unknown, actor: Account, clock = () => new Date()) {
  requireOrganizationLeadershipAdmission('command'); assertLocationCreationActor(actor);
  const command=normalizeLocationCreationCommand(input), locationId=command.write.id, intentHash=hash(command);
  return db.runTransaction(async tx=>{
    await authority(db,tx,actor);
    const ref=db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,locationId)), saved=await tx.get(ref);
    if(saved.exists){const r=receipt(saved.data(),actor,locationId);if(r.intentHash!==intentHash || r.state==='cancelled')return conflict('This creation identity is already used or cancelled. Recover it before changing the draft.');return outcome(r);}
    const a=await admission(db,tx,actor,true); if(a.count>=LOCATION_CREATION_PENDING_LIMIT)return conflict('Resolve an existing creation before starting another.');
    const now=instant(clock), r:LocationCreationReceipt={schemaVersion:1,actorUid:actor.uid,locationId,state:'prepared',createdAt:now,expiresAt:now+LOCATION_CREATION_TTL,updatedAt:now,intentHash,pendingActorKey:actorKey(actor)};
    changeAdmission(tx,a,actor,1);tx.create(ref,r);return outcome(r);
  });
}
/** Internal Store hook only. Every read precedes business writes; a cancel conflicts with this
 * receipt read. The generic HTTP writer cannot supply this proof or mint a prepared receipt. */
export async function readLocationCreationCommit(db: Firestore, tx: Transaction, input: unknown, actor: Account, clock = () => new Date()) {
  requireOrganizationLeadershipAdmission('command'); const command=normalizeLocationCreationCommand(input); await authority(db,tx,actor);
  const locationId=command.write.id,ref=db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,locationId)),saved=await tx.get(ref);
  if(!saved.exists)return conflict('Prepare this exact creation before saving.');
  const r=receipt(saved.data(),actor,locationId);if(r.intentHash!==hash(command)||r.state==='cancelled')return conflict('This creation was changed or safely cancelled.');
  if(r.state==='committed')return {replayed:true as const,ref,receipt:r};
  const now=instant(clock);if(now<r.createdAt||now>=r.expiresAt)return conflict('This creation review expired. Recover or cancel it before preparing another.');
  const a=await admission(db,tx,actor,true);if(a.count<1 || !a.receipts.some(p=>p.locationId===locationId))throw new Error('Creation admission is incomplete.');
  return {replayed:false as const,ref,receipt:r,admission:a,now};
}
export function finishLocationCreationCommit(tx: Transaction, proof: Awaited<ReturnType<typeof readLocationCreationCommit>>, actor: Account) {
  if(proof.replayed || !('admission' in proof) || !proof.admission) throw new Error('A fresh creation proof is required.');
  const {pendingActorKey:_pending,...base}=proof.receipt;
  changeAdmission(tx,proof.admission,actor,-1);
  tx.set(proof.ref,{...base,state:'committed',updatedAt:proof.now,auditId:locationCreationAuditId(actor,base.locationId),createdVersion:1});
}
export async function readLocationCreation(db: Firestore,input:unknown,actor:Account){
  requireOrganizationLeadershipAdmission('recovery');assertLocationCreationActor(actor);const {locationId}=normalizeLocationCreationMarker(input);
  return db.runTransaction(async tx=>{await authority(db,tx,actor);const saved=await tx.get(db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,locationId)));return saved.exists?outcome(receipt(saved.data(),actor,locationId)):{schemaVersion:1 as const,locationId,state:'missing' as const};},{readOnly:true});
}
export async function cancelLocationCreation(db: Firestore,input:unknown,actor:Account,clock=()=>new Date()){
  requireOrganizationLeadershipAdmission('recovery');assertLocationCreationActor(actor);const {locationId}=normalizeLocationCreationMarker(input);
  return db.runTransaction(async tx=>{
    await authority(db,tx,actor);const ref=db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,locationId)),saved=await tx.get(ref),r=saved.exists?receipt(saved.data(),actor,locationId):null;
    if(r && r.state!=='prepared')return outcome(r);
    const a=r?await admission(db,tx,actor,true):null,now=instant(clock);if(r && (!a?.receipts.some(p=>p.locationId===locationId) || now<r.updatedAt))throw new Error('Creation admission or clock is unavailable.');
    const {pendingActorKey:_pending,...base}=r??{schemaVersion:1 as const,actorUid:actor.uid,locationId,createdAt:now,expiresAt:now+LOCATION_CREATION_TTL,pendingActorKey:undefined};
    const next:LocationCreationReceipt={...base,state:'cancelled',updatedAt:now};
    if(a)changeAdmission(tx,a,actor,-1);tx.set(ref,next);return outcome(next);
  });
}
export async function listLocationCreations(db:Firestore,actor:Account){
  requireOrganizationLeadershipAdmission('recovery');assertLocationCreationActor(actor);
  return db.runTransaction(async tx=>{await authority(db,tx,actor);const a=await admission(db,tx,actor,true);return {schemaVersion:1 as const,complete:true as const,operations:a.receipts.map(outcome).sort((a,b)=>a.locationId.localeCompare(b.locationId))};},{readOnly:true});
}

/** All-off compatibility is safe only when this actor has no unresolved server creation.
 * This read-only admission probe remains available while recovery itself is paused. */
export async function locationCreationLegacyAllowed(db:Firestore,actor:Account){
  assertLocationCreationActor(actor);
  return db.runTransaction(async tx=>{await authority(db,tx,actor);const a=await admission(db,tx,actor,true);return a.count===0;},{readOnly:true});
}
