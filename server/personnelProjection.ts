import { personLifecycle, type PersonLifecycle } from '../src/lib/personLifecycle';

export interface SourceRecord { id: string; data: Record<string, unknown> }
export interface AssignmentIssue { code: string; field: string }
export interface ReferencePerson {
  personId: string;
  fullName: string | null;
  lifecycle: PersonLifecycle;
  issues: AssignmentIssue[];
}
export const STAFFING_SCALARS = ['storeManagerId', 'districtManagerId', 'regionalManagerId'] as const;
export const STAFFING_LISTS = ['assistantStoreManagerIds', 'keyHolderIds'] as const;

export function canonicalId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500
    && Buffer.byteLength(value, 'utf8') <= 1500 && value !== '.' && value !== '..' && !/^__.*__$/.test(value)
    && value === value.trim() && !/[/\u0000-\u001f\u007f]/.test(value);
}

function canonicalName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
}

function issue(issues: AssignmentIssue[], code: string, field: string) { issues.push({ code, field }); }

export function projectPerson(record: SourceRecord, locations: SourceRecord[]) {
  const data = record.data;
  const issues: AssignmentIssue[] = [];
  const fullName = canonicalName(data.fullName);
  const lifecycle = personLifecycle(data);
  if (!fullName) issue(issues, 'invalid_name', 'fullName');
  if (typeof data.name === 'string' && fullName && data.name.trim() !== fullName) issue(issues, 'conflicting_name_alias', 'fullName');
  if (lifecycle === 'unknown') issue(issues, 'ambiguous_lifecycle', 'lifecycle');
  const primaryLocationId = singleId(data.primaryLocationId, 'primaryLocationId', issues);
  const supportedLocationIds = listIds(data.supportedLocationIds, 'supportedLocationIds', issues);
  const locationMap = new Map(locations.map(location => [location.id, location.data]));
  for (const [field, ids] of [['primaryLocationId', primaryLocationId ? [primaryLocationId] : []], ['supportedLocationIds', supportedLocationIds]] as const) {
    for (const id of ids) {
      const location = locationMap.get(id);
      if (!location) issue(issues, 'missing_location', field);
      else if (location.recordStatus === 'Retired') issue(issues, 'retired_location', field);
      else if (location.recordStatus !== 'Active' && location.recordStatus !== 'Draft') issue(issues, 'unknown_location_state', field);
    }
  }
  if (primaryLocationId && supportedLocationIds.includes(primaryLocationId)) issue(issues, 'overlapping_workplace', 'supportedLocationIds');
  return { id: record.id, fullName, lifecycle, primaryLocationId, supportedLocationIds, issues };
}

function singleId(value: unknown, field: string, issues: AssignmentIssue[]): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (canonicalId(value)) return value;
  issue(issues, 'invalid_reference', field);
  return null;
}

function listIds(value: unknown, field: string, issues: AssignmentIssue[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) { issue(issues, 'invalid_reference', field); return []; }
  const ids: string[] = [];
  for (const entry of value) {
    if (!canonicalId(entry)) { issue(issues, 'invalid_reference', field); continue; }
    if (ids.includes(entry)) issue(issues, 'duplicate_assignment', field);
    ids.push(entry);
  }
  return ids;
}

function referencePerson(id: string, people: Map<string, SourceRecord>, field: string): ReferencePerson {
  const record = people.get(id);
  if (!record) return { personId: id, fullName: null, lifecycle: 'unknown', issues: [{ code: 'missing_person', field }] };
  const fullName = canonicalName(record.data.fullName);
  const lifecycle = personLifecycle(record.data);
  const issues: AssignmentIssue[] = [];
  if (!fullName) issue(issues, 'invalid_name', field);
  if (lifecycle === 'inactive') issue(issues, 'inactive_person', field);
  if (lifecycle === 'unknown') issue(issues, 'unknown_person_state', field);
  if (typeof record.data.name === 'string' && fullName && record.data.name.trim() !== fullName) issue(issues, 'conflicting_name_alias', field);
  return { personId: id, fullName, lifecycle, issues };
}

export function projectStaffing(record: SourceRecord, people: SourceRecord[], regions: SourceRecord[], districts: SourceRecord[]) {
  const data = record.data;
  const issues: AssignmentIssue[] = [];
  const peopleMap = new Map(people.map(person => [person.id, person]));
  const single = (field: typeof STAFFING_SCALARS[number], legacyField: string) => {
    const id = singleId(data[field], field, issues);
    if (!id && typeof data[legacyField] === 'string' && data[legacyField].trim()) issue(issues, 'legacy_only', field);
    return id;
  };
  const list = (field: typeof STAFFING_LISTS[number], legacyField: string) => {
    const ids = listIds(data[field], field, issues);
    const legacy = data[legacyField];
    if (Array.isArray(legacy) && legacy.length > ids.length && legacy.slice(ids.length).some(value => typeof value === 'string' && value.trim())) issue(issues, 'legacy_only', field);
    return ids;
  };
  const regionId = singleId(data.regionId, 'regionId', issues);
  const districtId = singleId(data.districtId, 'districtId', issues);
  const region = regions.find(item => item.id === regionId);
  const district = districts.find(item => item.id === districtId);
  for (const [field, id, source] of [['regionId', regionId, region], ['districtId', districtId, district]] as const) {
    if (id && !source) issue(issues, 'missing_hierarchy', field);
    if (source && source.data.status !== 'Active') issue(issues, source.data.status === 'Retired' ? 'retired_hierarchy' : 'unknown_hierarchy_state', field);
    if (source && !canonicalName(source.data.name)) issue(issues, 'invalid_name', field);
  }
  if (district && district.data.regionId !== regionId) issue(issues, 'hierarchy_parent_mismatch', 'districtId');
  const recordStatus = data.recordStatus === 'Active' ? 'active' : data.recordStatus === 'Retired' ? 'retired' : data.recordStatus === 'Draft' ? 'draft' : 'unknown';
  if (recordStatus === 'unknown') issue(issues, 'unknown_location_state', 'recordStatus');
  const storeNumber = canonicalId(data.storeNumber) ? data.storeNumber : null;
  if (!storeNumber) issue(issues, 'invalid_store_number', 'storeNumber');
  const storeManagerId = single('storeManagerId', 'storeManagerName');
  const districtManagerId = single('districtManagerId', 'districtManagerName');
  const regionalManagerId = single('regionalManagerId', 'regionalManagerName');
  const assistantStoreManagerIds = list('assistantStoreManagerIds', 'assistantStoreManagerNames');
  const keyHolderIds = list('keyHolderIds', 'keyHolderNames');
  const resolved = (id: string | null, field: string) => id ? referencePerson(id, peopleMap, field) : null;
  return {
    locationId: record.id, storeNumber, recordStatus, regionId, districtId,
    hierarchy: { regionName: region ? canonicalName(region.data.name) : null, districtName: district ? canonicalName(district.data.name) : null },
    storeManagerId, districtManagerId, regionalManagerId, assistantStoreManagerIds, keyHolderIds,
    staffing: {
      storeManager: resolved(storeManagerId, 'storeManagerId'),
      districtManager: resolved(districtManagerId, 'districtManagerId'),
      regionalManager: resolved(regionalManagerId, 'regionalManagerId'),
      assistantStoreManagers: assistantStoreManagerIds.map(id => referencePerson(id, peopleMap, 'assistantStoreManagerIds')),
      keyHolders: keyHolderIds.map(id => referencePerson(id, peopleMap, 'keyHolderIds')),
    },
    issues,
  };
}
