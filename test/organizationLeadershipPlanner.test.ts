import test from 'node:test';
import assert from 'node:assert/strict';
import { planOrganizationLeadership, leadershipUnitKey, LeadershipPlanError, type OrganizationLeadershipSnapshot, type OrganizationLeadershipIntent } from '../server/organizationLeadershipPlanner';

const now = '2026-10-28T12:00:00.000Z';
function fixture() {
  const snapshot: OrganizationLeadershipSnapshot = {
    units: [
      { unitType: 'region', id: '01', data: { name: 'West', status: 'Active', version: 1 } },
      { unitType: 'district', id: '01', data: { name: 'Central', regionId: '01', status: 'Active', version: 3, leadershipModelVersion: 1, leadershipVersion: 2, districtManagerId: 'incumbent' } },
      { unitType: 'district', id: '02', data: { name: 'North', regionId: '01', status: 'Active', version: 1, districtManagerId: null } },
    ],
    people: [
      { id: 'incumbent', data: { fullName: 'Current Manager', status: 'Active', activeStatus: true, positionIds: ['district-manager'], version: 1, workEmail: 'PRIVATE@example.test' } },
      { id: 'new-hire', data: { fullName: 'New Manager', status: 'Active', positionIds: ['district-manager', 'regional-manager'], version: 1 } },
    ],
    assignments: [{ id: 'existing', data: { unitType: 'district', unitId: '01', personId: 'incumbent', status: 'active', startedAt: '2026-10-01T00:00:00.000Z', endedAt: null, version: 1 } }],
    locations: [
      { id: 'store-007', data: { storeNumber: '007', name: 'Retail store', type: 'Enclosed Mall', recordStatus: 'Active', districtId: '01', regionId: '01', districtManagerId: 'incumbent', districtManagerName: 'Current Manager', version: 4, address: 'Untouched', storeManagerId: 'other' } },
      { id: 'corporate', data: { name: 'Corporate', type: 'Corporate Office', recordStatus: 'Active', districtId: '01', regionId: '01', version: 1 } },
    ],
    complete: { hierarchy: true, locations: true, assignmentUnits: [leadershipUnitKey('district', '01'), leadershipUnitKey('district', '02'), leadershipUnitKey('region', '01')] },
  };
  const intent: OrganizationLeadershipIntent = { operationId: 'operation-1', units: [{ unitType: 'district', unitId: '01', expectedVersion: 3, expectedLeadershipVersion: 2, activateLegacy: false, memberPersonIds: ['incumbent', 'new-hire'], primaryPersonId: 'incumbent', reason: '' }] };
  return { snapshot, intent };
}
function code(run: () => unknown, expected: LeadershipPlanError['code']) {
  assert.throws(run, error => error instanceof LeadershipPlanError && error.code === expected);
}

