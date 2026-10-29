import { createHash } from 'node:crypto';
import { canonicalTransitionJSON as canonical } from '../src/lib/personTransitionIntent';
import { classifyHierarchyLocationType, resolveHierarchyApplicability } from '../src/lib/hierarchyResolution';
import { personLifecycle } from '../src/lib/personLifecycle';
import { allowsLeadershipPosition } from '../src/lib/personPositions';
import type { LocationLifecycleIntent, LocationLifecycleReview, LocationLifecycleStaffing } from '../src/lib/locationLifecycleContract';
import { canonicalId, type SourceRecord } from './personnelProjection';
import { LeadershipPlanError, leadershipUnitKey, validateOrganizationSource, type OrganizationLeadershipSnapshot, type LeadershipUnitSource } from './organizationLeadershipPlanner';

export interface LocationLifecycleSnapshot extends OrganizationLeadershipSnapshot {
  references:{people:SourceRecord[];accounts:SourceRecord[];requests:SourceRecord[];complete:{people:true;accounts:true;requests:true}};
}
const fail=(code:LeadershipPlanError['code'],message:string):never=>{throw new LeadershipPlanError(code,message);};
const object=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v:unknown,keys:string[]):v is Record<string,any>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const wireId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const named=(v:unknown):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=1000&&!/[\u0000-\u001f\u007f]/.test(v);
const version=(v:unknown):number=>v===undefined?0:Number.isSafeInteger(v)&&Number(v)>=0?Number(v):fail('incomplete_source','Resolve source versions before reviewing a Location transition.');
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const kindOf=(v:unknown)=>typeof v==='string'?classifyHierarchyLocationType(v):'unclassified';
const pointer=(v:unknown):string|null=>v===undefined||v===null||v===''?null:canonicalId(v)?v:fail('incomplete_source','Resolve malformed Location relationship IDs.');
function list(v:unknown,maximum=1000):string[]{if(v===undefined)return [];if(!Array.isArray(v)||v.length>maximum||v.some(x=>!canonicalId(x))||new Set(v).size!==v.length)fail('incomplete_source','Resolve malformed or oversized relationship lists.');return v as string[];}
function rows(v:unknown,maximum:number):SourceRecord[]{
  if(!Array.isArray(v)||v.length>maximum)fail('capacity','Linked source exceeds complete inventory capacity.');
  const ids=new Set<string>();for(const r of v as SourceRecord[]){if(!exact(r,['id','data'])||!canonicalId(r.id)||ids.has(r.id)||!object(r.data)||Object.hasOwn(r.data,'id')&&r.data.id!==r.id)fail('incomplete_source','Linked inventory identity is incomplete or duplicated.');ids.add(r.id);version(r.data.version);}return v as SourceRecord[];
}
export function normalizeLocationLifecycleIntent(input:unknown):LocationLifecycleIntent{
  const value=input as Record<string,any>;
  const common=['schemaVersion','operationId','locationId','expectedVersion','reason'];
  if(!object(value)||!exact(value,[...common,...(value.action==='convert'?['action','type','hierarchy','releaseStoreStaffing']:['action','acknowledgeApiRemoval'])])||value.schemaVersion!==1||!wireId(value.operationId)||!wireId(value.locationId)||!Number.isSafeInteger(value.expectedVersion)||value.expectedVersion<0||!named(value.reason)||value.reason.trim().length<5||value.reason.length>500)fail('invalid_input','Provide one exact Location transition and a reason.');
  if(value.action==='convert'){
    const kind=kindOf(value.type),h=value.hierarchy;
    if(kind==='unclassified'||typeof value.releaseStoreStaffing!=='boolean'||(kind==='non-retail'?h!==null:!exact(h,['districtId','regionId','expectedDistrictVersion','expectedRegionVersion'])||!wireId(h.districtId)||!wireId(h.regionId)||![h.expectedDistrictVersion,h.expectedRegionVersion].every(n=>Number.isSafeInteger(n)&&n>=0)))fail('invalid_input','Choose the destination use and explicit hierarchy; never infer a destination.');
  }else if(value.action!=='remove'||typeof value.acknowledgeApiRemoval!=='boolean')fail('invalid_input','Choose conversion or removal.');
  return structuredClone(value) as LocationLifecycleIntent;
}

