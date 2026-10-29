import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLocationLifecycleDraft,emptyLifecycleSelection,lifecycleTypeChoices } from '../src/lib/locationLifecycleDraft';
import { moveBrowserFixture } from './helpers/organizationMoveBrowserFixture';
import type { LocationRecord } from '../src/types';
const choices=()=>({...emptyLifecycleSelection('007'),type:'Corporate Office',reason:'Explicit reviewed location use'});
test('conversion draft preserves exact Location identity/version and never infers staffing release or permissions',()=>{
  const f=moveBrowserFixture(),before=structuredClone(f),d=buildLocationLifecycleDraft(f.catalog,f.locations,choices());assert.equal(d.locationId,'007');assert.equal(d.expectedVersion,4);assert.equal(d.action,'convert');if(d.action==='convert'){assert.equal(d.hierarchy,null);assert.equal(d.releaseStoreStaffing,false);}assert.deepEqual(f,before);assert.doesNotMatch(JSON.stringify(d),/Manager|workEmail|primaryLocationId|account|positionId/);
});
test('non-retail to retail requires a deliberate canonical Region/District pair and current versions',()=>{
  const f=moveBrowserFixture();f.locations[0]={...f.locations[0],type:'Corporate Office',version:9} as LocationRecord;
  const s={...choices(),type:'Enclosed Mall',regionId:'02',districtId:'02'};const d=buildLocationLifecycleDraft(f.catalog,f.locations,s);assert(d.action==='convert');assert.deepEqual(d.hierarchy,{regionId:'02',districtId:'02',expectedDistrictVersion:1,expectedRegionVersion:1});
  for(const bad of [{regionId:'01'},{districtId:''},{regionId:''}])assert.throws(()=>buildLocationLifecycleDraft(f.catalog,f.locations,{...s,...bad}),/Choose a District/);
  f.catalog.units.find(u=>u.unitType==='district'&&u.id==='02')!.ownership='unsupported';assert.throws(()=>buildLocationLifecycleDraft(f.catalog,f.locations,s));
});
test('type choices cross use only; ordinary formats and unsupported source models are blocked',()=>{
  const f=moveBrowserFixture();assert(lifecycleTypeChoices(f.locations[0]).every(t=>['Corporate Office','Warehouse / Distribution Center','Other Company Location'].includes(t)));assert.throws(()=>buildLocationLifecycleDraft(f.catalog,f.locations,{...choices(),type:'Street / Standalone Location'}));
  f.locations[0].locationLifecycleModelVersion=99;assert.throws(()=>buildLocationLifecycleDraft(f.catalog,f.locations,choices()),/setup reviewed/);
});
test('removal keeps acknowledgment explicit and leaves retirement/dependency blockers to read-only server preview',()=>{
  const f=moveBrowserFixture(),s={...choices(),action:'remove' as const};let d=buildLocationLifecycleDraft(f.catalog,f.locations,s);assert.equal(d.action,'remove');if(d.action==='remove')assert.equal(d.acknowledgeApiRemoval,false);f.locations[0].version=Number.MAX_SAFE_INTEGER;d=buildLocationLifecycleDraft(f.catalog,f.locations,{...s,acknowledgeApiRemoval:true});assert.equal(d.expectedVersion,Number.MAX_SAFE_INTEGER);assert(d.action==='remove'&&d.acknowledgeApiRemoval);
});
test('refreshed versions are used only on deliberate draft rebuilding and reasons/identities are validated',()=>{
  const f=moveBrowserFixture(),d=buildLocationLifecycleDraft(f.catalog,f.locations,choices());f.locations[0].version=5;assert.equal(d.expectedVersion,4);assert.equal(buildLocationLifecycleDraft(f.catalog,f.locations,choices()).expectedVersion,5);
  for(const bad of [{locationId:'missing'},{reason:'bad'},{reason:'line\nbreak'},{type:''}])assert.throws(()=>buildLocationLifecycleDraft(f.catalog,f.locations,{...choices(),...bad}));f.locations[0].version=Number.MAX_SAFE_INTEGER;assert.throws(()=>buildLocationLifecycleDraft(f.catalog,f.locations,choices()));
});
