import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { buildLocationImportPlan, LOCATION_IMPORT_COLUMNS } from '../src/lib/locationImportPreview';
import { digestLocationImportActor, digestLocationImportSource, type LocationImportManifest } from '../server/locationImportConfirmation';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator.');
test('SDK: managed CSV plan confirms both Primary copies once and rejects drift before another receipt/audit', {timeout:90000},async()=>{
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`managed-import-${randomUUID()}`}), f=moveFixture(), batch=db.batch();
  for(const [path,data] of f.records) batch.create(db.doc(path),data); await batch.commit();
  const rows=(collection:string)=>[...f.records].filter(([path])=>path.startsWith(collection+'/')).map(([path,data])=>({id:path.split('/')[1],...data}));
  const snapshot:any={locations:rows('locations'),people:rows('people'),regions:rows('regions'),districts:rows('districts')};
  const manifest=(number:string):LocationImportManifest=>{
    const row:Record<string,string>={SchemaVersion:'locations-v1',StoreNumber:number,StoreName:'New imported Store',Type:'Enclosed Mall',Address:'8 Actual Way',City:'Los Angeles',State:'CA',ZipCode:'90008',Phone:'2135550108',TimeZone:'America/Los_Angeles',HierarchyApplicability:'Applicable',RegionId:'02',DistrictId:'02',OperationalStatus:'Open — Normal Operations',RecordStatus:'Active'};
    const csv=LOCATION_IMPORT_COLUMNS.join(',')+'\r\n'+LOCATION_IMPORT_COLUMNS.map(k=>JSON.stringify(row[k]||'')).join(',')+'\r\n';
    const plan=buildLocationImportPlan(csv,snapshot,undefined,()=>`imported-${number}`); assert.equal(plan.preview.rows[0].action,'add',JSON.stringify(plan.preview.rows[0].issues));
    return {version:1,schema:'locations-v1',actorDigest:digestLocationImportActor(actor),sourceDigest:digestLocationImportSource(csv),operationId:randomUUID(),batchId:randomUUID(),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),summary:plan.preview.summary,warningCount:plan.preview.summary.warnings,writes:plan.writes,unchanged:plan.unchanged};
  };
  try {
    const store=new FirestoreDirectoryStore(db), first=manifest('008'), receipt=await store.confirmLocationImport(first,actor);
    assert.equal(receipt.locations[0].record.districtManagerId,'new-hire'); assert.equal(receipt.locations[0].record.regionalManagerId,'new-hire');
    assert.equal((await store.confirmLocationImport(first,actor)).replayed,true);
    const removed=manifest('010');await db.doc('location_lifecycle_tombstones/imported-010').create({schemaVersion:1,locationId:'imported-010',removedAt:new Date().toISOString()});
    await assert.rejects(store.confirmLocationImport(removed,actor),/cannot be reused/);assert.equal((await db.doc('locations/imported-010').get()).exists,false);assert.equal((await db.doc(`location_import_receipts/${removed.operationId}`).get()).exists,false);
    const stale=manifest('009'), change=db.batch(); change.update(db.doc('regions/02'),{regionalManagerId:null,leadershipVersion:2,version:2}); change.update(db.doc('leadership_assignments/region-02'),{status:'ended'}); await change.commit();
    await assert.rejects(store.confirmLocationImport(stale,actor),/canonical/);
    assert.equal((await db.doc('locations/imported-009').get()).exists,false);
    assert.equal((await db.collection('location_import_receipts').get()).size,1); assert.equal((await db.collection('audit_logs').get()).size,1);
  }finally{await db.terminate();}
});
