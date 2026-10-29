import test from 'node:test';
import assert from 'node:assert/strict';
import { planLocationLifecycle,normalizeLocationLifecycleIntent,type LocationLifecycleSnapshot } from '../server/locationLifecyclePlanner';
import type { LocationLifecycleIntent } from '../src/lib/locationLifecycleContract';
import { leadershipUnitKey } from '../server/organizationLeadershipPlanner';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipNow as now } from './helpers/organizationLeadershipFixture';
function fixture(){
  const f=moveFixture();f.records.get('locations/corporate').storeNumber='000';
  const rows=(collection:string)=>[...f.records].filter(([p])=>p.startsWith(collection+'/')).map(([p,data])=>({id:p.split('/')[1],data:structuredClone(data)}));
  const units=[...rows('districts').map(u=>({...u,unitType:'district' as const})),...rows('regions').map(u=>({...u,unitType:'region' as const}))];
  const snapshot:LocationLifecycleSnapshot={units,assignments:rows('leadership_assignments'),locations:rows('locations'),people:rows('people'),complete:{hierarchy:true,locations:true,assignmentUnits:units.map(u=>leadershipUnitKey(u.unitType,u.id))},references:{people:rows('people'),accounts:rows('users'),requests:[],complete:{people:true,accounts:true,requests:true}}};
  const intent:LocationLifecycleIntent={schemaVersion:1,operationId:'convert-1',locationId:'007',expectedVersion:4,reason:'Explicit synthetic use change',action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:false};
  const location=snapshot.locations.find(l=>l.id==='007')!;
  return{snapshot,intent,location,plan:(i:unknown=intent)=>planLocationLifecycle(i,snapshot,now)};
}
test('conversion plans only one detached Location patch, ends inherited coverage and preserves unrelated records/contact/workplaces',()=>{
  const f=fixture(),before=structuredClone(f.snapshot),p=f.plan();assert.equal(p.review.ready,true);assert.equal(p.writes.length,1);assert.equal(p.writes[0].id,'007');const set=p.writes[0].set!;
  assert.equal(set.locationLifecycleModelVersion,1);assert.equal(set.version,5);assert.equal(set.type,'Corporate Office');assert.equal(set.regionId,null);assert.equal(set.districtId,null);assert.equal(set.districtManagerId,null);assert.equal(set.regionalManagerId,null);assert.equal(set.hierarchyApplicability,'Not Applicable');
  assert.equal(p.review.before.hierarchy?.districtManager.id,'incumbent');assert.equal(p.review.after.hierarchy,null);assert(p.review.coverage.every(c=>c.before===1&&c.after===0));assert.deepEqual(f.snapshot,before);
  assert.equal(({...f.location.data,...set} as Record<string,unknown>).address,'PRIVATE_ADDRESS');assert.doesNotMatch(JSON.stringify(p),/PRIVATE_CONTACT|PRIVATE_ACCOUNT|PRIVATE_ADDRESS/);
  assert.equal(Object.hasOwn(set,'recordStatus'),false);assert.equal(Object.hasOwn(set,'phone'),false);assert.equal(Object.hasOwn(set,'locationInboxEmail'),false);
});
test('non-retail to retail requires explicit managed destination and inherits both Primary managers, not a workplace or title',()=>{
  const f=fixture(),i={...f.intent,locationId:'corporate',expectedVersion:1,type:'Enclosed Mall',hierarchy:{districtId:'02',regionId:'02',expectedDistrictVersion:1,expectedRegionVersion:1}};
  const p=f.plan(i);assert.equal(p.review.ready,true);assert.equal(p.writes[0].set!.districtManagerId,'new-hire');assert.equal(p.writes[0].set!.regionalManagerId,'new-hire');assert.equal(p.writes[0].set!.storeManagerId,null);assert.equal(p.review.before.hierarchy,null);
  assert(p.review.dependencies.people.some(p=>p.id==='new-hire'&&p.relationships.includes('Works at')));assert(p.review.warnings.some(w=>/same Location ID/.test(w)));assert(p.review.coverage.every(c=>c.before===0&&c.after===1));
  assert.throws(()=>f.plan({...i,hierarchy:{...i.hierarchy,expectedRegionVersion:99}}),/destination changed/);assert.throws(()=>f.plan({...i,hierarchy:{...i.hierarchy,regionId:'01'}}),/parent links/);
});
test('ending local store staffing requires explicit selection and never changes People positions or workplace/support links',()=>{
  const f=fixture(),person={id:'store-person',data:{fullName:'Store Person',status:'Inactive',positionIds:['store-manager'],primaryLocationId:'007',supportedLocationIds:[]}};f.snapshot.people.push(person);f.snapshot.references.people.push(structuredClone(person));Object.assign(f.location.data,{storeManagerId:person.id,storeManagerName:'Old copied name',storeManagerPhone:'PRIVATE_STAFF_PHONE',assistantStoreManagerIds:[person.id],assistantStoreManagerNames:['Old copied name']});
  const blocked=f.plan();assert.equal(blocked.review.ready,false);assert.equal(blocked.writes.length,0);assert.equal(blocked.review.before.staffing.length,2);
  const before=structuredClone(f.snapshot),ready=f.plan({...f.intent,releaseStoreStaffing:true});assert.equal(ready.review.ready,true);assert.deepEqual(ready.writes[0].set!.assistantStoreManagerIds,[]);assert.equal(ready.writes[0].set!.storeManagerId,null);assert.equal(ready.writes[0].set!.storeManagerPhone,'');assert.doesNotMatch(JSON.stringify(ready),/PRIVATE_STAFF_PHONE/);assert.deepEqual(f.snapshot,before);
});
test('removal requires retirement, vacant staffing, API acknowledgment and no current linked dependencies',()=>{
  const f=fixture(),i={schemaVersion:1,operationId:'remove-1',locationId:'007',expectedVersion:4,reason:'Explicit synthetic removal',action:'remove',acknowledgeApiRemoval:false};
  let p=f.plan(i);assert.equal(p.review.ready,false);assert(p.review.blockers.some(b=>/Retire/.test(b)));assert(p.review.blockers.some(b=>/API/.test(b)));f.location.data.recordStatus='Retired';p=f.plan({...i,acknowledgeApiRemoval:true});assert.equal(p.review.ready,true);assert.equal(p.writes[0].operation,'delete');assert.equal(p.writes[0].set,null);assert.equal(p.review.after.removed,true);assert(p.review.warnings.some(w=>/Historical audits/.test(w)));
});
test('incoming workplace, support, legacy and pending Person assignment requests block removal without automatic reassignment',()=>{
  const f=fixture();f.location.data.recordStatus='Retired';Object.assign(f.snapshot.references.people[0].data,{primaryLocationId:'007',supportedLocationIds:['007'],assignedLocations:['7']});f.snapshot.references.requests.push({id:'pending',data:{status:'Pending',targetType:'Person',targetId:'incumbent',requestedChanges:{supportedLocationIds:['007']}}});
  const p=f.plan({schemaVersion:1,operationId:'remove-1',locationId:'007',expectedVersion:4,reason:'Explicit synthetic removal',action:'remove',acknowledgeApiRemoval:true});assert.equal(p.review.ready,false);assert.equal(p.writes.length,0);assert.deepEqual(p.review.dependencies.people[0].relationships,['Works at','Supports','Legacy assigned Location']);assert.equal(p.review.dependencies.requests[0].id,'pending');
});
test('non-revoked store account links and pending Location requests block conversion; unrelated/revoked/history stay untouched',()=>{
  const f=fixture();f.snapshot.references.accounts.push({id:'linked',data:{status:'Suspended',accessScope:'Store 7',name:'Linked Account'}});f.snapshot.references.requests.push({id:'request',data:{status:'Pending',targetType:'Location',targetId:'007'}});
  let p=f.plan();assert.equal(p.review.ready,false);assert.equal(p.review.dependencies.accounts[0].id,'linked');assert.equal(p.review.dependencies.requests[0].id,'request');
  f.snapshot.references.accounts.at(-1)!.data.status='Revoked';f.snapshot.references.requests[0].data.status='Approved';p=f.plan();assert.equal(p.review.ready,true);assert.equal(p.review.dependencies.accounts.length,0);assert.equal(p.review.dependencies.requests.length,0);
});
test('missing/incomplete/duplicate/malformed source and ambiguous aliases fail closed before emitting patches',()=>{
  for(const alter of [(f:ReturnType<typeof fixture>)=>{f.snapshot.references.complete.people=false as any;},(f:ReturnType<typeof fixture>)=>{f.snapshot.references.people.push(f.snapshot.references.people[0]);},(f:ReturnType<typeof fixture>)=>{f.snapshot.references.people[0].data.supportedLocationIds=['007','007'];},(f:ReturnType<typeof fixture>)=>{f.snapshot.references.accounts[0].data.accessScope='Unknown scope';},(f:ReturnType<typeof fixture>)=>{f.location.data.type='Unknown use';},(f:ReturnType<typeof fixture>)=>{f.location.data.locationLifecycleModelVersion=99;},(f:ReturnType<typeof fixture>)=>{f.snapshot.locations.push({id:'alias',data:{...f.location.data,storeNumber:'7'}});},(f:ReturnType<typeof fixture>)=>{f.location.data.storeManagerName='Unlinked label';}]){const f=fixture();alter(f);assert.throws(()=>f.plan());}
  const f=fixture();assert.throws(()=>f.plan({...f.intent,expectedVersion:3}),/Location changed/);assert.throws(()=>f.plan({...f.intent,type:'Street / Standalone Location',hierarchy:{districtId:'01',regionId:'01',expectedDistrictVersion:3,expectedRegionVersion:1}}),/ordinary Location editing/);
});
test('source order does not change review bindings and ownership/manager/staffing changes do',()=>{
  const f=fixture(),a=f.plan();f.snapshot.units.reverse();f.snapshot.assignments.reverse();f.snapshot.people.reverse();f.snapshot.locations.reverse();f.snapshot.references.people.reverse();assert.deepEqual(f.plan(),a);
  f.location.data.name='Changed Location';const b=f.plan();assert.notDeepEqual(b.preconditions,a.preconditions);
});
test('strict intent never accepts patches, client source attestations, unsupported action, missing acknowledgment or implicit hierarchy',()=>{
  const f=fixture();assert.deepEqual(normalizeLocationLifecycleIntent(f.intent),f.intent);
  for(const v of [{...f.intent,patch:{}},{...f.intent,complete:true},{...f.intent,action:'delete'},{...f.intent,type:'Unknown'},{...f.intent,type:{toString:'invalid'}},{...f.intent,hierarchy:{districtId:'02'}},{...f.intent,reason:'line\nbreak'},{...f.intent,releaseStoreStaffing:'yes'},{...f.intent,locationId:'../007'}])assert.throws(()=>normalizeLocationLifecycleIntent(v));
});

