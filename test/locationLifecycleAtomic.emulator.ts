import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore,Timestamp } from '@google-cloud/firestore';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor,leadershipNow } from './helpers/organizationLeadershipFixture';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { prepareLocationLifecycle as prepare,commitLocationLifecycle as commit,readLocationLifecycleOperation as status,cancelLocationLifecycleOperation as cancel,LOCATION_LIFECYCLE_REVIEW_TTL_MS as ttl } from '../server/locationLifecycleOperations';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
const time=Date.parse(leadershipNow),clock=()=>new Date(time);
async function fixture(){
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`location-lifecycle-${randomUUID()}`}),f=moveFixture();f.records.get('locations/corporate').storeNumber='000';
  const batch=db.batch();for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();
  const intent={schemaVersion:1,operationId:'native-lifecycle',locationId:'007',expectedVersion:4,reason:'Explicit reviewed conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};
  const reviewed=async(raw:unknown=intent)=>{const p=await prepare(db,raw,actor,clock);assert('reviewHash' in p);return{operationId:p.operationId,reviewHash:p.reviewHash!};};return{db,intent,reviewed};
}
test('SDK concurrent lifecycle commits save one conversion and audit with full native preservation',{timeout:90_000},async()=>{
  const f=await fixture();try{
    await f.db.doc('locations/007').update({preservedNative:Timestamp.fromMillis(1234),locationInboxEmail:'PRIVATE_SHARED_MAIL',storeManagerId:'incumbent',storeManagerName:'Current Manager',storeManagerPhone:'PRIVATE_PHONE'});f.intent.releaseStoreStaffing=true;
    const people=(await f.db.collection('people').get()).docs.map(d=>({id:d.id,...d.data()})),rosters=(await f.db.collection('leadership_assignments').get()).docs.map(d=>({id:d.id,...d.data()}));
    const command=await f.reviewed(),[one,two]=await Promise.all([commit(f.db,command,actor,clock),commit(f.db,command,actor,clock)]);assert.deepEqual(one,two);assert.equal(one.state,'committed');
    const location=(await f.db.doc('locations/007').get()).data()!;assert.equal(location.version,5);assert.equal(location.locationLifecycleModelVersion,1);assert.equal(location.type,'Corporate Office');assert.equal(location.districtId,null);assert.equal(location.storeManagerId,null);assert.equal(location.storeManagerPhone,'');assert.equal(location.locationInboxEmail,'PRIVATE_SHARED_MAIL');assert(location.preservedNative instanceof Timestamp);assert.equal(location.preservedNative.toMillis(),1234);
    assert.deepEqual((await f.db.collection('people').get()).docs.map(d=>({id:d.id,...d.data()})),people);assert.deepEqual((await f.db.collection('leadership_assignments').get()).docs.map(d=>({id:d.id,...d.data()})),rosters);const audits=await f.db.collection('audit_logs').get();assert.equal(audits.size,1);assert.doesNotMatch(JSON.stringify(audits.docs[0].data()),/PRIVATE/);assert.equal((await f.db.collection('location_lifecycle_tombstones').get()).size,0);
    assert.deepEqual(await status(f.db,command,actor),one);assert.deepEqual(await cancel(f.db,command,actor,clock),one);
  }finally{await f.db.terminate();}
});
test('SDK native-time change without a version increment and new references invalidate reviewed conversion',{timeout:90_000},async()=>{
  const f=await fixture();try{
    const command=await f.reviewed();await f.db.doc('people/incumbent').update({workEmail:'PRIVATE_CHANGED_CONTACT'});await assert.rejects(commit(f.db,command,actor,clock),/changed/);assert.equal((await f.db.collection('audit_logs').get()).size,0);
    const next=await f.reviewed({...f.intent,operationId:'fresh-after-contact'});await f.db.doc('users/store-account').create({status:'Active',name:'Store Account',accessScope:'Store 7'});await assert.rejects(commit(f.db,next,actor,clock),/changed/);assert.equal((await f.db.doc('locations/007').get()).data()!.version,4);
  }finally{await f.db.terminate();}
});
test('SDK removal atomically reserves permanent ID, preserves history and rejects ordinary recreation',{timeout:90_000},async()=>{
  const f=await fixture();try{
    await f.db.doc('locations/007').update({recordStatus:'Retired'});const before=(await f.db.doc('locations/007').get()).data()!;
    await f.db.doc('audit_logs/prior-history').create({action:'Synthetic prior history'});
    const intent={schemaVersion:1,operationId:'native-remove',locationId:'007',expectedVersion:4,reason:'Explicit reviewed removal',action:'remove',acknowledgeApiRemoval:true},command=await f.reviewed(intent),saved=await commit(f.db,command,actor,clock);
    assert.equal((await f.db.doc('locations/007').get()).exists,false);const tombstone=(await f.db.doc('location_lifecycle_tombstones/007').get()).data()!;assert.equal(tombstone.locationId,'007');assert.equal(tombstone.auditId,(saved as any).auditId);assert.equal((await f.db.collection('audit_logs').get()).size,2);
    const store=new FirestoreDirectoryStore(f.db);await assert.rejects(store.commit([{collection:'locations',id:'007',operation:'set',data:before,expectedVersion:null}],null,actor),/cannot be reused/);assert.equal((await f.db.doc('locations/007').get()).exists,false);
    assert.deepEqual(await commit(f.db,command,actor,()=>new Date(time+ttl*5)),saved);assert.deepEqual(await status(f.db,command,actor),saved);assert.deepEqual(await cancel(f.db,command,actor,clock),saved);assert.equal((await f.db.collection('audit_logs').get()).size,2);
  }finally{await f.db.terminate();}
});
test('SDK concurrent cancel/prepare and commit/cancel each have one terminal outcome',{timeout:90_000},async()=>{
  const f=await fixture();try{
    await Promise.allSettled([prepare(f.db,f.intent,actor,clock),cancel(f.db,{operationId:f.intent.operationId},actor,clock)]);assert.equal((await status(f.db,{operationId:f.intent.operationId},actor)).state,'cancelled');assert.equal((await f.db.doc('locations/007').get()).data()!.version,4);
    const command=await f.reviewed({...f.intent,operationId:'commit-cancel'});const results=await Promise.allSettled([commit(f.db,command,actor,clock),cancel(f.db,command,actor,clock)]);assert(results.every(r=>r.status==='fulfilled'));const terminal=await status(f.db,command,actor);assert(['committed','cancelled'].includes(terminal.state));assert.equal((await f.db.collection('audit_logs').get()).size,terminal.state==='committed'?1:0);assert.equal((await f.db.doc('locations/007').get()).data()!.version,terminal.state==='committed'?5:4);
  }finally{await f.db.terminate();}
});
test('SDK revoked authority prevents preparation, commit and recovery disclosure',{timeout:90_000},async()=>{
  const f=await fixture();try{const command=await f.reviewed();await f.db.doc('users/admin').update({status:'Inactive'});for(const run of [()=>prepare(f.db,f.intent,actor,clock),()=>commit(f.db,command,actor,clock),()=>status(f.db,command,actor),()=>cancel(f.db,command,actor,clock)])await assert.rejects(run(),/authority/);assert.equal((await f.db.doc('locations/007').get()).data()!.version,4);assert.equal((await f.db.collection('audit_logs').get()).size,0);}finally{await f.db.terminate();}
});
