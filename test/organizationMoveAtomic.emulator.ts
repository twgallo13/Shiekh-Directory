import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Firestore, GeoPoint, Timestamp } from '@google-cloud/firestore';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';
import { canonicalTransitionJSON as canonical } from '../src/lib/personTransitionIntent';
import { prepareOrganizationMove as prepare, commitOrganizationMove as commit, readOrganizationMoveOperation as status, cancelOrganizationMoveOperation as cancel,
  listOrganizationMoveOperations as list, ORGANIZATION_MOVE_OPERATION_COLLECTION as receipts } from '../server/organizationMoveOperations';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
const clock = () => new Date(leadershipNow);
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex');
async function fixture(parent = false) {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `move-atomic-${randomUUID()}` });
  const f = moveFixture(); if (parent) Object.assign(f.intent, { kind: 'district', id: '01', expectedVersion: 3 });
  Object.assign(f.records.get('locations/007'), { nativeTime: Timestamp.fromMillis(123), nativePoint: new GeoPoint(1, 2), nativeReference: db.doc('people/incumbent'), storeManagerId: 'store-person' });
  Object.assign(f.records.get('locations/corporate'), { districtId: '01', regionId: '01' });
  const batch = db.batch(); for (const [path, data] of f.records) batch.create(db.doc(path), data); await batch.commit();
  const reviewed = async (operationId = f.intent.operationId) => {
    const p = await prepare(db, { ...f.intent, operationId }, actor, clock); assert('reviewHash' in p);
    return { operationId: p.operationId, reviewHash: p.reviewHash! };
  };
  return { ...f, db, reviewed };
}

test('SDK duplicate move confirmations yield one audit and immutable recovery with preserved native/staff fields', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.reviewed(), before = (await f.db.doc('locations/007').get()).data()!;
    const [a, b] = await Promise.all([commit(f.db, command, actor, clock), commit(f.db, command, actor, clock)]);
    assert.deepEqual(a, b); assert.equal(a.state, 'committed');
    const saved = (await f.db.doc('locations/007').get()).data()!;
    assert.equal(saved.districtId, '02'); assert.equal(saved.regionId, '02'); assert.equal(saved.version, 5);
    assert(saved.nativeTime.isEqual(before.nativeTime)); assert(saved.nativePoint.isEqual(before.nativePoint)); assert(saved.nativeReference.isEqual(before.nativeReference));
    assert.equal(saved.storeManagerId, 'store-person'); assert.equal(saved.address, 'PRIVATE_ADDRESS');
    assert.equal((await f.db.collection('audit_logs').get()).size, 1); assert.equal((await f.db.collection('leadership_assignments').get()).size, 3);
    await f.db.doc('people/new-hire').delete();
    assert.deepEqual(await status(f.db, command, actor), a); assert.deepEqual(await cancel(f.db, command, actor, clock), a);
    assert.deepEqual(await commit(f.db, command, actor, () => new Date(Date.parse(leadershipNow) + 99_000_000)), a);
  } finally { await f.db.terminate(); }
});
test('SDK parent move changes District parent and retail Region together, preserving Corporate and rosters', { timeout: 90_000 }, async () => {
  const f = await fixture(true);
  try {
    await commit(f.db, await f.reviewed(), actor, clock);
    assert.equal((await f.db.doc('districts/01').get()).data()!.regionId, '02');
    const retail = (await f.db.doc('locations/007').get()).data()!;
    assert.equal(retail.regionId, '02'); assert.equal(retail.districtId, '01'); assert.equal(retail.districtManagerId, 'incumbent'); assert.equal(retail.regionalManagerId, 'new-hire');
    assert.equal((await f.db.doc('locations/corporate').get()).data()!.regionId, '01');
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 3); assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});
test('SDK new membership or target-manager change after preparation rejects without partial move', { timeout: 90_000 }, async () => {
  for (const change of ['membership', 'eligibility']) {
    const f = await fixture(true);
    try {
      const command = await f.reviewed();
      if (change === 'membership') await f.db.doc('locations/008').create({ ...(await f.db.doc('locations/007').get()).data(), storeNumber: '008' });
      else await f.db.doc('people/new-hire').update({ status: 'Inactive' });
      await assert.rejects(commit(f.db, command, actor, clock));
      assert.equal((await f.db.doc('districts/01').get()).data()!.regionId, '01');
      assert.equal((await f.db.doc('locations/007').get()).data()!.regionId, '01');
      assert.equal((await f.db.collection('audit_logs').get()).size, 0); assert.equal((await status(f.db, command, actor)).state, 'prepared');
    } finally { await f.db.terminate(); }
  }
});
test('SDK simultaneous preparation/cancellation seals a missing ID with no business move', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await Promise.allSettled([prepare(f.db, f.intent, actor, clock), cancel(f.db, { operationId: f.intent.operationId }, actor, clock)]);
    assert.equal((await status(f.db, { operationId: f.intent.operationId }, actor)).state, 'cancelled');
    assert.equal((await f.db.doc('locations/007').get()).data()!.districtId, '01'); assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});
test('SDK save/cancel race produces exactly one terminal move result', { timeout: 90_000 }, async () => {
  const f = await fixture(true);
  try {
    const command = await f.reviewed(); await Promise.allSettled([commit(f.db, command, actor, clock), cancel(f.db, command, actor, clock)]);
    const result = await status(f.db, command, actor); assert(['committed', 'cancelled'].includes(result.state));
    const moved = result.state === 'committed';
    assert.equal((await f.db.doc('districts/01').get()).data()!.regionId, moved ? '02' : '01');
    assert.equal((await f.db.doc('locations/007').get()).data()!.regionId, moved ? '02' : '01');
    assert.equal((await f.db.collection('audit_logs').get()).size, moved ? 1 : 0);
  } finally { await f.db.terminate(); }
});
test('SDK admission barrier serializes competing preparations at the 100-review capacity boundary', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await f.reviewed(); const original = (await f.db.collection(receipts).get()).docs[0].data();
    const seed = f.db.batch();
    for (let i = 1; i < 99; i++) {
      const operationId = `seed-${i}`, intent = { ...original.intent, operationId }, intentHash = hash(intent);
      seed.create(f.db.collection(receipts).doc(hash(['organization-move-v1', actor.uid, operationId])), { ...original, operationId, intent, intentHash, reviewHash: hash([intentHash, original.review, original.preconditions]) });
    }
    await seed.commit();
    const results = await Promise.allSettled([f.reviewed('candidate-a'), f.reviewed('candidate-b')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await list(f.db, actor)).operations.length, 100);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0); assert.equal((await f.db.doc('locations/007').get()).data()!.districtId, '01');
  } finally { await f.db.terminate(); }
});
test('SDK revoked authority and oversized preserved full documents reject without domain writes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.reviewed();
    await f.db.doc('locations/007').update({ preservedNote: 'x'.repeat(900_001) });
    await assert.rejects(commit(f.db, command, actor, clock), /capacity/);
    await f.db.doc('users/admin').update({ status: 'Inactive' });
    await assert.rejects(commit(f.db, command, actor, clock), /authority/); await assert.rejects(status(f.db, command, actor), /authority/);
    await assert.rejects(cancel(f.db, command, actor, clock), /authority/); await assert.rejects(list(f.db, actor), /authority/);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0); assert.equal((await f.db.doc('locations/007').get()).data()!.districtId, '01');
  } finally { await f.db.terminate(); }
});
