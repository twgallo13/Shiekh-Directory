import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {Firestore} from '@google-cloud/firestore';
import express from 'express';
import {moveFixture} from './helpers/organizationMoveFixture';
import {leadershipActor as actor} from './helpers/organizationLeadershipFixture';
import {FirestoreDirectoryStore} from '../server/firestoreDirectory';
import {prepareLocationLifecycle,commitLocationLifecycle} from '../server/locationLifecycleOperations';
import {createDirectoryApiRouter,apiErrorHandler} from '../server/directoryApi';
import {createPersonnelApiRouter} from '../server/personnelApi';
import {createLeadershipApiRouter} from '../server/leadershipApi';
import {FirestoreLocationRepository} from '../server/firestoreLocations';
import {FirestorePersonnelRepository} from '../server/firestorePersonnel';
import {FirestoreLeadershipRepository} from '../server/firestoreLeadership';
import type {ManagedApiCredential} from '../server/apiClientApi';
import {buildLocationImportPlan,LOCATION_IMPORT_COLUMNS} from '../src/lib/locationImportPreview';
import {digestLocationImportActor,digestLocationImportSource,type LocationImportManifest} from '../server/locationImportConfirmation';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8089')throw new Error('Use only the isolated loopback emulator.');

async function harness(){
  const db=new Firestore({projectId:'demo-directory-transitions',databaseId:`lifecycle-consumers-${randomUUID()}`}),f=moveFixture();
  const hours=Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d=>[d,{open:'10:00',close:'21:00',isClosed:false}]));
  const business={address:'100 Synthetic Way',city:'Test City',state:'CA',zipCode:'90001',phone:'+12135550100',phonePrivacy:'Internal',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations',standardHours:hours};
  Object.assign(f.records.get('locations/007'),business,{locationInboxEmail:'store007@shiekhshoes.com',storeManagerId:'store-manager',storeManagerName:'Store Manager',storeManagerPhone:'PRIVATE_PHONE',hierarchyApplicability:'Applicable',privateNotes:'PRIVATE_NOTE'});
  Object.assign(f.records.get('locations/corporate'),business,{storeNumber:'000',hierarchyApplicability:'Not Applicable',locationInboxEmail:'corporate-location@shiekhshoes.com'});
  Object.assign(f.records.get('people/incumbent'),{workEmail:'current.manager@shiekhshoes.com'});
  Object.assign(f.records.get('people/new-hire'),{workEmail:'new.manager@shiekhshoes.com'});
  f.records.set('people/store-manager',{fullName:'Store Manager',status:'Active',positionIds:['store-manager'],version:1,workEmail:'store007@shiekhshoes.com',privateNotes:'PRIVATE_PERSON'});
  const batch=db.batch();for(const[path,data]of f.records)batch.create(db.doc(path),data);await batch.commit();
  const base:ManagedApiCredential={clientId:'synthetic-directory-consumer',tokenVersionId:'synthetic-version',cursorSigningKey:'synthetic-key',scopes:['locations:read'],grantsVersion:1};
  const tokens=new Map<string,ManagedApiCredential>([['locations-only',base],['staff-consumer',{...base,clientId:'synthetic-staff-consumer',scopes:['locations:read','personnel:read','staffing:read','district-leadership:read','district-leadership:contacts:read']}]]);
  const grantsBefore=structuredClone([...tokens]),authenticator={authenticate:async(token:string)=>tokens.get(token)??null},app=express();app.disable('etag');
  app.use('/api/v1',createDirectoryApiRouter({authenticator,locations:new FirestoreLocationRepository(db),rateLimit:false}));
  app.use('/api/v2',createPersonnelApiRouter({authenticator,repository:new FirestorePersonnelRepository(db),rateLimit:false}));
  app.use('/api/v3',createLeadershipApiRouter({authenticator,repository:new FirestoreLeadershipRepository(db),rateLimit:false}));app.use(apiErrorHandler);
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${(server.address() as any).port}`,store=new FirestoreDirectoryStore(db);
  const get=(path:string,token='staff-consumer')=>fetch(origin+path,{headers:{Authorization:'Bearer '+token}});
  const json=async(path:string,token?:string)=>{const r=await get(path,token);const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));return v;};
  // Snapshot APIs round down to a whole second. Wait past writes without inventing future readTime.
  const snapshots=async()=>{await new Promise(r=>setTimeout(r,1020-Date.now()%1000));return{v2:(await json('/api/v2/snapshot')).snapshot as string,v3:(await json('/api/v3/snapshot')).snapshot as string};};
  const all=async(path:string,snapshot?:string,token?:string)=>{const data:any[]=[],seen=new Set<string>();let cursor:string|null=null;do{const q=new URLSearchParams({limit:'1',...(snapshot?{snapshot}:{}),...(cursor?{cursor}:{})});const page=await json(path+'?'+q,token);data.push(...page.data);cursor=page.pagination.nextCursor;if(cursor){assert(!seen.has(cursor));seen.add(cursor);}assert(seen.size<20);}while(cursor);return data;};
  const change=async(intent:any)=>{const p=await prepareLocationLifecycle(db,{schemaVersion:1,operationId:randomUUID(),reason:'Synthetic consumer compatibility acceptance',...intent},actor);assert('reviewHash' in p);assert.equal((await commitLocationLifecycle(db,{operationId:p.operationId,reviewHash:p.reviewHash!},actor)).state,'committed');};
  return{db,store,get,json,all,snapshots,change,tokens,grantsBefore,async close(){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await db.terminate();}};
}

test('SDK lifecycle changes preserve existing consumer shapes, contacts, scopes and full reconciliation',{timeout:90_000},async()=>{
  const h=await harness();try{
    const first=await h.snapshots(),beforePersonnel=await h.all('/api/v2/personnel',first.v2),beforeDistricts=await h.all('/api/v3/district-leadership',first.v3),publicBefore=await h.all('/api/v1/locations',undefined,'locations-only'),publicPage=await h.json('/api/v1/locations?limit=1','locations-only');
    assert(publicPage.pagination.nextCursor);assert.equal(publicPage.data[0].id,'007');
    assert.equal(publicBefore.find(l=>l.id==='007').storeNumber,'007');assert.equal(Object.hasOwn(publicBefore.find(l=>l.id==='007'),'phone'),false);
    assert.equal((await h.json('/api/v2/location-staffing/007?snapshot='+first.v2)).data.storeManagerId,'store-manager');
    assert.equal(beforeDistricts.find(d=>d.districtId==='01').districtManager.workEmail,'current.manager@shiekhshoes.com');
    await h.change({locationId:'007',expectedVersion:4,action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:true});
    const second=await h.snapshots(),out=(await h.json('/api/v1/locations/007')).data,staff=(await h.json('/api/v2/location-staffing/007?snapshot='+second.v2)).data,join=(await h.json('/api/v3/location-districts/007?snapshot='+second.v3)).data;
    assert.equal(out.id,'007');assert.equal(out.storeNumber,'007');assert.equal(out.locationInboxEmail,'store007@shiekhshoes.com');assert.equal(out.type,'Corporate Office');assert.equal(out.hierarchyApplicability,'Not Applicable');assert.equal(out.districtId,null);assert.deepEqual(Object.keys(out).sort(),Object.keys({...publicBefore.find(l=>l.id==='007'),district:''}).sort());
    for(const field of ['regionId','districtId','storeManagerId','districtManagerId','regionalManagerId'])assert.equal(staff[field],null);
    assert.deepEqual(staff.assistantStoreManagerIds,[]);assert.deepEqual(staff.keyHolderIds,[]);assert.equal(join.hierarchyApplicability,'Not Applicable');assert.equal(join.districtId,null);assert.deepEqual(join.issues,[]);
    assert.equal((await h.json('/api/v2/location-staffing/007?snapshot='+first.v2)).data.storeManagerId,'store-manager');assert.equal((await h.json('/api/v3/location-districts/007?snapshot='+first.v3)).data.hierarchyApplicability,'Applicable');
    assert.deepEqual(await h.all('/api/v2/personnel',second.v2),beforePersonnel);assert.deepEqual(await h.all('/api/v3/district-leadership',second.v3),beforeDistricts);
    const corpus=JSON.stringify([out,staff,join]);assert.doesNotMatch(corpus,/PRIVATE_|locationLifecycleModelVersion|operationId|reviewHash|firebaseUid|workEmail/);
    assert.equal((await h.get('/api/v2/snapshot','locations-only')).status,403);assert.equal((await h.get('/api/v3/snapshot','locations-only')).status,403);assert.deepEqual([...h.tokens],h.grantsBefore);
    await h.change({locationId:'corporate',expectedVersion:1,action:'convert',type:'Enclosed Mall',hierarchy:{districtId:'02',regionId:'02',expectedDistrictVersion:1,expectedRegionVersion:1},releaseStoreStaffing:false});
    const inbound=await h.snapshots(),incoming=(await h.json('/api/v2/location-staffing/corporate?snapshot='+inbound.v2)).data;assert.equal(incoming.districtManagerId,'new-hire');assert.equal(incoming.regionalManagerId,'new-hire');assert.equal(incoming.storeManagerId,null);assert.deepEqual(await h.all('/api/v2/personnel',inbound.v2),beforePersonnel);
    const continued=await h.json('/api/v1/locations?limit=1&cursor='+encodeURIComponent(publicPage.pagination.nextCursor),'locations-only');assert.equal(continued.data[0].id,'corporate');assert.equal(continued.data[0].type,'Corporate Office');assert.equal(continued.sync.watermark,publicPage.sync.watermark);
    const current=(await h.db.doc('locations/007').get()).data()!;await h.store.commit([{collection:'locations',id:'007',operation:'set',expectedVersion:5,data:{...current,recordStatus:'Retired'}}],null,actor);
    const retired=await h.snapshots();assert.equal((await h.get('/api/v1/locations/007')).status,404);assert.equal((await h.json('/api/v2/location-staffing/007?snapshot='+retired.v2)).data.recordStatus,'retired');assert.equal((await h.json('/api/v3/location-districts/007?snapshot='+retired.v3)).data.recordStatus,'retired');
    await h.change({locationId:'007',expectedVersion:6,action:'remove',acknowledgeApiRemoval:true});
    const removed=await h.snapshots();for(const[path,snapshot]of [['/api/v2/location-staffing',removed.v2],['/api/v3/location-districts',removed.v3]]){assert.equal((await h.all(path,snapshot)).some(l=>l.locationId==='007'),false);assert.equal((await h.get(path+'/007?snapshot='+snapshot)).status,404);}
    for(const[path,snapshot]of [['/api/v2/location-staffing',retired.v2],['/api/v3/location-districts',retired.v3]])assert.equal((await h.json(path+'/007?snapshot='+snapshot)).data.recordStatus,'retired');
    assert.equal((await h.all('/api/v1/locations',undefined,'locations-only')).some(l=>l.id==='007'),false);assert.equal((await h.json('/api/v1/locations/000')).data.id,'corporate');assert.deepEqual(await h.all('/api/v2/personnel',removed.v2),beforePersonnel);assert.deepEqual(await h.all('/api/v3/district-leadership',removed.v3),beforeDistricts);assert.equal((await h.db.doc('location_lifecycle_tombstones/007').get()).exists,true);assert.deepEqual([...h.tokens],h.grantsBefore);
  }finally{await h.close();}
});

test('SDK removal blocks a previously previewed CSV and generic recreation without partial receipts/audits',{timeout:90_000},async()=>{
  const h=await harness();try{
    await h.change({locationId:'007',expectedVersion:4,action:'convert',type:'Corporate Office',hierarchy:null,releaseStoreStaffing:true});
    const initial=(await h.db.doc('locations/007').get()).data()!,csvRow:Record<string,string>={SchemaVersion:'locations-v1',StoreNumber:'007',StoreName:'Attempted replacement',Type:'Corporate Office',Address:'100 Synthetic Way',City:'Test City',State:'CA',ZipCode:'90001',Phone:'2135550100',TimeZone:'America/Los_Angeles',HierarchyApplicability:'Not Applicable',OperationalStatus:'Open — Normal Operations',RecordStatus:'Active'};
    const csv=LOCATION_IMPORT_COLUMNS.join(',')+'\r\n'+LOCATION_IMPORT_COLUMNS.map(k=>JSON.stringify(csvRow[k]||'')).join(',')+'\r\n';
    // A disconnected preview can legitimately propose an absent record. The confirm transaction
    // must still refuse the permanently reserved identity if removal happens before confirmation.
    const seed=await h.store.read(),plan=buildLocationImportPlan(csv,{...seed,locations:seed.locations.filter(l=>l.id!=='007')},undefined,()=> '007');assert.equal(plan.preview.rows[0].action,'add',JSON.stringify(plan.preview.rows[0].issues));
    const crossing={...csvRow,Type:'Enclosed Mall',HierarchyApplicability:'Applicable',RegionId:'02',DistrictId:'02'},crossingCsv=LOCATION_IMPORT_COLUMNS.join(',')+'\r\n'+LOCATION_IMPORT_COLUMNS.map(k=>JSON.stringify(crossing[k]||'')).join(',')+'\r\n';
    assert.equal(buildLocationImportPlan(crossingCsv,seed).preview.rows[0].action,'blocked');
    const manifest:LocationImportManifest={version:1,schema:'locations-v1',actorDigest:digestLocationImportActor(actor),sourceDigest:digestLocationImportSource(csv),operationId:randomUUID(),batchId:randomUUID(),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+600000).toISOString(),summary:plan.preview.summary,warningCount:plan.preview.summary.warnings,writes:plan.writes,unchanged:plan.unchanged};
    await h.store.commit([{collection:'locations',id:'007',operation:'set',expectedVersion:5,data:{...initial,recordStatus:'Retired'}}],null,actor);await h.change({locationId:'007',expectedVersion:6,action:'remove',acknowledgeApiRemoval:true});
    const audits=(await h.db.collection('audit_logs').get()).size;
    await assert.rejects(h.store.confirmLocationImport(manifest,actor),/cannot be reused/);await assert.rejects(h.store.commit([{collection:'locations',id:'007',operation:'set',expectedVersion:null,data:initial}],null,actor),/cannot be reused/);
    assert.equal((await h.db.doc('locations/007').get()).exists,false);assert.equal((await h.db.doc('location_lifecycle_tombstones/007').get()).exists,true);assert.equal((await h.db.doc('location_import_receipts/'+manifest.operationId).get()).exists,false);assert.equal((await h.db.collection('audit_logs').get()).size,audits);
  }finally{await h.close();}
});
