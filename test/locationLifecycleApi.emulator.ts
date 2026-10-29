import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Firestore } from '@google-cloud/firestore';
import express from 'express';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { createLocationLifecycleHttpPort } from '../src/lib/locationLifecycleClient';
import { createSessionBoundary,type SessionState } from '../src/lib/authSession';
import type { LocationLifecycleIntent } from '../src/lib/locationLifecycleContract';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');
test('strict client → HTTP → Store → SDK lifecycle gates, interrupted save, paused recovery and removal',{timeout:90_000},async()=>{
  const keys=['LOCATION_LIFECYCLE_ENABLED','ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'],previous=keys.map(k=>process.env[k]);
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`lifecycle-http-${randomUUID()}`}),f=moveFixture();f.records.get('locations/corporate').storeNumber='000';const batch=db.batch();for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();
  const store=new FirestoreDirectoryStore(db),app=express();app.use('/api/directory',createDirectoryDataRouter(async token=>{assert.equal(token,'synthetic-token');return actor;},store));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const boundary=createSessionBoundary();boundary.update({status:'authorized',user:{uid:actor.uid,getIdToken:async()=> 'synthetic-token'},account:{...actor,email:null,emailVerified:true,personId:null},error:''} as SessionState);
  let drop=false,commitRequests=0;const port=createLocationLifecycleHttpPort({session:boundary.snapshot,generation:boundary.generation,timeoutMs:30_000,request:async(url,init)=>{const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}${url}`,init);if(String(url).endsWith('/commit')){commitRequests++;if(drop&&response.ok){drop=false;throw new TypeError('Synthetic reply lost after server success');}}return response;}});
  const intent:LocationLifecycleIntent={schemaVersion:1,operationId:'http-convert',locationId:'007',expectedVersion:4,reason:'Explicit HTTP use conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};
  try{
    keys.forEach(k=>delete process.env[k]);assert.equal((await port.capabilities()).newCommandsEnabled,false);await assert.rejects(port.prepare(intent));assert.equal((await db.collection('location_lifecycle_operations').get()).size,0);
    keys.slice(1).forEach(k=>process.env[k]='true');assert.equal((await port.capabilities()).newCommandsEnabled,false); // Roster flags alone never enable lifecycle writes.
    process.env.LOCATION_LIFECYCLE_ENABLED='true';assert.equal((await port.capabilities()).newCommandsEnabled,true);assert.equal((await port.catalog()).units.length,4);
    const p=await port.preview(intent);assert.equal(p.review.ready,true);assert.equal((await db.collection('location_lifecycle_operations').get()).size,0);
    const prepared=await port.prepare(intent);assert('reviewHash' in prepared);assert.equal((await port.list()).operations.length,1);
    process.env.LOCATION_LIFECYCLE_ENABLED='false';assert.equal((await port.capabilities()).catalogEnabled,false);await assert.rejects(port.commit(prepared.operationId,prepared.reviewHash!));assert.equal((await port.status(prepared.operationId)).state,'prepared');assert.equal((await port.cancel(prepared.operationId)).state,'cancelled');assert.equal((await db.doc('locations/007').get()).data()!.version,4);
    process.env.LOCATION_LIFECYCLE_ENABLED='true';const fresh=await port.prepare({...intent,operationId:'http-convert-retry'});assert('reviewHash' in fresh);drop=true;const before=commitRequests;await assert.rejects(port.commit(fresh.operationId,fresh.reviewHash!));assert.equal(commitRequests,before+1);const recovered=await port.status(fresh.operationId);assert.equal(recovered.state,'committed');assert.equal((await db.doc('locations/007').get()).data()!.version,5);assert.equal((await db.collection('audit_logs').get()).size,1);
    const current=(await db.doc('locations/007').get()).data()!;await store.commit([{collection:'locations',id:'007',operation:'set',expectedVersion:5,data:{...current,recordStatus:'Retired'}}],null,actor);
    const remove:LocationLifecycleIntent={schemaVersion:1,operationId:'http-remove',locationId:'007',expectedVersion:6,reason:'Explicit HTTP reviewed removal',action:'remove',acknowledgeApiRemoval:true};assert.equal((await port.preview(remove)).review.ready,true);const removal=await port.prepare(remove);assert('reviewHash' in removal);const removed=await port.commit(removal.operationId,removal.reviewHash!);assert.equal(removed.state,'committed');assert.equal((await db.doc('locations/007').get()).exists,false);assert.equal((await db.doc('location_lifecycle_tombstones/007').get()).exists,true);assert.equal((await port.list()).operations.length,0);assert.deepEqual(await port.status(removal.operationId),removed);
    await db.doc('users/admin').update({role:'Viewer'});await assert.rejects(port.status(removal.operationId),(e:any)=>e.status===403);
  }finally{port.dispose();keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.terminate();}
});
