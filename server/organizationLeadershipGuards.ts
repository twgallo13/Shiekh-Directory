import type { Firestore, Transaction } from '@google-cloud/firestore';
import { isDeepStrictEqual } from 'node:util';
import type { DirectoryWrite } from './firestoreDirectory';
import { DirectoryValidationError } from './firestoreDirectory';
import { canonicalId } from './personnelProjection';
import { leadershipUnitKey, type LeadershipUnitSource } from './organizationLeadershipPlanner';
import { allowsLeadershipPosition } from '../src/lib/personPositions';
import { personLifecycle } from '../src/lib/personLifecycle';
import { classifyHierarchyLocationType } from '../src/lib/hierarchyResolution';

interface Assignment { id: string; unitType: 'district' | 'region'; unitId: string; personId: string; status: 'active' | 'ended' }
export interface OrganizationGuardState { units: LeadershipUnitSource[]; assignments: Assignment[] }
const deny = (message: string): never => { throw new DirectoryValidationError(message); };
const modelFields = ['leadershipModelVersion', 'leadershipVersion'];
const pointer = (unit: LeadershipUnitSource) => unit.unitType === 'district' ? 'districtManagerId' : 'regionalManagerId';
const activated = (unit: LeadershipUnitSource) => Object.hasOwn(unit.data, 'leadershipModelVersion');
/** Names and empty-unit status are ordinary registry metadata, never staffing/parent authority.
 * Normalization preserves server fields first; this final comparison rejects every other change. */
export function isManagedUnitMetadataEdit(before: Record<string, unknown>, after: Record<string, unknown>) {
  const immutable = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'name', 'status', 'version', 'updatedAt'].includes(key)));
  return before.leadershipModelVersion === 1 && typeof after.name === 'string' && after.name.trim().length > 0 && after.name.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(after.name)
    && ['Active', 'Retired'].includes(after.status as string) && (before.name !== after.name || before.status !== after.status) && isDeepStrictEqual(immutable(before), immutable(after));
}

/** Reuse complete hierarchy already read by the caller's transaction. Legacy-only saves add no query.
 * Once any unit is activated, read complete bounded tenure identities, not contact/person details.
 * This is a transitional protection layer; canonical unit edits/moves need their reviewed command path.
 */
export async function readOrganizationGuardState(db: Firestore, tx: Transaction, units: LeadershipUnitSource[]): Promise<OrganizationGuardState> {
  const state: OrganizationGuardState = { units, assignments: [] };
  if (!units.some(activated)) return state;
  if (units.length > 600) deny('Leadership hierarchy exceeds its supported bound.');
  const rows = await tx.get(db.collection('leadership_assignments').select('unitType', 'unitId', 'personId', 'status').limit(15001));
  if (rows.size !== rows.docs.length || rows.size > 15000) deny('Leadership inventory exceeds its complete read bound.');
  let bytes = 0;
  for (const doc of rows.docs) {
    const data = doc.data();
    if (!doc.exists || !doc.updateTime || !canonicalId(doc.id) || doc.ref.path !== `leadership_assignments/${doc.id}` || !data
      || !['district', 'region'].includes(data.unitType) || !canonicalId(data.unitId) || !canonicalId(data.personId) || !['active', 'ended'].includes(data.status)) deny('Resolve invalid leadership history before saving linked data.');
    bytes += Buffer.byteLength(JSON.stringify(data)) + 256;
    if (bytes > 8_000_000) deny('Leadership inventory exceeds its byte bound.');
    state.assignments.push({ id: doc.id, unitType: data.unitType, unitId: data.unitId, personId: data.personId, status: data.status });
  }
  return state;
}

/** The older signed Person workflow does not understand Additional rosters or Region ownership.
 * Block overlapping commands at preview AND commit, while immutable receipt recovery remains available.
 */
export function assertOrganizationTransitionCompatibility(state: OrganizationGuardState, intent: { personId: string; responsibilities: { owner: string; id: string; field: string }[] }, locations: { id: string; data: Record<string, unknown> | null }[]) {
  const controlled = state.units.filter(activated);
  const managed = (type: 'district' | 'region', id: unknown) => controlled.some(u => u.unitType === type && u.id === id);
  if (state.assignments.some(a => a.status === 'active' && a.personId === intent.personId)) deny('This Person has organization responsibilities. Use the roster-aware review workflow.');
  for (const action of intent.responsibilities) {
    if (action.owner === 'districts' && managed('district', action.id)) deny('This District uses the roster-aware organization workflow.');
    if (action.owner !== 'locations' || action.field !== 'regionalManagerId') continue;
    const location = locations.find(l => l.id === action.id)?.data;
    const district = state.units.find(u => u.unitType === 'district' && u.id === location?.districtId);
    if (location && managed('region', district?.data.regionId ?? location.regionId)) deny('Regional Manager responsibility belongs to the canonical Region, not an individual store.');
  }
}

/** Called after ordinary normalization, before ANY write, for generic commits/imports/correction approval.
 * It never accepts a bypass boolean or mutates an assignment. Private command/receipt collections are
 * not generic Directory collections. Retained unresolved incumbents remain editable for contact-only changes.
 */
