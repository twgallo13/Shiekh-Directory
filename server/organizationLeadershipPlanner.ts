import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { classifyHierarchyLocationType, resolveHierarchyApplicability } from '../src/lib/hierarchyResolution';
import { personLifecycle } from '../src/lib/personLifecycle';
import { allowsLeadershipPosition } from '../src/lib/personPositions';
import { canonicalId, type SourceRecord } from './personnelProjection';

export type LeadershipUnitType = 'district' | 'region';
export interface LeadershipUnitSource extends SourceRecord { unitType: LeadershipUnitType }
export interface OrganizationLeadershipSnapshot {
  units: LeadershipUnitSource[];
  assignments: SourceRecord[];
  people: SourceRecord[];
  locations: SourceRecord[];
  /** Internal loader attestation, not a client-controlled completeness assertion. */
  complete: { hierarchy: true; locations: true; assignmentUnits: string[] };
}
export interface LeadershipUnitIntent {
  unitType: LeadershipUnitType;
  unitId: string;
  expectedVersion: number;
  expectedLeadershipVersion: number;
  activateLegacy: boolean;
  memberPersonIds: string[];
  primaryPersonId: string | null;
  reason: string;
}
export interface OrganizationLeadershipIntent { operationId: string; units: LeadershipUnitIntent[] }
export interface LeadershipPatch {
  collection: 'districts' | 'regions' | 'leadership_assignments' | 'locations';
  id: string;
  expectedVersion: number | null;
  set: Record<string, unknown>;
}
export const ORGANIZATION_LEADERSHIP_LIMITS = Object.freeze({ units: 5, members: 25, writes: 200, bytes: 8_000_000 });
export class LeadershipPlanError extends Error {
  constructor(public readonly code: 'invalid_input' | 'incomplete_source' | 'conflict' | 'ineligible' | 'capacity', message: string) { super(message); }
}
function fail(code: LeadershipPlanError['code'], message: string): never { throw new LeadershipPlanError(code, message); }
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const own = (v: object, field: string) => Object.hasOwn(v, field);
const version = (v: unknown): number => v === undefined ? 0 : Number.isSafeInteger(v) && (v as number) >= 0 ? v as number : fail('invalid_input', 'Invalid source version.');
const increment = (v: unknown): number => {
  const current = version(v);
  return current < Number.MAX_SAFE_INTEGER ? current + 1 : fail('conflict', 'Record version cannot be incremented safely.');
};
const pointer = (type: LeadershipUnitType) => type === 'district' ? 'districtManagerId' : 'regionalManagerId';
const label = (type: LeadershipUnitType) => type === 'district' ? 'District Manager' : 'Regional Manager';
export const leadershipUnitKey = (type: LeadershipUnitType, id: string) => JSON.stringify([type, id]);
const text = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const utcInstant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
function canonical(value: unknown, seen = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (!value || typeof value !== 'object' || seen.has(value) || (!Array.isArray(value) && !plain(value))) fail('invalid_input', 'Source must contain finite, acyclic JSON values.');
  seen.add(value);
  const result = Array.isArray(value) ? '[' + value.map(v => canonical(v, seen)).join(',') + ']'
    : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k], seen)).join(',') + '}';
  seen.delete(value);
  return result;
}
const digest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function exactKeys(value: unknown, keys: readonly string[]) {
  if (!plain(value) || Object.keys(value).length !== keys.length || keys.some(k => !own(value, k))) fail('invalid_input', 'Use only the documented fields.');
}
export function normalizeOrganizationLeadershipIntent(value: unknown): OrganizationLeadershipIntent {
  exactKeys(value, ['operationId', 'units']);
  const input = value as Record<string, unknown>;
  if (!canonicalId(input.operationId) || !Array.isArray(input.units) || !input.units.length || input.units.length > ORGANIZATION_LEADERSHIP_LIMITS.units) fail('invalid_input', 'Provide an operation ID and one to five units.');
  const seen = new Set<string>();
  for (const raw of input.units as unknown[]) {
    exactKeys(raw, ['unitType', 'unitId', 'expectedVersion', 'expectedLeadershipVersion', 'activateLegacy', 'memberPersonIds', 'primaryPersonId', 'reason']);
    const u = raw as Record<string, unknown>;
    if (!['district', 'region'].includes(u.unitType as string) || !canonicalId(u.unitId) || typeof u.activateLegacy !== 'boolean'
      || !Number.isSafeInteger(u.expectedVersion) || (u.expectedVersion as number) < 0
      || !Number.isSafeInteger(u.expectedLeadershipVersion) || (u.expectedLeadershipVersion as number) < 0
      || !Array.isArray(u.memberPersonIds) || u.memberPersonIds.length > ORGANIZATION_LEADERSHIP_LIMITS.members || !Array.from(u.memberPersonIds).every(canonicalId)
      || new Set(u.memberPersonIds).size !== u.memberPersonIds.length || !(u.primaryPersonId === null || canonicalId(u.primaryPersonId))
      || typeof u.reason !== 'string' || u.reason.length > 500 || /[\u0000-\u001f\u007f]/.test(u.reason)) fail('invalid_input', 'Invalid leadership intent.');
    const key = leadershipUnitKey(u.unitType as LeadershipUnitType, u.unitId as string);
    if (seen.has(key)) fail('invalid_input', 'A unit must be reviewed only once per operation.');
    seen.add(key);
    if ((u.memberPersonIds as string[]).length ? !(u.memberPersonIds as string[]).includes(u.primaryPersonId as string) : u.primaryPersonId !== null) fail('invalid_input', 'A staffed unit needs one explicitly selected Primary; a vacant unit must have no members.');
  }
  return structuredClone(value) as OrganizationLeadershipIntent;
}
function records(rows: unknown, maximum: number, key: (row: SourceRecord) => string = r => r.id): SourceRecord[] {
  if (!Array.isArray(rows) || rows.length > maximum) fail('capacity', 'Source collection capacity exceeded.');
  const seen = new Set<string>();
  for (const r of rows) {
    if (!plain(r) || !canonicalId(r.id) || !plain(r.data) || (own(r.data, 'id') && r.data.id !== r.id)) fail('incomplete_source', 'Every source record requires an exact, consistent ID and data.');
    const k = key(r as unknown as SourceRecord);
    if (seen.has(k)) fail('incomplete_source', 'Duplicate source identity.');
    seen.add(k); version(r.data.version);
  }
  return rows;
}
function validateSource(snapshot: OrganizationLeadershipSnapshot, now: string) {
  if (!plain(snapshot) || !plain(snapshot.complete) || snapshot.complete.hierarchy !== true || snapshot.complete.locations !== true || !Array.isArray(snapshot.complete.assignmentUnits)) fail('incomplete_source', 'Complete hierarchy, store membership and unit roster reads are required.');
  records(snapshot.units, 600, r => {
    const type = (r as LeadershipUnitSource).unitType;
    if (type !== 'district' && type !== 'region') fail('incomplete_source', 'Invalid unit type.');
    return leadershipUnitKey(type, r.id);
  });
  records(snapshot.assignments, 15000); records(snapshot.people, 5000); records(snapshot.locations, 1000);
  if (Buffer.byteLength(canonical(snapshot), 'utf8') > ORGANIZATION_LEADERSHIP_LIMITS.bytes) fail('capacity', 'Source snapshot capacity exceeded.');
  for (const a of snapshot.assignments) {
    const d = a.data;
    if (!['district', 'region'].includes(d.unitType as string) || !canonicalId(d.unitId) || !canonicalId(d.personId)
      || !['active', 'ended'].includes(d.status as string) || !utcInstant(d.startedAt)
      || Date.parse(d.startedAt as string) > Date.parse(now)
      || (d.status === 'active' ? d.endedAt !== null : !utcInstant(d.endedAt)
        || Date.parse(d.endedAt as string) < Date.parse(d.startedAt as string) || Date.parse(d.endedAt as string) > Date.parse(now))) fail('incomplete_source', 'Malformed or scheduled assignment source; do not interpret it as vacancy.');
  }
}

