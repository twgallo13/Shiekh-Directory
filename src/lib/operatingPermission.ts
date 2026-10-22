import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../types';
import { personLifecycle } from './personLifecycle';

export interface OperatingActor { role: string; accessScope?: string; personId?: string | null }

/** Action authority comes from application scope plus canonical responsibilities, never a typed job title. */
export function canManageOperatingState(actor: OperatingActor, location: Pick<LocationRecord, 'storeNumber' | 'recordStatus' | 'type' | 'hierarchyApplicability' | 'regionId' | 'districtId' | 'storeManagerId' | 'districtManagerId'>, people: Person[], districts: DistrictRecord[], regions: RegionRecord[]): boolean {
  if (location.recordStatus !== 'Active' || !['System Administrator', 'Directory Data Steward', 'Editor', 'Viewer'].includes(actor.role)) return false;
  const company = ['Company', 'Company-wide'].includes(actor.accessScope || '');
  const exactStore = actor.accessScope === `Store ${location.storeNumber}`;
  if (!company && !exactStore) return false;
  if (['System Administrator', 'Directory Data Steward'].includes(actor.role)) return true;
  const person = people.find(person => person.id === actor.personId);
  if (!person || personLifecycle(person) !== 'active') return false;
  if (location.storeManagerId === person.id) return true;
  const retail = ['Enclosed Mall', 'Strip Center / Shopping Center', 'Street / Standalone Location'].includes(location.type) && location.hierarchyApplicability !== 'Not Applicable';
  if (!retail) return location.districtManagerId === person.id;
  const district = districts.find(district => district.id === location.districtId);
  const region = regions.find(region => region.id === district?.regionId);
  if (!district || district.status !== 'Active' || !region || region.status !== 'Active' || district.regionId !== location.regionId) return false;
  if (Object.hasOwn(district, 'districtManagerId')) return district.districtManagerId === person.id;
  return location.districtManagerId === person.id;
}
