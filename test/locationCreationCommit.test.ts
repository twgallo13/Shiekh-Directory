import test from 'node:test';
import assert from 'node:assert/strict';
import { validLocationCreationCommit } from '../src/lib/locationCreationCommit';
import type { DirectoryWrite } from '../src/lib/directoryClient';
test('created-store confirmation requires the exact identity/version and inherited hierarchy',()=>{
  const write:DirectoryWrite={collection:'locations',operation:'set',id:'new',expectedVersion:null,data:{storeNumber:'008',name:'Store',type:'Enclosed Mall',recordStatus:'Active',regionId:'01',districtId:'01',districtManagerId:'dm',regionalManagerId:undefined}};
  const result:any={records:[{collection:'locations',operation:'set',id:'new',data:{...write.data,id:'new',version:1}}]};
  assert.equal(validLocationCreationCommit(result,write),true);
  for(const change of [(r:any)=>{r.records=[];},(r:any)=>{r.records.push(structuredClone(r.records[0]));},(r:any)=>{r.records[0].id='other';},(r:any)=>{r.records[0].data.version=2;},(r:any)=>{r.records[0].data.districtManagerId='other';},(r:any)=>{delete r.records[0].data.name;}]) {const r=structuredClone(result);change(r);assert.equal(validLocationCreationCommit(r,write),false);}
});
