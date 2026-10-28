import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryWriter } from '../server/firestoreDirectory';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
const command=()=>({write:{collection:'locations',operation:'set',expectedVersion:null,id:'loc-new',data:{storeNumber:'008',name:'Store'}}});
async function harness(options:{actor?:any;flags?:any;omit?:string;fail?:Error;legacyAllowed?:boolean}={}){
  const calls:any[]=[];const record=async(mode:string,input:unknown,resolved:unknown)=>{calls.push({mode,input,actor:resolved});if(options.fail)throw options.fail;return{schemaVersion:1,locationId:'loc-new',state:'cancelled',updatedAt:'2026-10-28T12:00:00.000Z'};};
  const store:any={commit:async()=>assert.fail('No generic fallback'),locationCreationCapabilities:()=>({schemaVersion:1,catalogEnabled:true,recoveryEnabled:true,newCommandsEnabled:true,...options.flags}),prepareLocationCreation:(i:unknown,a:unknown)=>record('prepare',i,a),commitLocationCreation:(i:unknown,a:unknown)=>record('commit',i,a),readLocationCreation:(i:unknown,a:unknown)=>record('status',i,a),cancelLocationCreation:(i:unknown,a:unknown)=>record('cancel',i,a),listLocationCreations:async(a:unknown)=>{await record('list',undefined,a);return{schemaVersion:1,complete:true,operations:[]};}};
  store.locationCreationLegacyAllowed=async()=>options.legacyAllowed!==false;
  if(options.omit)delete store[options.omit];const app=express();app.use('/api/directory',createDirectoryDataRouter(async token=>{assert.equal(token,'synthetic-token');return options.actor??actor;},store as DirectoryWriter));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  const request=(mode:string,body?:unknown,extra:RequestInit={})=>fetch(`http://127.0.0.1:${(server.address() as any).port}/api/directory/location-creations/${mode}`,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer synthetic-token','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)}),...extra});
  return{calls,request,close:async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}};
}
test('creation API admits only authenticated Active Company-wide existing Location writer roles',async()=>{
  for(const role of ['System Administrator','Directory Data Steward','Editor']){const h=await harness({actor:{...actor,role}});try{assert.equal((await h.request('capabilities')).status,200);}finally{await h.close();}}
  for(const change of [{role:'Viewer'},{status:'Inactive'},{accessScope:'Store 008'}]){const h=await harness({actor:{...actor,...change}});try{assert.equal((await h.request('prepare',command())).status,403);assert.equal(h.calls.length,0);}finally{await h.close();}}
  const h=await harness();try{assert.equal((await h.request('capabilities',undefined,{headers:{}})).status,401);}finally{await h.close();}
});
test('creation API no-store capability result has no ETag or conditional 304; pause preserves recovery',async()=>{
  const h=await harness({flags:{catalogEnabled:false,newCommandsEnabled:false}});try{
    const r=await h.request('capabilities',undefined,{headers:{Authorization:'Bearer synthetic-token','If-None-Match':'*'}});assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(r.headers.get('etag'),null);
    assert.equal((await h.request('prepare',command())).status,503);assert.equal((await h.request('status',{locationId:'loc-new'})).status,200);assert.equal((await h.request('cancel',{locationId:'loc-new'})).status,200);assert.equal((await h.request('operations')).status,200);
    assert.deepEqual(h.calls.map(c=>c.mode),['status','cancel','list']);
  }finally{await h.close();}
});
test('partial Store cannot advertise new creation or fall back to a generic save',async()=>{
  for(const omit of ['prepareLocationCreation','commitLocationCreation','readLocationCreation','cancelLocationCreation','listLocationCreations']){const h=await harness({omit});try{assert.equal((await(await h.request('capabilities')).json()).newCommandsEnabled,false);assert.equal((await h.request('commit',command())).status,503);assert.equal(h.calls.length,0);}finally{await h.close();}}
});
test('legacy admission requires an explicit all-disabled rollout; unavailable or partial rollout is not permission to fall back',async()=>{
  for(const options of [{flags:{catalogEnabled:false,recoveryEnabled:false,newCommandsEnabled:false}},{omit:'locationCreationCapabilities'},{flags:{catalogEnabled:true,recoveryEnabled:false,newCommandsEnabled:false}}]){
    const h=await harness(options);try{const caps=await(await h.request('capabilities')).json();assert.equal(caps.legacyCreationEnabled,!!options.flags && options.flags.catalogEnabled===false);assert.equal(h.calls.length,0);}finally{await h.close();}
  }
});
test('all-off legacy permission requires an explicit successful server pending-operation check',async()=>{
  for(const change of [{legacyAllowed:false},{omit:'locationCreationLegacyAllowed'}]){const h=await harness({...change,flags:{catalogEnabled:false,recoveryEnabled:false,newCommandsEnabled:false}});try{assert.equal((await(await h.request('capabilities')).json()).legacyCreationEnabled,false);}finally{await h.close();}}
});

test('all-off partial adapter never advertises legacy admission',async()=>{
  for(const omit of ['prepareLocationCreation','commitLocationCreation','readLocationCreation','cancelLocationCreation','listLocationCreations']){const h=await harness({omit,flags:{catalogEnabled:false,recoveryEnabled:false,newCommandsEnabled:false}});try{assert.equal((await(await h.request('capabilities')).json()).legacyCreationEnabled,false);}finally{await h.close();}}
});

test('creation API validates exact commands/markers and body bounds before Store calls',async()=>{
  const h=await harness();try{
    assert.equal((await h.request('prepare',{...command(),token:'bad'})).status,400);assert.equal((await h.request('status',{locationId:'loc-new',data:{}})).status,400);
    assert.equal((await h.request('commit',{write:{...command().write,expectedVersion:0}})).status,400);
    assert.equal((await h.request('prepare',{write:{...command().write,data:{padding:'x'.repeat(230000)}}})).status,413);
    assert.equal((await h.request('prepare',undefined,{method:'POST',body:'{',headers:{Authorization:'Bearer synthetic-token','Content-Type':'application/json'}})).status,400);assert.equal(h.calls.length,0);
  }finally{await h.close();}
});
test('creation API propagates only server-resolved actors and rejects enriched marker routes',async()=>{
  const h=await harness();try{assert.equal((await h.request('prepare',command())).status,200);assert.equal((await h.request('commit',command())).status,200);assert.deepEqual(h.calls[0].actor,actor);assert.deepEqual(h.calls[0].input,command());}finally{await h.close();}
});
test('creation API returns useful known failures and hides infrastructure details',async()=>{
  for(const [fail,status,code]of [[new DirectoryConflict('Changed draft'),409,'location_creation_conflict'],[new DirectoryValidationError('Review the address'),400,'location_creation_invalid_input'],[new DirectoryWriteDenied('PRIVATE_DENIAL'),403,'location_creation_unconfirmed'],[new Error('PRIVATE_DATABASE_DETAILS'),503,'location_creation_unconfirmed']] as const){const h=await harness({fail});try{const response=await h.request('prepare',command());assert.equal(response.status,status);const body=await response.json();assert.equal(body.error.code,code);assert(!JSON.stringify(body).includes('PRIVATE_'));}finally{await h.close();}}
});