/** Pure internal dry run only. This does not authenticate, sign, persist, activate or authorize anything.
 * Loader completeness and every precondition must be rechecked by a future transactional writer.
 * Never expose raw patches/preconditions to consumers or treat this plan as a commit capability.
 */
export function planOrganizationLeadership(raw: unknown, snapshot: OrganizationLeadershipSnapshot, now: string) {
  const intent = normalizeOrganizationLeadershipIntent(raw);
  if (!utcInstant(now)) fail('invalid_input', 'Use an authoritative UTC commit time.');
  validateSource(snapshot, now);
  const patches = new Map<string, LeadershipPatch>();
  const readUnits = new Map<string, LeadershipUnitSource>();
  const readPeople = new Map<string, SourceRecord>();
  const readLocations = new Map<string, SourceRecord>();
  const review: { unitType: LeadershipUnitType; unitId: string; name: string; reason: string; activating: boolean; beforePrimaryPersonId: string | null; primaryPersonId: string | null; added: string[]; ended: string[]; members: { personId: string; fullName: string; isPrimary: boolean; eligibilityIssue?: string }[]; compatibilityStores: number }[] = [];
  const findUnit = (type: LeadershipUnitType, id: string) => {
    const r = snapshot.units.find(u => u.unitType === type && u.id === id);
    if (!r) fail('incomplete_source', 'Exact unit dependency is missing.');
    readUnits.set(leadershipUnitKey(type, id), r);
    return r;
  };
  const put = (collection: LeadershipPatch['collection'], row: SourceRecord, set: Record<string, unknown>, create = false) => {
    const k = JSON.stringify([collection, row.id]);
    if (patches.has(k)) {
      const old = patches.get(k)!;
      for (const field of Object.keys(set)) if (own(old.set, field) && !isDeepStrictEqual(old.set[field], set[field])) fail('conflict', 'Selected actions propose conflicting changes.');
      old.set = { ...old.set, ...set };
      return;
    }
    const changed = create ? set : Object.fromEntries(Object.entries(set).filter(([k, v]) => !isDeepStrictEqual(row.data[k], v) || !own(row.data, k)));
    if (Object.keys(changed).length) patches.set(k, { collection, id: row.id, expectedVersion: create ? null : version(row.data.version), set: { ...changed, version: create ? 1 : increment(row.data.version), updatedAt: now } });
  };
  for (const u of intent.units) {
    const unit = findUnit(u.unitType, u.unitId), key = leadershipUnitKey(u.unitType, u.unitId), field = pointer(u.unitType);
    if (!snapshot.complete.assignmentUnits.includes(key)) fail('incomplete_source', 'The complete unit roster was not read.');
    if (unit.data.status !== 'Active' || !text(unit.data.name)) fail('ineligible', 'Choose an Active, named unit.');
    if (u.unitType === 'district') {
      if (!canonicalId(unit.data.regionId)) fail('ineligible', 'Choose a District with an Active parent Region.');
      const parent = findUnit('region', unit.data.regionId);
      if (parent.data.status !== 'Active' || !text(parent.data.name)) fail('ineligible', 'Choose a District with an Active, named parent Region.');
    }
    const managed = unit.data.leadershipModelVersion === 1;
    if (own(unit.data, 'leadershipModelVersion') && !managed) fail('incomplete_source', 'Unsupported roster schema; do not downgrade.');
    if (managed && !own(unit.data, 'leadershipVersion')) fail('incomplete_source', 'Activated roster has no leadership version.');
    if (version(unit.data.version) !== u.expectedVersion || version(unit.data.leadershipVersion) !== u.expectedLeadershipVersion) fail('conflict', 'Unit or leadership version changed; review again.');
    if (managed === u.activateLegacy) fail('invalid_input', managed ? 'This unit is already activated.' : 'Legacy ownership requires explicit reviewed activation.');
    const all = snapshot.assignments.filter(a => a.data.unitType === u.unitType && a.data.unitId === u.unitId);
    const active = all.filter(a => a.data.status === 'active');
    if (!managed && active.length) fail('incomplete_source', 'Legacy unit has unexpected active roster rows.');
    if (active.length > ORGANIZATION_LEADERSHIP_LIMITS.members || new Set(active.map(a => a.data.personId)).size !== active.length) fail('incomplete_source', 'Duplicate or excessive active roster members.');
    const beforePointer = unit.data[field];
    if (managed && (active.length ? !canonicalId(beforePointer) || !active.some(a => a.data.personId === beforePointer) : beforePointer !== null)) fail('incomplete_source', 'Stored Primary and active roster disagree; a repair review is required.');
    if (!managed && own(unit.data, field) && beforePointer !== null && !canonicalId(beforePointer)) fail('incomplete_source', 'Invalid legacy Primary reference.');
    const next = new Set(u.memberPersonIds), previousIds = new Set(active.map(a => a.data.personId as string));
    const removed = active.filter(a => !next.has(a.data.personId as string));
    const added = u.memberPersonIds.filter(id => !previousIds.has(id));
    const primaryChanged = !own(unit.data, field) || beforePointer !== u.primaryPersonId;
    if ((u.activateLegacy || primaryChanged || removed.length) && u.reason.trim().length < 5) fail('invalid_input', 'Explain the activation, Primary change or responsibility ending.');
    const members = u.memberPersonIds.map(id => {
      const p = snapshot.people.find(p => p.id === id);
      if (!p) fail('incomplete_source', 'Exact Person dependency is missing.');
      readPeople.set(id, p);
      const eligible = personLifecycle(p.data) === 'active' && allowsLeadershipPosition(p.data, label(u.unitType)) && text(p.data.fullName);
      // Preserve unresolved incumbents as explicit review warnings. A retained tenure is not a new
      // assignment; adding or promoting someone still requires current controlled eligibility.
      if (!eligible && (added.includes(id) || primaryChanged && id === u.primaryPersonId)) fail('ineligible', 'New managers and Primary promotions require the matching position, Active lifecycle and a name.');
      return { personId: id, fullName: text(p.data.fullName) ? p.data.fullName : id, isPrimary: id === u.primaryPersonId,
        ...(!eligible ? { eligibilityIssue: 'Existing assignment needs review: current position, Active status or name is unresolved.' } : {}) };
    });
    for (const a of removed) put('leadership_assignments', a, { status: 'ended', endedAt: now });
    for (const id of added) {
      const assignmentId = 'assignment-' + digest([intent.operationId, u.unitType, u.unitId, id]).slice(0, 40);
      if (snapshot.assignments.some(a => a.id === assignmentId)) fail('conflict', 'This operation may already have committed; reconcile its receipt before retrying.');
      put('leadership_assignments', { id: assignmentId, data: {} }, { unitType: u.unitType, unitId: u.unitId, personId: id, status: 'active', startedAt: now, endedAt: null }, true);
    }
    if (managed && !primaryChanged && !removed.length && !added.length) fail('invalid_input', 'There is no leadership change to save.');
    put(u.unitType === 'district' ? 'districts' : 'regions', unit, { leadershipModelVersion: 1, leadershipVersion: increment(u.expectedLeadershipVersion), [field]: u.primaryPersonId });
    let compatibilityStores = 0;
    if (primaryChanged || u.activateLegacy) {
      const primaryName = members.find(p => p.isPrimary)?.fullName ?? '';
      for (const l of snapshot.locations) {
        const d = canonicalId(l.data.districtId) ? snapshot.units.find(d => d.unitType === 'district' && d.id === l.data.districtId) : undefined;
        const relevant = u.unitType === 'district' ? l.data.districtId === u.unitId : l.data.regionId === u.unitId || d?.data.regionId === u.unitId;
        if (!relevant) continue;
        const kind = classifyHierarchyLocationType(l.data.type);
        if (kind === 'non-retail') continue;
        if (kind !== 'retail') fail('incomplete_source', 'Classify relevant unknown Locations before handover.');
        const applicability = resolveHierarchyApplicability(l.data);
        if (!d || d.data.status !== 'Active' || d.data.regionId !== l.data.regionId || applicability.value !== 'Applicable' || applicability.issues.length
          || !['Active', 'Retired', 'Draft'].includes(l.data.recordStatus as string)) fail('ineligible', 'Resolve relevant retail hierarchy/applicability conflicts before handover.');
        const r = findUnit('region', d.data.regionId as string);
        if (r.data.status !== 'Active') fail('ineligible', 'Resolve the retail parent Region before handover.');
        readUnits.set(leadershipUnitKey('district', d.id), d); readLocations.set(l.id, l);
        compatibilityStores++;
        put('locations', l, { [field]: u.primaryPersonId, [field.replace(/Id$/, 'Name')]: primaryName });
      }
    }
    review.push({ unitType: u.unitType, unitId: u.unitId, name: unit.data.name as string, reason: u.reason.trim(), activating: u.activateLegacy, beforePrimaryPersonId: canonicalId(beforePointer) ? beforePointer : null, primaryPersonId: u.primaryPersonId, added, ended: removed.map(a => a.data.personId as string), members, compatibilityStores });
  }
  const writes = [...patches.values()].sort((a, b) => JSON.stringify([a.collection, a.id]).localeCompare(JSON.stringify([b.collection, b.id])));
  if (writes.length > ORGANIZATION_LEADERSHIP_LIMITS.writes) fail('capacity', 'This selection exceeds the bounded atomic change limit. Select fewer units; nothing was saved.');
  const preconditions = {
    units: [...readUnits].map(([key, r]) => ({ key, version: version(r.data.version), fingerprint: digest(r.data) })),
    people: [...readPeople].map(([id, p]) => ({ id, version: version(p.data.version), fingerprint: digest({ fullName: p.data.fullName ?? null, positionIds: p.data.positionIds ?? null, status: p.data.status ?? null, activeStatus: p.data.activeStatus ?? null }) })),
    unitAssignments: intent.units.map(u => ({ key: leadershipUnitKey(u.unitType, u.unitId), fingerprint: digest(snapshot.assignments.filter(a => a.data.unitType === u.unitType && a.data.unitId === u.unitId).sort((a, b) => a.id.localeCompare(b.id))) })),
    storeMembership: digest(snapshot.locations.map(l => ({ id: l.id, version: version(l.data.version), districtId: l.data.districtId ?? null, regionId: l.data.regionId ?? null, type: l.data.type ?? null, hierarchyApplicability: l.data.hierarchyApplicability ?? null })).sort((a, b) => a.id.localeCompare(b.id))),
    changedLocations: [...readLocations].map(([id, l]) => ({ id, version: version(l.data.version), fingerprint: digest(l.data) })),
  };
  // Conservative planning estimate only; the future writer must bound its actual audit/receipt envelope too.
  const estimatedAtomicBytes = Buffer.byteLength(canonical({ writes, review, preconditions }), 'utf8') * 3 + 8192;
  if (estimatedAtomicBytes > ORGANIZATION_LEADERSHIP_LIMITS.bytes) fail('capacity', 'The reviewed atomic payload is too large. Nothing was saved.');
  return { operationId: intent.operationId, plannedAt: now, review, writes, preconditions, estimatedAtomicBytes };
}
