import test from 'node:test';
import assert from 'node:assert/strict';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';
import { prepareOrganizationMove as prepare, commitOrganizationMove as commit, readOrganizationMoveOperation as status, cancelOrganizationMoveOperation as cancel,
  listOrganizationMoveOperations as list, ORGANIZATION_MOVE_OPERATION_COLLECTION as receipts, ORGANIZATION_MOVE_ADMISSION_COLLECTION as admissions, ORGANIZATION_MOVE_REVIEW_TTL_MS as ttl } from '../server/organizationMoveOperations';

const time = Date.parse(leadershipNow), clock = () => new Date(time);
const reviewed = async (f: ReturnType<typeof moveFixture>) => { const p = await prepare(f.firestore, f.intent, actor, clock); assert('reviewHash' in p); return { operationId: p.operationId, reviewHash: p.reviewHash! }; };
const rows = (f: ReturnType<typeof moveFixture>, collection: string) => [...f.records].filter(([path]) => path.startsWith(collection + '/'));

test('move preparation binds one private actor review, is idempotent and changes no business data', async () => {
  const f = moveFixture(), before = structuredClone([...f.records]);
  const first = await prepare(f.firestore, f.intent, actor, clock);
  assert.deepEqual(await prepare(f.firestore, f.intent, actor, clock), first);
  assert.deepEqual([...f.records].filter(([path]) => ![receipts, admissions].some(c => path.startsWith(c + '/'))), before);
  assert.equal(rows(f, receipts).length, 1); assert.doesNotMatch(JSON.stringify(first), /PRIVATE|preconditions|actorUid|writes/);
  assert.doesNotMatch(JSON.stringify(rows(f, receipts)), /PRIVATE|workEmail|primaryLocationId/);
});
test('move saves inheritance only, writes one audit and recovers immutable committed outcome', async () => {
  const f = moveFixture(), beforeAssignments = structuredClone(rows(f, 'leadership_assignments')), beforePeople = structuredClone(rows(f, 'people'));
  const command = await reviewed(f), saved = await commit(f.firestore, command, actor, clock);
  assert.equal(saved.state, 'committed');
  const store = f.records.get('locations/007'); assert.equal(store.districtId, '02'); assert.equal(store.regionId, '02'); assert.equal(store.districtManagerId, 'new-hire'); assert.equal(store.version, 5); assert.equal(store.address, 'PRIVATE_ADDRESS');
  assert.deepEqual(rows(f, 'leadership_assignments'), beforeAssignments); assert.deepEqual(rows(f, 'people'), beforePeople);
  assert.equal(rows(f, 'audit_logs').length, 1);
  f.records.delete('people/new-hire');
  assert.deepEqual(await commit(f.firestore, command, actor, () => new Date(time + ttl * 10)), saved);
  assert.deepEqual(await status(f.firestore, { operationId: command.operationId }, actor), saved);
  assert.deepEqual(await cancel(f.firestore, { operationId: command.operationId }, actor, clock), saved);
});
test('District parent moves preserve its DM/tenures and update inherited Region copies atomically', async () => {
  const f = moveFixture(); Object.assign(f.intent, { kind: 'district', id: '01', expectedVersion: 3 });
  await commit(f.firestore, await reviewed(f), actor, clock);
  assert.equal(f.records.get('districts/01').regionId, '02'); assert.equal(f.records.get('districts/01').districtManagerId, 'incumbent');
  assert.equal(f.records.get('locations/007').districtId, '01'); assert.equal(f.records.get('locations/007').regionalManagerId, 'new-hire');
  assert.equal(rows(f, 'audit_logs').length, 1); assert.equal(rows(f, 'leadership_assignments').length, 3);
});
test('missing preparation, changed review hash and operation-ID reuse cannot write', async () => {
  const f = moveFixture(), command = await reviewed(f), before = structuredClone([...f.records]);
  await assert.rejects(commit(f.firestore, { ...command, reviewHash: '0'.repeat(64) }, actor, clock));
  await assert.rejects(commit(f.firestore, { operationId: 'missing', reviewHash: command.reviewHash }, actor, clock));
  await assert.rejects(prepare(f.firestore, { ...f.intent, reason: 'Changed reason' }, actor, clock));
  assert.deepEqual([...f.records], before);
});
test('membership, eligibility, target hierarchy and roster changes require another review', async () => {
  for (const change of [
    (f: ReturnType<typeof moveFixture>) => f.records.set('locations/008', { ...f.records.get('locations/007'), storeNumber: '008' }),
    (f: ReturnType<typeof moveFixture>) => f.records.get('people/new-hire').status = 'Inactive',
    (f: ReturnType<typeof moveFixture>) => f.records.get('districts/02').regionId = '01',
    (f: ReturnType<typeof moveFixture>) => f.records.get('leadership_assignments/district-02').version = 2,
  ]) { const f = moveFixture(), command = await reviewed(f); change(f); const before = structuredClone([...f.records]); await assert.rejects(commit(f.firestore, command, actor, clock)); assert.deepEqual([...f.records], before); }
});
test('status/cancel/list and mutations all require fresh live administrator authority', async () => {
  const f = moveFixture(), command = await reviewed(f); f.records.get('users/admin').status = 'Inactive';
  for (const call of [() => prepare(f.firestore, f.intent, actor, clock), () => commit(f.firestore, command, actor, clock), () => status(f.firestore, command, actor), () => cancel(f.firestore, command, actor, clock), () => list(f.firestore, actor)]) await assert.rejects(call(), /authority/);
  assert.equal(rows(f, 'audit_logs').length, 0);
});
test('another actor cannot read, commit or cancel the original operation', async () => {
  const f = moveFixture(), command = await reviewed(f), other = { ...actor, uid: 'other-admin' };
  f.records.set('users/other-admin', { firebaseUid: other.uid, role: other.role, status: 'Active', accessScope: 'Company-wide' });
  assert.equal((await status(f.firestore, command, other)).state, 'missing');
  assert.equal((await list(f.firestore, other)).operations.length, 0);
  await assert.rejects(commit(f.firestore, command, other, clock));
  assert.equal((await cancel(f.firestore, command, other, clock)).state, 'cancelled');
  assert.equal((await status(f.firestore, command, actor)).state, 'prepared');
});
test('cancellation seals a missing ID, retains expired prepared reviews and never undoes a saved move', async () => {
  const f = moveFixture(); await cancel(f.firestore, { operationId: f.intent.operationId }, actor, clock);
  assert.equal((await prepare(f.firestore, f.intent, actor, clock)).state, 'cancelled'); assert.equal(rows(f, 'audit_logs').length, 0);
  const g = moveFixture(), command = await reviewed(g);
  await assert.rejects(commit(g.firestore, command, actor, () => new Date(time + ttl)), /expired/);
  assert.equal((await list(g.firestore, actor)).operations.length, 1);
  assert.equal((await cancel(g.firestore, command, actor, () => new Date(time + ttl))).state, 'cancelled');
  assert.equal((await list(g.firestore, actor)).operations.length, 0);
});
test('backwards clocks, unsupported full saved values and oversized records reject atomically', async () => {
  for (const change of [
    (f: ReturnType<typeof moveFixture>) => f.records.get('locations/007').note = 'x'.repeat(900_001),
    (f: ReturnType<typeof moveFixture>) => f.records.get('locations/007').note = undefined,
  ]) { const f = moveFixture(), command = await reviewed(f); change(f); const before = structuredClone([...f.records]); await assert.rejects(commit(f.firestore, command, actor, clock)); assert.deepEqual([...f.records], before); }
  const f = moveFixture(), command = await reviewed(f); await assert.rejects(commit(f.firestore, command, actor, () => new Date(time - 1)), /expired/);
});
test('transaction failure leaves no move, committed receipt or audit', async () => {
  const f = moveFixture(), command = await reviewed(f), before = structuredClone([...f.records]); f.state.failWrite = true;
  await assert.rejects(commit(f.firestore, command, actor, clock)); assert.deepEqual([...f.records], before);
});
