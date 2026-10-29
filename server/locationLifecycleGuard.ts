import { isDeepStrictEqual } from 'node:util';
import { classifyHierarchyLocationType } from '../src/lib/hierarchyResolution';
import { DirectoryValidationError } from './firestoreDirectory';
import type { DirectoryWrite } from './firestoreDirectory';
import type { OrganizationGuardState } from './organizationLeadershipGuards';

export const LOCATION_LIFECYCLE_MODEL_FIELD='locationLifecycleModelVersion';
const owns=(v:Record<string,unknown>|undefined)=>!!v&&Object.hasOwn(v,LOCATION_LIFECYCLE_MODEL_FIELD);
const deny=(message:string):never=>{throw new DirectoryValidationError(message);};
/** Older clients may omit the marker, but cannot mint, change or clear server ownership. */
export function preserveLocationLifecycleModel(data:Record<string,unknown>,before:Record<string,unknown>|undefined){
  if(owns(data)&&(!owns(before)||data[LOCATION_LIFECYCLE_MODEL_FIELD]!==before![LOCATION_LIFECYCLE_MODEL_FIELD]))deny('Location lifecycle ownership is server-command managed.');
  if(owns(before))data[LOCATION_LIFECYCLE_MODEL_FIELD]=before![LOCATION_LIFECYCLE_MODEL_FIELD];
}
/** Detachment must not make a reviewed Location ordinary/unprotected again. */
export function validateLocationLifecycleWrite(write:DirectoryWrite,before:Record<string,unknown>|undefined,state:OrganizationGuardState,validatedRename?:{personId:string;fullName:string}|null){
  const after=write.data;
  if(write.collection!=='locations')return;
  if(!owns(before)){if(after&&owns(after))deny('Location lifecycle ownership is server-command managed.');return;}
  if(before![LOCATION_LIFECYCLE_MODEL_FIELD]!==1)deny('Resolve unsupported Location lifecycle ownership before editing.');
  if(write.operation==='delete'||!after)deny('Remove this Location through the reviewed Location workflow.');
  if(after[LOCATION_LIFECYCLE_MODEL_FIELD]!==1)deny('Location lifecycle ownership cannot be removed.');
  const previous=classifyHierarchyLocationType(before!.type),next=classifyHierarchyLocationType(after.type);
  if(previous==='unclassified'||next!==previous)deny('Review retail/non-retail conversion in the Location workflow.');
  const blank=(v:unknown)=>v===null||v===undefined||v===''?null:v;
  for(const field of ['regionId','districtId','districtManagerId','regionalManagerId','districtManagerName','regionalManagerName','district']){
    // Supplied only after the complete name-only batch has passed validateManagedPersonRename.
    // Never authorize an ID change, arbitrary label, partial propagation or non-retail staffing.
    const pointer=field==='districtManagerName'?'districtManagerId':field==='regionalManagerName'?'regionalManagerId':null;
    const matchingRename=next==='retail'&&pointer&&validatedRename&&before![pointer]===validatedRename.personId&&after[pointer]===validatedRename.personId&&after[field]===validatedRename.fullName;
    if(!matchingRename&&!isDeepStrictEqual(blank(before![field]),blank(after[field])))deny('Review Location hierarchy and inherited leadership changes separately.');
  }
  if(before!.hierarchyApplicability!==after.hierarchyApplicability)deny('Review Location hierarchy applicability changes separately.');
  if(next==='non-retail'){
    if(after.hierarchyApplicability!=='Not Applicable'||['regionId','districtId','districtManagerId','regionalManagerId','storeManagerId','districtManagerName','regionalManagerName','storeManagerName','storeManagerPhone'].some(k=>blank(after[k])!==null)||['assistantStoreManagerIds','assistantStoreManagerNames','keyHolderIds','keyHolderNames'].some(k=>after[k]!==undefined&&(!Array.isArray(after[k])||(after[k] as unknown[]).length)))deny('Reviewed non-retail Locations have no retail hierarchy or store leadership. Use People workplaces/supports for non-retail responsibility.');
  }else{
    const district=state.units.find(u=>u.unitType==='district'&&u.id===after.districtId),region=state.units.find(u=>u.unitType==='region'&&u.id===after.regionId);
    if(after.hierarchyApplicability!=='Applicable'||!district||!region||district.data.regionId!==region.id||[district,region].some(u=>u.data.leadershipModelVersion!==1||u.data.status!=='Active'))deny('Resolve canonical managed retail hierarchy before saving.');
  }
}
