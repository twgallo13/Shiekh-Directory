import test from 'node:test';
import assert from 'node:assert/strict';
import { readLocationLifecyclePlan } from '../server/locationLifecycleSource';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor,leadershipNow as now } from './helpers/organizationLeadershipFixture';
export function lifecycleSourceFixture(){
  const f=moveFixture();f.records.get('locations/corporate').storeNumber='000';
  const intent={schemaVersion:1,operationId:'convert-source-1',locationId:'007',expectedVersion:4,reason:'Reviewed synthetic use conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};
  return{...f,intent,read:(raw:unknown=intent)=>readLocationLifecyclePlan(f.firestore,f.transaction,raw,actor,now)};
}
test('lifecycle source derives complete bounded inventories and namespaced rosters without writes or contact payloads',async()=>{
  const f=lifecycleSourceFixture(),before=structuredClone([...f.records]);
  f.records.get('locations/007').storeManagerId='incumbent';f.records.get('locations/007').storeManagerPhone='PRIVATE_STAFF_PHONE';
  const result=await f.read({...f.intent,releaseStoreStaffing:true});
  assert.equal(result.plan.review.ready,true);assert.equal(result.plan.writes[0].set!.type,'Corporate Office');
  assert.equal(f.reads.filter(r=>r.collection==='leadership_assignments').length,2);
  assert(f.reads.every(r=>Number.isFinite(r.maximum)));assert(result.native.get('locations/007')!.updateTime.seconds);
  assert.doesNotMatch(JSON.stringify([...result.native]),/PRIVATE|workEmail|firebaseUid|email/);
  assert.equal(result.native.get('locations/007')!.data.storeManagerPhone,'[present]');
  assert.equal(f.records.get('locations/007').version,4);assert.deepEqual([...f.records].filter(([p])=>p!=='locations/007'),before.filter(([p])=>p!=='locations/007'));
});
test('corporate removal needs no fake roster or workplace and incoming conversion reads destination rosters',async()=>{
  const f=lifecycleSourceFixture();f.records.get('locations/corporate').recordStatus='Retired';f.records.get('people/new-hire').primaryLocationId=null;
  const removed=await f.read({schemaVersion:1,operationId:'remove-corp',locationId:'corporate',expectedVersion:1,reason:'Reviewed synthetic removal',action:'remove',acknowledgeApiRemoval:true});
  assert.equal(removed.plan.review.ready,true);assert.equal(f.reads.filter(r=>r.collection==='leadership_assignments').length,0);
  const created=await f.read({...f.intent,locationId:'corporate',expectedVersion:1,type:'Enclosed Mall',hierarchy:{districtId:'02',regionId:'02',expectedDistrictVersion:1,expectedRegionVersion:1}});
  assert.equal(created.plan.review.after.hierarchy!.districtManager.id,'new-hire');
});
test('complete incoming People, account and nested pending request links become blockers',async()=>{
  const f=lifecycleSourceFixture();f.records.get('locations/007').recordStatus='Retired';
  f.records.set('people/support',{fullName:'Support',status:'Active',supportedLocationIds:['007']});
  f.records.set('users/store-user',{name:'Store account',status:'Suspended',accessScope:'Store 7',email:'PRIVATE_OTHER_ACCOUNT'});
  f.records.set('requests/pending',{status:'Pending',targetType:'Person',targetId:'incumbent',requestedChanges:{primaryLocationId:'007',workEmail:'PRIVATE_PENDING_CONTACT'}});
  const p=await f.read({schemaVersion:1,operationId:'remove-007',locationId:'007',expectedVersion:4,reason:'Reviewed synthetic removal',action:'remove',acknowledgeApiRemoval:true});
  assert.equal(p.plan.review.ready,false);assert.equal(p.plan.review.dependencies.people[0].id,'support');assert.equal(p.plan.review.dependencies.accounts[0].id,'store-user');assert.equal(p.plan.review.dependencies.requests[0].id,'pending');assert.equal(p.plan.writes.length,0);
  assert.deepEqual(p.native.get('requests/pending')!.data.requestedChanges,{primaryLocationId:'007'});assert.doesNotMatch(JSON.stringify([...p.native]),/PRIVATE/);
});
test('invalid intent/actor fails before source reads and live authority is mandatory',async()=>{
  const f=lifecycleSourceFixture();await assert.rejects(f.read({...f.intent,locationId:'../007'}));assert.equal(f.reads.length,0);
  await assert.rejects(readLocationLifecyclePlan(f.firestore,f.transaction,f.intent,{...actor,role:'Editor'},now));assert.equal(f.reads.length,0);
  f.records.get('users/admin').status='Inactive';await assert.rejects(f.read(),/authority/);assert.equal(f.reads.length,1);
});
test('missing metadata, wrong paths, duplicate/failing/incomplete or oversized inventories fail closed',async()=>{
  for(const fault of [{fail:'requests'},{missingTime:'locations/007'},{badPath:'people/incumbent'},{duplicate:'users'},{omitFilter:true}]){
    const f=lifecycleSourceFixture();Object.assign(f.state,fault);await assert.rejects(f.read());assert.equal(f.records.get('locations/007').version,4);
  }
  const f=lifecycleSourceFixture();for(let i=0;i<5001;i++)f.records.set(`requests/extra-${i}`,{status:'Approved'});await assert.rejects(f.read(),/bounded capacity/);
});
test('fresh inventory additions, hidden version and dependency changes alter source bindings',async()=>{
  const f=lifecycleSourceFixture(),a=await f.read();
  f.records.set('users/another',{status:'Active',name:'Company account',accessScope:'Company-wide',version:1});const b=await f.read();assert.notEqual(a.sourceFingerprint,b.sourceFingerprint);
  f.records.get('users/another').version=2;const c=await f.read();assert.notEqual(b.sourceFingerprint,c.sourceFingerprint);
  f.records.set('requests/pending',{status:'Pending',targetType:'Person',targetId:'incumbent',requestedChanges:{supportedLocationIds:['007']}});const d=await f.read();assert.equal(d.plan.review.ready,false);assert.notEqual(c.sourceFingerprint,d.sourceFingerprint);
});
