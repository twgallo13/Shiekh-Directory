import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');
const keys=['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'];
const flags=(on:boolean)=>keys.forEach(k=>{if(on)process.env[k]='true';else delete process.env[k];});
const command=(id:string,number:string)=>({write:{collection:'locations' as const,operation:'set' as const,expectedVersion:null,id,data:{id,storeNumber:number,name:'Synthetic Store',type:'Enclosed Mall',recordStatus:'Active',districtId:'02',regionId:'02',districtManagerId:'new-hire',districtManagerName:'New Manager',regionalManagerId:'new-hire',regionalManagerName:'New Manager',address:'100 Synthetic Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations'}}});
async function fixture(){const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`legacy-create-${randomUUID()}`}),f=moveFixture(),batch=db.batch();for(const[p,d]of f.records)batch.create(db.doc(p),d);await batch.commit();return{db,store:new FirestoreDirectoryStore(db)};}
const admissionId=createHash('sha256').update(JSON.stringify(['location-creation-actor-v1',actor.uid])).digest('hex');

test('SDK legacy create rejects a preparation arriving after the capability probe; cancellation then permits one serialized create',{timeout:90000},async()=>{
  const previous=keys.map(k=>process.env[k]),f=await fixture();
  try{
    flags(false);assert.equal(await f.store.locationCreationLegacyAllowed(actor),true);
    flags(true);await f.store.prepareLocationCreation(command('pending','008'),actor);flags(false);
    const next=command('legacy','009');await assert.rejects(f.store.commit([next.write],null,actor),/pending Location creation/);
    assert.equal((await f.db.doc('locations/legacy').get()).exists,false);assert.equal((await f.db.collection('audit_logs').get()).size,0);
    process.env.ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED='true';await f.store.cancelLocationCreation({locationId:'pending'},actor);flags(false);
    await f.store.commit([next.write],null,actor);assert.equal((await f.db.doc('locations/legacy').get()).data()!.version,1);
    const admission=(await f.db.doc(`location_creation_admission/${admissionId}`).get()).data()!;assert.equal(admission.pending,0);assert.equal(admission.version,3);
    process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED='true';await assert.rejects(f.store.commit([command('partial','010').write],null,actor),/protected Location creation/);assert.equal((await f.db.doc('locations/partial').get()).exists,false);
  }finally{await f.db.terminate();keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});

test('SDK in-flight enabled prepare and all-off legacy writer serialize through the same admission version',{timeout:90000},async()=>{
  const previous=keys.map(k=>process.env[k]),f=await fixture();
  try{
    flags(true);const preparing=f.store.prepareLocationCreation(command('pending-race','008'),actor);
    // Preparation has passed its instance's entry gate. The compatibility instance now runs
    // all-off, as during a rolling deployment; its transaction must still coordinate in storage.
    flags(false);const creating=f.store.commit([command('legacy-race','009').write],null,actor);
    const [prepared,legacy]=await Promise.allSettled([preparing,creating]);assert.equal(prepared.status,'fulfilled');
    const admission=(await f.db.doc(`location_creation_admission/${admissionId}`).get()).data()!;assert.equal(admission.pending,1);
    if(legacy.status==='fulfilled'){assert.equal(admission.version,2);assert.equal((await f.db.doc('locations/legacy-race').get()).data()!.version,1);}
    else{assert.match(String(legacy.reason),/pending Location creation/);assert.equal(admission.version,1);assert.equal((await f.db.doc('locations/legacy-race').get()).exists,false);}
    assert.equal((await f.db.doc('locations/pending-race').get()).exists,false);
  }finally{await f.db.terminate();keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
