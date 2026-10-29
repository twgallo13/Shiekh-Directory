import type { LocationType } from '../types';
import type { OrganizationMoveHierarchy } from './organizationMoveContract';

/** Private reviewed Location-use transition; public consumer contracts are unchanged. */
interface Base { schemaVersion:1; operationId:string; locationId:string; expectedVersion:number; reason:string }
export type LocationLifecycleIntent = Base & (
  | {action:'convert';type:LocationType;hierarchy:{districtId:string;regionId:string;expectedDistrictVersion:number;expectedRegionVersion:number}|null;releaseStoreStaffing:boolean}
  | {action:'remove';acknowledgeApiRemoval:boolean}
);
export interface LocationLifecycleStaffing { role:'Store Manager'|'Assistant Manager'|'Key Holder';personId:string;fullName:string }
export interface LocationLifecycleReview {
  action:'convert'|'remove';locationId:string;storeNumber:string;name:string;recordStatus:string;reason:string;
  before:{type:string;hierarchy:OrganizationMoveHierarchy|null;staffing:LocationLifecycleStaffing[]};
  after:{type:string|null;hierarchy:OrganizationMoveHierarchy|null;staffing:LocationLifecycleStaffing[];removed:boolean};
  dependencies:{people:{id:string;name:string;relationships:string[]}[];accounts:{id:string;name:string}[];requests:{id:string;targetType:string;targetId:string}[]};
  coverage:{unitType:'district'|'region';unitId:string;name:string;before:number;after:number}[];
  ready:boolean;blockers:string[];warnings:string[];
}
