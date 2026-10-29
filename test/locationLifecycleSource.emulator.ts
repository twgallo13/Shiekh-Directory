import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { readLocationLifecyclePlan } from '../server/locationLifecycleSource';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor,leadershipNow as now } from './helpers/organizationLeadershipFixture';

if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
test('SDK lifecycle source masks nested references, binds fresh changes and live authority without writes',{timeout:90_000},async()=>{
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`lifecycle-source-${randomUUID()}`});
  const f=moveFixture();f.records.get('locations/corporate').storeNumber='000';
  f.records.set('requests/pending',{status:'Pending',targetType:'Person',targetId:'incumbent',requestedChanges:{primaryLocationId:'007',workEmail:'PRIVATE_PENDING_CONTACT'}});
  const batch=db.batch();for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();
  const intent={schemaVersion:1,operationId:'native-convert',locationId:'007',expectedVersion:4,reason:'Reviewed synthetic conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};
  const read=()=>db.runTransaction(tx=>readLocationLifecyclePlan(db,tx,intent,actor,now),{readOnly:true});
  try{
    const before=(await db.doc('locations/007').get()).data(),first=await read();
    assert.equal(first.plan.review.ready,false);assert.equal(first.plan.review.dependencies.requests[0].id,'pending');
    assert.deepEqual(first.native.get('requests/pending')!.data.requestedChanges,{primaryLocationId:'007'});
    assert.doesNotMatch(JSON.stringify([...first.native]),/PRIVATE|workEmail|firebaseUid/);
    await db.doc('requests/pending').update({status:'Approved'});const second=await read();assert.equal(second.plan.review.ready,true);assert.notEqual(first.sourceFingerprint,second.sourceFingerprint);
    // Native update time binds even an unprojected contact change with no business version increment.
    await db.doc('people/incumbent').update({workEmail:'PRIVATE_CHANGED_CONTACT'});const third=await read();assert.notEqual(second.sourceFingerprint,third.sourceFingerprint);
    await db.doc('users/store-account').create({status:'Active',name:'Store account',accessScope:'Store 7'});const fourth=await read();assert.equal(fourth.plan.review.ready,false);assert.equal(fourth.plan.review.dependencies.accounts[0].id,'store-account');
    assert.deepEqual((await db.doc('locations/007').get()).data(),before);assert.equal((await db.collection('audit_logs').get()).size,0);assert.equal((await db.collection('location_lifecycle_operations').get()).size,0);
    await db.doc('users/admin').update({status:'Inactive'});await assert.rejects(read(),/authority/);
  }finally{await db.terminate();}
});
