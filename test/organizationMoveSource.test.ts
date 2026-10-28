import test from 'node:test';
import assert from 'node:assert/strict';
import { readOrganizationMovePlan } from '../server/organizationMoveSource';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipNow } from './helpers/organizationLeadershipFixture';

test('move source derives namespaced source/destination rosters and masks exact manager reads', async () => {
  const f = moveFixture(), before = structuredClone([...f.records]);
  const result = await readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow);
  assert.equal(result.plan.review.after.regionId, '02'); assert.equal(result.plan.review.after.districtManager.id, 'new-hire');
  assert.equal(f.reads.filter(r => r.collection === 'leadership_assignments').length, 4);
  assert(f.reads.filter(r => r.maximum).every(r => Number.isFinite(r.maximum)));
  assert.deepEqual(f.reads.find(r => r.paths)!.paths, ['people/incumbent', 'people/new-hire']);
  assert.doesNotMatch(JSON.stringify([...result.native]), /PRIVATE|workEmail|primaryLocationId|firebaseUid/);
  assert.deepEqual([...f.records], before); assert.equal(result.native.get('locations/007')!.updateTime.seconds, '100');
});
test('parent move shares source Region/District IDs without duplicate or missing roster reads', async () => {
  const f = moveFixture(); Object.assign(f.intent, { kind: 'district', id: '01', expectedVersion: 3 });
  const result = await readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow);
  assert.equal(f.reads.filter(r => r.collection === 'leadership_assignments').length, 3);
  assert.equal(result.plan.writes.length, 2); assert.equal(result.plan.review.after.districtManager.id, 'incumbent');
});
test('invalid caller intent does not query source; missing canonical hierarchy cannot become vacancy', async () => {
  const f = moveFixture();
  await assert.rejects(readOrganizationMovePlan(f.firestore, f.transaction, { ...f.intent, id: '../bad' }, leadershipNow)); assert.equal(f.reads.length, 0);
  f.records.delete('regions/02'); await assert.rejects(readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow), /dependency/);
});
test('source failures, wrong native identities, incomplete exact People and unrelated rosters fail closed', async () => {
  for (const fault of [{ fail: 'leadership_assignments' }, { missingTime: 'locations/007' }, { badPath: 'districts/02' }, { duplicate: 'locations' }, { truncatePeople: true }, { wrongPerson: true }, { omitFilter: true }]) {
    const f = moveFixture(); Object.assign(f.state, fault); await assert.rejects(readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow));
    assert.equal(f.records.get('locations/007').districtId, '01');
  }
});
test('unversioned membership and parent changes produce fresh reviewed bindings', async () => {
  const f = moveFixture(), first = await readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow);
  f.records.set('locations/008', { ...f.records.get('locations/007'), storeNumber: '008' });
  const second = await readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow);
  assert.notEqual(first.plan.preconditions.storeMembership, second.plan.preconditions.storeMembership);
  f.records.get('districts/02').regionId = '01';
  const third = await readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow);
  assert.equal(third.plan.review.after.regionId, '01'); assert.notDeepEqual(second.plan.preconditions.units, third.plan.preconditions.units);
});
test('complete selected assignment history and exact active eligibility are required', async () => {
  const f = moveFixture(); f.records.get('people/new-hire').status = 'Inactive';
  await assert.rejects(readOrganizationMovePlan(f.firestore, f.transaction, f.intent, leadershipNow), /eligibility/);
  const g = moveFixture();
  for (let i = 0; i < 1001; i++) g.records.set(`leadership_assignments/overflow-${i}`, { unitType: 'district', unitId: '02' });
  await assert.rejects(readOrganizationMovePlan(g.firestore, g.transaction, g.intent, leadershipNow), /bounded capacity/);
});
