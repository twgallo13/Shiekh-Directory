import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,webcrypto } from 'node:crypto';
import { once } from 'node:events';
import { Firestore } from '@google-cloud/firestore';
import express from 'express';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { readPersonTransitionAuthority } from '../server/personTransitionAuthority';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { createLocationLifecycleHttpPort } from '../src/lib/locationLifecycleClient';
import { openLocationLifecycleWorkflow } from '../src/lib/locationLifecycleWorkflow';
import { LOCATION_LIFECYCLE_RECOVERY_PREFIX } from '../src/lib/organizationLeadershipRecovery';
import { createSessionBoundary,type SessionState } from '../src/lib/authSession';
import { refreshTransitionSavedState } from '../src/lib/transitionSavedRefresh';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');
test('controller → strict HTTP → SDK recovers a lost save and removal only after strict refresh',{timeout:90_000},async()=>{
  const keys=['LOCATION_LIFECYCLE_ENABLED','ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'],previous=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='true');
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`lifecycle-browser-${randomUUID()}`}),f=moveFixture();f.records.get('locations/corporate').storeNumber='000';const batch=db.batch();for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();
  const store=new FirestoreDirectoryStore(db),app=express();let failRefresh=false,drop=true,commitRequests=0;
  app.get('/api/auth/bootstrap',async(req,res)=>{assert.equal(req.get('authorization'),'Bearer synthetic-token');if(failRefresh)return void res.status(503).json({});try{await db.runTransaction(tx=>readPersonTransitionAuthority(db,tx,actor),{readOnly:true});res.json(await store.read());}catch{res.status(403).json({});}});
  app.use('/api/directory',createDirectoryDataRouter(async token=>{assert.equal(token,'synthetic-token');return actor;},store));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const boundary=createSessionBoundary();boundary.update({status:'authorized',user:{uid:actor.uid,getIdToken:async()=> 'synthetic-token'},account:{...actor,email:null,emailVerified:true,personId:null},error:''} as SessionState);const auth={currentSession:boundary.snapshot,sessionGeneration:boundary.generation,onSessionBoundary:boundary.subscribe};
  const storage={getItem(key:string){return Object.hasOwn(this,key)?(this as any)[key]:null;},setItem(key:string,value:string){(this as any)[key]=value;},removeItem(key:string){delete (this as any)[key];}} as any;
  const held=new Set<string>(),locks={request:async(key:string,_options:any,callback:any)=>{if(held.has(key))return callback(null);held.add(key);try{return await callback({name:key});}finally{held.delete(key);}}} as any;
  let next=0,savedLocations:any[]=[],controller:Awaited<ReturnType<typeof openLocationLifecycleWorkflow>>|null=null;
  const key=LOCATION_LIFECYCLE_RECOVERY_PREFIX+encodeURIComponent(actor.uid);
  const open=async()=>{
    const port=createLocationLifecycleHttpPort({session:boundary.snapshot,generation:boundary.generation,timeoutMs:30_000,request:async(url,init)=>{const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}${url}`,init);if(String(url).endsWith('/commit')){commitRequests++;if(drop&&response.ok){drop=false;throw new TypeError('Synthetic reply lost');}}return response;}});
    return openLocationLifecycleWorkflow({auth,port,storage,locks,subtle:webcrypto.subtle as SubtleCrypto,newOperationId:()=>`browser-${++next}`,onChange:()=>{},refreshSavedDirectory:()=>refreshTransitionSavedState({session:boundary.snapshot,generation:boundary.generation,fence:()=>({epoch:1,pending:0}),read:port.directory,apply:seed=>{savedLocations=seed.locations;}})});
  };
  try{
    controller=await open();await controller.prepare({schemaVersion:1,locationId:'007',expectedVersion:4,reason:'Reviewed browser conversion',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false});assert.equal(controller.snapshot().phase,'review');const original=controller.snapshot().operationId!;assert.doesNotMatch(storage.getItem(key),/PRIVATE|reason|reviewHash|personId|token/);
    await controller.commit();assert.equal(controller.snapshot().phase,'recovery');assert(storage.getItem(key));assert.equal(commitRequests,1);controller.dispose();await new Promise<void>(resolve=>setImmediate(resolve));
    failRefresh=true;await assert.rejects(open());assert(storage.getItem(key));failRefresh=false;
    controller=await open();assert.equal(controller.snapshot().phase,'saved');assert.equal(storage.getItem(key),null);assert.equal(commitRequests,1);assert.equal(savedLocations.find(l=>l.id==='007').version,5);assert.equal((await db.collection('audit_logs').get()).size,1);assert.equal((await db.collection('location_lifecycle_operations').get()).docs[0].data().operationId,original);controller.dispose();await new Promise<void>(resolve=>setImmediate(resolve));
    const current=(await db.doc('locations/007').get()).data()!;await store.commit([{collection:'locations',id:'007',operation:'set',expectedVersion:5,data:{...current,recordStatus:'Retired'}}],null,actor);
    controller=await open();await controller.prepare({schemaVersion:1,locationId:'007',expectedVersion:6,reason:'Reviewed browser removal',action:'remove',acknowledgeApiRemoval:true});assert.equal(controller.snapshot().phase,'review');await controller.commit();assert.equal(controller.snapshot().phase,'saved');assert.equal(storage.getItem(key),null);assert.equal(savedLocations.some(l=>l.id==='007'),false);assert.equal((await db.doc('location_lifecycle_tombstones/007').get()).exists,true);assert.equal(commitRequests,2);
  }finally{controller?.dispose();keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.terminate();}
});
