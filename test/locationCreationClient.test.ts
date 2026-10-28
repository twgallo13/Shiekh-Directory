import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBoundary, type SessionState } from '../src/lib/authSession';
import { createLocationCreationHttpPort, isLocationCreationCommand, parseLocationCreationCapabilities, parseLocationCreationOutcome, parseLocationCreationList } from '../src/lib/locationCreationClient';
import { createOrganizationHttpPort } from '../src/lib/organizationLeadershipClient';
import { normalizeLocationCreationCommand } from '../server/locationCreationRecovery';
const command=()=>({write:{collection:'locations' as const,operation:'set' as const,expectedVersion:null,id:'loc-new',data:{storeNumber:'008',name:'Store'}}});
const prepared=()=>({schemaVersion:1,locationId:'loc-new',state:'prepared',updatedAt:'2026-10-28T12:00:00.000Z',expiresAt:'2026-10-28T12:10:00.000Z'});
function fixture(request:typeof fetch,role='System Administrator',timeoutMs?:number){const b=createSessionBoundary();b.update({status:'authorized',user:{uid:'actor',getIdToken:async()=> 'token'},account:{uid:'actor',role,status:'Active',accessScope:'Company-wide'},error:''} as SessionState);return{b,port:createLocationCreationHttpPort({session:b.snapshot,generation:b.generation,request,timeoutMs})};}
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
test('creation command preflight matches server fixed-shape/JSON/size acceptance',()=>{
  assert(isLocationCreationCommand(command()));assert.deepEqual(normalizeLocationCreationCommand(command()),command());
  for(const change of [(c:any)=>{c.write.expectedVersion=0;},(c:any)=>{c.write.data.id='other';},(c:any)=>{c.write.data.optional=undefined;},(c:any)=>{c.write.data.padding='界'.repeat(70000);},(c:any)=>{c.actor='spoof';}]){const c=command();change(c);assert.equal(isLocationCreationCommand(c),false);assert.throws(()=>normalizeLocationCreationCommand(c));}
});
test('capability parsing never turns an unavailable or paused workflow into legacy creation permission',()=>{
  const off={schemaVersion:1,catalogEnabled:false,recoveryEnabled:false,newCommandsEnabled:false,legacyCreationEnabled:true};assert.equal(parseLocationCreationCapabilities(off).legacyCreationEnabled,true);
  assert.throws(()=>parseLocationCreationCapabilities({...off,recoveryEnabled:true}));
  const {legacyCreationEnabled:_legacy,...old}=off;assert.throws(()=>parseLocationCreationCapabilities(old));
});
test('creation DTO parser rejects wrong identities, enrichment, expiry, audit namespace, versions and partial lists',()=>{
  const p=prepared();assert.equal(parseLocationCreationOutcome(p,'loc-new').state,'prepared');
  for(const value of [{...p,locationId:'other'},{...p,contacts:[]},{...p,expiresAt:'2026-10-28T12:11:00.000Z'},{schemaVersion:1,locationId:'loc-new',state:'committed',updatedAt:p.updatedAt,auditId:'organization-'+'a'.repeat(64),createdVersion:1},{schemaVersion:1,locationId:'loc-new',state:'committed',updatedAt:p.updatedAt,auditId:'location-creation-'+'a'.repeat(64),createdVersion:2}])assert.throws(()=>parseLocationCreationOutcome(value,'loc-new'));
  assert.equal(parseLocationCreationList({schemaVersion:1,complete:true,operations:[p]}).operations.length,1);
  assert.throws(()=>parseLocationCreationList({schemaVersion:1,complete:false,operations:[]}));assert.throws(()=>parseLocationCreationList({schemaVersion:1,complete:true,operations:[p,p]}));
});
test('creation client uses fixed session-bound routes and never retries a dropped mutation',async()=>{
  const calls:any[]=[];const f=fixture(async(url,init)=>{calls.push({url,init});return response(prepared());});
  try{await f.port.prepare(command());assert.equal(calls[0].url,'/api/directory/location-creations/prepare');assert.equal(calls[0].init.headers.Authorization,'Bearer token');assert.equal(calls[0].init.cache,'no-store');assert.equal(calls[0].init.redirect,'error');}finally{f.port.dispose();}
  let attempts=0;const lost=fixture(async()=>{attempts++;throw new TypeError('lost');});try{await assert.rejects(lost.port.commit(command()));assert.equal(attempts,1);}finally{lost.port.dispose();}
});
test('creation permits existing Company-wide writers without loosening roster workflow admission',async()=>{
  for(const role of ['Directory Data Steward','Editor']){let calls=0;const f=fixture(async()=>{calls++;return response({schemaVersion:1,locationId:'loc-new',state:'missing'});},role);try{await f.port.status('loc-new');const roster=createOrganizationHttpPort({session:f.b.snapshot,generation:f.b.generation,request:async()=>{calls++;throw new Error();}});await assert.rejects(roster.list());roster.dispose();assert.equal(calls,1);}finally{f.port.dispose();}}
});
test('late token/session callbacks are fenced, while deadline cancellation sends no delayed mutation',async()=>{
  let release:(v:string)=>void,calls=0;const f=fixture(async()=>{calls++;return response(prepared());},'System Administrator',5);
  f.b.snapshot().user!.getIdToken=()=>new Promise(resolve=>{release=resolve;});
  await assert.rejects(f.port.prepare(command()));release!('token');await new Promise(resolve=>setTimeout(resolve,0));assert.equal(calls,0);f.port.dispose();
  const changed=fixture(async()=>{changed.b.invalidate();return response(prepared());});try{await assert.rejects(changed.port.prepare(command()));}finally{changed.port.dispose();}
});
test('creation response bytes and error messages stay bounded/sanitized',async()=>{
  const large=fixture(async()=>response({padding:'x'.repeat(130000)}));try{await assert.rejects(large.port.status('loc-new'));}finally{large.port.dispose();}
  const safe=fixture(async()=>response({error:{code:'location_creation_conflict',message:'Cancel the old creation first.'}},409));try{await assert.rejects(safe.port.prepare(command()),/Cancel the old/);}finally{safe.port.dispose();}
  const unsafe=fixture(async()=>response({error:{code:'infrastructure',message:'PRIVATE_DETAILS'}},503));try{await assert.rejects(unsafe.port.prepare(command()),e=>!String(e).includes('PRIVATE_DETAILS'));}finally{unsafe.port.dispose();}
});