/** Detached internal review only. No authentication, loader, persistence, receipt, signing or
 * write authority. A future server adapter must derive completeness and recheck every binding. */
export function planLocationLifecycle(raw:unknown,snapshot:LocationLifecycleSnapshot,now:string){
  const intent=normalizeLocationLifecycleIntent(raw);
  if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(now)||!Number.isFinite(Date.parse(now))||new Date(now).toISOString()!==now)fail('invalid_input','Use authoritative UTC time.');
  validateOrganizationSource(snapshot,now);
  const refs=snapshot.references;
  if(!object(refs)||!exact(refs.complete,['people','accounts','requests'])||Object.values(refs.complete).some(v=>v!==true))fail('incomplete_source','Complete workplace, account and request inventories are required.');
  rows(refs.people,5000);rows(refs.accounts,5000);rows(refs.requests,5000);
  if(Buffer.byteLength(canonical(refs))>8_000_000)fail('capacity','Linked inventory exceeds byte capacity.');
  const source=snapshot.locations.find(l=>l.id===intent.locationId);
  if(!source||!named(source.data.name)||!named(source.data.storeNumber)||!['Active','Retired','Draft'].includes(source.data.recordStatus as string))fail('incomplete_source','Review the exact named Location and lifecycle.');
  const before=source.data,oldKind=kindOf(before.type);
  if(oldKind==='unclassified'||Object.hasOwn(before,'locationLifecycleModelVersion')&&before.locationLifecycleModelVersion!==1)fail('incomplete_source','Resolve unsupported Location use or lifecycle ownership before transition.');
  if(version(before.version)!==intent.expectedVersion)fail('conflict','The Location changed. Review current information again.');
  const readUnits=new Map<string,LeadershipUnitSource>(),readPeople=new Map<string,SourceRecord>();
  const unit=(type:'district'|'region',id:unknown)=>{
    const u=snapshot.units.find(u=>u.unitType===type&&u.id===id);
    if(!u||u.data.status!=='Active'||!named(u.data.name)||u.data.leadershipModelVersion!==1||!Number.isSafeInteger(u.data.leadershipVersion)||Number(u.data.leadershipVersion)<0||!snapshot.complete.assignmentUnits.includes(leadershipUnitKey(type,u.id)))fail('incomplete_source','Review complete Active managed District and Region sources.');
    readUnits.set(leadershipUnitKey(type,u.id),u);return u;
  };
  const leader=(u:LeadershipUnitSource)=>{
    const members=snapshot.assignments.filter(a=>a.data.unitType===u.unitType&&a.data.unitId===u.id&&a.data.status==='active'),primary=u.data[u.unitType==='district'?'districtManagerId':'regionalManagerId'];
    if(members.length>25||new Set(members.map(m=>m.data.personId)).size!==members.length||(members.length?!canonicalId(primary)||!members.some(m=>m.data.personId===primary):primary!==null))fail('incomplete_source','Resolve canonical roster/Primary disagreement.');
    for(const member of members){const p=snapshot.people.find(p=>p.id===member.data.personId);if(!p||!named(p.data.fullName)||personLifecycle(p.data)!=='active'||!allowsLeadershipPosition(p.data,u.unitType==='district'?'District Manager':'Regional Manager'))fail('ineligible','Resolve manager eligibility before changing coverage.');readPeople.set(p.id,p);}
    return{id:primary as string|null,name:primary===null?'':snapshot.people.find(p=>p.id===primary)!.data.fullName as string};
  };
  const hierarchy=(districtId:unknown,regionId:unknown)=>{
    const d=unit('district',districtId),r=unit('region',regionId);
    if(d.data.regionId!==r.id)fail('incomplete_source','District and Region parent links disagree.');
    return{districtId:d.id,districtName:d.data.name as string,regionId:r.id,regionName:r.data.name as string,districtManager:leader(d),regionalManager:leader(r)};
  };
  const oldHierarchy=oldKind==='retail'?hierarchy(before.districtId,before.regionId):null;
  if(oldHierarchy){const a=resolveHierarchyApplicability(before);if(a.value!=='Applicable'||a.issues.length)fail('incomplete_source','Resolve current retail hierarchy applicability.');for(const[field,m]of[['districtManagerId',oldHierarchy.districtManager],['regionalManagerId',oldHierarchy.regionalManager]] as const)if(pointer(before[field])!==m.id||(before[field.replace(/Id$/,'Name')]??'')!==m.name)fail('incomplete_source','Resolve stale inherited manager copies before transition.');}
  let destination:LocationLifecycleReview['after']['hierarchy']=null;
  if(intent.action==='convert'){
    if(intent.expectedVersion===Number.MAX_SAFE_INTEGER)fail('conflict','The Location version cannot advance safely.');
    const kind=classifyHierarchyLocationType(intent.type);
    if(kind===oldKind)fail('invalid_input','Use ordinary Location editing for format changes within the same use.');
    if(kind==='retail'){
      const h=intent.hierarchy!;destination=hierarchy(h.districtId,h.regionId);
      if(version(unit('district',h.districtId).data.version)!==h.expectedDistrictVersion||version(unit('region',h.regionId).data.version)!==h.expectedRegionVersion)fail('conflict','The destination changed. Review it again.');
    }
  }
  const staffing:LocationLifecycleStaffing[]=[];
  const staff=(role:LocationLifecycleStaffing['role'],id:string)=>{const p=snapshot.people.find(p=>p.id===id);if(!p||!named(p.data.fullName))fail('incomplete_source','Resolve every saved store staffing Person ID before transition.');readPeople.set(p.id,p);staffing.push({role,personId:id,fullName:p.data.fullName as string});};
  const sm=pointer(before.storeManagerId);if(sm)staff('Store Manager',sm);else if(before.storeManagerName||before.storeManagerPhone)fail('incomplete_source','Reconcile unlinked Store Manager contact labels before transition.');
  for(const[field,role,names]of[['assistantStoreManagerIds','Assistant Manager','assistantStoreManagerNames'],['keyHolderIds','Key Holder','keyHolderNames']] as const){const ids=list(before[field],100);if(before[names]!==undefined&&(!Array.isArray(before[names])||before[names].some(v=>typeof v!=='string')))fail('incomplete_source','Resolve malformed staffing labels.');if(!ids.length&&Array.isArray(before[names])&&before[names].length)fail('incomplete_source','Reconcile unlinked store staffing labels before transition.');for(const id of ids)staff(role,id);}
  staffing.sort((a,b)=>`${a.role}/${a.personId}`.localeCompare(`${b.role}/${b.personId}`));
  const equalNumber=(a:unknown,b:unknown)=>typeof a==='string'&&typeof b==='string'&&(/^\d+$/.test(a)&&/^\d+$/.test(b)?a.replace(/^0+(?=\d)/,'')===b.replace(/^0+(?=\d)/,''):a===b);
  const sameNumber=(v:unknown)=>equalNumber(v,before.storeNumber);
  if(snapshot.locations.some(l=>l.id!==source.id&&sameNumber(l.data.storeNumber)))fail('incomplete_source','Resolve ambiguous Store Number aliases before reviewing account-related dependencies.');
  const people=refs.people.flatMap(p=>{
    const links:string[]=[];if(pointer(p.data.primaryLocationId)===source.id)links.push('Works at');if(list(p.data.supportedLocationIds).includes(source.id))links.push('Supports');
    const legacy=p.data.assignedLocations;if(legacy!==undefined&&(!Array.isArray(legacy)||legacy.length>1000||legacy.some(v=>typeof v!=='string')))fail('incomplete_source','Resolve malformed legacy Location references.');
    let legacyLinked=false;if(Array.isArray(legacy))for(const value of legacy){const matches=snapshot.locations.filter(l=>l.id===value||equalNumber(value,l.data.storeNumber));if(matches.length!==1)fail('incomplete_source','Resolve unlinked or ambiguous legacy assigned-Location values; do not match people or Locations by name.');if(matches[0].id===source.id)legacyLinked=true;}
    if(legacyLinked)links.push('Legacy assigned Location');
    return links.length?[{id:p.id,name:named(p.data.fullName)?p.data.fullName:p.id,relationships:links}]:[];
  });
  const accounts=refs.accounts.flatMap(a=>{
    if(!['Active','Suspended','Revoked'].includes(a.data.status as string))fail('incomplete_source','Resolve account lifecycle before reviewing Location removal/conversion.');
    if(a.data.status==='Revoked')return [];
    if(a.data.storeNumber!==undefined&&a.data.storeNumber!==null&&typeof a.data.storeNumber!=='string')fail('incomplete_source','Resolve account Store Number identity before transition.');
    const scope=a.data.accessScope;if(typeof scope!=='string'||!['Company','Company-wide'].includes(scope)&&!/^Store [0-9]+$/.test(scope))fail('incomplete_source','Review unsupported account scopes before Location transition.');
    const scoped=/^Store ([0-9]+)$/.exec(scope as string)?.[1];return sameNumber(a.data.storeNumber)||sameNumber(scoped)?[{id:a.id,name:named(a.data.name)?a.data.name:a.id}]:[];
  });
  const requests=refs.requests.flatMap(r=>{
    if(!['Pending','Approved','Rejected'].includes(r.data.status as string))fail('incomplete_source','Resolve request lifecycle before transition.');
    if(r.data.status!=='Pending')return [];
    if(!['Location','Person'].includes(r.data.targetType as string)||!canonicalId(r.data.targetId))fail('incomplete_source','Resolve pending request target identity.');
    const c=r.data.requestedChanges;if(c!==undefined&&!object(c))fail('incomplete_source','Resolve malformed pending request relationships.');
    const target=r.data.targetType==='Location'&&r.data.targetId===source.id;
    const changes=c as Record<string,unknown>|undefined;
    const person=r.data.targetType==='Person'&&(pointer(changes?.primaryLocationId)===source.id||list(changes?.supportedLocationIds).includes(source.id));
    return target||person?[{id:r.id,targetType:String(r.data.targetType),targetId:String(r.data.targetId)}]:[];
  });
  for(const items of [people,accounts,requests])items.sort((a,b)=>a.id.localeCompare(b.id));
  if([people,accounts,requests].some(rows=>rows.length>100))fail('capacity','Linked references exceed review capacity. Resolve them in smaller stages first.');
  const blockers:string[]=[],warnings:string[]=[];
  if(accounts.length)blockers.push(`Review and clear ${accounts.length} store-specific account link(s) separately. This workflow never changes account permissions.`);
  if(requests.length)blockers.push(`Resolve ${requests.length} pending correction/assignment request(s) before changing Location use or removing it.`);
  if(intent.action==='remove'){
    if(before.recordStatus!=='Retired')blockers.push('Retire this Location before reviewing removal.');
    if(staffing.length)blockers.push('End saved local store leadership assignments before removal.');
    if(people.length)blockers.push(`Reassign or clear ${people.length} workplace/support/legacy Location relationship(s) before removal.`);
    if(!intent.acknowledgeApiRemoval)blockers.push('Acknowledge that removal also removes this Location from Directory API responses.');
  }else if(staffing.length&&!intent.releaseStoreStaffing)blockers.push('Explicitly select ending the listed local store leadership assignments before conversion.');
  if(oldKind==='non-retail'&&(pointer(before.districtId)||pointer(before.regionId)))warnings.push('Historical non-retail hierarchy values will be replaced or cleared; they are not store membership.');
  if(intent.action==='convert'&&people.length)warnings.push('Workplace/support links keep this same Location ID. People positions and app access are unchanged.');
  if(intent.action==='remove')warnings.push('Historical audits and terminal operation receipts remain. External app records are not automatically deleted or reassigned.');
  const coverage:LocationLifecycleReview['coverage']=[];
  for(const u of readUnits.values()){
    for(const l of snapshot.locations){const d=snapshot.units.find(d=>d.unitType==='district'&&d.id===l.data.districtId),region=d?.data.regionId;const relevant=u.unitType==='district'?l.data.districtId===u.id:l.data.regionId===u.id||region===u.id;if(relevant){const kind=kindOf(l.data.type);if(kind==='unclassified')fail('incomplete_source','Resolve affected Location classification before calculating coverage.');if(kind==='non-retail')continue;const a=resolveHierarchyApplicability(l.data);if(!d||l.data.regionId!==region||a.value!=='Applicable'||a.issues.length)fail('incomplete_source','Resolve affected hierarchy inventory before calculating coverage.');}}
    const belongs=(l:SourceRecord)=>kindOf(l.data.type)==='retail'&&(u.unitType==='district'?l.data.districtId===u.id:l.data.regionId===u.id);
    const count=snapshot.locations.filter(belongs).length,was=oldHierarchy&&(u.unitType==='district'?oldHierarchy.districtId===u.id:oldHierarchy.regionId===u.id),will=destination&&(u.unitType==='district'?destination.districtId===u.id:destination.regionId===u.id);
    coverage.push({unitType:u.unitType,unitId:u.id,name:u.data.name as string,before:count,after:count-(was?1:0)+(will?1:0)});
  }
  const review:LocationLifecycleReview={action:intent.action,locationId:source.id,storeNumber:before.storeNumber as string,name:before.name as string,recordStatus:before.recordStatus as string,reason:intent.reason.trim(),before:{type:before.type as string,hierarchy:oldHierarchy,staffing},after:{type:intent.action==='remove'?null:intent.type,hierarchy:destination,staffing:[],removed:intent.action==='remove'},dependencies:{people,accounts,requests},coverage:coverage.sort((a,b)=>`${a.unitType}/${a.unitId}`.localeCompare(`${b.unitType}/${b.unitId}`)),ready:blockers.length===0,blockers,warnings};
  const set=intent.action==='convert'?{
    locationLifecycleModelVersion:1,type:intent.type,hierarchyApplicability:destination?'Applicable':'Not Applicable',districtId:destination?.districtId??null,regionId:destination?.regionId??null,district:destination?.districtName??'',districtManagerId:destination?.districtManager.id??null,districtManagerName:destination?.districtManager.name??'',regionalManagerId:destination?.regionalManager.id??null,regionalManagerName:destination?.regionalManager.name??'',
    storeManagerId:null,storeManagerName:'',storeManagerPhone:'',assistantStoreManagerIds:[],assistantStoreManagerNames:[],keyHolderIds:[],keyHolderNames:[],version:intent.expectedVersion+1,updatedAt:now,
  }:null;
  const writes=review.ready?[{collection:'locations' as const,id:source.id,operation:intent.action==='remove'?'delete' as const:'set' as const,expectedVersion:intent.expectedVersion,set}]:[];
  const byId=(a:SourceRecord,b:SourceRecord)=>a.id.localeCompare(b.id);
  const preconditions={location:hash(before),units:[...readUnits].map(([key,u])=>({key,fingerprint:hash(u.data)})).sort((a,b)=>a.key.localeCompare(b.key)),people:[...readPeople.values()].map(p=>({id:p.id,fingerprint:hash(p.data)})).sort((a,b)=>a.id.localeCompare(b.id)),rosters:hash([...snapshot.assignments].sort(byId)),membership:hash([...snapshot.locations].sort(byId)),references:hash({people,accounts,requests})};
  const estimatedAtomicBytes=Buffer.byteLength(canonical({review,writes,preconditions}))*3+8192;
  if(estimatedAtomicBytes>8_000_000)fail('capacity','Location transition review exceeds byte capacity.');
  return{operationId:intent.operationId,plannedAt:now,review,writes,preconditions,estimatedAtomicBytes};
}
