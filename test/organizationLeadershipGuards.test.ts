import test from 'node:test';
import assert from 'node:assert/strict';
import type { DirectoryWrite } from '../server/firestoreDirectory';
import { assertOrganizationTransitionCompatibility, readOrganizationGuardState, validateOrganizationLeadershipWrites as validate, type OrganizationGuardState } from '../server/organizationLeadershipGuards';
import { leadershipFixture } from './helpers/organizationLeadershipFixture';

function fixture() {
  const f = leadershipFixture();
  const state: OrganizationGuardState = {
    units: [...f.records].filter(([p]) => p.startsWith('regions/') || p.startsWith('districts/')).map(([path, data]) => ({ unitType: path.startsWith('regions/') ? 'region' : 'district', id: path.split('/')[1], data })),
    assignments: [{ id: 'existing', unitType: 'district', unitId: '01', personId: 'incumbent', status: 'active' }],
  };
  const people = [...f.records].filter(([path]) => path.startsWith('people/')).map(([path, data]) => ({ id: path.split('/')[1], ...data }));
  const write = (collection: DirectoryWrite['collection'], id: string, changes: Record<string, unknown> = {}) => {
    const before = f.records.get(`${collection}/${id}`), data = { ...before, ...changes };
    return { before, value: { collection, id, operation: 'set', data } as DirectoryWrite };
  };
  return { ...f, faults: f.state, state, people, write };
}

test('legacy-only reads add no query and retain the existing scalar handover path', async () => {
  const f = fixture(); delete f.state.units.find(u => u.unitType === 'district')!.data.leadershipModelVersion;
  delete f.state.units.find(u => u.unitType === 'district')!.data.leadershipVersion;
  const state = await readOrganizationGuardState(f.firestore, f.transaction, f.state.units);
  assert.equal(f.reads.length, 0);
  const w = f.write('districts', '01', { districtManagerId: 'new-hire' });
  assert.doesNotThrow(() => validate([w.value], [w.before], state, f.people));
});

test('activated reads establish complete bounded assignment identities without contacts', async () => {
  const f = fixture(), state = await readOrganizationGuardState(f.firestore, f.transaction, f.state.units);
  assert.equal(state.assignments.length, 1);
  assert.deepEqual(f.reads[0].fields, ['unitType', 'unitId', 'personId', 'status']);
  assert.equal(f.reads[0].maximum, 15001);
  f.faults.fail = 'leadership_assignments';
  await assert.rejects(readOrganizationGuardState(f.firestore, f.transaction, f.state.units));
});

test('generic writes cannot activate, downgrade or change managed staffing/parents', () => {
  const f = fixture();
  for (const changes of [{ leadershipModelVersion: undefined }, { leadershipModelVersion: 0 }, { districtManagerId: 'new-hire' }, { regionId: 'other' }, { arbitrary: true }]) {
    const w = f.write('districts', '01', changes);
    assert.throws(() => validate([w.value], [w.before], f.state, f.people), /organization workflow/);
  }
  const region = f.write('regions', '01', { leadershipModelVersion: 1, leadershipVersion: 1 });
  assert.throws(() => validate([region.value], [region.before], f.state, f.people), /server-command/);
});

test('managed renames preserve stable references and reject unsafe names and combined writes', () => {
  const f = fixture(), w = f.write('districts', '01', { name: 'Renamed' });
  assert.doesNotThrow(() => validate([w.value], [w.before], f.state, f.people));
  for (const name of ['', ' ', 'a\u0000b', 'x'.repeat(1001)]) {
    const bad = f.write('districts', '01', { name });
    assert.throws(() => validate([bad.value], [bad.before], f.state, f.people), /organization workflow/);
  }
  assert.throws(() => validate([w.value, w.value], [w.before, w.before], f.state, f.people), /organization workflow/);
  assert.throws(() => validate([{ collection: 'districts', id: '01', operation: 'delete' }], [w.before], f.state, f.people), /organization workflow/);
});

test('managed retirement requires vacancy and retired vacant units remain valid dormant sources', () => {
  const f = fixture(), occupied = f.write('districts', '01', { status: 'Retired' });
  assert.throws(() => validate([occupied.value], [occupied.before], f.state, f.people), /Primary\/Additional/);
  f.state.assignments = [];
  const district = f.state.units.find(u => u.unitType === 'district')!;
  district.data.districtManagerId = null;
  const vacant = f.write('districts', '01', { status: 'Retired' });
  assert.doesNotThrow(() => validate([vacant.value], [vacant.before], f.state, f.people));
  district.data.status = 'Retired';
  f.state.units.find(u => u.unitType === 'region')!.data.status = 'Retired';
  assert.doesNotThrow(() => validate([], [], f.state, f.people));
  const reactivate = f.write('districts', '01', { status: 'Active' });
  assert.throws(() => validate([reactivate.value], [reactivate.before], f.state, f.people), /active parent Region/);
  district.data.districtManagerId = 'incumbent';
  assert.throws(() => validate([], [], f.state, f.people), /roster/);
});

