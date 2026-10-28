import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { LOCATION_CREATION_RECEIPTS, LOCATION_CREATION_ADMISSION, locationCreationKey, locationCreationAuditId, prepareLocationCreation } from '../server/locationCreationRecovery';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');
const keys=['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'];
const command=(id='loc-new',number='008')=>({write:{collection:'locations',operation:'set',expectedVersion:null,id,data:{id,storeNumber:number,name:'New Store',type:'Enclosed Mall',recordStatus:'Active',districtId:'02',regionId:'02',districtManagerId:'new-hire',districtManagerName:'New Manager',regionalManagerId:'new-hire',regionalManagerName:'New Manager',address:'100 Actual Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations'}}});
async function fixture(){const previous=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='true');const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`create-recovery-${randomUUID()}`}), f=moveFixture(),batch=db.batch();for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();return{db,store:new FirestoreDirectoryStore(db),close:async()=>{await db.terminate();keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}};}
test('SDK: one creation/audit/receipt; replay and status remain terminal after expiry or later deletion', {timeout:90000},async()=>{
  const f=await fixture();try{
    assert.equal((await f.store.prepareLocationCreation(command(),actor)).state,'prepared');assert.equal((await f.store.listLocationCreations(actor)).operations.length,1);
    const first=await f.store.commitLocationCreation(command(),actor);assert.equal(first.state,'committed');
    assert.equal((await f.store.commitLocationCreation(command(),actor)).state,'committed');assert.equal((await f.db.collection('audit_logs').get()).size,1);
    const receipt=(await f.db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,'loc-new')).get()).data()!;
    assert(!JSON.stringify(receipt).includes('Actual Way'));assert(!Object.hasOwn(receipt,'write'));assert.equal((await f.store.listLocationCreations(actor)).operations.length,0);
    assert.equal((await prepareLocationCreation(f.db,command(),actor,()=>new Date(receipt.expiresAt+1))).state,'committed');
    await f.db.doc('locations/loc-new').delete();assert.equal((await f.store.commitLocationCreation(command(),actor)).state,'committed');assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);
    assert.deepEqual(await f.store.cancelLocationCreation({locationId:'loc-new'},actor),first);
    assert.equal((await f.db.collection('audit_logs').get()).size,1);
  }finally{await f.close();}
});
test('SDK: actor isolation, exact intent and live authority are checked before mutation', {timeout:90000},async()=>{
  const f=await fixture();try{
    await f.store.prepareLocationCreation(command(),actor);await f.db.doc('users/other').set({firebaseUid:'other',role:actor.role,status:'Active',accessScope:'Company-wide'});
    const other={...actor,uid:'other'};assert.equal((await f.store.readLocationCreation({locationId:'loc-new'},other)).state,'missing');
    await assert.rejects(f.store.commitLocationCreation(command(),other),/Prepare/);
    const changed=command();changed.write.data.name='Different';await assert.rejects(f.store.prepareLocationCreation(changed,actor),/already used/);await assert.rejects(f.store.commitLocationCreation(changed,actor),/changed/);
    await f.db.doc('users/admin').update({status:'Suspended'});await assert.rejects(f.store.commitLocationCreation(command(),actor),/authority/);
    assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);assert.equal((await f.db.collection('audit_logs').get()).size,0);
  }finally{await f.close();}
});
test('SDK: missing cancellation seals late prepare/save; expired preparation remains recoverable and cancellable', {timeout:90000},async()=>{
  const f=await fixture();try{
    assert.equal((await f.store.cancelLocationCreation({locationId:'loc-new'},actor)).state,'cancelled');await assert.rejects(f.store.prepareLocationCreation(command(),actor),/cancelled/);await assert.rejects(f.store.commitLocationCreation(command(),actor),/cancelled/);
    const expired=command('expired','009');await prepareLocationCreation(f.db,expired,actor,()=>new Date(Date.now()-600001));
    await assert.rejects(f.store.commitLocationCreation(expired,actor),/expired/);assert.equal((await f.store.readLocationCreation({locationId:'expired'},actor)).state,'prepared');
    delete process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED;
    assert.equal((await f.store.cancelLocationCreation({locationId:'expired'},actor)).state,'cancelled');assert.equal((await f.store.listLocationCreations(actor)).operations.length,0);assert.equal((await f.db.collection('audit_logs').get()).size,0);
  }finally{await f.close();}
});
test('SDK: concurrent save/cancel yields either one saved creation or a durable cancellation, never both', {timeout:90000},async()=>{
  const f=await fixture();try{
    await f.store.prepareLocationCreation(command(),actor);
    const results=await Promise.allSettled([f.store.commitLocationCreation(command(),actor),f.store.cancelLocationCreation({locationId:'loc-new'},actor)]);
    assert(results.some(r=>r.status==='fulfilled'));
    const state=await f.store.readLocationCreation({locationId:'loc-new'},actor), exists=(await f.db.doc('locations/loc-new').get()).exists;
    assert.equal(exists,state.state==='committed');assert.equal((await f.db.collection('audit_logs').get()).size,exists?1:0);
    assert.equal((await f.store.listLocationCreations(actor)).operations.length,0);
  }finally{await f.close();}
});
test('SDK: actor admission serializes competing final slots at the pending limit', {timeout:90000},async()=>{
  const f=await fixture();try{
    await f.store.prepareLocationCreation(command(),actor);
    const base=(await f.db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,'loc-new')).get()).data()!, a=(await f.db.collection(LOCATION_CREATION_ADMISSION).get()).docs[0];
    const batch=f.db.batch();for(let i=0;i<98;i++){const locationId=`pending-${i}`;batch.create(f.db.collection(LOCATION_CREATION_RECEIPTS).doc(locationCreationKey(actor,locationId)),{...base,locationId});}batch.update(a.ref,{pending:99,version:99});await batch.commit();
    const results=await Promise.allSettled([f.store.prepareLocationCreation(command('slot-a','009'),actor),f.store.prepareLocationCreation(command('slot-b','010'),actor)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.store.listLocationCreations(actor)).operations.length,100);
  }finally{await f.close();}
});
test('SDK: stale canonical ownership leaves a preparation recoverable without a partial Location/audit', {timeout:90000},async()=>{
  const f=await fixture();try{
    await f.store.prepareLocationCreation(command(),actor);const change=f.db.batch();change.update(f.db.doc('regions/02'),{regionalManagerId:null,version:2,leadershipVersion:2});change.update(f.db.doc('leadership_assignments/region-02'),{status:'ended'});await change.commit();
    await assert.rejects(f.store.commitLocationCreation(command(),actor),/canonical/);assert.equal((await f.store.readLocationCreation({locationId:'loc-new'},actor)).state,'prepared');
    assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);assert.equal((await f.db.collection('audit_logs').get()).size,0);
    assert.equal((await f.store.cancelLocationCreation({locationId:'loc-new'},actor)).state,'cancelled');
  }finally{await f.close();}
});
test('SDK: preparation/cancel race never reopens a sealed identity', {timeout:90000},async()=>{
  const f=await fixture();try{
    await Promise.allSettled([f.store.prepareLocationCreation(command(),actor),f.store.cancelLocationCreation({locationId:'loc-new'},actor)]);
    assert.equal((await f.store.readLocationCreation({locationId:'loc-new'},actor)).state,'cancelled');
    await assert.rejects(f.store.commitLocationCreation(command(),actor),/cancelled/);assert.equal((await f.store.listLocationCreations(actor)).operations.length,0);
    assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);
  }finally{await f.close();}
});
test('SDK: an occupied deterministic audit cannot be overwritten by a creation', {timeout:90000},async()=>{
  const f=await fixture();try{
    await f.store.prepareLocationCreation(command(),actor);const audit=f.db.doc(`audit_logs/${locationCreationAuditId(actor,'loc-new')}`);await audit.create({sentinel:'Retain existing audit'});
    await assert.rejects(f.store.commitLocationCreation(command(),actor));assert.deepEqual((await audit.get()).data(),{sentinel:'Retain existing audit'});
    assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);assert.equal((await f.store.readLocationCreation({locationId:'loc-new'},actor)).state,'prepared');
  }finally{await f.close();}
});
test('SDK: audit size refusal rolls back queued business writes and retains the preparation', {timeout:90000},async()=>{
  const f=await fixture();try{
    const large:any=command();large.write.data.padding=Object.fromEntries(Array.from({length:10000},(_,i)=>[`k${i}`,'']));
    await f.store.prepareLocationCreation(large,actor);await assert.rejects(f.store.commitLocationCreation(large,actor),/audit exceeds/);
    assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);assert.equal((await f.db.collection('audit_logs').get()).size,0);
    assert.equal((await f.store.readLocationCreation({locationId:'loc-new'},actor)).state,'prepared');
  }finally{await f.close();}
});
test('SDK: undercounted and overcounted admission block both save and cancellation without changing either receipt', {timeout:90000},async()=>{
  for(const pending of [1,3]){
    const f=await fixture();try{
      await f.store.prepareLocationCreation(command(),actor);await f.store.prepareLocationCreation(command('other-location','009'),actor);
      const admission=(await f.db.collection(LOCATION_CREATION_ADMISSION).get()).docs[0];await admission.ref.update({pending});
      await assert.rejects(f.store.commitLocationCreation(command(),actor),/incomplete/);
      await assert.rejects(f.store.cancelLocationCreation({locationId:'loc-new'},actor),/incomplete/);
      assert.equal((await f.store.readLocationCreation({locationId:'loc-new'},actor)).state,'prepared');
      assert.equal((await f.store.readLocationCreation({locationId:'other-location'},actor)).state,'prepared');
      assert.equal((await admission.ref.get()).data()!.pending,pending);
      assert.equal((await f.db.doc('locations/loc-new').get()).exists,false);assert.equal((await f.db.collection('audit_logs').get()).size,0);
    }finally{await f.close();}
  }
});
