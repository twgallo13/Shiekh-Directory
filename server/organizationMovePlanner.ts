import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { canonicalTransitionJSON as canonical } from '../src/lib/personTransitionIntent';
import { classifyHierarchyLocationType, resolveHierarchyApplicability } from '../src/lib/hierarchyResolution';
import { allowsLeadershipPosition } from '../src/lib/personPositions';
import { personLifecycle } from '../src/lib/personLifecycle';
import { canonicalId } from './personnelProjection';
import { LeadershipPlanError, leadershipUnitKey, validateOrganizationSource, type OrganizationLeadershipSnapshot, type LeadershipUnitSource, type LeadershipPatch } from './organizationLeadershipPlanner';

import type { OrganizationMoveIntent, OrganizationMoveReview } from '../src/lib/organizationMoveContract';
export type { OrganizationMoveIntent } from '../src/lib/organizationMoveContract';
const fail = (code: LeadershipPlanError['code'], message: string): never => { throw new LeadershipPlanError(code, message); };
const version = (value: unknown) => value === undefined ? 0 : Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fail('incomplete_source', 'Resolve source versions before reviewing a move.');
const hash = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
const named = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 1000 && !/[\u0000-\u001f\u007f]/.test(value);
export function normalizeOrganizationMoveIntent(value: unknown): OrganizationMoveIntent {
  const keys = ['schemaVersion', 'operationId', 'kind', 'id', 'expectedVersion', 'targetId', 'expectedTargetVersion', 'reason'];
  const v = value as OrganizationMoveIntent;
  if (!v || typeof v !== 'object' || Object.getPrototypeOf(v) !== Object.prototype || Object.keys(v).length !== keys.length || keys.some(k => !Object.hasOwn(v, k))
    || v.schemaVersion !== 1 || !canonicalId(v.operationId) || !['store', 'district'].includes(v.kind) || !canonicalId(v.id) || !canonicalId(v.targetId)
    || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0 || !Number.isSafeInteger(v.expectedTargetVersion) || v.expectedTargetVersion < 0
    || !named(v.reason) || v.reason.trim().length < 5 || v.reason.length > 500) fail('invalid_input', 'Provide one exact reviewed hierarchy move with a reason.');
  return structuredClone(v);
}

/** Pure internal dry run. No I/O, authentication, native transaction, receipt, API or write authority.
 * Caller completeness attestations must eventually come from a bounded coherent server loader.
 * Only managed Active units are supported; legacy/unresolved hierarchy needs explicit setup/repair.
 */
