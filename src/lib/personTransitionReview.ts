import type { DistrictRecord, LocationRecord, PersonRecord, RegionRecord, UpdateRequest, UserProfile } from '../types';
import { isRetailHierarchyType } from './hierarchyResolution';
import { buildPersonLocationRelationships } from './personLocationRelationships';
import { personProfileImpact } from './personProfileImpact';
import { LEADERSHIP_POSITION_FIELDS } from './personPositions';

/** Loaded-data review only. Not an authorization decision, atomic snapshot or transition command. */
export function personTransitionReview(person: PersonRecord, locations: LocationRecord[], districts: DistrictRecord[], regions: RegionRecord[], users: UserProfile[], requests: UpdateRequest[]) {
  const impact = personProfileImpact(person, locations, districts, regions, users);
  const relationships = buildPersonLocationRelationships(person, locations, districts);
  const associated = new Set(relationships.map(row => row.locationId));
  const linkedAccounts = users.filter(user => user.personId === person.id);
  const historicalCopies = locations.filter(location => {
    const district = districts.find(d => d.id === location.districtId);
    return location.districtManagerId === person.id && isRetailHierarchyType(location.type)
      && district && Object.hasOwn(district, 'districtManagerId') && district.districtManagerId !== person.id;
  }).map(location => ({ id: location.id, storeNumber: location.storeNumber, version: location.version, districtId: location.districtId }));
  for (const copy of historicalCopies) associated.add(copy.id);
  const referencesPerson = (data: unknown) => Boolean(data && typeof data === 'object' && Object.keys(LEADERSHIP_POSITION_FIELDS).some(field => {
    const value = (data as Record<string, unknown>)[field];
    return Array.isArray(value) ? value.includes(person.id) : value === person.id;
  }));
  const pendingRequests = requests.filter(request => request.status === 'Pending').flatMap(request => {
    const reasons = [
      ...(request.targetType === 'Person' && request.targetId === person.id ? ['Targets this Person'] : []),
      ...(request.targetType === 'Location' && associated.has(request.targetId) ? ['Targets an associated Location; not necessarily a staffing change'] : []),
      ...(referencesPerson(request.requestedChanges) ? ['Proposed leadership references this Person ID'] : []),
      ...(referencesPerson(request.currentSnapshot) ? ['Submission baseline references this Person ID; historical context, not current authority'] : []),
    ];
    return reasons.length ? [{ id: request.id, version: request.version, changeType: request.changeType, reasons }] : [];
  });
  return {
    responsibilities: impact.responsibilities,
    issues: impact.issues,
    workplaces: relationships.filter(row => row.labels.some(label => label === 'Primary workplace' || label === 'Supports')),
    inheritedStores: relationships.filter(row => row.labels.includes('District Manager') && districts.some(d => d.id === row.location?.districtId && Object.hasOwn(d, 'districtManagerId') && d.districtManagerId === person.id) && row.location && isRetailHierarchyType(row.location.type)),
    historicalCopies,
    accounts: linkedAccounts.map(user => ({ id: user.id, role: user.role, status: user.status, version: user.version })),
    pendingRequests,
  };
}