export function validateOrganizationLeadershipWrites(writes: DirectoryWrite[], previous: (Record<string, unknown> | undefined)[], state: OrganizationGuardState, people: Record<string, unknown>[]) {
  const controlled = state.units.filter(activated), active = state.assignments.filter(a => a.status === 'active');
  const byKey = new Map(state.units.map(u => [leadershipUnitKey(u.unitType, u.id), u]));
  if (byKey.size !== state.units.length || new Set(state.assignments.map(a => a.id)).size !== state.assignments.length) deny('Duplicate leadership source identity.');
  for (const unit of controlled) {
    const rows = active.filter(a => a.unitType === unit.unitType && a.unitId === unit.id), primary = unit.data[pointer(unit)];
    if (!['Active', 'Retired'].includes(unit.data.status as string) || unit.data.status === 'Retired' && (rows.length > 0 || primary !== null)
      || unit.unitType === 'district' && !state.units.some(r => r.unitType === 'region' && r.id === unit.data.regionId && (unit.data.status === 'Retired' || r.data.status === 'Active'))
      || unit.data.leadershipModelVersion !== 1 || !Number.isSafeInteger(unit.data.leadershipVersion) || Number(unit.data.leadershipVersion) < 0
      || rows.length > 25 || new Set(rows.map(a => a.personId)).size !== rows.length
      || (rows.length ? !canonicalId(primary) || !rows.some(a => a.personId === primary) : primary !== null)) deny('Resolve the activated leadership roster before linked saves.');
  }
  if (active.some(a => !byKey.has(leadershipUnitKey(a.unitType, a.unitId)) || !activated(byKey.get(leadershipUnitKey(a.unitType, a.unitId))!))) deny('Active leadership rows require an activated canonical unit.');
  const managed = (type: 'district' | 'region', id: unknown) => typeof id === 'string' && controlled.find(u => u.unitType === type && u.id === id);
  const regionFor = (data: Record<string, unknown>) => byKey.get(leadershipUnitKey('district', String(data.districtId)))?.data.regionId ?? data.regionId;
  for (const [index, write] of writes.entries()) {
    const before = previous[index], after = write.data;
    if (write.collection === 'districts' || write.collection === 'regions') {
      const type = write.collection === 'districts' ? 'district' : 'region', current = byKey.get(leadershipUnitKey(type, write.id));
      if (current && activated(current)) {
        if (writes.length !== 1 || write.operation !== 'set' || !before || !after || !isManagedUnitMetadataEdit(before, after)) deny('Only a managed unit name or empty-unit status can be edited here. Use the organization workflow for leadership or parent changes.');
        if (after.status === 'Retired' && active.some(a => a.unitType === type && a.unitId === write.id)) deny('End or reassign every Primary/Additional responsibility before retiring this unit.');
        if (type === 'district' && after.status === 'Active' && !state.units.some(u => u.unitType === 'region' && u.id === after.regionId && u.data.status === 'Active')) deny('Active Districts require an active parent Region.');
      } else if (after && modelFields.some(field => Object.hasOwn(after, field))) deny('Leadership model/version fields are server-command owned.');
      if (type === 'region' && after && Object.hasOwn(after, 'regionalManagerId') && !isDeepStrictEqual(after.regionalManagerId, before?.regionalManagerId)) deny('Regional Manager ownership requires the reviewed organization workflow.');
      if (type === 'region' && controlled.some(u => u.unitType === 'district' && u.data.regionId === write.id && u.data.status === 'Active')
        && (write.operation === 'delete' || after?.status !== 'Active')) deny('An activated District requires its Active parent Region.');
      if (type === 'district' && before && !isDeepStrictEqual(after?.regionId, before.regionId) && (managed('region', before.regionId) || managed('region', after?.regionId))) deny('Review District moves between managed Regions in the organization workflow.');
    }
    if (write.collection === 'people') {
      const responsibilities = active.filter(a => a.personId === write.id);
      if (!responsibilities.length) continue;
      if (!before || write.operation === 'delete' || !after) deny('End or reassign organization responsibilities before deleting this Person.');
      if (!isDeepStrictEqual(after.fullName, before.fullName)) deny('Review compatibility updates before renaming an assigned organization manager.');
      const eligibilityChanged = ['positionIds', 'status', 'activeStatus'].some(field => !isDeepStrictEqual(after[field], before[field]));
      if (eligibilityChanged && responsibilities.some(a => personLifecycle(after) !== 'active' || !allowsLeadershipPosition(after, a.unitType === 'district' ? 'District Manager' : 'Regional Manager'))) deny('End or reassign every affected Primary/Additional responsibility before removing a position or inactivating this Person.');
    }
    if (write.collection !== 'locations') continue;
    const oldManaged = before && (managed('district', before.districtId) || managed('region', regionFor(before)));
    const newManaged = after && (managed('district', after.districtId) || managed('region', regionFor(after)));
    if (!oldManaged && !newManaged) continue;
    const oldKind = before && classifyHierarchyLocationType(before.type), newKind = after && classifyHierarchyLocationType(after.type);
    if (oldKind === 'non-retail' && (!after || newKind === 'non-retail') || !before && newKind === 'non-retail') continue;
    if (write.operation === 'delete' || before && (before.districtId !== after?.districtId || before.regionId !== after?.regionId || before.type !== after?.type || before.hierarchyApplicability !== after?.hierarchyApplicability)) deny('Review managed store moves, type changes or removal in the organization workflow.');
    if (!after || newKind !== 'retail') deny('Classify managed stores before saving.');
    for (const unit of [managed('district', after.districtId), managed('region', regionFor(after))]) {
      if (!unit) continue;
      const field = pointer(unit), primary = unit.data[field], person = people.find(p => p.id === primary);
      // Existing Location normalization represents an explicit unit vacancy as absent/empty copy.
      // Authority remains the activated unit's null pointer; absence on the unit is still invalid.
      const copied = after[field] === undefined || after[field] === '' ? null : after[field];
      if (copied !== primary || primary !== null && (!person || typeof person.fullName !== 'string' || !person.fullName.trim())
        || (after[field.replace(/Id$/, 'Name')] ?? '') !== (primary === null ? '' : person!.fullName)) deny('Store leadership must match its canonical District/Region Primary Manager. Refresh the organization data.');
    }
  }
}