export function planOrganizationMove(raw: unknown, snapshot: OrganizationLeadershipSnapshot, now: string) {
  const intent = normalizeOrganizationMoveIntent(raw);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(now) || !Number.isFinite(Date.parse(now)) || new Date(now).toISOString() !== now) fail('invalid_input', 'Use authoritative UTC time.');
  validateOrganizationSource(snapshot, now);
  const readUnits = new Map<string, LeadershipUnitSource>(), readPeople = new Set<string>();
  const unit = (type: 'region' | 'district', id: unknown) => {
    const row = snapshot.units.find(u => u.unitType === type && u.id === id);
    if (!row || row.data.status !== 'Active' || !named(row.data.name) || row.data.leadershipModelVersion !== 1
      || !Number.isSafeInteger(row.data.leadershipVersion) || Number(row.data.leadershipVersion) < 0
      || !snapshot.complete.assignmentUnits.includes(leadershipUnitKey(type, row.id))) fail('incomplete_source', 'Review complete Active managed units before moving hierarchy membership.');
    readUnits.set(leadershipUnitKey(type, row.id), row); return row;
  };
  const leader = (u: LeadershipUnitSource) => {
    const rows = snapshot.assignments.filter(a => a.data.unitType === u.unitType && a.data.unitId === u.id && a.data.status === 'active');
    const field = u.unitType === 'district' ? 'districtManagerId' : 'regionalManagerId', primary = u.data[field];
    if (rows.length > 25 || new Set(rows.map(a => a.data.personId)).size !== rows.length || (rows.length ? !canonicalId(primary) || !rows.some(a => a.data.personId === primary) : primary !== null)) fail('incomplete_source', 'Resolve the unit roster and Primary before moving hierarchy membership.');
    for (const row of rows) {
      const p = snapshot.people.find(p => p.id === row.data.personId);
      if (!p || personLifecycle(p.data) !== 'active' || !allowsLeadershipPosition(p.data, u.unitType === 'district' ? 'District Manager' : 'Regional Manager') || !named(p.data.fullName)) fail('ineligible', 'Resolve current manager eligibility before changing unit coverage.');
      readPeople.add(p.id);
    }
    return { id: primary as string | null, name: primary === null ? '' : snapshot.people.find(p => p.id === primary)!.data.fullName as string };
  };
  const sourceLocation = intent.kind === 'store' ? snapshot.locations.find(l => l.id === intent.id) : undefined;
  if (intent.kind === 'store' && !sourceLocation) fail('incomplete_source', 'Exact store source is missing.');
  const district = unit('district', intent.kind === 'district' ? intent.id : sourceLocation!.data.districtId);
  const oldRegion = unit('region', district.data.regionId);
  const targetDistrict = intent.kind === 'store' ? unit('district', intent.targetId) : district;
  const targetRegion = unit('region', intent.kind === 'district' ? intent.targetId : targetDistrict.data.regionId);
  const source = intent.kind === 'store' ? sourceLocation! : district, target = intent.kind === 'store' ? targetDistrict : targetRegion;
  if (version(source.data.version) !== intent.expectedVersion || version(target.data.version) !== intent.expectedTargetVersion) fail('conflict', 'Source or destination changed. Review the move again.');
  if (intent.kind === 'store' ? district.id === targetDistrict.id : oldRegion.id === targetRegion.id) fail('invalid_input', 'This move makes no membership change.');
  const oldDM = leader(district), oldRM = leader(oldRegion), newDM = leader(targetDistrict), newRM = leader(targetRegion);
  const locations = intent.kind === 'store' ? [sourceLocation!] : snapshot.locations.filter(l => l.data.districtId === district.id);
  const writes: LeadershipPatch[] = [];
  const put = (collection: 'locations' | 'districts', row: { id: string; data: Record<string, unknown> }, fields: Record<string, unknown>) => {
    const current = version(row.data.version); if (current >= Number.MAX_SAFE_INTEGER) fail('conflict', 'Record version cannot advance safely.');
    const changed = Object.fromEntries(Object.entries(fields).filter(([k, value]) => !isDeepStrictEqual(row.data[k], value)));
    if (Object.keys(changed).length) writes.push({ collection, id: row.id, expectedVersion: current, set: { ...changed, version: current + 1, updatedAt: now } });
  };
  const copies: { id: string; storeNumber: string; name: string; recordStatus: string }[] = [];
  let excludedNonRetail = 0;
  for (const location of locations) {
    const l = location.data, kind = classifyHierarchyLocationType(l.type);
    if (kind === 'non-retail' && intent.kind === 'district') { excludedNonRetail++; continue; }
    const applicability = resolveHierarchyApplicability(l);
    if (kind !== 'retail' || applicability.value !== 'Applicable' || applicability.issues.length || !['Active', 'Retired', 'Draft'].includes(l.recordStatus as string)
      || l.regionId !== oldRegion.id || l.districtId !== district.id || !named(l.name) || !named(l.storeNumber)) fail('incomplete_source', 'Resolve every affected retail hierarchy before moving; Corporate and unknown types are not stores.');
    for (const [field, manager] of [['districtManagerId', oldDM], ['regionalManagerId', oldRM]] as const) {
      const copied = l[field] === undefined || l[field] === '' ? null : l[field];
      if (copied !== manager.id || (l[field.replace(/Id$/, 'Name')] ?? '') !== manager.name) fail('incomplete_source', 'Resolve stale inherited manager copies before moving a store.');
    }
    copies.push({ id: location.id, storeNumber: l.storeNumber as string, name: l.name as string, recordStatus: l.recordStatus as string });
    put('locations', location, { districtId: targetDistrict.id, regionId: targetRegion.id, districtManagerId: newDM.id, districtManagerName: newDM.name, regionalManagerId: newRM.id, regionalManagerName: newRM.name });
  }
  if (intent.kind === 'district') put('districts', district, { regionId: targetRegion.id });
  if (writes.length > 200) fail('capacity', 'The reviewed move exceeds atomic planning capacity. Nothing was saved.');
  writes.sort((a, b) => `${a.collection}/${a.id}`.localeCompare(`${b.collection}/${b.id}`));
  const review: OrganizationMoveReview = { kind: intent.kind, id: intent.id, name: source.data.name as string, reason: intent.reason.trim(),
    before: { districtId: district.id, districtName: district.data.name as string, regionId: oldRegion.id, regionName: oldRegion.data.name as string, districtManager: oldDM, regionalManager: oldRM },
    after: { districtId: targetDistrict.id, districtName: targetDistrict.data.name as string, regionId: targetRegion.id, regionName: targetRegion.data.name as string, districtManager: newDM, regionalManager: newRM },
    stores: copies.sort((a, b) => a.id.localeCompare(b.id)), excludedNonRetail, businessDocuments: writes.length };
  const preconditions = {
    units: [...readUnits].map(([key, u]) => ({ key, version: version(u.data.version), fingerprint: hash(u.data) })).sort((a, b) => a.key.localeCompare(b.key)),
    people: [...readPeople].sort().map(id => { const p = snapshot.people.find(p => p.id === id)!; return { id, version: version(p.data.version), fingerprint: hash({ fullName: p.data.fullName, positionIds: p.data.positionIds, status: p.data.status ?? null, activeStatus: p.data.activeStatus ?? null }) }; }),
    storeMembership: hash(snapshot.locations.map(l => ({ id: l.id, version: version(l.data.version), districtId: l.data.districtId ?? null, regionId: l.data.regionId ?? null, type: l.data.type ?? null, recordStatus: l.data.recordStatus ?? null, hierarchyApplicability: l.data.hierarchyApplicability ?? null })).sort((a, b) => a.id.localeCompare(b.id))),
    rosters: [...readUnits.keys()].sort().map(key => ({ key, fingerprint: hash(snapshot.assignments.filter(a => leadershipUnitKey(a.data.unitType as 'district' | 'region', String(a.data.unitId)) === key).sort((a, b) => a.id.localeCompare(b.id))) })),
    changedLocations: locations.filter(l => writes.some(w => w.collection === 'locations' && w.id === l.id)).map(l => ({ id: l.id, fingerprint: hash(l.data) })).sort((a, b) => a.id.localeCompare(b.id)),
  };
  const estimatedAtomicBytes = Buffer.byteLength(canonical({ writes, review, preconditions })) * 3 + 8192;
  if (estimatedAtomicBytes > 8_000_000) fail('capacity', 'The reviewed move exceeds byte planning capacity. Nothing was saved.');
  return { operationId: intent.operationId, plannedAt: now, review, writes, preconditions, estimatedAtomicBytes };
}
