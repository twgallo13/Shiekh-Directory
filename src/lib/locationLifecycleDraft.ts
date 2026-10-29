import type { LocationRecord,LocationType } from '../types';
import type { OrganizationCatalog } from './organizationLeadershipContract';
import type { LocationLifecycleDraft } from './locationLifecycleContract';
import { classifyHierarchyLocationType } from './hierarchyResolution';
import { moveUnitReady } from './organizationMoveDraft';
export const lifecycleLocationTypes:LocationType[]=['Enclosed Mall','Strip Center / Shopping Center','Street / Standalone Location','Corporate Office','Warehouse / Distribution Center','Other Company Location'];
export interface LocationLifecycleSelection{locationId:string;action:'convert'|'remove';type:string;regionId:string;districtId:string;reason:string;releaseStoreStaffing:boolean;acknowledgeApiRemoval:boolean}
export const emptyLifecycleSelection=(locationId=''):LocationLifecycleSelection=>({locationId,action:'convert',type:'',regionId:'',districtId:'',reason:'',releaseStoreStaffing:false,acknowledgeApiRemoval:false});
export function lifecycleTypeChoices(location:LocationRecord|undefined){if(!location)return[];const kind=classifyHierarchyLocationType(location.type);return kind==='unclassified'?[]:lifecycleLocationTypes.filter(t=>classifyHierarchyLocationType(t)!==kind);}
/** UI convenience only. Version, eligibility, hierarchy and dependencies are rechecked by server. */
export function buildLocationLifecycleDraft(catalog:OrganizationCatalog,locations:LocationRecord[],selection:LocationLifecycleSelection):LocationLifecycleDraft{
  const location=locations.find(l=>l.id===selection.locationId),reason=selection.reason.trim();
  if(!location||!Number.isSafeInteger(location.version??0)||Number(location.version??0)<0||!['Active','Retired','Draft'].includes(location.recordStatus)||classifyHierarchyLocationType(location.type)==='unclassified')throw new Error('Choose a location with a known type and current saved record.');
  if(Object.hasOwn(location,'locationLifecycleModelVersion')&&location.locationLifecycleModelVersion!==1)throw new Error('This location needs its setup reviewed before changing its use.');
  if(reason.length<5||reason.length>500||/[\u0000-\u001f\u007f]/.test(reason))throw new Error('Add a short reason for this change, using 5 to 500 characters on one line.');
  const common={schemaVersion:1 as const,locationId:location.id,expectedVersion:location.version??0,reason};
  if(selection.action==='remove')return{...common,action:'remove',acknowledgeApiRemoval:selection.acknowledgeApiRemoval};
  if(selection.action!=='convert'||!lifecycleTypeChoices(location).includes(selection.type as LocationType)||common.expectedVersion===Number.MAX_SAFE_INTEGER)throw new Error('Choose a new location type. Ordinary format changes stay in Edit Location.');
  let hierarchy:Extract<LocationLifecycleDraft,{action:'convert'}>['hierarchy']=null;
  if(classifyHierarchyLocationType(selection.type)==='retail'){
    const district=catalog.units.find(u=>u.unitType==='district'&&u.id===selection.districtId),region=catalog.units.find(u=>u.unitType==='region'&&u.id===selection.regionId);
    if(catalog.issues.length||!district||!region||!moveUnitReady(district)||!moveUnitReady(region)||district.regionId!==region.id)throw new Error('Choose a District within a Region with completed manager setup.');
    hierarchy={districtId:district.id,regionId:region.id,expectedDistrictVersion:district.version!,expectedRegionVersion:region.version!};
  }
  return{...common,action:'convert',type:selection.type as LocationType,hierarchy,releaseStoreStaffing:selection.releaseStoreStaffing};
}
