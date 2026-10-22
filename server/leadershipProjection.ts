import { canonicalId, type AssignmentIssue, type SourceRecord } from './personnelProjection';
import { personLifecycle } from '../src/lib/personLifecycle';
import { classifyHierarchyLocationType, resolveHierarchyApplicability } from '../src/lib/hierarchyResolution';
import { normalizeLocationInboxEmail } from '../src/lib/locationInboxEmail';

export const WORK_EMAIL_DOMAINS = ['shiekhshoes.com', 'shiekhshoes.org'] as const;
export type WorkEmailStatus = 'not_granted' | 'missing' | 'invalid' | 'unapproved_domain' | 'shared_location_inbox' | 'withheld_inactive' | 'withheld_unknown_lifecycle' | 'unresolved_person' | 'available';
export interface LeadershipContactAccess { granted: boolean; sharedInboxKeys: ReadonlySet<string> }

/** Contact only, never a login/authorization claim. No fallback to legacy/personal email. */
function workContact(person: SourceRecord | undefined, access: LeadershipContactAccess): { workEmail: string | null; workEmailStatus: WorkEmailStatus } {
  const withheld = (workEmailStatus: WorkEmailStatus) => ({ workEmail: null, workEmailStatus });
  if (!access.granted) return withheld('not_granted');
  if (!person) return withheld('unresolved_person');
  const lifecycle = personLifecycle(person.data);
  if (lifecycle !== 'active') return withheld(lifecycle === 'inactive' ? 'withheld_inactive' : 'withheld_unknown_lifecycle');
  if (person.data.workEmail === undefined || person.data.workEmail === null || person.data.workEmail === '') return withheld('missing');
  const email = normalizeLocationInboxEmail(person.data.workEmail);
  if (!email) return withheld('invalid');
  if (!WORK_EMAIL_DOMAINS.some(domain => email.comparisonKey.endsWith('@' + domain))) return withheld('unapproved_domain');
  if (access.sharedInboxKeys.has(email.comparisonKey)) return withheld('shared_location_inbox');
  return { workEmail: email.value, workEmailStatus: 'available' };
}

const name = (value: unknown): string | null => typeof value === 'string' && value.trim() && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : null;
const registryState = (value: unknown) => value === 'Active' ? 'active' as const : value === 'Retired' ? 'retired' as const : 'unknown' as const;
const locationState = (value: unknown) => value === 'Draft' ? 'draft' as const : registryState(value);

function reference(value: unknown, field: string, issues: AssignmentIssue[]) {
  if (canonicalId(value)) return value;
  issues.push({ code: value === undefined || value === null || value === '' ? 'missing_reference' : 'invalid_reference', field });
  return null;
}

function hierarchyReference(id: string | null, source: SourceRecord | undefined, field: string, issues: AssignmentIssue[]) {
  if (id && !source) issues.push({ code: 'missing_hierarchy', field });
  if (source && registryState(source.data.status) !== 'active') issues.push({ code: source.data.status === 'Retired' ? 'retired_hierarchy' : 'unknown_hierarchy_state', field });
  if (source && !name(source.data.name)) issues.push({ code: 'invalid_name', field });
}

/** Explicit District ownership only: never infer a leader from store copies, titles or email. */
export function projectDistrictLeadership(record: SourceRecord, people: SourceRecord[], regions: SourceRecord[], contacts: LeadershipContactAccess = { granted: false, sharedInboxKeys: new Set() }) {
  const data = record.data, issues: AssignmentIssue[] = [];
  const districtName = name(data.name), recordStatus = registryState(data.status);
  if (!districtName) issues.push({ code: 'invalid_name', field: 'districtName' });
  if (recordStatus === 'unknown') issues.push({ code: 'unknown_hierarchy_state', field: 'recordStatus' });
  const regionId = reference(data.regionId, 'regionId', issues);
  const region = regions.find(r => r.id === regionId);
  hierarchyReference(regionId, region, 'regionId', issues);
  let assignmentState: 'assigned' | 'vacant' | 'unmanaged' | 'invalid' | 'unresolved';
  let districtManager: { personId: string; fullName: string | null; lifecycle: ReturnType<typeof personLifecycle>; workEmail: string | null; workEmailStatus: WorkEmailStatus; issues: AssignmentIssue[] } | null = null;
  if (!Object.hasOwn(data, 'districtManagerId')) assignmentState = 'unmanaged';
  else if (data.districtManagerId === null) assignmentState = 'vacant';
  else if (!canonicalId(data.districtManagerId)) {
    assignmentState = 'invalid'; issues.push({ code: 'invalid_reference', field: 'districtManagerId' });
  } else {
    const person = people.find(p => p.id === data.districtManagerId);
    const personIssues: AssignmentIssue[] = [];
    const fullName = person ? name(person.data.fullName) : null;
    const lifecycle = person ? personLifecycle(person.data) : 'unknown';
    if (!person) personIssues.push({ code: 'missing_person', field: 'districtManagerId' });
    else {
      if (!fullName) personIssues.push({ code: 'invalid_name', field: 'fullName' });
      if (lifecycle !== 'active') personIssues.push({ code: lifecycle === 'inactive' ? 'inactive_person' : 'unknown_person_state', field: 'lifecycle' });
      if (typeof person.data.name === 'string' && fullName && person.data.name.trim() !== fullName) personIssues.push({ code: 'conflicting_name_alias', field: 'fullName' });
    }
    assignmentState = person ? 'assigned' : 'unresolved';
    districtManager = { personId: data.districtManagerId, fullName, lifecycle, ...workContact(person, contacts), issues: personIssues };
  }
  return { districtId: record.id, districtName, recordStatus, regionId, regionName: region ? name(region.data.name) : null,
    regionStatus: region ? registryState(region.data.status) : null, assignmentState, districtManager, issues };
}

/** Minimal join dataset; reconcile it only with the complete District roster from the same snapshot. */
export function projectLocationDistrict(record: SourceRecord, districts: SourceRecord[], regions: SourceRecord[]) {
  const data = record.data, issues: AssignmentIssue[] = [];
  const recordStatus = locationState(data.recordStatus), locationType = classifyHierarchyLocationType(data.type);
  const applicability = resolveHierarchyApplicability(data);
  const storeNumber = canonicalId(data.storeNumber) ? data.storeNumber : null;
  if (!storeNumber) issues.push({ code: 'invalid_store_number', field: 'storeNumber' });
  if (recordStatus === 'unknown') issues.push({ code: 'unknown_location_state', field: 'recordStatus' });
  if (locationType === 'unclassified') issues.push({ code: 'unknown_location_type', field: 'locationType' });
  if (applicability.issues.length) issues.push({ code: 'hierarchy_applicability_conflict', field: 'hierarchyApplicability' });
  const ids = (field: 'regionId' | 'districtId') => {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      if (applicability.value === 'Applicable') issues.push({ code: 'missing_reference', field });
      return null;
    }
    return reference(data[field], field, issues);
  };
  const regionId = ids('regionId'), districtId = ids('districtId');
  const region = regions.find(r => r.id === regionId), district = districts.find(d => d.id === districtId);
  hierarchyReference(regionId, region, 'regionId', issues);
  hierarchyReference(districtId, district, 'districtId', issues);
  if (district && district.data.regionId !== regionId) issues.push({ code: 'hierarchy_parent_mismatch', field: 'districtId' });
  return { locationId: record.id, storeNumber, recordStatus, locationType, hierarchyApplicability: applicability.value, regionId, districtId, issues };
}
