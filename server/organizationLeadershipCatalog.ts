import type { Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from './authAuthority';
import type { OrganizationCatalog, OrganizationUnitSummary, OrganizationUnitType } from '../src/lib/organizationLeadershipContract';
import { assertPersonTransitionActor, readPersonTransitionAuthority } from './personTransitionAuthority';
import { canonicalId, type SourceRecord } from './personnelProjection';
import { allowsLeadershipPosition } from '../src/lib/personPositions';
import { personLifecycle } from '../src/lib/personLifecycle';
import { classifyHierarchyLocationType, resolveHierarchyApplicability } from '../src/lib/hierarchyResolution';
import { leadershipUnitKey, type LeadershipUnitSource } from './organizationLeadershipPlanner';

export interface OrganizationCatalogSnapshot { units: LeadershipUnitSource[]; people: SourceRecord[]; assignments: SourceRecord[]; locations: SourceRecord[] }
const safeVersion = (value: unknown) => value === undefined ? 0 : Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
const named = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value);
const eligible = (p: SourceRecord | undefined, type: OrganizationUnitType) => !!p && named(p.data.fullName) && personLifecycle(p.data) === 'active' && allowsLeadershipPosition(p.data, type === 'district' ? 'District Manager' : 'Regional Manager');
/** Read diagnostics do not repair, hide, infer or grant assignments. Candidate eligibility is separate
 * from retained membership; unavailable/ineligible incumbents remain visible by stable Person ID. */
export function projectOrganizationCatalog(snapshot: OrganizationCatalogSnapshot, now: string): OrganizationCatalog {
  if (!Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now) throw new Error('Invalid catalog clock.');
  const people = new Map(snapshot.people.map(p => [p.id, p])), issues: string[] = [];
  const units = new Map(snapshot.units.map(u => [leadershipUnitKey(u.unitType, u.id), u]));
  if (people.size !== snapshot.people.length || units.size !== snapshot.units.length || new Set(snapshot.assignments.map(a => a.id)).size !== snapshot.assignments.length) throw new Error('Duplicate catalog identity.');
  for (const a of snapshot.assignments) if (!['district', 'region'].includes(a.data.unitType as string) || !canonicalId(a.data.unitId)
    || !units.has(leadershipUnitKey(a.data.unitType as OrganizationUnitType, a.data.unitId as string))) issues.push('An assignment references an unavailable organization unit.');
  const summaries: OrganizationUnitSummary[] = snapshot.units.map(u => {
    const d = u.data, unitIssues: string[] = [], type = u.unitType, field = type === 'district' ? 'districtManagerId' : 'regionalManagerId';
    const ownership = !Object.hasOwn(d, 'leadershipModelVersion') ? 'legacy' : d.leadershipModelVersion === 1 ? 'managed' : 'unsupported';
    if (!named(d.name)) unitIssues.push('Unit name needs review.');
    if (d.status !== 'Active') unitIssues.push('Only Active units can receive assignments.');
    const region = type === 'district' && canonicalId(d.regionId) ? units.get(leadershipUnitKey('region', d.regionId)) : undefined;
    if (type === 'district' && (!region || region.data.status !== 'Active')) unitIssues.push('An Active parent Region is required.');
    const version = safeVersion(d.version), leadershipVersion = safeVersion(d.leadershipVersion);
    if (version === null || leadershipVersion === null || ownership === 'managed' && !Object.hasOwn(d, 'leadershipVersion')) unitIssues.push('Saved versions need review.');
    if (ownership === 'unsupported') unitIssues.push('This leadership model is unsupported.');
    const all = snapshot.assignments.filter(a => a.data.unitType === type && a.data.unitId === u.id);
    const active = all.filter(a => a.data.status === 'active');
    const validTime = (v: unknown) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v && Date.parse(v) <= Date.parse(now);
    if (all.some(a => !canonicalId(a.data.personId) || !['active', 'ended'].includes(a.data.status as string) || !validTime(a.data.startedAt)
      || (a.data.status === 'active' ? a.data.endedAt !== null : !validTime(a.data.endedAt) || Date.parse(a.data.endedAt as string) < Date.parse(a.data.startedAt as string)))) unitIssues.push('Assignment history needs review.');
    const primary = canonicalId(d[field]) ? d[field] : null;
    let assignmentState: OrganizationUnitSummary['assignmentState'] = !Object.hasOwn(d, field) ? 'unmanaged' : d[field] === null ? 'vacant' : primary ? 'assigned' : 'invalid';
    const ids = ownership === 'managed' ? [...new Set(active.map(a => a.data.personId).filter(canonicalId))] : primary ? [primary] : [];
    if (ownership === 'managed' && (active.length > 25 || active.length !== ids.length || (active.length ? !primary || !ids.includes(primary) : d[field] !== null))) {
      unitIssues.push('Primary and active roster disagree.'); assignmentState = 'invalid';
    }
    if (ownership === 'legacy' && active.length) { unitIssues.push('Legacy unit has unexpected roster assignments.'); assignmentState = 'invalid'; }
    if (assignmentState === 'invalid') unitIssues.push('Primary Manager reference needs review.');
    const members = ids.map(id => {
      const p = people.get(id), isEligible = eligible(p, type);
      return { personId: id, fullName: p && named(p.data.fullName) ? p.data.fullName : id, isPrimary: id === primary, eligible: isEligible,
        issues: !p ? ['Person record is unavailable.'] : !isEligible ? ['Current name, position or Active status needs review.'] : [] };
    });
    if (ids.some(id => !people.has(id))) unitIssues.push('An assigned Person record is unavailable.');
    if (ownership === 'legacy' && members.some(p => !p.eligible)) unitIssues.push('Review the legacy manager before activation.');
    return { unitType: type, id: u.id, name: named(d.name) ? d.name : u.id, status: typeof d.status === 'string' ? d.status : 'Unknown', regionId: type === 'district' && canonicalId(d.regionId) ? d.regionId : null,
      version, leadershipVersion, ownership, assignmentState, primaryPersonId: primary, members, storeCount: 0, issues: [...new Set(unitIssues)] };
  });
  for (const location of snapshot.locations) {
    const d = location.data, kind = classifyHierarchyLocationType(d.type);
    if (kind === 'non-retail') continue;
    const district = summaries.find(u => u.unitType === 'district' && u.id === d.districtId);
    const affected = summaries.filter(u => u.unitType === 'district' ? u.id === d.districtId : u.id === d.regionId || u.id === district?.regionId);
    const applicability = resolveHierarchyApplicability(d);
    for (const unit of affected) {
      if (kind === 'retail') unit.storeCount++;
      if (kind !== 'retail' || !district || district.regionId !== d.regionId || applicability.value !== 'Applicable' || applicability.issues.length || !['Active', 'Retired', 'Draft'].includes(d.recordStatus as string)) unit.issues.push('Linked store hierarchy needs review.');
    }
  }
  for (const unit of summaries) unit.issues = [...new Set(unit.issues)];
  const result: OrganizationCatalog = { schemaVersion: 1, complete: true, evaluatedAt: now, issues: [...new Set(issues)], units: summaries.sort((a, b) => leadershipUnitKey(a.unitType, a.id).localeCompare(leadershipUnitKey(b.unitType, b.id))),
    people: snapshot.people.map(p => ({ id: p.id, fullName: named(p.data.fullName) ? p.data.fullName : p.id, eligibleUnitTypes: (['district', 'region'] as const).filter(type => eligible(p, type)) })).sort((a, b) => a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id)) };
  if (Buffer.byteLength(JSON.stringify(result)) > 8_000_000) throw new Error('Projected catalog exceeds response capacity.');
  return result;
}