test('review rejects incomplete coverage or oversized linked dependency lists, and never overflows Location versions',()=>{
  const f=fixture();f.snapshot.locations.push({id:'unclassified',data:{name:'Unclassified',storeNumber:'009',type:'Unknown',recordStatus:'Active',districtId:'01',regionId:'01'}});assert.throws(()=>f.plan(),/classification/);
  const g=fixture();g.snapshot.references.people=Array.from({length:101},(_,i)=>({id:`person-${i}`,data:{fullName:`Person ${i}`,primaryLocationId:'007'}}));assert.throws(()=>g.plan(),/review capacity/);
  const h=fixture();h.location.data.version=Number.MAX_SAFE_INTEGER;assert.throws(()=>h.plan({...h.intent,expectedVersion:Number.MAX_SAFE_INTEGER}),/cannot advance/);h.location.data.recordStatus='Retired';const removal=h.plan({schemaVersion:1,operationId:'remove-max',locationId:'007',expectedVersion:Number.MAX_SAFE_INTEGER,reason:'Explicit reviewed removal',action:'remove',acknowledgeApiRemoval:true});assert.equal(removal.review.ready,true);assert.equal(removal.writes[0].expectedVersion,Number.MAX_SAFE_INTEGER);
  const legacy=fixture();legacy.snapshot.references.people[0].data.assignedLocations=['Southland Mall'];assert.throws(()=>legacy.plan(),/do not match.*by name/);
});
