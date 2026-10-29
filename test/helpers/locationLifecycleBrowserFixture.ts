import { moveBrowserFixture } from './organizationMoveBrowserFixture';
import type { LocationRecord } from '../../src/types';
import type { LocationLifecycleIntent,LocationLifecycleReview } from '../../src/lib/locationLifecycleContract';
import { classifyHierarchyLocationType } from '../../src/lib/hierarchyResolution';
export function lifecycleBrowserFixture(){
  const f=moveBrowserFixture(),day={open:'10:00',close:'21:00',isClosed:false},standardHours={monday:{...day},tuesday:{...day},wednesday:{...day},thursday:{...day},friday:{...day},saturday:{...day},sunday:{...day}};
  const full={address:'100 Synthetic Way',city:'Test City',state:'CA',zipCode:'90001',phone:'(213) 555-0100',phonePrivacy:'Public',timeZone:'America/Los_Angeles',operationalStatus:'Open — Normal Operations',standardHours};
  f.locations[0]={...f.locations[0],...full,storeManagerName:'Avery Chen',hierarchyApplicability:'Applicable'} as LocationRecord;
  f.locations.push({...f.locations[0],id:'008',storeNumber:'008',name:'Archived Sample',recordStatus:'Retired',storeManagerId:null,storeManagerName:''} as LocationRecord);
  f.locations.push({...full,id:'corp',storeNumber:'000',name:'Corporate HQ',type:'Corporate Office',recordStatus:'Active',version:1,hierarchyApplicability:'Not Applicable',districtId:null,regionId:null,districtManagerId:null,regionalManagerId:null,storeManagerId:null} as LocationRecord);
  return f;
}
export function lifecycleBrowserReview(intent:LocationLifecycleIntent,data:ReturnType<typeof lifecycleBrowserFixture>,linkedAccount=false):LocationLifecycleReview{
  const l=data.locations.find(l=>l.id===intent.locationId)!;
  const hierarchy=(districtId:string,regionId:string)=>{const d=data.catalog.units.find(u=>u.unitType==='district'&&u.id===districtId)!,r=data.catalog.units.find(u=>u.unitType==='region'&&u.id===regionId)!;return{districtId:d.id,districtName:d.name,regionId:r.id,regionName:r.name,districtManager:{id:d.primaryPersonId,name:d.members.find(m=>m.isPrimary)?.fullName??''},regionalManager:{id:r.primaryPersonId,name:r.members.find(m=>m.isPrimary)?.fullName??''}};};
  const before=classifyHierarchyLocationType(l.type)==='retail'?hierarchy(l.districtId!,l.regionId!):null,after=intent.action==='convert'&&intent.hierarchy?hierarchy(intent.hierarchy.districtId,intent.hierarchy.regionId):null;
  const staffing:LocationLifecycleReview['before']['staffing']=l.storeManagerId?[{role:'Store Manager',personId:l.storeManagerId,fullName:l.storeManagerName!}]:[];
  const dependencies:LocationLifecycleReview['dependencies']={people:l.id==='007'?[{id:'store-manager',name:'Avery Chen',relationships:['Works at']}]:[],accounts:linkedAccount?[{id:'store-account',name:'Sample store account'}]:[],requests:[]},blockers:string[]=[];
  if(linkedAccount)blockers.push('Review and clear the store account link before changing this location.');
  if(intent.action==='convert'&&staffing.length&&!intent.releaseStoreStaffing)blockers.push('Select ending the listed store assignments before converting this location.');
  if(intent.action==='remove'){if(l.recordStatus!=='Retired')blockers.push('Retire this location before reviewing removal.');if(staffing.length)blockers.push('End store staffing assignments before removal.');if(dependencies.people.length)blockers.push('Reassign or clear the linked workplace before removal.');if(!intent.acknowledgeApiRemoval)blockers.push('Acknowledge that removal also removes the location from API results.');}
  const coverage:LocationLifecycleReview['coverage']=[];
  for(const u of data.catalog.units){const was=!!before&&(u.unitType==='district'?before.districtId:before.regionId)===u.id,will=!!after&&(u.unitType==='district'?after.districtId:after.regionId)===u.id;if(!was&&!will)continue;const count=data.locations.filter(l=>classifyHierarchyLocationType(l.type)==='retail'&&(u.unitType==='district'?l.districtId:l.regionId)===u.id).length;coverage.push({unitType:u.unitType,unitId:u.id,name:u.name,before:count,after:count-(was?1:0)+(will?1:0)});}
  const warnings=intent.action==='remove'?['Historical audits and terminal operation receipts remain. External app records are not automatically deleted or reassigned.']:dependencies.people.length?['Workplace/support links keep this same Location ID. People positions and app access are unchanged.']:[];
  return{action:intent.action,locationId:l.id,storeNumber:l.storeNumber,name:l.name,recordStatus:l.recordStatus,reason:intent.reason.trim(),before:{type:l.type,hierarchy:before,staffing},after:{type:intent.action==='remove'?null:intent.type,hierarchy:after,staffing:[],removed:intent.action==='remove'},dependencies,coverage,ready:!blockers.length,blockers,warnings};
}
