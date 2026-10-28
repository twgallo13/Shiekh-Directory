import test from 'node:test';
import assert from 'node:assert/strict';
import { readOrganizationCatalog, projectOrganizationCatalog, type OrganizationCatalogSnapshot } from '../server/organizationLeadershipCatalog';
import { leadershipFixture, leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';

function source() {
  const f = leadershipFixture();
  const snapshot: OrganizationCatalogSnapshot = { units: [], people: [], assignments: [], locations: [] };
  for (const [path, data] of f.records) {
    const [collection, id] = path.split('/'), row = { id, data };
    if (collection === 'regions' || collection === 'districts') snapshot.units.push({ ...row, unitType: collection === 'regions' ? 'region' : 'district' });
    else if (collection === 'people') snapshot.people.push(row);
    else if (collection === 'locations') snapshot.locations.push(row);
    else if (collection === 'leadership_assignments') snapshot.assignments.push(row);
  }
  return { ...f, snapshot };
}

test('catalog is a coherent masked administrator read, separate from contact/accounts/workplace and candidate eligibility', async () => {
  const f = source(), before = structuredClone([...f.records]);
  const result = await readOrganizationCatalog(f.firestore, actor, () => new Date(leadershipNow));
  assert.equal(result.complete, true); assert.deepEqual(result.issues, []);
  const district = result.units.find(u => u.unitType === 'district')!, region = result.units.find(u => u.unitType === 'region')!;
  assert.equal(district.id, '01'); assert.equal(region.id, '01');
  assert.equal(district.storeCount, 1); assert.equal(region.storeCount, 1);
  assert.equal(district.ownership, 'managed'); assert.equal(region.assignmentState, 'unmanaged');
  assert.deepEqual(district.members.map(p => [p.personId, p.isPrimary]), [['incumbent', true]]);
  assert.deepEqual(result.people.find(p => p.id === 'new-hire')!.eligibleUnitTypes, ['district', 'region']);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|workEmail|locationInbox|firebaseUid|primaryLocation|preconditions/);
  assert.deepEqual([...f.records], before);
  assert(f.reads.every(r => r.fields.length && Number.isFinite(r.maximum)));
});

test('ineligible retained Additional member stays visible but is not an eligible candidate', () => {
  const f = source(); f.snapshot.assignments.push({ id: 'additional', data: { ...f.snapshot.assignments[0].data, personId: 'new-hire' } });
  f.snapshot.people.find(p => p.id === 'new-hire')!.data.status = 'Inactive';
  const r = projectOrganizationCatalog(f.snapshot, leadershipNow);
  const member = r.units.find(u => u.unitType === 'district')!.members.find(m => m.personId === 'new-hire')!;
  assert.equal(member.isPrimary, false); assert.equal(member.eligible, false); assert(member.issues.length);
  assert.deepEqual(r.people.find(p => p.id === 'new-hire')!.eligibleUnitTypes, []);
});

test('missing Person is unresolved membership, never a vacancy or inferred email identity', () => {
  const f = source(); f.snapshot.people = [];
  const unit = projectOrganizationCatalog(f.snapshot, leadershipNow).units.find(u => u.unitType === 'district')!;
  assert.equal(unit.assignmentState, 'assigned'); assert.equal(unit.primaryPersonId, 'incumbent');
  assert.equal(unit.members[0].fullName, 'incumbent'); assert.equal(unit.members[0].eligible, false);
  assert.match(unit.members[0].issues[0], /unavailable/);
});

test('unmanaged, explicit vacancy, invalid Primary and unsupported models remain distinct', () => {
  const f = source(), unit = f.snapshot.units.find(u => u.unitType === 'district')!;
  f.snapshot.assignments = []; delete unit.data.leadershipModelVersion; delete unit.data.leadershipVersion;
  for (const [value, state] of [[null, 'vacant'], ['', 'invalid'], ['incumbent', 'assigned']] as const) {
    unit.data.districtManagerId = value;
    assert.equal(projectOrganizationCatalog(f.snapshot, leadershipNow).units.find(u => u.unitType === 'district')!.assignmentState, state);
  }
  delete unit.data.districtManagerId;
  assert.equal(projectOrganizationCatalog(f.snapshot, leadershipNow).units.find(u => u.unitType === 'district')!.assignmentState, 'unmanaged');
  unit.data.leadershipModelVersion = 2;
  assert.equal(projectOrganizationCatalog(f.snapshot, leadershipNow).units.find(u => u.unitType === 'district')!.ownership, 'unsupported');
});

test('duplicate active tenures, malformed dates, bad parents and mismatched store membership produce diagnostics', () => {
  for (const edit of [(f: ReturnType<typeof source>) => f.snapshot.assignments.push({ ...f.snapshot.assignments[0], id: 'duplicate' }),
    (f: ReturnType<typeof source>) => f.snapshot.assignments[0].data.startedAt = '2030-01-01T00:00:00.000Z',
    (f: ReturnType<typeof source>) => f.snapshot.units[0].data.status = 'Retired',
    (f: ReturnType<typeof source>) => f.snapshot.locations[0].data.regionId = 'other']) {
    const f = source(); edit(f);
    assert(projectOrganizationCatalog(f.snapshot, leadershipNow).units.find(u => u.unitType === 'district')!.issues.length);
  }
});

test('orphan unit history produces a global diagnostic; no row is silently assigned elsewhere', () => {
  const f = source(); f.snapshot.assignments[0].data.unitId = 'unavailable';
  assert(projectOrganizationCatalog(f.snapshot, leadershipNow).issues.length);
});

test('authority loss, failed query, missing native metadata and duplicate identities cannot become an empty catalog', async () => {
  for (const edit of [(f: ReturnType<typeof source>) => f.records.get('users/admin').role = 'Viewer',
    (f: ReturnType<typeof source>) => f.state.fail = 'leadership_assignments',
    (f: ReturnType<typeof source>) => f.state.missingTime = 'regions/01',
    (f: ReturnType<typeof source>) => f.state.duplicate = 'people']) {
    const f = source(); edit(f);
    await assert.rejects(readOrganizationCatalog(f.firestore, actor, () => new Date(leadershipNow)));
  }
});

test('inventory sentinel and byte overflow reject a partial catalog', async () => {
  for (const kind of ['count', 'bytes']) {
    const f = source();
    if (kind === 'count') for (let i = 0; i < 1000; i++) f.records.set(`locations/new-${i}`, {});
    else f.records.get('people/new-hire').fullName = 'x'.repeat(8_000_001);
    await assert.rejects(readOrganizationCatalog(f.firestore, actor, () => new Date(leadershipNow)), /capacity/);
  }
});

test('duplicate identities and invalid catalog clock reject without mutation', () => {
  const f = source(); assert.throws(() => projectOrganizationCatalog(f.snapshot, 'not-a-date'));
  f.snapshot.people.push(f.snapshot.people[0]);
  assert.throws(() => projectOrganizationCatalog(f.snapshot, leadershipNow), /Duplicate/);
});