test('Additional manager deletion, inactivation, position removal and renaming require roster-aware review', () => {
  const f = fixture(); f.state.assignments.push({ id: 'additional', unitType: 'district', unitId: '01', personId: 'new-hire', status: 'active' });
  for (const changes of [{ status: 'Inactive' }, { positionIds: ['regional-manager'] }, { fullName: 'Renamed' }]) {
    const w = f.write('people', 'new-hire', changes);
    assert.throws(() => validate([w.value], [w.before], f.state, f.people), /review|responsibilit/i);
  }
  assert.throws(() => validate([{ collection: 'people', id: 'new-hire', operation: 'delete' }], [f.records.get('people/new-hire')], f.state, f.people), /responsibilit/);
});

test('contact-only edits preserve unresolved retained incumbents; adding another position preserves current eligibility', () => {
  const f = fixture(); f.records.get('people/incumbent').status = 'Inactive';
  const contact = f.write('people', 'incumbent', { workEmail: 'updated@example.test' });
  assert.doesNotThrow(() => validate([contact.value], [contact.before], f.state, f.people));
  f.records.get('people/incumbent').status = 'Active';
  const role = f.write('people', 'incumbent', { positionIds: ['district-manager', 'regional-manager'] });
  assert.doesNotThrow(() => validate([role.value], [role.before], f.state, f.people));
});

test('retiring a parent Region and reparenting across managed Regions require explicit organization review', () => {
  const f = fixture(), retirement = f.write('regions', '01', { status: 'Retired' });
  assert.throws(() => validate([retirement.value], [retirement.before], f.state, f.people), /parent Region/);
  const district = f.state.units.find(u => u.unitType === 'district')!;
  delete district.data.leadershipModelVersion; delete district.data.leadershipVersion; f.state.assignments = [];
  const region = f.state.units.find(u => u.unitType === 'region')!;
  Object.assign(region.data, { leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: null });
  const move = f.write('districts', '01', { regionId: 'other' });
  assert.throws(() => validate([move.value], [move.before], f.state, f.people), /District moves/);
});

test('store contact updates preserve canonical ownership and no DM override is accepted', () => {
  const f = fixture(), contact = f.write('locations', '007', { phone: '9095550100' });
  assert.doesNotThrow(() => validate([contact.value], [contact.before], f.state, f.people));
  for (const changes of [{ districtManagerId: 'new-hire' }, { districtManagerName: 'Spoofed' }]) {
    const w = f.write('locations', '007', changes);
    assert.throws(() => validate([w.value], [w.before], f.state, f.people), /canonical/);
  }
});

test('new retail stores must inherit both canonical owners; Corporate remains separate', () => {
  const f = fixture(), region = f.state.units.find(u => u.unitType === 'region')!;
  Object.assign(region.data, { leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: 'new-hire' });
  f.state.assignments.push({ id: 'rm', unitType: 'region', unitId: '01', personId: 'new-hire', status: 'active' });
  const data = { ...f.records.get('locations/007'), regionalManagerId: 'new-hire', regionalManagerName: 'New Manager' };
  const w = { collection: 'locations', id: 'new', operation: 'set', data } as DirectoryWrite;
  assert.doesNotThrow(() => validate([w], [undefined], f.state, f.people));
  delete w.data!.regionalManagerId;
  assert.throws(() => validate([w], [undefined], f.state, f.people), /canonical/);
  const corporate = f.write('locations', 'corporate', { districtId: '01', regionId: '01' });
  assert.doesNotThrow(() => validate([corporate.value], [corporate.before], f.state, f.people));
});

test('explicit unit vacancy remains valid through existing empty/absent Location-copy normalization', () => {
  const f = fixture();
  f.state.units.find(u => u.unitType === 'district')!.data.districtManagerId = null;
  f.state.assignments = [];
  for (const value of [null, undefined, '']) {
    const w = f.write('locations', '007', { districtManagerId: value, districtManagerName: '' });
    assert.doesNotThrow(() => validate([w.value], [w.before], f.state, f.people));
  }
  const bad = f.write('locations', '007', { districtManagerId: false, districtManagerName: '' });
  assert.throws(() => validate([bad.value], [bad.before], f.state, f.people), /canonical/);
});

