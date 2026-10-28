import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { prepareNewLocationLeadership } from '../src/lib/newLocationLeadership';
import type { LocationRecord } from '../src/types';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator.');
test('SDK: coherent managed creation, create-only collision and stale Primary are atomic', { timeout:90000 }, async()=>{
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`new-store-${randomUUID()}`}), f=moveFixture(), batch=db.batch();
  for(const [path,data] of f.records) batch.create(db.doc(path),data); await batch.commit();
  const withId=(collection:string)=>[...f.records].filter(([path])=>path.startsWith(collection+'/')).map(([path,data])=>({id:path.split('/')[1],...data}));
  const draft={id:'new-store',storeNumber:'008',name:'New Store',type:'Enclosed Mall',recordStatus:'Draft',districtId:'02',regionId:'02',address:'100 Actual Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations'} as LocationRecord;
  const prepared=prepareNewLocationLeadership(draft,withId('districts') as any,withId('regions') as any,withId('people') as any), store=new FirestoreDirectoryStore(db);
  const audit=(id:string)=>({action:'Location Created',entityType:'Location',entityId:id,entityName:'New Store',details:'Synthetic creation acceptance.'});
  try {
    await store.commit([{collection:'locations',id:prepared.id,operation:'set',expectedVersion:null,data:prepared as any}],audit(prepared.id),actor);
    const saved=(await db.doc('locations/new-store').get()).data()!;
    assert.equal(saved.version,1); assert.equal(saved.districtManagerId,'new-hire'); assert.equal(saved.regionalManagerId,'new-hire'); assert.equal(saved.storeNumber,'008');
    await assert.rejects(store.commit([{collection:'locations',id:prepared.id,operation:'set',expectedVersion:null,data:{...prepared,name:'Overwrite'}}],audit(prepared.id),actor),/concurrently/);
    assert.equal((await db.doc('locations/new-store').get()).data()!.name,'New Store');
    const change=db.batch(); change.update(db.doc('regions/02'),{regionalManagerId:null,leadershipVersion:2,version:2}); change.update(db.doc('leadership_assignments/region-02'),{status:'ended'}); await change.commit();
    await assert.rejects(store.commit([{collection:'locations',id:'stale-store',operation:'set',expectedVersion:null,data:{...prepared,id:'stale-store',storeNumber:'009'}}],audit('stale-store'),actor),/canonical/);
    assert.equal((await db.doc('locations/stale-store').get()).exists,false); assert.equal((await db.collection('audit_logs').get()).size,1);
  } finally {await db.terminate();}
});
