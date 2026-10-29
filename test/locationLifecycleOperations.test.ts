import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor,leadershipNow } from './helpers/organizationLeadershipFixture';
import { previewLocationLifecycle as preview,prepareLocationLifecycle as prepare,commitLocationLifecycle as commit,readLocationLifecycleOperation as status,cancelLocationLifecycleOperation as cancel,listLocationLifecycleOperations as list,LOCATION_LIFECYCLE_OPERATION_COLLECTION as receipts,LOCATION_LIFECYCLE_ADMISSION_COLLECTION as admissions,LOCATION_LIFECYCLE_REVIEW_TTL_MS as ttl } from '../server/locationLifecycleOperations';
const time=Date.parse(leadershipNow),clock=()=>new Date(time);
function fixture(){const f=moveFixture();f.records.get('locations/corporate').storeNumber='000';const intent={schemaVersion:1,operationId:'lifecycle-1',locationId:'007',expectedVersion:4,reason:'Explicit reviewed conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};return{...f,intent};}
const rows=(f:ReturnType<typeof fixture>,collection:string)=>[...f.records].filter(([p])=>p.startsWith(collection+'/'));
async function reviewed(f:ReturnType<typeof fixture>,raw:unknown=f.intent){const p=await prepare(f.firestore,raw,actor,clock);assert('reviewHash' in p);return{operationId:p.operationId,reviewHash:p.reviewHash!};}
test('read-only blocked dependency preview and failed preparation make no business or receipt changes',async()=>{
  const f=fixture();f.records.set('users/store',{status:'Active',accessScope:'Store 7',name:'Store account',email:'PRIVATE_EMAIL'});const before=structuredClone([...f.records]);
  const r=await preview(f.firestore,f.intent,actor,clock);assert.equal(r.review.ready,false);assert.equal(r.review.dependencies.accounts[0].id,'store');assert.doesNotMatch(JSON.stringify(r),/PRIVATE|patches|sourceFingerprint|preconditions/);
  await assert.rejects(prepare(f.firestore,f.intent,actor,clock),/dependencies/);assert.deepEqual([...f.records],before);
});
test('preparation is private, deterministic and idempotent without business writes',async()=>{
  const f=fixture(),before=structuredClone([...f.records]),p=await prepare(f.firestore,f.intent,actor,clock);
  assert.deepEqual(await prepare(f.firestore,f.intent,actor,clock),p);assert.equal(rows(f,receipts).length,1);assert.deepEqual([...f.records].filter(([path])=>![receipts,admissions].some(c=>path.startsWith(c+'/'))),before);
  assert.doesNotMatch(JSON.stringify(p),/PRIVATE|sourceFingerprint|preconditions|actorUid|writes/);assert.doesNotMatch(JSON.stringify(rows(f,receipts)),/PRIVATE/);
});
test('conversion updates only the target and preserves contacts, workplace, people, rosters and history',async()=>{
  const f=fixture();Object.assign(f.records.get('locations/007'),{storeManagerId:'incumbent',storeManagerName:'Current Manager',storeManagerPhone:'PRIVATE_STAFF_PHONE',locationInboxEmail:'PRIVATE_SHARED_MAIL',customFields:{preserved:true}});f.intent.releaseStoreStaffing=true;
  const before=structuredClone([...f.records]),command=await reviewed(f),saved=await commit(f.firestore,command,actor,clock),location=f.records.get('locations/007');
  assert.equal(saved.state,'committed');assert.equal(location.version,5);assert.equal(location.locationLifecycleModelVersion,1);assert.equal(location.type,'Corporate Office');assert.equal(location.districtId,null);assert.equal(location.regionalManagerId,null);assert.equal(location.storeManagerId,null);assert.equal(location.storeManagerPhone,'');assert.equal(location.address,'PRIVATE_ADDRESS');assert.equal(location.locationInboxEmail,'PRIVATE_SHARED_MAIL');assert.deepEqual(location.customFields,{preserved:true});
  assert.deepEqual(rows(f,'people'),before.filter(([p])=>p.startsWith('people/')));assert.deepEqual(rows(f,'leadership_assignments'),before.filter(([p])=>p.startsWith('leadership_assignments/')));assert.equal(rows(f,'audit_logs').length,1);assert.equal(rows(f,'audit_logs')[0][1].action,'Location Use Converted');assert.doesNotMatch(JSON.stringify([...rows(f,'audit_logs'),...rows(f,receipts)]),/PRIVATE/);
});
test('removal reserves the old ID while audits and immutable terminal outcomes remain recoverable',async()=>{
  const f=fixture();f.records.get('locations/007').recordStatus='Retired';const raw={schemaVersion:1,operationId:'remove-1',locationId:'007',expectedVersion:4,reason:'Explicit reviewed removal',action:'remove',acknowledgeApiRemoval:true};
  const command=await reviewed(f,raw),saved=await commit(f.firestore,command,actor,clock);assert.equal(f.records.has('locations/007'),false);assert.equal(f.records.get('location_lifecycle_tombstones/007').locationId,'007');assert.equal(rows(f,'audit_logs').length,1);
  f.records.delete('people/incumbent');assert.deepEqual(await commit(f.firestore,command,actor,()=>new Date(time+ttl*3)),saved);assert.deepEqual(await status(f.firestore,{operationId:'remove-1'},actor),saved);assert.deepEqual(await cancel(f.firestore,{operationId:'remove-1'},actor,clock),saved);assert.equal(rows(f,'audit_logs').length,1);
});
test('a new incoming reference or changed native business inventory invalidates confirmation',async()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>f.records.set('users/new-store',{status:'Suspended',accessScope:'Store 7'}),(f:ReturnType<typeof fixture>)=>f.records.set('requests/incoming',{status:'Pending',targetType:'Person',targetId:'incumbent',requestedChanges:{supportedLocationIds:['007']}}),(f:ReturnType<typeof fixture>)=>f.records.get('locations/007').version++,(f:ReturnType<typeof fixture>)=>f.records.get('people/incumbent').fullName='Different Name']){
    const f=fixture(),command=await reviewed(f);change(f);await assert.rejects(commit(f.firestore,command,actor,clock));assert.equal(f.records.get('locations/007').type,'Enclosed Mall');assert.equal(rows(f,'audit_logs').length,0);
  }
});
test('intent reuse, mismatched hash, unprepared or tampered private receipts cannot save',async()=>{
  const f=fixture(),command=await reviewed(f);await assert.rejects(prepare(f.firestore,{...f.intent,reason:'Different intent'},actor,clock));await assert.rejects(commit(f.firestore,{...command,reviewHash:'0'.repeat(64)},actor,clock));await assert.rejects(commit(f.firestore,{operationId:'missing',reviewHash:command.reviewHash},actor,clock));
  rows(f,receipts)[0][1].sourceFingerprint='0'.repeat(64);await assert.rejects(status(f.firestore,{operationId:command.operationId},actor));assert.equal(rows(f,'audit_logs').length,0);
});
test('cancellation seals absent/prepared IDs and never undoes committed work',async()=>{
  const f=fixture();const cancelled=await cancel(f.firestore,{operationId:f.intent.operationId},actor,clock);assert.equal(cancelled.state,'cancelled');assert.equal((await prepare(f.firestore,f.intent,actor,clock)).state,'cancelled');
  const g=fixture(),command=await reviewed(g);await cancel(g.firestore,command,actor,clock);assert.equal((await commit(g.firestore,command,actor,clock)).state,'cancelled');assert.equal(g.records.get('locations/007').version,4);assert.equal(rows(g,'audit_logs').length,0);
});
test('live authority, actor isolation and expiry guard every operation and immutable recovery',async()=>{
  const f=fixture(),command=await reviewed(f);await assert.rejects(commit(f.firestore,command,actor,()=>new Date(time+ttl)),/expired/);let calls=0;await assert.rejects(commit(f.firestore,command,actor,()=>new Date(calls++?time+ttl:time)),/expired/);
  const other={...actor,uid:'different-admin'};assert.equal((await status(f.firestore,{operationId:command.operationId},actor)).state,'prepared');await assert.rejects(status(f.firestore,{operationId:command.operationId},other),/authority/);
  f.records.get('users/admin').status='Inactive';for(const run of [()=>status(f.firestore,command,actor),()=>cancel(f.firestore,command,actor,clock),()=>list(f.firestore,actor),()=>commit(f.firestore,command,actor,clock),()=>preview(f.firestore,f.intent,actor,clock)])await assert.rejects(run(),/authority/);
});
test('capacity and write failures leave no partial conversion, audit or terminal receipt',async()=>{
  for(const change of [(f:ReturnType<typeof fixture>)=>f.records.get('locations/007').largePreservedValue='x'.repeat(910_000),(f:ReturnType<typeof fixture>)=>f.state.failWrite=true]){
    const f=fixture(),command=await reviewed(f);change(f);await assert.rejects(commit(f.firestore,command,actor,clock));assert.equal(f.records.get('locations/007').version,4);assert.equal(rows(f,'audit_logs').length,0);assert.equal(rows(f,receipts)[0][1].state,'prepared');
  }
});
test('bounded actor-only recovery includes expired reviews and rejects oversize backlog',async()=>{
  const f=fixture();await reviewed(f);const seed=structuredClone(rows(f,receipts)[0][1]);
  const key=(id:string)=>createHash('sha256').update(JSON.stringify(['location-lifecycle-v1',actor.uid,id])).digest('hex');
  for(let i=1;i<100;i++){const id=`pending-${i}`;f.records.set(`${receipts}/${key(id)}`,{...seed,operationId:id});}
  const result=await list(f.firestore,actor);assert.equal(result.operations.length,100);assert.doesNotMatch(JSON.stringify(result),/Current Manager|sourceFingerprint|preconditions|reason|PRIVATE/);
  await assert.rejects(prepare(f.firestore,{...f.intent,operationId:'extra'},actor,clock),/outstanding/);f.records.set(`${receipts}/${key('overflow')}`,{...seed,operationId:'overflow'});await assert.rejects(list(f.firestore,actor),/capacity/);
});
