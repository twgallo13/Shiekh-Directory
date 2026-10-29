import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { buildLocationImportPlan,LOCATION_IMPORT_COLUMNS } from '../src/lib/locationImportPreview';
import { digestLocationImportActor,digestLocationImportSource,type LocationImportManifest } from '../server/locationImportConfirmation';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');
test('SDK: detached ownership survives old-client omission and CSV subtype edits; mint/erase/conversion/deletion/future bypasses fail',{timeout:90000},async()=>{
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`lifecycle-guard-${randomUUID()}`}),store=new FirestoreDirectoryStore(db),ref=db.doc('locations/owned');
  const data={id:'owned',version:1,locationLifecycleModelVersion:1,storeNumber:'000',name:'Synthetic Corporate',type:'Corporate Office',recordStatus:'Active',hierarchyApplicability:'Not Applicable',districtId:null,regionId:null,district:'',districtManagerId:null,districtManagerName:'',regionalManagerId:null,regionalManagerName:'',storeManagerId:null,storeManagerName:'',storeManagerPhone:'',assistantStoreManagerIds:[],assistantStoreManagerNames:[],keyHolderIds:[],keyHolderNames:[],address:'100 Synthetic Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations'};
  await ref.create(data);const saved=async()=>(await ref.get()).data()!;
  const commit=async(changes:Record<string,unknown>,omitMarker=false)=>{const before=await saved(),next={...before,...changes};if(omitMarker)delete next.locationLifecycleModelVersion;return store.commit([{collection:'locations',id:'owned',operation:'set',expectedVersion:before.version,data:next}],null,actor);};
  try{
    await commit({type:'Warehouse / Distribution Center'},true);assert.equal((await saved()).locationLifecycleModelVersion,1);assert.equal((await saved()).version,2);assert.equal((await db.collection('audit_logs').get()).size,1);
    const record=await saved(),row:Record<string,string>={SchemaVersion:'locations-v1',LocationId:'owned',Type:'Other Company Location'},csv=LOCATION_IMPORT_COLUMNS.join(',')+'\r\n'+LOCATION_IMPORT_COLUMNS.map(k=>JSON.stringify(row[k]||'')).join(',')+'\r\n';
    const plan=buildLocationImportPlan(csv,{locations:[record],people:[],regions:[],districts:[]} as any);assert.equal(plan.preview.rows[0].action,'update',JSON.stringify(plan.preview.rows[0].issues));
    const manifest:LocationImportManifest={version:1,schema:'locations-v1',actorDigest:digestLocationImportActor(actor),sourceDigest:digestLocationImportSource(csv),operationId:randomUUID(),batchId:randomUUID(),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),summary:plan.preview.summary,warningCount:plan.preview.summary.warnings,writes:plan.writes,unchanged:plan.unchanged};
    await store.confirmLocationImport(manifest,actor);assert.equal((await saved()).locationLifecycleModelVersion,1);assert.equal((await saved()).version,3);assert.equal((await db.collection('audit_logs').get()).size,2);
    for(const changes of [{locationLifecycleModelVersion:null},{locationLifecycleModelVersion:2},{type:'Enclosed Mall'},{storeManagerId:'someone'},{districtId:'somewhere'}])await assert.rejects(commit(changes));
    await assert.rejects(store.commit([{collection:'locations',id:'new-owned',operation:'set',expectedVersion:null,data:{...data,id:'new-owned',storeNumber:'001'}}],null,actor),/server-command/);assert.equal((await db.doc('locations/new-owned').get()).exists,false);
    await assert.rejects(store.commit([{collection:'locations',id:'owned',operation:'delete',expectedVersion:3}],null,actor),/reviewed Location workflow/);assert.equal((await saved()).version,3);
    await ref.update({locationLifecycleModelVersion:99});await assert.rejects(commit({name:'Bypass future'}),/unsupported/);assert.equal((await saved()).name,data.name);assert.equal((await db.collection('audit_logs').get()).size,2);
  }finally{await db.terminate();}
});
