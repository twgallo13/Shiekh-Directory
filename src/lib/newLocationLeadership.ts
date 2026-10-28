import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../types';
import { inheritDistrictLeader } from './districtLeadership';
import { isRetailHierarchyType, resolveHierarchyApplicability } from './hierarchyResolution';
import { requiresManagedHierarchyReview } from './managedHierarchyEditing';
import { personLifecycle } from './personLifecycle';
import { allowsLeadershipPosition } from './personPositions';

/** New retail records copy canonical Primary managers, never infer ownership from a title/store.
 * Existing store edits/moves remain separate. This is draft preparation, not server authority. */
export function prepareNewLocationLeadership(location: LocationRecord, districts: DistrictRecord[], regions: RegionRecord[], people: Person[]): LocationRecord {
  if (!isRetailHierarchyType(location.type)) return location;
  const district = districts.find(d => d.id === location.districtId), region = regions.find(r => r.id === location.regionId);
  const managedDistrict = requiresManagedHierarchyReview(district), managedRegion = requiresManagedHierarchyReview(region);
  if (!managedDistrict && !managedRegion) return inheritDistrictLeader(location, districts, people);
  const applicability = resolveHierarchyApplicability(location);
  if (!district || !region || district.status !== 'Active' || region.status !== 'Active' || district.regionId !== region.id
    || applicability.value !== 'Applicable' || applicability.issues.length) throw new Error('Choose a matching active Region and District before creating this store.');
  let prepared = inheritDistrictLeader(location, districts, people);
  for (const [unit, field, role] of [[district, 'districtManagerId', 'District Manager'], [region, 'regionalManagerId', 'Regional Manager']] as const) {
    if (!requiresManagedHierarchyReview(unit)) continue;
    const raw = unit as unknown as Record<string, unknown>;
    if (raw.leadershipModelVersion !== 1 || !Number.isSafeInteger(raw.leadershipVersion) || Number(raw.leadershipVersion) < 0 || !Object.hasOwn(raw, field)) throw new Error('Manager setup needs review before creating this store. Refresh the organization records.');
    const primary = raw[field];
    if (primary === null) { prepared = { ...prepared, [field]: undefined, [field.replace(/Id$/, 'Name')]: '' }; continue; }
    const candidates = people.filter(p => p.id === primary), person = candidates[0];
    if (typeof primary !== 'string' || !primary || candidates.length !== 1 || personLifecycle(person) !== 'active' || !allowsLeadershipPosition(person, role)
      || typeof person.fullName !== 'string' || !person.fullName.trim()) throw new Error(`The ${role} assignment needs review before creating this store. Refresh the organization records.`);
    prepared = { ...prepared, [field]: primary, [field.replace(/Id$/, 'Name')]: person.fullName };
  }
  return prepared;
}
