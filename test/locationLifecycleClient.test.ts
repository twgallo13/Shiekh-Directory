import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBoundary,type SessionState } from '../src/lib/authSession';
import { createLocationLifecycleHttpPort,parseLocationLifecyclePreparation,parseLocationLifecycleReview,parseLocationLifecycleOutcome } from '../src/lib/locationLifecycleClient';
import { createOrganizationSessionTransport } from '../src/lib/organizationLeadershipClient';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor,leadershipNow } from './helpers/organizationLeadershipFixture';
import { prepareLocationLifecycle,previewLocationLifecycle } from '../server/locationLifecycleOperations';
import type { LocationLifecycleIntent } from '../src/lib/locationLifecycleContract';
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
function fixture(request:typeof fetch){const b=createSessionBoundary();b.update({status:'authorized',user:{uid:'actor',getIdToken:async()=> 'synthetic-token'},account:{uid:'actor',role:'System Administrator',status:'Active',accessScope:'Company-wide'},error:''} as SessionState);return{b,port:createLocationLifecycleHttpPort({session:b.snapshot,generation:b.generation,request,timeoutMs:30})};}
async function prepared(remove=false){const f=moveFixture();f.records.get('locations/corporate').storeNumber='000';if(remove)f.records.get('locations/007').recordStatus='Retired';const common={schemaVersion:1 as const,operationId:'lifecycle-1',locationId:'007',expectedVersion:4,reason:'Explicit reviewed use change'};const intent:LocationLifecycleIntent=remove?{...common,action:'remove',acknowledgeApiRemoval:true}:{...common,action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};return{...f,intent,value:await prepareLocationLifecycle(f.firestore,intent,actor,()=>new Date(leadershipNow))};}
test('real conversion/removal preparations parse with exact intended boundaries and no enrichment',async()=>{
  for(const remove of [false,true]){
    const f=await prepared(remove);assert.deepEqual(parseLocationLifecyclePreparation(f.value,f.intent),f.value);
    for(const alter of [(v:any)=>v.review.after.staffing.push({role:'Store Manager',personId:'incumbent',fullName:'Current'}),(v:any)=>v.review.before.hierarchy.districtManager.email='PRIVATE',(v:any)=>v.review.coverage[0].after++,(v:any)=>v.review.locationId='other',(v:any)=>v.review.dependencies.accounts.push({id:'account',name:'Linked'}),(v:any)=>v.review.ready=false,(v:any)=>v.review.reason='Different reason',(v:any)=>v.expiresAt=v.updatedAt]){const bad=structuredClone(f.value);alter(bad);assert.throws(()=>parseLocationLifecyclePreparation(bad,f.intent));}
  }
});
test('blocked previews remain displayable but cannot masquerade as ready preparations',async()=>{
  const f=await prepared();f.records.set('users/store-account',{status:'Active',accessScope:'Store 7',name:'Store Account'});const p=await previewLocationLifecycle(f.firestore,f.intent,actor,()=>new Date(leadershipNow));assert.equal(parseLocationLifecycleReview(p.review,f.intent).ready,false);
  const bad=structuredClone(f.value) as any;bad.review=p.review;assert.throws(()=>parseLocationLifecyclePreparation(bad,f.intent));
  for(const alter of [(v:any)=>v.dependencies.accounts[0].email='PRIVATE',(v:any)=>v.dependencies.accounts.push(v.dependencies.accounts[0]),(v:any)=>v.before.staffing.push({role:'Unknown',personId:'id',fullName:'Person'}),(v:any)=>v.writes=[]]){const value=structuredClone(p.review);alter(value);assert.throws(()=>parseLocationLifecycleReview(value,f.intent));}
});
test('outcomes bind one operation, one record and the lifecycle audit domain',()=>{
  const good={schemaVersion:1,operationId:'lifecycle-1',state:'committed',updatedAt:leadershipNow,auditId:`location-lifecycle-${'a'.repeat(64)}`,changedRecords:1};assert.deepEqual(parseLocationLifecycleOutcome(good,'lifecycle-1'),good);
  for(const change of [{changedRecords:2},{operationId:'other'},{auditId:`organization-${'a'.repeat(64)}`},{review:{}}])assert.throws(()=>parseLocationLifecycleOutcome({...good,...change},'lifecycle-1'));
});
test('fixed private transport never retries and does not expose infrastructure details',async()=>{
  let calls=0;const f=fixture(async(url,init)=>{calls++;assert.equal(url,'/api/directory/location-lifecycle/commit');assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');return response({error:{code:'unknown',message:'PRIVATE INFRASTRUCTURE'}},503);});await assert.rejects(f.port.commit('lifecycle-1','a'.repeat(64)),e=>e instanceof Error&&!e.message.includes('PRIVATE'));assert.equal(calls,1);f.port.dispose();
});
test('invalid intent/arbitrary mode cannot transmit tokens and other families cannot call preview',async()=>{
  let calls=0;const f=fixture(async()=>{calls++;return response({});});await assert.rejects(f.port.prepare({operationId:'lifecycle-1',actor} as any));await assert.rejects(f.port.preview({operationId:'lifecycle-1',patches:[]} as any));const t=createOrganizationSessionTransport({session:f.b.snapshot,generation:f.b.generation,request:async()=>{calls++;return response({});}},'moves');await assert.rejects(t.call('preview',{}));await assert.rejects(t.call('../arbitrary'));assert.equal(calls,0);t.dispose();f.port.dispose();
});
test('late replies and token work are fenced by actor generation, disposal and deadline',async()=>{
  let release!:(r:Response)=>void;const f=fixture(async()=>new Promise<Response>(resolve=>{release=resolve;}));const pending=f.port.status('lifecycle-1');await Promise.resolve();await Promise.resolve();f.b.invalidate();release(response({schemaVersion:1,operationId:'lifecycle-1',state:'missing'}));await assert.rejects(pending);f.port.dispose();
  let calls=0,token!:(s:string)=>void;const g=fixture(async()=>{calls++;return response({});});g.b.snapshot().user!.getIdToken=()=>new Promise(resolve=>{token=resolve;});await assert.rejects(g.port.status('lifecycle-1'));token('synthetic-token');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,0);g.port.dispose();
});
test('oversize response and malformed result retain uncertainty rather than accepting success',async()=>{
  const f=fixture(async()=>response({padding:'x'.repeat(1_000_001)}));await assert.rejects(f.port.status('lifecycle-1'));f.port.dispose();
});
