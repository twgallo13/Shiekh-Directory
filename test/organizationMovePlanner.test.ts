import test from 'node:test';
import assert from 'node:assert/strict';
import { planOrganizationMove, type OrganizationMoveIntent } from '../server/organizationMovePlanner';
import { leadershipUnitKey, type OrganizationLeadershipSnapshot } from '../server/organizationLeadershipPlanner';

const now = '2026-10-28T12:00:00.000Z';
function fixture() {
  const snapshot: OrganizationLeadershipSnapshot = { units: [], assignments: [], people: [], locations: [], complete: { hierarchy: true, locations: true, assignmentUnits: [] } };
  for (const id of ['01', '02']) for (const type of ['district', 'region'] as const) {
    const personId = `${type}-${id}`, pointer = type === 'district' ? 'districtManagerId' : 'regionalManagerId';
    snapshot.units.push({ unitType: type, id, data: { name: `${type} ${id}`, status: 'Active', version: 1, leadershipModelVersion: 1, leadershipVersion: 1, [pointer]: personId, ...(type === 'district' ? { regionId: id } : {}) } });
    snapshot.people.push({ id: personId, data: { fullName: personId, positionIds: [type === 'district' ? 'district-manager' : 'regional-manager'], status: 'Active', version: 1, workEmail: 'PRIVATE_CONTACT' } });
    snapshot.assignments.push({ id: `tenure-${personId}`, data: { unitType: type, unitId: id, personId, status: 'active', startedAt: now, endedAt: null, version: 1 } });
    snapshot.complete.assignmentUnits.push(leadershipUnitKey(type, id));
  }
  snapshot.locations.push({ id: 'store-007', data: { name: 'Store', storeNumber: '007', type: 'Enclosed Mall', recordStatus: 'Active', version: 1, districtId: '01', regionId: '01', districtManagerId: 'district-01', districtManagerName: 'district-01', regionalManagerId: 'region-01', regionalManagerName: 'region-01', storeManagerId: 'store-person', address: 'PRIVATE_ADDRESS' } });
  const intent: OrganizationMoveIntent = { schemaVersion: 1, operationId: 'move-1', kind: 'store', id: 'store-007', expectedVersion: 1, targetId: '02', expectedTargetVersion: 1, reason: 'Explicit reviewed move' };
  return { snapshot, intent };
}
test('store follows target District and Region managers, preserves other staff and exposes no contacts', () => {
  const { snapshot, intent } = fixture(), before = structuredClone(snapshot);
  const plan = planOrganizationMove(intent, snapshot, now);
  assert.deepEqual(plan.writes[0].set, { districtId: '02', regionId: '02', districtManagerId: 'district-02', districtManagerName: 'district-02', regionalManagerId: 'region-02', regionalManagerName: 'region-02', version: 2, updatedAt: now });
  assert.equal(plan.writes.length, 1); assert.equal(plan.review.stores[0].storeNumber, '007');
  assert.equal(JSON.stringify(plan).includes('PRIVATE'), false);
  assert.equal(plan.writes.some(w => w.collection === 'leadership_assignments'), false);
  assert.deepEqual(snapshot, before);
});
test('district parent move updates every retail state, excludes Corporate and retains District DM', () => {
  const { snapshot, intent } = fixture(); Object.assign(intent, { kind: 'district', id: '01' });
  for (const status of ['Retired', 'Draft']) snapshot.locations.push({ id: status, data: { ...snapshot.locations[0].data, storeNumber: status, recordStatus: status } });
  snapshot.locations.push({ id: 'corporate', data: { type: 'Corporate Office', districtId: '01', regionId: '01', name: 'Corporate' } });
  const plan = planOrganizationMove(intent, snapshot, now);
  assert.equal(plan.writes.length, 4); assert.equal(plan.review.stores.length, 3); assert.equal(plan.review.excludedNonRetail, 1);
  assert.deepEqual(plan.writes.find(w => w.collection === 'districts')!.set, { regionId: '02', version: 2, updatedAt: now });
  for (const w of plan.writes.filter(w => w.collection === 'locations')) {
    assert.equal(w.set.regionalManagerId, 'region-02'); assert.equal(w.set.regionId, '02');
    assert.equal(Object.hasOwn(w.set, 'districtId'), false); assert.equal(Object.hasOwn(w.set, 'districtManagerId'), false);
  }
});
test('explicit target vacancies are inherited without selecting an eligible but unassigned Person', () => {
  const { snapshot, intent } = fixture();
  snapshot.assignments = snapshot.assignments.filter(a => a.data.unitId !== '02');
  for (const u of snapshot.units.filter(u => u.id === '02')) u.data[u.unitType === 'district' ? 'districtManagerId' : 'regionalManagerId'] = null;
  const plan = planOrganizationMove(intent, snapshot, now);
  assert.equal(plan.writes[0].set.districtManagerId, null); assert.equal(plan.writes[0].set.regionalManagerId, null);
  assert.equal(plan.writes[0].set.districtManagerName, '');
});
test('unsupported/legacy/retired/missing or unreviewed unit sources fail closed', () => {
  for (const mutate of [
    (s: OrganizationLeadershipSnapshot) => delete s.units[2].data.leadershipModelVersion,
    (s: OrganizationLeadershipSnapshot) => s.units[2].data.status = 'Retired',
    (s: OrganizationLeadershipSnapshot) => s.units[2].data.leadershipModelVersion = 99,
    (s: OrganizationLeadershipSnapshot) => s.complete.assignmentUnits = [],
    (s: OrganizationLeadershipSnapshot) => s.units = s.units.filter(u => !(u.unitType === 'region' && u.id === '02')),
    (s: OrganizationLeadershipSnapshot) => s.assignments.push({ ...s.assignments[2], id: 'duplicate-person' }),
  ]) { const { snapshot, intent } = fixture(); mutate(snapshot); assert.throws(() => planOrganizationMove(intent, snapshot, now)); }
});
test('new coverage cannot target unresolved manager eligibility or missing exact Person', () => {
  for (const changes of [{ status: 'Inactive' }, { positionIds: ['other'] }, { fullName: '' }]) {
    const { snapshot, intent } = fixture(); Object.assign(snapshot.people[2].data, changes); assert.throws(() => planOrganizationMove(intent, snapshot, now), /eligibility/);
  }
  const { snapshot, intent } = fixture(); snapshot.people.splice(2, 1); assert.throws(() => planOrganizationMove(intent, snapshot, now), /eligibility/);
});
test('stale versions, no-op moves and caller-controlled patch fields are rejected', () => {
  const { snapshot, intent } = fixture();
  for (const change of [{ expectedVersion: 2 }, { expectedTargetVersion: 2 }, { targetId: '01' }, { patch: {} }, { reason: '' }]) assert.throws(() => planOrganizationMove({ ...intent, ...change }, snapshot, now));
  assert.throws(() => planOrganizationMove(intent, snapshot, 'not a date'));
});
test('unknown types, stale hierarchy and copied manager disagreements cannot be silently moved', () => {
  for (const changes of [{ type: 'Unknown' }, { type: 'Corporate Office' }, { regionId: '02' }, { districtManagerId: 'other' }, { regionalManagerName: 'Stale' }, { hierarchyApplicability: 'Not Applicable' }]) {
    const { snapshot, intent } = fixture(); Object.assign(snapshot.locations[0].data, changes); assert.throws(() => planOrganizationMove(intent, snapshot, now));
  }
});
test('parent move refuses an unclassified linked Location rather than silently excluding it', () => {
  const { snapshot, intent } = fixture(); Object.assign(intent, { kind: 'district', id: '01' });
  snapshot.locations.push({ id: 'unknown', data: { ...snapshot.locations[0].data, type: 'Unknown' } });
  assert.throws(() => planOrganizationMove(intent, snapshot, now));
});
test('complete membership, manager and roster changes alter bound preconditions', () => {
  const { snapshot, intent } = fixture(), first = planOrganizationMove(intent, snapshot, now);
  snapshot.locations.push({ id: 'new-store', data: { ...snapshot.locations[0].data, storeNumber: '008' } });
  const second = planOrganizationMove(intent, snapshot, now); assert.notEqual(first.preconditions.storeMembership, second.preconditions.storeMembership);
  snapshot.people[2].data.fullName = 'Renamed target';
  const third = planOrganizationMove(intent, snapshot, now); assert.notDeepEqual(second.preconditions.people, third.preconditions.people);
});
test('write-cap boundary and unsafe version reject without a partial plan', () => {
  const { snapshot, intent } = fixture(); Object.assign(intent, { kind: 'district', id: '01' });
  for (let i = 1; i < 199; i++) snapshot.locations.push({ id: `store-${i}`, data: { ...snapshot.locations[0].data, storeNumber: String(i) } });
  assert.equal(planOrganizationMove(intent, snapshot, now).writes.length, 200);
  snapshot.locations.push({ id: 'overflow', data: { ...snapshot.locations[0].data, storeNumber: 'over' } });
  assert.throws(() => planOrganizationMove(intent, snapshot, now), /capacity/);
  const f = fixture(); f.snapshot.locations[0].data.version = Number.MAX_SAFE_INTEGER; f.intent.expectedVersion = Number.MAX_SAFE_INTEGER;
  assert.throws(() => planOrganizationMove(f.intent, f.snapshot, now), /safely/);
});

test('source query order does not change the reviewed move or its preconditions', () => {
  const { snapshot, intent } = fixture(); Object.assign(intent, { kind: 'district', id: '01' });
  snapshot.locations.push({ id: 'second', data: { ...snapshot.locations[0].data, storeNumber: '008' } });
  const first = planOrganizationMove(intent, snapshot, now);
  snapshot.locations.reverse(); snapshot.people.reverse(); snapshot.units.reverse(); snapshot.assignments.reverse();
  assert.deepEqual(planOrganizationMove(intent, snapshot, now), first);
});
