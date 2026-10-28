import test from 'node:test';
import assert from 'node:assert/strict';
import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../src/types';
import { prepareNewLocationLeadership } from '../src/lib/newLocationLeadership';
function fixture() {
  return { location: { id:'new',storeNumber:'008',name:'New Store',type:'Enclosed Mall',recordStatus:'Draft',regionId:'01',districtId:'01',storeManagerId:'store-manager',storeManagerName:'Store Manager',regionalManagerId:'old-rm',regionalManagerName:'Old Regional',address:'100 Actual Way' } as LocationRecord,
    districts: [{ id:'01',name:'Central',regionId:'01',status:'Active',version:1,leadershipModelVersion:1,leadershipVersion:1,districtManagerId:'dm' }] as unknown as DistrictRecord[],
    regions: [{ id:'01',name:'West',status:'Active',version:1,leadershipModelVersion:1,leadershipVersion:1,regionalManagerId:'rm' }] as unknown as RegionRecord[],
    people: [{ id:'dm',fullName:'District Manager',status:'Active',positionIds:['district-manager'] },{ id:'rm',fullName:'Regional Manager',status:'Active',positionIds:['regional-manager'] }] as Person[] };
}
test('new retail records inherit each canonical Primary without changing their own staff, hierarchy or contact', () => {
  const f=fixture(), before=structuredClone(f), saved=prepareNewLocationLeadership(f.location,f.districts,f.regions,f.people);
  assert.equal(saved.districtManagerId,'dm'); assert.equal(saved.regionalManagerId,'rm'); assert.equal(saved.regionalManagerName,'Regional Manager');
  for (const field of ['id','storeNumber','storeManagerId','storeManagerName','address','districtId','regionId','recordStatus'] as const) assert.equal(saved[field],f.location[field]);
  assert.deepEqual(f,before);
});
test('District and Region ownership are independent; legacy Regional assignment is preserved', () => {
  const f=fixture(); delete (f.regions[0] as any).leadershipModelVersion; delete (f.regions[0] as any).leadershipVersion; delete (f.regions[0] as any).regionalManagerId;
  const saved=prepareNewLocationLeadership(f.location,f.districts,f.regions,f.people);
  assert.equal(saved.districtManagerId,'dm'); assert.equal(saved.regionalManagerId,'old-rm'); assert.equal(saved.regionalManagerName,'Old Regional');
  delete (f.districts[0] as any).leadershipModelVersion; delete (f.districts[0] as any).leadershipVersion;
  assert.equal(prepareNewLocationLeadership(f.location,f.districts,f.regions,f.people).regionalManagerId,'old-rm');
});
test('explicit managed vacancies clear stale copied IDs and names; Corporate is not swept into retail inheritance', () => {
  const f=fixture(); (f.regions[0] as any).regionalManagerId=null; f.districts[0].districtManagerId=null;
  const saved=prepareNewLocationLeadership(f.location,f.districts,f.regions,f.people);
  assert.equal(saved.districtManagerId,undefined); assert.equal(saved.districtManagerName,''); assert.equal(saved.regionalManagerId,undefined); assert.equal(saved.regionalManagerName,'');
  f.location.type='Corporate Office'; assert.equal(prepareNewLocationLeadership(f.location,f.districts,f.regions,f.people),f.location);
});
test('unknown model, missing pointer, invalid roster manager, inactive/ambiguous Person and parent mismatch fail before a request', () => {
  for (const change of [
    (f:ReturnType<typeof fixture>)=>{(f.regions[0] as any).leadershipModelVersion=2;},
    (f:ReturnType<typeof fixture>)=>{delete (f.regions[0] as any).regionalManagerId;},
    (f:ReturnType<typeof fixture>)=>{f.people[1].status='Inactive';},
    (f:ReturnType<typeof fixture>)=>{f.people[1].positionIds=['store-manager'];},
    (f:ReturnType<typeof fixture>)=>{f.people.push(structuredClone(f.people[1]));},
    (f:ReturnType<typeof fixture>)=>{f.districts[0].regionId='other';},
    (f:ReturnType<typeof fixture>)=>{f.regions[0].status='Retired';},
    (f:ReturnType<typeof fixture>)=>{f.location.hierarchyApplicability='Not Applicable';},
  ]) { const f=fixture(); change(f); assert.throws(()=>prepareNewLocationLeadership(f.location,f.districts,f.regions,f.people),/review|active Region/); }
});
