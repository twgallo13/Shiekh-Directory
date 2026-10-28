import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { createLocationCreationHttpPort } from '../src/lib/locationCreationClient';
import { createSessionBoundary, type SessionState } from '../src/lib/authSession';
import { openLocationCreationWorkflow } from '../src/lib/locationCreationWorkflow';
import { refreshTransitionSavedState } from '../src/lib/transitionSavedRefresh';
import { webcrypto } from 'node:crypto';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');
test('HTTP → Store → SDK: default-off, paused recovery, lost commit reply and live authority loss', {timeout:90000},async()=>{
  const keys=['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED','ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED','ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'],previous=keys.map(k=>process.env[k]);
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`creation-http-${randomUUID()}`}),fixture=moveFixture(),batch=db.batch();
  // The planner fixture deliberately omits non-retail display fields. This journey also serves
  // a complete bootstrap, so provide that required Location field rather than weakening refresh.
  fixture.records.get('locations/corporate').storeNumber='001';
  for(const[path,data]of fixture.records)batch.create(db.doc(path),data);await batch.commit();
  const store=new FirestoreDirectoryStore(db),app=express();app.use('/api/directory',createDirectoryDataRouter(async token=>{assert.equal(token,'synthetic-token');return actor;},store));
  app.get('/api/auth/bootstrap',async(_req,res)=>res.json(await store.read()));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`;
  const boundary=createSessionBoundary();boundary.update({status:'authorized',user:{uid:actor.uid,getIdToken:async()=> 'synthetic-token'},account:actor,error:''} as SessionState);
  let loseReply=true,commits=0;
  const makePort=()=>createLocationCreationHttpPort({session:boundary.snapshot,generation:boundary.generation,request:async(url,init)=>{
    const response=await fetch(origin+url,init);
    if(String(url).endsWith('/commit')){commits++;if(loseReply){loseReply=false;assert.equal(response.status,200);throw new Error('Synthetic lost successful reply');}}
    return response;
  }});
  const port=makePort();
  const command=(id='loc-first')=>({write:{collection:'locations' as const,operation:'set' as const,expectedVersion:null,id,data:{id,storeNumber:'008',name:'New Store',type:'Enclosed Mall',recordStatus:'Active',districtId:'02',regionId:'02',districtManagerId:'new-hire',districtManagerName:'New Manager',regionalManagerId:'new-hire',regionalManagerName:'New Manager',address:'100 Actual Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations'}}});
  try{
    keys.forEach(k=>delete process.env[k]);assert.equal((await port.capabilities()).legacyCreationEnabled,true);assert.equal((await port.capabilities()).newCommandsEnabled,false);await assert.rejects(port.prepare(command()));assert.equal((await db.collection('location_creation_operations').get()).size,0);
    keys.forEach(k=>process.env[k]='true');assert.equal((await port.prepare(command())).state,'prepared');
    keys.forEach(k=>delete process.env[k]);assert.equal((await port.capabilities()).legacyCreationEnabled,false);keys.forEach(k=>process.env[k]='true');
    delete process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED;assert.equal((await port.status('loc-first')).state,'prepared');assert.equal((await port.cancel('loc-first')).state,'cancelled');assert.equal((await port.list()).operations.length,0);
    process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED='true';const next=command('loc-next');await port.prepare(next);await assert.rejects(port.commit(next));
    const saved=await port.status('loc-next');assert.equal(saved.state,'committed');if(saved.state!=='committed')throw new Error('Expected terminal confirmation');
    assert.equal(saved.auditId,'location-creation-'+createHash('sha256').update(JSON.stringify(['location-creation-v1',actor.uid,'loc-next'])).digest('hex'));
    assert.equal(commits,1);assert.equal((await db.collection('audit_logs').get()).size,1);assert.equal((await db.doc('locations/loc-next').get()).data()!.version,1);assert.equal((await port.list()).operations.length,0);
    const storage:any={};Object.defineProperties(storage,{getItem:{value:(k:string)=>storage[k]??null},setItem:{value:(k:string,v:string)=>{storage[k]=v;}},removeItem:{value:(k:string)=>{delete storage[k];}}});
    const held=new Set<string>(),locks={request:async(k:string,_:unknown,fn:any)=>{if(held.has(k))return fn(null);held.add(k);try{return await fn({name:k});}finally{held.delete(k);}}} as unknown as LockManager;
    let refreshed=0;const open=()=>{const p=makePort();return openLocationCreationWorkflow({auth:{currentSession:boundary.snapshot,sessionGeneration:boundary.generation,onSessionBoundary:boundary.subscribe},port:p,storage,locks,subtle:webcrypto.subtle as SubtleCrypto,onChange:()=>{},refreshSavedDirectory:()=>refreshTransitionSavedState({session:boundary.snapshot,generation:boundary.generation,fence:()=>({epoch:1,pending:0}),purpose:'location-creation',read:p.directory,apply:seed=>{assert(seed.locations.some(l=>l.id==='loc-controller'));refreshed++;}})});};
    loseReply=true;let controller=await open();const controlled=command('loc-controller');controlled.write.data.storeNumber='009';await controller.create(controlled);assert.equal(controller.snapshot().phase,'recovery');controller.dispose();await new Promise(r=>setTimeout(r,0));controller=await open();assert.equal(controller.snapshot().phase,'saved');assert.equal(refreshed,1);assert.equal(commits,2);assert.equal(Object.keys(storage).length,0);controller.dispose();assert.equal((await db.doc('locations/loc-controller').get()).data()!.version,1);assert.equal((await db.collection('audit_logs').get()).size,2);
    await db.doc('users/admin').update({status:'Suspended'});await assert.rejects(port.status('loc-next'),e=>(e as any).status===403);
  }finally{port.dispose();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.terminate();keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
