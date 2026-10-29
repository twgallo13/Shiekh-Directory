import { createHash } from 'node:crypto';
import type { DocumentSnapshot, Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import { canonicalTransitionJSON } from '../src/lib/personTransitionIntent';
import { classifyHierarchyLocationType } from '../src/lib/hierarchyResolution';
import { canonicalId } from './personnelProjection';
import { LeadershipPlanError, leadershipUnitKey } from './organizationLeadershipPlanner';
import { normalizeLocationLifecycleIntent, planLocationLifecycle, type LocationLifecycleSnapshot } from './locationLifecyclePlanner';
import { assertPersonTransitionActor, readPersonTransitionAuthority } from './personTransitionAuthority';

export const LOCATION_LIFECYCLE_SOURCE_LIMITS = Object.freeze({districts:500,regions:100,locations:1000,people:5000,users:5000,requests:5000,assignmentsPerUnit:1000,bytes:8_000_000});
const fields={
  districts:['id','version','name','status','regionId','districtManagerId','leadershipModelVersion','leadershipVersion'],
  regions:['id','version','name','status','regionalManagerId','leadershipModelVersion','leadershipVersion'],
  locations:['id','version','storeNumber','name','type','recordStatus','locationLifecycleModelVersion','hierarchyApplicability','districtId','regionId','districtManagerId','districtManagerName','regionalManagerId','regionalManagerName','storeManagerId','storeManagerName','storeManagerPhone','assistantStoreManagerIds','assistantStoreManagerNames','keyHolderIds','keyHolderNames'],
  people:['id','version','fullName','positionIds','status','activeStatus','primaryLocationId','supportedLocationIds','assignedLocations'],
  users:['id','version','name','status','accessScope','storeNumber'],
  requests:['id','version','status','targetType','targetId','requestedChanges.primaryLocationId','requestedChanges.supportedLocationIds'],
  leadership_assignments:['id','version','unitType','unitId','personId','status','startedAt','endedAt'],
} as const;
type Collection=keyof typeof fields;
export interface LocationLifecycleNativeSource {collection:Collection;id:string;data:Record<string,unknown>;updateTime:{seconds:string;nanoseconds:number}}
const fail=(message:string):never=>{throw new LeadershipPlanError('incomplete_source',message);};
const capacity=(message:string):never=>{throw new LeadershipPlanError('capacity',message);};
const plain=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
function json(v:unknown,depth=0):void{
  if(depth>30)fail('Location lifecycle source exceeds nesting capacity.');
  if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return;
  if(Array.isArray(v)){for(const item of v)json(item,depth+1);return;}
  if(plain(v)){for(const item of Object.values(v))json(item,depth+1);return;}
  fail('Location lifecycle source contains unsupported field values.');
}

/** Internal read-only source. Firebase authentication is a caller prerequisite; live administrator
 * authority is rechecked here in the same transaction. No browser completeness claims, contact payloads,
 * credentials, business writes or conversion admission. Future commits must rerun this adapter and
 * compare both the planner bindings and sourceFingerprint, then preserve full native saved records. */
export async function readLocationLifecyclePlan(db:Firestore,tx:Transaction,raw:unknown,actor:Account,now:string){
  assertPersonTransitionActor(actor);
  const intent=normalizeLocationLifecycleIntent(raw);
  await readPersonTransitionAuthority(db,tx,actor);
  const snapshot:LocationLifecycleSnapshot={units:[],assignments:[],locations:[],people:[],complete:{hierarchy:true,locations:true,assignmentUnits:[]},references:{people:[],accounts:[],requests:[],complete:{people:true,accounts:true,requests:true}}};
  const native=new Map<string,LocationLifecycleNativeSource>();let bytes=0;
  const source=(collection:Collection,doc:DocumentSnapshot)=>{
    const time=doc.updateTime,rawData=doc.data();
    if(!doc.exists||!canonicalId(doc.id)||doc.ref.path!==`${collection}/${doc.id}`||!time||!Number.isSafeInteger(time.seconds)||!Number.isInteger(time.nanoseconds)||time.nanoseconds<0||time.nanoseconds>=1_000_000_000||!plain(rawData))fail('Invalid native Location lifecycle source metadata.');
    const data:Record<string,unknown>={};
    for(const field of fields[collection]){
      const [parent,child]=field.split('.');
      if(!child){if(Object.hasOwn(rawData,parent))data[parent]=rawData[parent];}
      else if(Object.hasOwn(rawData,parent)){
        if(!plain(rawData[parent]))fail('Invalid pending relationship source.');
        if(Object.hasOwn(rawData[parent],child)){data[parent]??={};(data[parent] as Record<string,unknown>)[child]=rawData[parent][child];}
      }
    }
    json(data);
    // Only the presence of this compatibility contact is needed to reject orphaned staffing.
    // Keep the actual phone out of review source/receipts; native updateTime binds its changes.
    if(collection==='locations'&&Object.hasOwn(data,'storeManagerPhone')){
      if(data.storeManagerPhone!==null&&typeof data.storeManagerPhone!=='string')fail('Invalid saved staffing contact shape.');
      if(data.storeManagerPhone)data.storeManagerPhone='[present]';
    }
    if(Object.hasOwn(data,'id')&&data.id!==doc.id)fail('Location lifecycle document identity disagrees.');
    const key=`${collection}/${doc.id}`;if(native.has(key))fail('Duplicate Location lifecycle source document.');
    const value:LocationLifecycleNativeSource={collection,id:doc.id,data,updateTime:{seconds:String(time.seconds),nanoseconds:time.nanoseconds}};
    bytes+=Buffer.byteLength(canonicalTransitionJSON(value));if(bytes>LOCATION_LIFECYCLE_SOURCE_LIMITS.bytes)capacity('Location lifecycle source exceeds byte capacity.');
    native.set(key,value);return{id:doc.id,data};
  };
  for(const collection of ['districts','regions','locations','people','users','requests'] as const){
    const maximum=LOCATION_LIFECYCLE_SOURCE_LIMITS[collection],rows=await tx.get(db.collection(collection).select(...fields[collection]).limit(maximum+1));
    if(rows.size!==rows.docs.length)fail('Incomplete Location lifecycle inventory.');
    if(rows.size>maximum)capacity('Location lifecycle inventory exceeds bounded capacity.');
    for(const doc of rows.docs){const record=source(collection,doc);
      if(collection==='districts'||collection==='regions')snapshot.units.push({...record,unitType:collection==='districts'?'district':'region'});
      else if(collection==='locations')snapshot.locations.push(record);
      else if(collection==='people'){snapshot.people.push(record);snapshot.references.people.push(record);}
      else if(collection==='users')snapshot.references.accounts.push(record);
      else snapshot.references.requests.push(record);
    }
  }
  const location=snapshot.locations.find(l=>l.id===intent.locationId);if(!location)fail('Exact Location source is missing.');
  const selected=new Map<string,{unitType:'district'|'region';unitId:string}>();
  const add=(unitType:'district'|'region',unitId:unknown)=>{
    if(!canonicalId(unitId)||!snapshot.units.some(u=>u.unitType===unitType&&u.id===unitId))fail('Exact Location hierarchy source is missing.');
    selected.set(leadershipUnitKey(unitType,unitId as string),{unitType,unitId:unitId as string});
  };
  if(classifyHierarchyLocationType(location.data.type as string)==='retail'){add('district',location.data.districtId);add('region',location.data.regionId);}
  if(intent.action==='convert'&&intent.hierarchy){add('district',intent.hierarchy.districtId);add('region',intent.hierarchy.regionId);}
  for(const unit of [...selected.values()].sort((a,b)=>leadershipUnitKey(a.unitType,a.unitId).localeCompare(leadershipUnitKey(b.unitType,b.unitId)))){
    const rows=await tx.get(db.collection('leadership_assignments').where('unitType','==',unit.unitType).where('unitId','==',unit.unitId).select(...fields.leadership_assignments).limit(LOCATION_LIFECYCLE_SOURCE_LIMITS.assignmentsPerUnit+1));
    if(rows.size!==rows.docs.length)fail('Incomplete Location lifecycle roster inventory.');
    if(rows.size>LOCATION_LIFECYCLE_SOURCE_LIMITS.assignmentsPerUnit)capacity('Location lifecycle roster exceeds bounded capacity.');
    for(const doc of rows.docs){const record=source('leadership_assignments',doc);if(record.data.unitType!==unit.unitType||record.data.unitId!==unit.unitId)fail('Unrelated roster returned for Location review.');snapshot.assignments.push(record);}
    snapshot.complete.assignmentUnits.push(leadershipUnitKey(unit.unitType,unit.unitId));
  }
  const sourceFingerprint=createHash('sha256').update(canonicalTransitionJSON([...native].sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
  return{intent,plan:planLocationLifecycle(intent,snapshot,now),native,sourceFingerprint};
}
