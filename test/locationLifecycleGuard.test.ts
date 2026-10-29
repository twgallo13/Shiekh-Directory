import test from 'node:test';
import assert from 'node:assert/strict';
import { preserveLocationLifecycleModel,validateLocationLifecycleWrite } from '../server/locationLifecycleGuard';
import { validateOrganizationLeadershipWrites,managedLocationLifecycleChanges } from '../server/organizationLeadershipGuards';
import type { DirectoryWrite } from '../server/firestoreDirectory';
const state={units:[],assignments:[]};
const before={locationLifecycleModelVersion:1,type:'Corporate Office',version:2,hierarchyApplicability:'Not Applicable',regionId:null,districtId:null,districtManagerId:null,districtManagerName:'',regionalManagerId:null,regionalManagerName:'',district:'',storeManagerId:null,storeManagerName:'',storeManagerPhone:'',assistantStoreManagerIds:[],assistantStoreManagerNames:[],keyHolderIds:[],keyHolderNames:[],recordStatus:'Active'};
const write=(changes:Record<string,unknown>):DirectoryWrite=>({collection:'locations',id:'location',operation:'set',data:{...before,...changes}});
test('ownership survives client omission but cannot be minted/changed/cleared by ordinary creates or edits',()=>{
  const omitted={type:'Corporate Office'};preserveLocationLifecycleModel(omitted,before);assert.equal((omitted as any).locationLifecycleModelVersion,1);
  for(const v of [null,0,2])assert.throws(()=>preserveLocationLifecycleModel({locationLifecycleModelVersion:v},before),/server-command/);
  assert.throws(()=>preserveLocationLifecycleModel({locationLifecycleModelVersion:1},undefined),/server-command/);assert.throws(()=>validateLocationLifecycleWrite(write({}),{type:'Corporate Office'},state),/server-command/);
});
test('detached non-retail ownership remains protected without ANY organization units or enabled gates',()=>{
  assert.doesNotThrow(()=>validateOrganizationLeadershipWrites([write({name:'New label',type:'Warehouse / Distribution Center'})],[before],state,[]));
  for(const changes of [{type:'Enclosed Mall'},{regionId:'01'},{hierarchyApplicability:'Applicable'},{districtManagerId:'manager'},{storeManagerId:'person'},{assistantStoreManagerIds:['person']},{locationLifecycleModelVersion:undefined}])assert.throws(()=>validateOrganizationLeadershipWrites([write(changes)],[before],state,[]));
  assert.throws(()=>validateOrganizationLeadershipWrites([{collection:'locations',id:'location',operation:'delete'}],[before],state,[]),/reviewed Location workflow/);
  assert.throws(()=>validateOrganizationLeadershipWrites([write({})],[{...before,locationLifecycleModelVersion:99}],state,[]),/unsupported/);
});
test('ordinary reviewed-owned lifecycle/format edits remain selected for mandatory audit after hierarchy detachment',()=>{
  assert.equal(managedLocationLifecycleChanges([write({type:'Warehouse / Distribution Center'})],[before],state).length,1);
  assert.equal(managedLocationLifecycleChanges([write({recordStatus:'Retired'})],[before],state).length,1);
  assert.equal(managedLocationLifecycleChanges([write({name:'New label'})],[before],state).length,0);
});

test('complete reviewed manager rename may propagate inherited labels on an owned retail Location only',()=>{
  const person={id:'manager',fullName:'Before',status:'Active',positionIds:['district-manager'],version:1};
  const location={...before,id:'location',type:'Enclosed Mall',hierarchyApplicability:'Applicable',districtId:'01',regionId:'01',districtManagerId:'manager',districtManagerName:'Before'};
  const state={units:[{id:'01',unitType:'region' as const,data:{status:'Active',leadershipModelVersion:1,leadershipVersion:1,regionalManagerId:null}},{id:'01',unitType:'district' as const,data:{status:'Active',regionId:'01',leadershipModelVersion:1,leadershipVersion:1,districtManagerId:'manager'}}],assignments:[{id:'tenure',unitType:'district' as const,unitId:'01',personId:'manager',status:'active' as const}]};
  const writes:DirectoryWrite[]=[{collection:'people',id:'manager',operation:'set',data:{...person,fullName:'After'}},{collection:'locations',id:'location',operation:'set',data:{...location,districtManagerName:'After'}}];
  assert.doesNotThrow(()=>validateOrganizationLeadershipWrites(writes,[person,location],state,[person],[location]));
  assert.throws(()=>validateOrganizationLeadershipWrites(writes.slice(1),[location],state,[person],[location]));
  for(const change of [{districtManagerId:'someone-else'},{regionId:'02'},{regionalManagerName:'Wrong'},{districtManagerName:'Wrong'},{locationLifecycleModelVersion:99}]){
    const altered=structuredClone(writes);Object.assign(altered[1].data!,change);assert.throws(()=>validateOrganizationLeadershipWrites(altered,[person,location],state,[person],[location]));
  }
  assert.throws(()=>validateOrganizationLeadershipWrites(writes.slice(0,1),[person],state,[person],[location]),/every affected/);
});
