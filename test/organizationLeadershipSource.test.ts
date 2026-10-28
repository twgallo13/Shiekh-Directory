import test from 'node:test';
import assert from 'node:assert/strict';
import { readOrganizationLeadershipPlan, ORGANIZATION_SOURCE_LIMITS } from '../server/organizationLeadershipSource';
import { leadershipFixture, leadershipNow } from './helpers/organizationLeadershipFixture';

test('source loader uses complete bounded masked queries and exact relevant People in the same transaction', async () => {
  const f = leadershipFixture(), before = structuredClone([...f.records]);
  const result = await readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow);
  assert.equal(result.plan.review[0].members.length, 2);
  assert.equal(result.plan.review[0].primaryPersonId, 'incumbent');
  assert.deepEqual(f.reads.filter(r => r.maximum).map(r => [r.collection, r.maximum]), [['districts', 501], ['regions', 101], ['locations', 1001], ['leadership_assignments', 1001]]);
  assert.deepEqual(f.reads.find(r => r.paths)!.paths, ['people/incumbent', 'people/new-hire']);
  assert.doesNotMatch(JSON.stringify([...result.native.values()]), /PRIVATE|workEmail|primaryLocationId|firebaseUid/);
  assert.deepEqual([...f.records], before);
  assert.equal(result.native.get('districts/01')!.updateTime.seconds, '100');
});

test('invalid intent cannot cause any source query', async () => {
  const f = leadershipFixture();
  await assert.rejects(readOrganizationLeadershipPlan(f.firestore, f.transaction, { ...f.intent, extra: true }, leadershipNow));
  assert.deepEqual(f.reads, []);
});

test('query failure, missing metadata, wrong paths and duplicate results never become vacancy', async () => {
  for (const state of [{ fail: 'leadership_assignments' }, { missingTime: 'districts/01' }, { badPath: 'regions/01' }, { duplicate: 'locations' }, { truncatePeople: true }, { wrongPerson: true }]) {
    const f = leadershipFixture(); Object.assign(f.state, state);
    await assert.rejects(readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow));
    assert.equal(f.records.get('districts/01').districtManagerId, 'incumbent');
  }
});

test('missing requested People and mismatched embedded IDs reject', async () => {
  for (const edit of [(f: ReturnType<typeof leadershipFixture>) => f.records.delete('people/new-hire'), (f: ReturnType<typeof leadershipFixture>) => f.records.get('people/new-hire').id = 'other']) {
    const f = leadershipFixture(); edit(f);
    await assert.rejects(readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow));
  }
});

test('roster queries use namespaced unit pairs and reject unrelated results', async () => {
  const f = leadershipFixture();
  f.records.set('leadership_assignments/region-tenure', { unitType: 'region', unitId: '01', personId: 'incumbent', status: 'active', startedAt: leadershipNow, endedAt: null, version: 1 });
  assert.equal((await readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow)).plan.review[0].members.length, 2);
  f.state.omitFilter = true;
  await assert.rejects(readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow), /unrelated unit/);
});

test('assignment history is complete, includes ended tenures and does not read unrelated historical People', async () => {
  const f = leadershipFixture();
  f.records.set('leadership_assignments/ended', { unitType: 'district', unitId: '01', personId: 'old-missing-person', status: 'ended', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-02-01T00:00:00.000Z', version: 1 });
  const r = await readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow);
  assert(r.native.has('leadership_assignments/ended'));
  assert(!r.native.has('people/old-missing-person'));
});

test('query sentinels reject hierarchy and roster overflow rather than truncate', async () => {
  for (const collection of ['districts', 'regions', 'locations', 'leadership_assignments'] as const) {
    const f = leadershipFixture(), max = collection === 'leadership_assignments' ? ORGANIZATION_SOURCE_LIMITS.assignmentsPerUnit : ORGANIZATION_SOURCE_LIMITS[collection];
    const existing = [...f.records.keys()].filter(path => path.startsWith(collection + '/')).length;
    for (let i = existing; i <= max; i++) f.records.set(`${collection}/overflow-${i}`, { unitType: 'district', unitId: '01' });
    await assert.rejects(readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow), /bounded capacity/);
  }
});

test('unsupported native projected values and byte overflow fail before returning a plan', async () => {
  for (const value of [undefined, new Date(), NaN, Infinity, 'x'.repeat(8_000_001)]) {
    const f = leadershipFixture(); f.records.get('people/new-hire').fullName = value;
    await assert.rejects(readOrganizationLeadershipPlan(f.firestore, f.transaction, f.intent, leadershipNow));
  }
});
