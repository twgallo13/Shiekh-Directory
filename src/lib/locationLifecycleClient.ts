import type { LocationLifecycleIntent,LocationLifecycleReview } from './locationLifecycleContract';
import { classifyHierarchyLocationType } from './hierarchyResolution';
import { createOrganizationSessionTransport,OrganizationTransportError,parseOrganizationCapabilities,parseOrganizationCatalog,parseOrganizationList,parseOrganizationOutcome } from './organizationLeadershipClient';

const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v:unknown,keys:string[]):v is Record<string,any>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const text=(v:unknown,max=1000):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v:unknown,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const instant=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const kind=(v:unknown)=>typeof v==='string'?classifyHierarchyLocationType(v):'unclassified';
const strings=(v:unknown,max:number)=>Array.isArray(v)&&v.length<=max&&v.every(x=>text(x));
function invalid():never{throw new OrganizationTransportError('This Location review could not be verified. Keep its identity and check recovery.');}
export function isLocationLifecycleIntent(v:unknown):v is LocationLifecycleIntent{
  if(!object(v)||!exact(v,['schemaVersion','operationId','locationId','expectedVersion','reason','action',...(v.action==='convert'?['type','hierarchy','releaseStoreStaffing']:['acknowledgeApiRemoval'])])||v.schemaVersion!==1||!id(v.operationId)||!id(v.locationId)||!integer(v.expectedVersion)||!text(v.reason,500)||v.reason.trim().length<5)return false;
  if(v.action==='remove')return typeof v.acknowledgeApiRemoval==='boolean';
  if(v.action!=='convert'||kind(v.type)==='unclassified'||typeof v.releaseStoreStaffing!=='boolean')return false;
  const h=v.hierarchy;return kind(v.type)==='non-retail'?h===null:exact(h,['districtId','regionId','expectedDistrictVersion','expectedRegionVersion'])&&id(h.districtId)&&id(h.regionId)&&integer(h.expectedDistrictVersion)&&integer(h.expectedRegionVersion);
}
function hierarchy(v:unknown){
  if(v===null)return;
  if(!exact(v,['districtId','districtName','regionId','regionName','districtManager','regionalManager'])||!id(v.districtId)||!id(v.regionId)||!text(v.districtName)||!text(v.regionName))invalid();
  for(const m of [v.districtManager,v.regionalManager])if(!exact(m,['id','name'])||(m.id===null?m.name!=='':!id(m.id)||!text(m.name)))invalid();
}
function staffing(v:unknown){
  if(!Array.isArray(v)||v.length>201)invalid();const seen=new Set<string>();
  for(const m of v){if(!exact(m,['role','personId','fullName'])||!['Store Manager','Assistant Manager','Key Holder'].includes(m.role)||!id(m.personId)||!text(m.fullName))invalid();const key=JSON.stringify([m.role,m.personId]);if(seen.has(key))invalid();seen.add(key);}
}
export function parseLocationLifecycleReview(v:unknown,intent:LocationLifecycleIntent):LocationLifecycleReview{
  if(!isLocationLifecycleIntent(intent)||!exact(v,['action','locationId','storeNumber','name','recordStatus','reason','before','after','dependencies','coverage','ready','blockers','warnings'])||v.action!==intent.action||v.locationId!==intent.locationId||v.reason!==intent.reason.trim()||!text(v.storeNumber)||!text(v.name)||!['Active','Retired','Draft'].includes(v.recordStatus)||typeof v.ready!=='boolean'||!strings(v.blockers,20)||!strings(v.warnings,20)||v.ready!==(v.blockers.length===0))invalid();
  if(!exact(v.before,['type','hierarchy','staffing'])||kind(v.before.type)==='unclassified'||!exact(v.after,['type','hierarchy','staffing','removed'])||v.after.removed!==(intent.action==='remove')||v.after.type!==(intent.action==='remove'?null:intent.type))invalid();
  hierarchy(v.before.hierarchy);hierarchy(v.after.hierarchy);staffing(v.before.staffing);staffing(v.after.staffing);
  if((kind(v.before.type)==='retail')!==(v.before.hierarchy!==null)||v.after.staffing.length)invalid();
  if(intent.action==='remove'){if(v.after.hierarchy!==null)invalid();}
  else{
    if(kind(v.before.type)===kind(intent.type)||(intent.hierarchy===null?v.after.hierarchy!==null:!v.after.hierarchy||v.after.hierarchy.districtId!==intent.hierarchy.districtId||v.after.hierarchy.regionId!==intent.hierarchy.regionId))invalid();
  }
  if(!exact(v.dependencies,['people','accounts','requests']))invalid();
  for(const category of ['people','accounts','requests']){
    const rows=v.dependencies[category];if(!Array.isArray(rows)||rows.length>100||rows.some(x=>!object(x))||new Set(rows.map(x=>x.id)).size!==rows.length)invalid();
    for(const row of rows){
      if(category==='people'){if(!exact(row,['id','name','relationships'])||!id(row.id)||!text(row.name)||!Array.isArray(row.relationships)||!row.relationships.length||row.relationships.length>3||new Set(row.relationships).size!==row.relationships.length||row.relationships.some(x=>!['Works at','Supports','Legacy assigned Location'].includes(x)))invalid();}
      else if(category==='accounts'){if(!exact(row,['id','name'])||!id(row.id)||!text(row.name))invalid();}
      else if(!exact(row,['id','targetType','targetId'])||!id(row.id)||!id(row.targetId)||!['Location','Person'].includes(row.targetType))invalid();
    }
  }
  if(v.ready&&(v.dependencies.accounts.length||v.dependencies.requests.length||intent.action==='convert'&&v.before.staffing.length&&!intent.releaseStoreStaffing||intent.action==='remove'&&(v.recordStatus!=='Retired'||v.before.staffing.length||v.dependencies.people.length||!intent.acknowledgeApiRemoval)))invalid();
  const expected=new Map<string,{before:boolean;after:boolean}>();
  for(const side of ['before','after'] as const){const h=v[side].hierarchy;if(h)for(const unitType of ['district','region']){const key=JSON.stringify([unitType,h[`${unitType}Id`]]),entry=expected.get(key)??{before:false,after:false};entry[side]=true;expected.set(key,entry);}}
  if(!Array.isArray(v.coverage)||v.coverage.length!==expected.size)invalid();const seen=new Set<string>();
  for(const row of v.coverage){if(!exact(row,['unitType','unitId','name','before','after'])||!['district','region'].includes(row.unitType)||!id(row.unitId)||!text(row.name)||!integer(row.before,1000)||!integer(row.after,1000))invalid();const key=JSON.stringify([row.unitType,row.unitId]),entry=expected.get(key);if(!entry||seen.has(key)||row.after!==row.before-(entry.before?1:0)+(entry.after?1:0))invalid();seen.add(key);}
  return v as LocationLifecycleReview;
}
export function parseLocationLifecycleOutcome(v:unknown,operationId:string){
  const r=parseOrganizationOutcome(v,operationId);if(r.state==='committed'&&(!/^location-lifecycle-[a-f0-9]{64}$/.test(r.auditId)||r.changedRecords!==1))invalid();return r;
}
export function parseLocationLifecyclePreparation(v:unknown,intent:LocationLifecycleIntent){
  if(!isLocationLifecycleIntent(intent))invalid();
  if(!object(v)||v.state!=='prepared')return parseLocationLifecycleOutcome(v,intent.operationId);
  if(!exact(v,['schemaVersion','operationId','state','updatedAt','expiresAt','reviewHash','review'])||v.schemaVersion!==1||v.operationId!==intent.operationId||!instant(v.updatedAt)||!instant(v.expiresAt)||Date.parse(v.expiresAt)-Date.parse(v.updatedAt)!==600_000||!hash(v.reviewHash))invalid();
  const review=parseLocationLifecycleReview(v.review,intent);if(!review.ready)invalid();return{schemaVersion:1 as const,operationId:intent.operationId,state:'prepared' as const,updatedAt:v.updatedAt,expiresAt:v.expiresAt,reviewHash:v.reviewHash,review};
}
/** No retries or generic fallback. Recovery controller must persist actor/operation identity
 * before prepare/commit/cancel; read-only preview alone needs no durable mutation marker. */
