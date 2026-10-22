import type { DistrictRecord, LocationRecord, Person, RegionRecord, UserProfile } from '../types';
import { isRetailHierarchyType } from './hierarchyResolution';
import { LEADERSHIP_POSITION_FIELDS, PERSON_POSITIONS, type PersonPositionId } from './personPositions';

/** A read-only dependency preview; copied DM labels never override District ownership. */
export function personProfileImpact(person: Person | undefined, locations: LocationRecord[], districts: DistrictRecord[], regions: RegionRecord[], users: UserProfile[]) {
  const responsibilities: { key: string; label: string; requiredPosition: PersonPositionId; source: string; href: string }[] = [];
  const issues: string[] = [];
  if (!person) return { responsibilities, issues, accounts: [] as UserProfile[] };
  for (const d of districts.filter(d => d.districtManagerId === person.id)) {
    const region = regions.find(r => r.id === d.regionId);
    const stores = locations.filter(l => l.districtId === d.id && isRetailHierarchyType(l.type));
    responsibilities.push({ key: `district:${d.id}`, label: `${d.name} · ${region?.name || 'Unresolved Region'} · ${stores.length} linked store${stores.length === 1 ? '' : 's'}`, requiredPosition: 'district-manager', source: `District-owned DM · ${d.status}`, href: '/admin?tab=hierarchy-registry' });
    if (d.status !== 'Active' || region?.status !== 'Active') issues.push(`${d.name}: District or parent Region needs review.`);
  }
  for (const l of locations) {
    const d = districts.find(d => d.id === l.districtId);
    const inherited = isRetailHierarchyType(l.type) && d && Object.hasOwn(d, 'districtManagerId');
    for (const [field, role] of Object.entries(LEADERSHIP_POSITION_FIELDS) as [keyof typeof LEADERSHIP_POSITION_FIELDS, typeof LEADERSHIP_POSITION_FIELDS[keyof typeof LEADERSHIP_POSITION_FIELDS]][]) {
      const value = l[field];
      if (!(Array.isArray(value) ? value.includes(person.id) : value === person.id)) continue;
      if (field === 'districtManagerId' && inherited) {
        if (d.districtManagerId !== person.id) issues.push(`#${l.storeNumber}: historical DM copy differs from District ownership; not current authority.`);
        continue;
      }
      responsibilities.push({ key: `${l.id}:${field}`, label: `#${l.storeNumber} · ${l.name}`, requiredPosition: PERSON_POSITIONS.find(p => p.label === role)!.id, source: `${role} · ${l.recordStatus === 'Retired' ? 'Retired Location' : 'Location-owned'}`, href: `/locations/${encodeURIComponent(l.id)}/edit` });
    }
  }
  return { responsibilities, issues, accounts: users.filter(u => u.personId === person.id) };
}