const inventory = {
  districts: { max: 500, fields: ['id', 'version', 'name', 'status', 'regionId', 'districtManagerId', 'leadershipModelVersion', 'leadershipVersion'] },
  regions: { max: 100, fields: ['id', 'version', 'name', 'status', 'regionalManagerId', 'leadershipModelVersion', 'leadershipVersion'] },
  people: { max: 5000, fields: ['id', 'fullName', 'positionIds', 'status', 'activeStatus'] },
  leadership_assignments: { max: 15000, fields: ['id', 'unitType', 'unitId', 'personId', 'status', 'startedAt', 'endedAt'] },
  locations: { max: 1000, fields: ['id', 'type', 'recordStatus', 'districtId', 'regionId', 'hierarchyApplicability'] },
};
async function readInventory(db: Firestore, tx: Transaction) {
  const snapshot: OrganizationCatalogSnapshot = { units: [], people: [], assignments: [], locations: [] };
  let bytes = 0;
  for (const [collection, config] of Object.entries(inventory)) {
    const result = await tx.get(db.collection(collection).select(...config.fields).limit(config.max + 1));
    if (result.size !== result.docs.length || result.size > config.max) throw new Error('Catalog inventory exceeds complete bounded capacity.');
    for (const doc of result.docs) {
      const raw = doc.data();
      if (!doc.exists || !doc.updateTime || !canonicalId(doc.id) || doc.ref.path !== `${collection}/${doc.id}` || !raw || Object.hasOwn(raw, 'id') && raw.id !== doc.id) throw new Error('Invalid catalog source metadata.');
      // Project again defensively even when a test/adapter returns a broader document than the SDK mask.
      const data = Object.fromEntries(config.fields.filter(f => Object.hasOwn(raw, f)).map(f => [f, raw[f]]));
      bytes += Buffer.byteLength(JSON.stringify({ id: doc.id, data })) + 256;
      if (bytes > 8_000_000) throw new Error('Catalog inventory exceeds byte capacity.');
      const row = { id: doc.id, data };
      if (collection === 'districts' || collection === 'regions') snapshot.units.push({ ...row, unitType: collection === 'districts' ? 'district' : 'region' });
      else if (collection === 'leadership_assignments') snapshot.assignments.push(row);
      else if (collection === 'people') snapshot.people.push(row);
      else snapshot.locations.push(row);
    }
  }
  return snapshot;
}
export async function readOrganizationCatalog(db: Firestore, actor: Account, clock = () => new Date()) {
  assertPersonTransitionActor(actor);
  return db.runTransaction(async tx => {
    await readPersonTransitionAuthority(db, tx, actor);
    return projectOrganizationCatalog(await readInventory(db, tx), clock().toISOString());
  }, { readOnly: true });
}
