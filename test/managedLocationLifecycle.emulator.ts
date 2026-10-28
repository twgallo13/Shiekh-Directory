import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');

test('SDK: retire/reactivate and retail format preserve canonical ownership with mandatory audits; conversion/removal fail atomically',{timeout:90000},async()=>{
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`store-lifecycle-${randomUUID()}`}),f=moveFixture(),batch=db.batch();
  Object.assign(f.records.get('locations/007'),{address:'100 Synthetic Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations',hierarchyApplicability:'Applicable'});
  for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();
  const store=new FirestoreDirectoryStore(db),ref=db.doc('locations/007'),saved=async()=>(await ref.get()).data()!;
  const unchanged=async()=>({units:(await db.collection('districts').get()).docs.map(d=>({id:d.id,...d.data()})),regions:(await db.collection('regions').get()).docs.map(d=>({id:d.id,...d.data()})),people:(await db.collection('people').get()).docs.map(d=>({id:d.id,...d.data()})),rosters:(await db.collection('leadership_assignments').get()).docs.map(d=>({id:d.id,...d.data()}))});
  try{
    const baseline=await saved(),others=await unchanged();
    const commit=async(changes:Record<string,unknown>)=>{const before=await saved();return store.commit([{collection:'locations',id:'007',operation:'set',expectedVersion:before.version,data:{...before,...changes}}],null,actor);};
    await commit({recordStatus:'Retired',operationalStatus:'Permanently Closed'});assert.equal((await saved()).recordStatus,'Retired');assert.equal((await saved()).version,5);
    await commit({recordStatus:'Active',operationalStatus:'Open — Normal Operations',type:'Street / Standalone Location'});const active=await saved();assert.equal(active.version,6);assert.equal(active.type,'Street / Standalone Location');
    for(const field of ['districtId','regionId','districtManagerId','districtManagerName','regionalManagerId','regionalManagerName'])assert.equal(active[field],baseline[field]);
    assert.deepEqual(await unchanged(),others);const audits=await db.collection('audit_logs').get();assert.equal(audits.size,2);for(const audit of audits.docs){assert.equal(audit.data().action,'Location Lifecycle Updated');assert.equal(audit.data().userId,actor.uid);assert(audit.data().previousStates.length);assert(audit.data().newStates.length);}
    for(const changes of [{type:'Corporate Office'},{type:'Enclosed Mall',districtId:'02',regionId:'02'},{type:'Enclosed Mall',districtManagerId:'new-hire',districtManagerName:'New Manager'}])await assert.rejects(commit(changes));
    await assert.rejects(store.commit([{collection:'locations',id:'007',operation:'delete',expectedVersion:6}],null,actor),/managed store/);
    assert.deepEqual(await saved(),active);assert.equal((await db.collection('audit_logs').get()).size,2);assert.deepEqual(await unchanged(),others);
    await ref.update({notes:'x'.repeat(300000)});
    await assert.rejects(commit({recordStatus:'Retired',operationalStatus:'Permanently Closed'}),/audit/i);
    assert.equal((await saved()).recordStatus,'Active');assert.equal((await saved()).version,6);assert.equal((await db.collection('audit_logs').get()).size,2);
  }finally{await db.terminate();}
});