test('additional DM without a workplace preserves Primary, store membership, contacts and account state', () => {
  const { snapshot, intent } = fixture(), before = structuredClone(snapshot);
  const result = planOrganizationLeadership(intent, snapshot, now);
  assert.equal(result.review[0].primaryPersonId, 'incumbent');
  assert.deepEqual(result.review[0].members.map(m => [m.personId, m.isPrimary]), [['incumbent', true], ['new-hire', false]]);
  assert.deepEqual(result.writes.map(w => w.collection).sort(), ['districts', 'leadership_assignments']);
  assert.equal(result.writes.some(w => w.collection === 'locations'), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.deepEqual(snapshot, before);
  assert.equal(snapshot.people[1].data.primaryLocationId, undefined);
});

test('unresolved retained incumbents warn without blocking an eligible Additional manager', () => {
  for (const change of [{ status: 'Inactive', activeStatus: false }, { positionIds: [] }, { fullName: '' }]) {
    const { snapshot, intent } = fixture();
    Object.assign(snapshot.people[0].data, change);
    const result = planOrganizationLeadership(intent, snapshot, now);
    assert.match(result.review[0].members[0].eligibilityIssue!, /Existing assignment needs review/);
    assert.equal(result.review[0].members[0].isPrimary, true);
    assert.equal(result.writes.some(w => w.collection === 'locations'), false);
    assert.equal(result.review[0].members[1].eligibilityIssue, undefined);
  }
});

test('an unresolved existing Additional cannot be promoted; an inactive incumbent can be demoted and retained', () => {
  const { snapshot, intent } = fixture();
  snapshot.assignments.push({ id: 'additional', data: { unitType: 'district', unitId: '01', personId: 'new-hire', status: 'active', startedAt: '2026-10-01T00:00:00.000Z', endedAt: null, version: 1 } });
  snapshot.people[1].data.status = 'Inactive';
  intent.units[0].primaryPersonId = 'new-hire'; intent.units[0].reason = 'Reviewed handover';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible');
  snapshot.people[1].data.status = 'Active';
  snapshot.people[0].data.status = 'Inactive'; snapshot.people[0].data.activeStatus = false;
  const result = planOrganizationLeadership(intent, snapshot, now);
  assert.equal(result.review[0].members[0].isPrimary, false);
  assert.match(result.review[0].members[0].eligibilityIssue!, /Existing assignment/);
  assert.equal(result.review[0].members[1].isPrimary, true);
});

test('explicit Primary handover retains the outgoing manager as additional and patches only compatibility fields', () => {
  const { snapshot, intent } = fixture();
  intent.units[0].primaryPersonId = 'new-hire'; intent.units[0].reason = 'Approved handover';
  const r = planOrganizationLeadership(intent, snapshot, now);
  assert.equal(r.review[0].reason, 'Approved handover');
  assert.deepEqual(r.review[0].members.map(m => [m.personId, m.isPrimary]), [['incumbent', false], ['new-hire', true]]);
  const w = r.writes.find(w => w.collection === 'locations')!;
  assert.equal(w.id, 'store-007'); assert.equal(w.expectedVersion, 4);
  assert.deepEqual(w.set, { districtManagerId: 'new-hire', districtManagerName: 'New Manager', version: 5, updatedAt: now });
  assert.equal(r.writes.some(w => w.id === 'corporate'), false);
  assert.equal(r.writes.some(w => Object.hasOwn(w.set, 'districtId') || Object.hasOwn(w.set, 'regionId')), false);
});

test('Region and District 01 are different identities; Corporate workplace never supplies leadership scope', () => {
  const { snapshot, intent } = fixture();
  snapshot.people[1].data.primaryLocationId = 'corporate';
  intent.units.push({ unitType: 'region', unitId: '01', expectedVersion: 1, expectedLeadershipVersion: 0, activateLegacy: true, memberPersonIds: ['new-hire'], primaryPersonId: 'new-hire', reason: 'Reviewed Region activation' });
  const r = planOrganizationLeadership(intent, snapshot, now);
  assert.equal(r.review.length, 2);
  assert.equal(r.writes.filter(w => w.collection === 'leadership_assignments').length, 2);
  assert.notEqual(...r.writes.filter(w => w.collection === 'leadership_assignments').map(w => w.id) as [string, string]);
  const store = r.writes.find(w => w.collection === 'locations')!;
  assert.equal(store.set.regionalManagerId, 'new-hire'); assert.equal(store.set.districtManagerId, undefined);
  assert.equal(r.writes.some(w => w.id === 'corporate'), false);
});

test('vacancy explicitly ends every active tenure without deleting history', () => {
  const { snapshot, intent } = fixture();
  intent.units[0].memberPersonIds = []; intent.units[0].primaryPersonId = null; intent.units[0].reason = 'Reviewed vacancy';
  const r = planOrganizationLeadership(intent, snapshot, now);
  assert.deepEqual(r.writes.find(w => w.id === 'existing')!.set, { status: 'ended', endedAt: now, version: 2, updatedAt: now });
  assert.equal(r.writes.find(w => w.collection === 'districts')!.set.districtManagerId, null);
  assert.equal(r.writes.find(w => w.collection === 'locations')!.set.districtManagerId, null);
  assert.deepEqual(r.review[0].ended, ['incumbent']);
});

test('legacy activation is explicit and never infers a DM from store copies', () => {
  const { snapshot, intent } = fixture();
  intent.units = [{ ...intent.units[0], unitId: '02', expectedVersion: 1, expectedLeadershipVersion: 0, activateLegacy: true, memberPersonIds: [], primaryPersonId: null, reason: 'Confirm vacancy' }];
  const r = planOrganizationLeadership(intent, snapshot, now);
  assert.equal(r.review[0].activating, true); assert.equal(r.review[0].members.length, 0);
  intent.units[0].activateLegacy = false;
  code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
});

test('no automatic promotion when a Primary is removed or the first member is added', () => {
  const { snapshot, intent } = fixture();
  intent.units[0].memberPersonIds = ['new-hire'];
  code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
  intent.units[0] = { ...intent.units[0], unitId: '02', expectedVersion: 1, expectedLeadershipVersion: 0, activateLegacy: true, primaryPersonId: null };
  code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
});

for (const [name, change] of [
  ['typed title without controlled positions', p => { delete p.positionIds; p.jobTitle = 'District Manager'; }],
  ['inactive person', p => { p.status = 'Inactive'; }],
  ['ambiguous lifecycle', p => { p.status = 'Inactive'; p.activeStatus = true; }],
  ['wrong position', p => { p.positionIds = ['store-manager']; }],
] as [string, (p: Record<string, unknown>) => void][]) test('new assignments refuse ' + name, () => {
  const { snapshot, intent } = fixture(); change(snapshot.people[1].data);
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible');
});

test('retired parent, missing Person and incomplete sources fail rather than becoming vacancies', () => {
  let { snapshot, intent } = fixture(); snapshot.units[0].data.status = 'Retired';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible');
  ({ snapshot, intent } = fixture()); snapshot.people.pop();
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  ({ snapshot, intent } = fixture()); snapshot.complete.assignmentUnits = [];
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
});

test('unit and membership changes are represented by version and full-query preconditions', () => {
  const { snapshot, intent } = fixture();
  const r = planOrganizationLeadership(intent, snapshot, now);
  snapshot.locations.push({ id: 'new-store', data: { name: 'New store', storeNumber: '008', type: 'Enclosed Mall', recordStatus: 'Active', regionId: '01', districtId: '01', version: 0 } });
  const next = planOrganizationLeadership(intent, snapshot, now);
  assert.notEqual(r.preconditions.storeMembership, next.preconditions.storeMembership);
  snapshot.units[1].data.leadershipVersion = 3;
  code(() => planOrganizationLeadership(intent, snapshot, now), 'conflict');
});

test('malformed, duplicate and unsupported roster data is not silently repaired', () => {
  let { snapshot, intent } = fixture(); snapshot.assignments.push({ ...structuredClone(snapshot.assignments[0]), id: 'duplicate' });
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  ({ snapshot, intent } = fixture()); snapshot.assignments[0].data.personId = '';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  ({ snapshot, intent } = fixture()); snapshot.units[1].data.leadershipModelVersion = 2;
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  ({ snapshot, intent } = fixture()); snapshot.units[1].data.id = 'forged-unit';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  ({ snapshot, intent } = fixture()); delete snapshot.units[1].data.leadershipVersion;
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
});

test('unknown input fields, duplicate members/units and no-op actions are refused', () => {
  let { snapshot, intent } = fixture();
  code(() => planOrganizationLeadership({ ...intent, firebaseUid: 'forged' }, snapshot, now), 'invalid_input');
  intent.units[0].memberPersonIds.push('new-hire'); code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
  ({ snapshot, intent } = fixture()); intent.units.push(structuredClone(intent.units[0])); code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
  ({ snapshot, intent } = fixture()); intent.units[0].memberPersonIds = ['incumbent']; code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
  ({ snapshot, intent } = fixture()); intent.units[0].memberPersonIds = ['incumbent', , 'new-hire']; code(() => planOrganizationLeadership(intent, snapshot, now), 'invalid_input');
});

test('atomic bound refusal cannot leave a partial multi-unit plan or mutate inputs', () => {
  const { snapshot, intent } = fixture();
  intent.units[0].primaryPersonId = 'new-hire'; intent.units[0].reason = 'Reviewed handover';
  for (let i = 0; i < 200; i++) snapshot.locations.push({ id: 'large-' + i, data: { type: 'Enclosed Mall', recordStatus: 'Active', districtId: '01', regionId: '01', districtManagerId: 'incumbent', districtManagerName: 'Current Manager', version: 0 } });
  const before = structuredClone(snapshot);
  code(() => planOrganizationLeadership(intent, snapshot, now), 'capacity'); assert.deepEqual(snapshot, before);
});

test('deterministic assignment IDs require receipt reconciliation after an uncertain commit', () => {
  const { snapshot, intent } = fixture();
  const a = planOrganizationLeadership(intent, snapshot, now).writes.find(w => w.collection === 'leadership_assignments')!;
  snapshot.assignments.push({ id: a.id, data: { ...a.set, status: 'ended', endedAt: now } });
  code(() => planOrganizationLeadership(intent, snapshot, now), 'conflict');
});

test('inconsistent relevant store hierarchy blocks Primary changes but excludes Corporate coverage', () => {
  const { snapshot, intent } = fixture();
  intent.units[0].primaryPersonId = 'new-hire'; intent.units[0].reason = 'Approved handover';
  snapshot.locations[0].data.regionId = 'wrong';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible');
});

test('unsupported applicability and unknown store lifecycle cannot be certified during handover', () => {
  const { snapshot, intent } = fixture(); intent.units[0].primaryPersonId = 'new-hire'; intent.units[0].reason = 'Reviewed handover';
  snapshot.locations[0].data.hierarchyApplicability = 'invented';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible');
  delete snapshot.locations[0].data.hierarchyApplicability; snapshot.locations[0].data.recordStatus = 'unknown';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible');
});

test('immediate-only planner rejects impossible clocks and scheduled or reversed assignment periods', () => {
  const { snapshot, intent } = fixture();
  code(() => planOrganizationLeadership(intent, snapshot, '2026-99-99T00:00:00.000Z'), 'invalid_input');
  snapshot.assignments[0].data.startedAt = '2027-01-01T00:00:00.000Z';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  snapshot.assignments[0].data.startedAt = '2026-10-01T00:00:00.000Z';
  snapshot.assignments[0].data.status = 'ended'; snapshot.assignments[0].data.endedAt = '2025-01-01T00:00:00.000Z';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
  snapshot.assignments[0].data.startedAt = 'October 1, 2026';
  code(() => planOrganizationLeadership(intent, snapshot, now), 'incomplete_source');
});

test('exact atomic write limit succeeds; one more change is rejected before returning a plan', () => {
  const { snapshot, intent } = fixture(); intent.units[0].primaryPersonId = 'new-hire'; intent.units[0].reason = 'Approved handover';
  for (let i = 0; i < 197; i++) snapshot.locations.push({ id: 'bounded-' + i, data: { type: 'Enclosed Mall', recordStatus: 'Active', districtId: '01', regionId: '01', districtManagerId: 'incumbent', districtManagerName: 'Current Manager', version: 0 } });
  assert.equal(planOrganizationLeadership(intent, snapshot, now).writes.length, 200);
  snapshot.locations.push({ id: 'one-too-many', data: { ...snapshot.locations[0].data } });
  code(() => planOrganizationLeadership(intent, snapshot, now), 'capacity');
});

test('unsafe record or leadership version increments never create corrupt future versions', () => {
  let { snapshot, intent } = fixture(); snapshot.units[1].data.version = Number.MAX_SAFE_INTEGER; intent.units[0].expectedVersion = Number.MAX_SAFE_INTEGER;
  code(() => planOrganizationLeadership(intent, snapshot, now), 'conflict');
  ({ snapshot, intent } = fixture()); snapshot.units[1].data.leadershipVersion = Number.MAX_SAFE_INTEGER; intent.units[0].expectedLeadershipVersion = Number.MAX_SAFE_INTEGER;
  code(() => planOrganizationLeadership(intent, snapshot, now), 'conflict');
});

test('later unit failure discards the entire multi-unit dry run without touching input', () => {
  const { snapshot, intent } = fixture();
  intent.units.push({ unitType: 'region', unitId: '01', expectedVersion: 1, expectedLeadershipVersion: 0, activateLegacy: true, memberPersonIds: ['incumbent'], primaryPersonId: 'incumbent', reason: 'Reviewed assignment' });
  const before = structuredClone(snapshot);
  code(() => planOrganizationLeadership(intent, snapshot, now), 'ineligible'); // incumbent has no RM position
  assert.deepEqual(snapshot, before);
});
