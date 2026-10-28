import type { DistrictRecord, LocationRecord, PersonRecord, UserProfile } from '../types';
import { isRetailHierarchyType } from './hierarchyResolution';
import { DirectoryCommitError } from './directoryClient';

export type PersonLocationRelationshipLabel =
  | 'Primary workplace'
  | 'Supports'
  | 'Store Manager'
  | 'Assistant Manager'
  | 'District Manager'
  | 'Regional Manager'
  | 'Key Holder';

export interface PersonLocationRelationshipRow {
  locationId: string;
  location?: LocationRecord;
  labels: PersonLocationRelationshipLabel[];
  unavailable: boolean;
}

export interface PersonDeletionBlockers {
  locations: PersonLocationRelationshipRow[];
  users: UserProfile[];
}

const LABEL_ORDER: PersonLocationRelationshipLabel[] = [
  'Primary workplace',
  'Supports',
  'Store Manager',
  'Assistant Manager',
  'District Manager',
  'Regional Manager',
  'Key Holder',
];

export function buildPersonLocationRelationships(
  person: PersonRecord,
  locations: LocationRecord[],
  districts: DistrictRecord[] = [],
): PersonLocationRelationshipRow[] {
  const labelsByLocationId = new Map<string, Set<PersonLocationRelationshipLabel>>();
  const add = (locationId: string | undefined, label: PersonLocationRelationshipLabel) => {
    if (!locationId) return;
    const labels = labelsByLocationId.get(locationId) || new Set<PersonLocationRelationshipLabel>();
    labels.add(label);
    labelsByLocationId.set(locationId, labels);
  };

  add(person.primaryLocationId, 'Primary workplace');
  for (const locationId of person.supportedLocationIds || []) add(locationId, 'Supports');
  for (const location of locations) {
    if (location.storeManagerId === person.id) add(location.id, 'Store Manager');
    if (location.assistantStoreManagerIds?.includes(person.id)) add(location.id, 'Assistant Manager');
    const district = districts.find(d => d.id === location.districtId);
    const districtOwned = isRetailHierarchyType(location.type) && district && Object.hasOwn(district, 'districtManagerId');
    if ((districtOwned ? district.districtManagerId : location.districtManagerId) === person.id) add(location.id, 'District Manager');
    if (location.regionalManagerId === person.id) add(location.id, 'Regional Manager');
    if (location.keyHolderIds?.includes(person.id)) add(location.id, 'Key Holder');
  }

  return [...labelsByLocationId].map(([locationId, labels]) => {
    const location = locations.find(item => item.id === locationId);
    return {
      locationId,
      ...(location ? { location } : {}),
      labels: LABEL_ORDER.filter(label => labels.has(label)),
      unavailable: !location || location.recordStatus === 'Retired',
    };
  }).sort((left, right) => {
    if (!left.location) return right.location ? 1 : left.locationId.localeCompare(right.locationId);
    if (!right.location) return -1;
    return left.location.storeNumber.localeCompare(right.location.storeNumber, undefined, { numeric: true });
  });
}

export function getPersonDeletionBlockers(
  person: PersonRecord,
  locations: LocationRecord[],
  users: UserProfile[],
  districts: DistrictRecord[] = [],
): PersonDeletionBlockers {
  return {
    locations: buildPersonLocationRelationships(person, locations, districts)
      .map(row => ({ ...row, labels: row.labels.filter(label => label !== 'Primary workplace' && label !== 'Supports') }))
      .filter(row => row.labels.length > 0),
    users: users.filter(user => user.personId === person.id),
  };
}

export const PERSON_LEADERSHIP_NAME_FIELDS = ['fullName', 'phone', 'workPhone', 'phonePrivacy'] as const;

/**
 * Copies only display name/phone leadership fields onto an affected Location. Never touches
 * regionId, districtId, or the legacy district text; those remain exclusively canonical-assignment fields.
 */
export function reconcileLocationLeadershipCopy(
  location: LocationRecord,
  personId: string,
  updatedPerson: PersonRecord,
  resolvedStoreManagerPhone: string,
  resolvePersonName: (id: string) => string | undefined,
  updatedFields: readonly string[],
): LocationRecord {
  const affected = location.storeManagerId === personId || location.districtManagerId === personId || location.regionalManagerId === personId
    || location.assistantStoreManagerIds?.includes(personId) || location.keyHolderIds?.includes(personId);
  const copiesNameOrContact = PERSON_LEADERSHIP_NAME_FIELDS.some(field => updatedFields.includes(field));
  if (!affected || !copiesNameOrContact) return location;

  // A name-only save must not rewrite contact data or another manager's copied name.
  if (updatedFields.includes('fullName') && updatedFields.every(field => field === 'fullName' || field === 'name')) {
    const copyList = (ids: string[], names: string[] | undefined) => {
      if (new Set(ids).size !== ids.length) throw new DirectoryCommitError('Resolve duplicate leadership members before renaming. No changes were sent.', 'invalid_metadata');
      if (names?.length === ids.length) return ids.map((id, index) => id === personId ? updatedPerson.fullName : names[index]);
      // Legacy lists can be rebuilt only from a complete exact-ID name lookup. Never filter a
      // missing member away or silently retain a stale/missing copy. The managed server path
      // independently rejects ambiguous saved arrays until their source is explicitly repaired.
      const resolved = ids.map(id => id === personId ? updatedPerson.fullName : resolvePersonName(id));
      if (resolved.some(name => typeof name !== 'string' || !name.trim())) throw new DirectoryCommitError('Reload and resolve every linked leadership member before renaming. No changes were sent.', 'invalid_metadata');
      return resolved as string[];
    };
    return { ...location,
      ...(location.storeManagerId === personId ? { storeManagerName: updatedPerson.fullName } : {}),
      ...(location.districtManagerId === personId ? { districtManagerName: updatedPerson.fullName } : {}),
      ...(location.regionalManagerId === personId ? { regionalManagerName: updatedPerson.fullName } : {}),
      ...(location.assistantStoreManagerIds?.includes(personId) ? { assistantStoreManagerNames: copyList(location.assistantStoreManagerIds, location.assistantStoreManagerNames) } : {}),
      ...(location.keyHolderIds?.includes(personId) ? { keyHolderNames: copyList(location.keyHolderIds, location.keyHolderNames) } : {}),
    };
  }

  return {
    ...location,
    ...(location.storeManagerId === personId ? {
      storeManagerName: updatedPerson.fullName,
      storeManagerPhone: resolvedStoreManagerPhone,
      storeManagerPhonePrivacy: updatedPerson.phonePrivacy,
    } : {}),
    ...(location.districtManagerId === personId ? {
      districtManagerName: updatedPerson.fullName,
    } : {}),
    ...(location.regionalManagerId === personId ? { regionalManagerName: updatedPerson.fullName } : {}),
    ...(location.assistantStoreManagerIds?.includes(personId) ? { assistantStoreManagerNames: location.assistantStoreManagerIds
      .map(resolvePersonName)
      .filter((name): name is string => Boolean(name)) } : {}),
    ...(location.keyHolderIds?.includes(personId) ? { keyHolderNames: location.keyHolderIds
      .map(resolvePersonName)
      .filter((name): name is string => Boolean(name)) } : {}),
  };
}