export function createLocationLifecycleHttpPort(options:Parameters<typeof createOrganizationSessionTransport>[0]){
  const {call,dispose}=createOrganizationSessionTransport(options,'lifecycle');
  return{
    capabilities:async()=>parseOrganizationCapabilities(await call('capabilities')),
    catalog:async()=>parseOrganizationCatalog(await call('catalog')),
    list:async()=>parseOrganizationList(await call('operations')),
    directory:()=>call('directory'),
    preview:async(intent:LocationLifecycleIntent)=>{if(!isLocationLifecycleIntent(intent))invalid();const v=await call('preview',intent);if(!exact(v,['schemaVersion','review'])||v.schemaVersion!==1)invalid();return{schemaVersion:1 as const,review:parseLocationLifecycleReview(v.review,intent)};},
    prepare:async(intent:LocationLifecycleIntent)=>{if(!isLocationLifecycleIntent(intent))invalid();return parseLocationLifecyclePreparation(await call('prepare',intent),intent);},
    commit:async(operationId:string,reviewHash:string)=>{if(!id(operationId)||!hash(reviewHash))invalid();return parseLocationLifecycleOutcome(await call('commit',{operationId,reviewHash}),operationId);},
    status:async(operationId:string)=>{if(!id(operationId))invalid();return parseLocationLifecycleOutcome(await call('status',{operationId}),operationId);},
    cancel:async(operationId:string)=>{if(!id(operationId))invalid();return parseLocationLifecycleOutcome(await call('cancel',{operationId}),operationId);},dispose,
  };
}