test('store moves, type changes and deletion cannot bypass reviewed membership changes', () => {
  const f = fixture();
  for (const changes of [{ districtId: 'other' }, { regionId: 'other' }, { type: 'Corporate Office' }, { hierarchyApplicability: 'Not applicable' }]) {
    const w = f.write('locations', '007', changes);
    assert.throws(() => validate([w.value], [w.before], f.state, f.people), /managed store/);
  }
  assert.throws(() => validate([{ collection: 'locations', id: '007', operation: 'delete' }], [f.records.get('locations/007')], f.state, f.people), /managed store/);
});

test('unsupported models, duplicated members and pointer/roster disagreement fail closed', () => {
  for (const edit of [(f: ReturnType<typeof fixture>) => f.state.units[1].data.leadershipModelVersion = 99,
    (f: ReturnType<typeof fixture>) => f.state.assignments.push({ ...f.state.assignments[0], id: 'duplicate' }),
    (f: ReturnType<typeof fixture>) => f.state.units[1].data.districtManagerId = 'unassigned']) {
    const f = fixture(); edit(f);
    assert.throws(() => validate([], [], f.state, f.people), /roster/);
  }
});

test('old signed Person commands cannot bypass Additional, District or Region ownership', () => {
  const f = fixture();
  assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { personId: 'incumbent', responsibilities: [] }, []), /roster-aware/);
  assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { personId: 'other', responsibilities: [{ owner: 'districts', id: '01', field: 'districtManagerId' }] }, []), /roster-aware/);
  const region = f.state.units[0]; Object.assign(region.data, { leadershipModelVersion: 1, leadershipVersion: 0, regionalManagerId: null });
  assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { personId: 'other', responsibilities: [{ owner: 'locations', id: '007', field: 'regionalManagerId' }] }, [{ id: '007', data: f.records.get('locations/007') }]), /canonical Region/);
  assert.doesNotThrow(() => assertOrganizationTransitionCompatibility(f.state, { personId: 'other', responsibilities: [{ owner: 'locations', id: '007', field: 'storeManagerId' }] }, []));
});

test('reviewed Person transitions may preserve rosters while adding/removing unrelated positions', () => {
  const f = fixture();
  const intent = { personId: 'incumbent', lifecycle: 'keep', positionIds: ['district-manager', 'store-manager'], responsibilities: [{ owner: 'districts', id: '01', field: 'districtManagerId', action: 'retain' }] };
  assert.doesNotThrow(() => assertOrganizationTransitionCompatibility(f.state, intent, []));
  assert.doesNotThrow(() => assertOrganizationTransitionCompatibility(f.state, { ...intent, positionIds: ['district-manager'] }, []));
  for (const change of [{ positionIds: ['store-manager'] }, { lifecycle: 'inactive' }, { positionIds: undefined }]) {
    assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { ...intent, ...change }, []), /roster-aware/);
  }
  assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { ...intent, responsibilities: [{ ...intent.responsibilities[0], action: 'vacate' }] }, []), /organization workflow/);
});

test('Additional and concurrent Region responsibilities retain their own required position', () => {
  const f = fixture();
  f.state.assignments.push({ id: 'additional', unitType: 'district', unitId: '01', personId: 'new-hire', status: 'active' });
  const region = f.state.units.find(u => u.unitType === 'region')!;
  Object.assign(region.data, { leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: 'new-hire' });
  f.state.assignments.push({ id: 'rm', unitType: 'region', unitId: '01', personId: 'new-hire', status: 'active' });
  f.records.get('locations/007').regionalManagerId = 'new-hire';
  const intent = { personId: 'new-hire', lifecycle: 'keep', positionIds: ['district-manager', 'regional-manager', 'store-manager'], responsibilities: [{ owner: 'locations', id: '007', field: 'regionalManagerId', action: 'retain' }] };
  assert.doesNotThrow(() => assertOrganizationTransitionCompatibility(f.state, intent, [{ id: '007', data: f.records.get('locations/007') }]));
  for (const positions of [['district-manager'], ['regional-manager']]) assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { ...intent, positionIds: positions }, []), /roster-aware/);
  assert.throws(() => assertOrganizationTransitionCompatibility(f.state, { ...intent, responsibilities: [{ ...intent.responsibilities[0], action: 'replace' }] }, [{ id: '007', data: f.records.get('locations/007') }]), /canonical Region/);
});
