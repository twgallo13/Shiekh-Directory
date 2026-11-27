import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import {
  prepareOrganizationLeadership as prepare, commitOrganizationLeadership as commit,
  readOrganizationLeadershipOperation as status, cancelOrganizationLeadershipOperation as cancel,
} from '../server/organizationLeadershipOperations';
import { leadershipFixture, leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';

// Explicit opt-in, before any SDK initialization/RPC. No production project, default credentials or imports.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback Firestore emulator at 127.0.0.1:8089.');
async function fixture() {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `leadership-${randomUUID()}` });
  const synthetic = leadershipFixture(), batch = db.batch();
  for (const [path, data] of synthetic.records) batch.create(db.doc(path), data);
  await batch.commit();
  const clock = () => new Date(leadershipNow);
  const prepared = async () => {
    const r = await prepare(db, synthetic.intent, actor, clock);
    assert.equal(r.state, 'prepared');
    assert('reviewHash' in r);
    return { operationId: r.operationId, reviewHash: r.reviewHash };
  };
  return { db, intent: synthetic.intent, clock, prepared };
}

test('SDK: two concurrent commits produce one tenure, one audit and identical recovery outcomes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.prepared();
    const [one, two] = await Promise.all([commit(f.db, command, actor, f.clock), commit(f.db, command, actor, f.clock)]);
    assert.deepEqual(one, two); assert.equal(one.state, 'committed');
    assert.equal((await f.db.doc('districts/01').get()).data()!.version, 4);
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 2);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
    assert.deepEqual(await status(f.db, command, actor), one);
    assert.equal((await f.db.doc('locations/007').get()).data()!.version, 4);
  } finally { await f.db.terminate(); }
});

test('SDK: Primary compatibility update preserves native fields and outgoing Additional membership', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    f.intent.units[0].primaryPersonId = 'new-hire'; f.intent.units[0].reason = 'Reviewed primary handover';
    await f.db.doc('locations/007').update({ preservedNative: Timestamp.fromMillis(1000) });
    const command = await f.prepared();
    await commit(f.db, command, actor, f.clock);
    const store = (await f.db.doc('locations/007').get()).data()!;
    assert.equal(store.districtManagerId, 'new-hire'); assert.equal(store.address, 'PRIVATE_ADDRESS');
    assert(store.preservedNative instanceof Timestamp); assert.equal(store.preservedNative.toMillis(), 1000);
    assert.equal((await f.db.doc('leadership_assignments/existing').get()).data()!.status, 'active');
    assert.equal((await f.db.doc('people/new-hire').get()).data()!.primaryLocationId, 'corporate');
  } finally { await f.db.terminate(); }
});

test('SDK: new store between review and commit invalidates the review without partial writes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.prepared();
    const store = (await f.db.doc('locations/007').get()).data()!;
    await f.db.doc('locations/new-store').create({ ...store, storeNumber: '008' });
    await assert.rejects(commit(f.db, command, actor, f.clock), /changed/);
    assert.equal((await status(f.db, command, actor)).state, 'prepared');
    assert.equal((await f.db.doc('districts/01').get()).data()!.version, 3);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

test('SDK: Region and District with the same ID commit distinct rosters and one merged retail compatibility update', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    f.intent.units[0].primaryPersonId = 'new-hire'; f.intent.units[0].reason = 'Reviewed district primary';
    f.intent.units.push({ unitType: 'region', unitId: '01', expectedVersion: 1, expectedLeadershipVersion: 0, activateLegacy: true, memberPersonIds: ['new-hire'], primaryPersonId: 'new-hire', reason: 'Reviewed region activation' });
    await commit(f.db, await f.prepared(), actor, f.clock);
    const store = (await f.db.doc('locations/007').get()).data()!;
    assert.equal(store.version, 5); assert.equal(store.districtManagerId, 'new-hire'); assert.equal(store.regionalManagerId, 'new-hire');
    assert.equal((await f.db.doc('regions/01').get()).data()!.regionalManagerId, 'new-hire');
    const added = (await f.db.collection('leadership_assignments').where('personId', '==', 'new-hire').get()).docs.map(d => d.data().unitType).sort();
    assert.deepEqual(added, ['district', 'region']);
    assert.equal((await f.db.doc('locations/corporate').get()).data()!.version, 1);
  } finally { await f.db.terminate(); }
});

test('SDK: explicit vacancy ends tenure and clears compatibility without deleting Person or history', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    f.intent.units[0].memberPersonIds = []; f.intent.units[0].primaryPersonId = null; f.intent.units[0].reason = 'Reviewed vacancy';
    await commit(f.db, await f.prepared(), actor, f.clock);
    assert.equal((await f.db.doc('districts/01').get()).data()!.districtManagerId, null);
    const assignment = (await f.db.doc('leadership_assignments/existing').get()).data()!;
    assert.equal(assignment.status, 'ended'); assert.equal(assignment.endedAt, leadershipNow);
    assert.equal((await f.db.doc('locations/007').get()).data()!.districtManagerId, null);
    assert.equal((await f.db.doc('people/incumbent').get()).data()!.status, 'Active');
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('SDK: live administrator downgrade prevents save and recovery disclosure', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.prepared();
    await f.db.doc('users/admin').update({ role: 'Viewer' });
    await assert.rejects(commit(f.db, command, actor, f.clock), /administrator/);
    await assert.rejects(status(f.db, command, actor), /administrator/);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

test('SDK: concurrent cancellation and preparation seal the operation without domain writes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const marker = { operationId: f.intent.operationId };
    await Promise.all([prepare(f.db, f.intent, actor, f.clock), cancel(f.db, marker, actor, f.clock)]);
    assert.equal((await status(f.db, marker, actor)).state, 'cancelled');
    assert.equal((await prepare(f.db, f.intent, actor, f.clock)).state, 'cancelled');
    assert.equal((await f.db.doc('districts/01').get()).data()!.version, 3);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

test('SDK: concurrent commit/cancel has one terminal outcome and no partial business state', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const command = await f.prepared();
    const [saved, cancelled] = await Promise.all([commit(f.db, command, actor, f.clock), cancel(f.db, command, actor, f.clock)]);
    assert.deepEqual(saved, cancelled);
    const final = await status(f.db, command, actor);
    assert(['committed', 'cancelled'].includes(final.state));
    assert.equal((await f.db.doc('districts/01').get()).data()!.version, final.state === 'committed' ? 4 : 3);
    assert.equal((await f.db.collection('audit_logs').get()).size, final.state === 'committed' ? 1 : 0);
    assert.equal((await f.db.collection('leadership_assignments').get()).size, final.state === 'committed' ? 2 : 1);
  } finally { await f.db.terminate(); }
});
