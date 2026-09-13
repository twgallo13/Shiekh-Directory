import type { LocationRecord, PersonRecord, UserProfile } from '../types';

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
    if (location.districtManagerId === person.id) add(location.id, 'District Manager');
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
): PersonDeletionBlockers {
  return {
    locations: buildPersonLocationRelationships(person, locations)
      .map(row => ({ ...row, labels: row.labels.filter(label => label !== 'Primary workplace' && label !== 'Supports') }))
      .filter(row => row.labels.length > 0),
    users: users.filter(user => user.personId === person.id),
  };
}
