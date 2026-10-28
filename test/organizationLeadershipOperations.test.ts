import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareOrganizationLeadership as prepare, commitOrganizationLeadership as commit,
  readOrganizationLeadershipOperation as status, cancelOrganizationLeadershipOperation as cancel,
  ORGANIZATION_OPERATION_COLLECTION, ORGANIZATION_REVIEW_TTL_MS,
  ORGANIZATION_ADMISSION_COLLECTION,
  listOrganizationLeadershipOperations as list,
} from '../server/organizationLeadershipOperations';
import { leadershipFixture, leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';

const time = Date.parse(leadershipNow), clock = () => new Date(time);
const prepared = async (f: ReturnType<typeof leadershipFixture>) => {
  const p = await prepare(f.firestore, f.intent, actor, clock);
  assert.equal(p.state, 'prepared');
  return { operationId: p.operationId, reviewHash: 'reviewHash' in p ? p.reviewHash : '' };
};
const receipts = (f: ReturnType<typeof leadershipFixture>) => [...f.records].filter(([path]) => path.startsWith(ORGANIZATION_OPERATION_COLLECTION + '/'));

test('preparation persists only private review state; repeated exact preparation is idempotent', async () => {
  const f = leadershipFixture(), before = structuredClone([...f.records]);
  const first = await prepare(f.firestore, f.intent, actor, clock);
  assert.equal(first.state, 'prepared');
  assert.deepEqual(await prepare(f.firestore, f.intent, actor, clock), first);
  const reordered = { units: f.intent.units.map(unit => Object.fromEntries(Object.entries(unit).reverse())), operationId: f.intent.operationId };
  assert.deepEqual(await prepare(f.firestore, reordered, actor, clock), first);
  assert.equal(receipts(f).length, 1);
  assert.deepEqual([...f.records].filter(([path]) => ![ORGANIZATION_OPERATION_COLLECTION, ORGANIZATION_ADMISSION_COLLECTION].some(c => path.startsWith(c + '/'))), before);
  assert.doesNotMatch(JSON.stringify(first), /PRIVATE|preconditions|patches|actorUid/);
  assert.doesNotMatch(JSON.stringify(receipts(f)), /PRIVATE_CONTACT|PRIVATE_ACCOUNT|PRIVATE_ADDRESS/);
});

test('commit saves complete assignment, unit, audit and receipt atomically and recovers immutable success', async () => {
  const f = leadershipFixture(), command = await prepared(f);
  const result = await commit(f.firestore, command, actor, clock);
  assert.equal(result.state, 'committed');
  assert.equal(f.records.get('districts/01').leadershipVersion, 3);
  assert.equal(f.records.get('districts/01').districtManagerId, 'incumbent');
  assert.equal([...f.records].filter(([p]) => p.startsWith('leadership_assignments/')).length, 2);
  assert.equal([...f.records].filter(([p]) => p.startsWith('audit_logs/')).length, 1);
  assert.equal(f.records.get('locations/007').version, 4);
  f.records.delete('people/new-hire'); // Later business changes/expiry cannot make success uncertain.
  assert.deepEqual(await commit(f.firestore, command, actor, () => new Date(time + 100_000_000)), result);
  assert.deepEqual(await status(f.firestore, { operationId: command.operationId }, actor), result);
  assert.deepEqual(await cancel(f.firestore, { operationId: command.operationId }, actor, clock), result);
  assert.doesNotMatch(JSON.stringify(result), /Current Manager|New Manager|reviewHash|preconditions|PRIVATE/);
});

test('Primary handover retains outgoing tenure and preserves unrelated full store fields', async () => {
  const f = leadershipFixture();
  f.intent.units[0].primaryPersonId = 'new-hire'; f.intent.units[0].reason = 'Reviewed handover';
  const command = await prepared(f);
  await commit(f.firestore, command, actor, clock);
  assert.equal(f.records.get('locations/007').districtManagerId, 'new-hire');
  assert.equal(f.records.get('locations/007').address, 'PRIVATE_ADDRESS');
  assert.equal(f.records.get('locations/007').version, 5);
  assert.equal(f.records.get('leadership_assignments/existing').status, 'active');
  assert.equal(f.records.get('people/new-hire').primaryLocationId, 'corporate');
});

test('changed review hash, intent reuse and unprepared operation reject without domain writes', async () => {
  const f = leadershipFixture(), command = await prepared(f), before = structuredClone([...f.records]);
  await assert.rejects(commit(f.firestore, { ...command, reviewHash: '0'.repeat(64) }, actor, clock));
  await assert.rejects(commit(f.firestore, { operationId: 'missing', reviewHash: '0'.repeat(64) }, actor, clock));
  const changed = structuredClone(f.intent); changed.units[0].reason = 'Changed intent';
  await assert.rejects(prepare(f.firestore, changed, actor, clock));
  assert.deepEqual([...f.records], before);
});

test('membership phantom, Person eligibility, hierarchy and unit version changes require fresh review', async () => {
  for (const edit of [
    (f: ReturnType<typeof leadershipFixture>) => f.records.set('locations/new-store', { ...f.records.get('locations/007'), storeNumber: '008' }),
    (f: ReturnType<typeof leadershipFixture>) => f.records.get('people/new-hire').status = 'Inactive',
    (f: ReturnType<typeof leadershipFixture>) => f.records.get('regions/01').status = 'Retired',
    (f: ReturnType<typeof leadershipFixture>) => f.records.get('districts/01').version++,
    (f: ReturnType<typeof leadershipFixture>) => f.records.set('leadership_assignments/other', { ...f.records.get('leadership_assignments/existing'), personId: 'new-hire' }),
  ]) {
    const f = leadershipFixture(), command = await prepared(f); edit(f);
    const before = structuredClone([...f.records]);
    await assert.rejects(commit(f.firestore, command, actor, clock));
    assert.deepEqual([...f.records], before);
  }
});

test('live authority is required for preparation, commit, status and cancellation', async () => {
  const f = leadershipFixture(), command = await prepared(f);
  f.records.get('users/admin').role = 'Viewer';
  const before = structuredClone([...f.records]);
  for (const action of [() => prepare(f.firestore, f.intent, actor, clock), () => commit(f.firestore, command, actor, clock), () => status(f.firestore, command, actor), () => cancel(f.firestore, command, actor, clock)]) await assert.rejects(action());
  assert.deepEqual([...f.records], before);
});

test('duplicate authority and a different actor cannot reuse an operation', async () => {
  const f = leadershipFixture(), command = await prepared(f);
  f.records.set('users/duplicate', structuredClone(f.records.get('users/admin')));
  await assert.rejects(commit(f.firestore, command, actor, clock));
  f.records.delete('users/duplicate');
  f.records.set('users/other', { ...f.records.get('users/admin'), firebaseUid: 'other' });
  const other = { ...actor, uid: 'other' };
  assert.equal((await status(f.firestore, command, other)).state, 'missing');
  await assert.rejects(commit(f.firestore, command, other, clock));
});

test('cancellation seals both absent and prepared operations without affecting committed work', async () => {
  for (const makePrepared of [false, true]) {
    const f = leadershipFixture(); if (makePrepared) await prepared(f);
    const result = await cancel(f.firestore, { operationId: f.intent.operationId }, actor, clock);
    assert.equal(result.state, 'cancelled');
    assert.deepEqual(await prepare(f.firestore, f.intent, actor, clock), result);
    assert.deepEqual(await commit(f.firestore, { operationId: f.intent.operationId, reviewHash: '0'.repeat(64) }, actor, clock), result);
    assert.equal(f.records.get('districts/01').version, 3);
  }
});

test('expired, invalid and backwards clocks cannot create or commit work', async () => {
  const f = leadershipFixture(), command = await prepared(f), before = structuredClone([...f.records]);
  for (const ms of [time - 1, time + ORGANIZATION_REVIEW_TTL_MS, NaN, -1]) await assert.rejects(commit(f.firestore, command, actor, () => new Date(ms)));
  await assert.rejects(prepare(f.firestore, f.intent, actor, () => new Date(time + ORGANIZATION_REVIEW_TTL_MS)));
  await assert.rejects(prepare(f.firestore, f.intent, actor, () => new Date(time - 1)));
  assert.deepEqual([...f.records], before);
  const fresh = leadershipFixture(); let calls = 0;
  await assert.rejects(prepare(fresh.firestore, fresh.intent, actor, () => new Date(calls++ ? time + ORGANIZATION_REVIEW_TTL_MS : time)));
  assert.equal(receipts(fresh).length, 0);
});

test('expiry during final reads and transaction write failure roll back every record', async () => {
  for (const failWrite of [false, true]) {
    const f = leadershipFixture(), command = await prepared(f), before = structuredClone([...f.records]); let calls = 0;
    f.state.failWrite = failWrite;
    await assert.rejects(commit(f.firestore, command, actor, () => new Date(!failWrite && calls++ ? time + ORGANIZATION_REVIEW_TTL_MS : time)));
    assert.deepEqual([...f.records], before);
  }
});

test('full preserved document capacity is checked even when small patches fit', async () => {
  const f = leadershipFixture(); f.records.get('districts/01').unrelatedLargeField = 'x'.repeat(900_000);
  const command = await prepared(f), before = structuredClone([...f.records]);
  await assert.rejects(commit(f.firestore, command, actor, clock), /document capacity/);
  assert.deepEqual([...f.records], before);
});

test('malformed markers, unsupported actor roles and tampered private receipt are refused', async () => {
  const f = leadershipFixture(), command = await prepared(f);
  for (const raw of [{}, { ...command, patches: [] }, { operationId: '../bad' }, { ...command, reviewHash: 'short' }]) await assert.rejects(commit(f.firestore, raw, actor, clock));
  await assert.rejects(prepare(f.firestore, f.intent, { ...actor, role: 'Viewer' }, clock));
  receipts(f)[0][1].review[0].primaryPersonId = 'other';
  await assert.rejects(commit(f.firestore, command, actor, clock), /binding/);
});

test('actor-only outstanding list is redacted and retains expired previews for safe cancellation', async () => {
  const f = leadershipFixture(), command = await prepared(f);
  const r = await list(f.firestore, actor);
  assert.equal(r.complete, true); assert.equal(r.operations.length, 1);
  assert.equal(r.operations[0].operationId, command.operationId);
  assert.doesNotMatch(JSON.stringify(r), /reviewHash|Current Manager|PRIVATE|preconditions|intent/);
  f.records.set('users/other', { ...f.records.get('users/admin'), firebaseUid: 'other' });
  assert.deepEqual((await list(f.firestore, { ...actor, uid: 'other' })).operations, []);
  await cancel(f.firestore, command, actor, () => new Date(time + ORGANIZATION_REVIEW_TTL_MS + 1));
  assert.deepEqual((await list(f.firestore, actor)).operations, []);
});

test('pending preparation cap prevents an unlistable backlog; exact replay and cancellation remain possible', async () => {
  const f = leadershipFixture();
  for (let i = 0; i < 100; i++) await prepare(f.firestore, { ...f.intent, operationId: `review-${i}` }, actor, clock);
  assert.equal((await list(f.firestore, actor)).operations.length, 100);
  await assert.rejects(prepare(f.firestore, { ...f.intent, operationId: 'overflow' }, actor, clock), /outstanding review/);
  assert.equal((await prepare(f.firestore, { ...f.intent, operationId: 'review-0' }, actor, clock)).state, 'prepared');
  await cancel(f.firestore, { operationId: 'review-0' }, actor, clock);
  assert.equal((await prepare(f.firestore, { ...f.intent, operationId: 'after-cancel' }, actor, clock)).state, 'prepared');
});
