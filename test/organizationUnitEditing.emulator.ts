import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { leadershipFixture, leadershipActor as actor } from './helpers/organizationLeadershipFixture';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
async function fixture(empty = false) {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `unit-edit-${randomUUID()}` });
  const f = leadershipFixture();
  if (empty) {
    f.records.delete('leadership_assignments/existing'); f.records.delete('locations/007');
    f.records.get('districts/01').districtManagerId = null;
  }
  const batch = db.batch();
  for (const [path, data] of f.records) batch.create(db.doc(path), data);
  await batch.commit();
  const store = new FirestoreDirectoryStore(db);
  const edit = (data: Record<string, unknown>, expectedVersion = 3) => store.commit([
    { collection: 'districts', id: '01', operation: 'set', expectedVersion, data },
  ], null, actor);
  return { db, edit, store };
}

test('SDK managed rename preserves roster, store and server fields; audit is mandatory even without client audit', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const storeBefore = (await f.db.doc('locations/007').get()).data();
    const tenureBefore = (await f.db.doc('leadership_assignments/existing').get()).data();
    await f.edit({ name: 'Coastal', status: 'Active', regionId: '01' });
    const unit = (await f.db.doc('districts/01').get()).data()!;
    assert.equal(unit.name, 'Coastal'); assert.equal(unit.id, '01'); assert.equal(unit.version, 4);
    assert.equal(unit.leadershipModelVersion, 1); assert.equal(unit.leadershipVersion, 2); assert.equal(unit.districtManagerId, 'incumbent');
    assert.deepEqual((await f.db.doc('locations/007').get()).data(), storeBefore);
    assert.deepEqual((await f.db.doc('leadership_assignments/existing').get()).data(), tenureBefore);
    const audits = await f.db.collection('audit_logs').get(); assert.equal(audits.size, 1);
    assert.equal(audits.docs[0].data().previousState.name, 'Central');
    assert.equal(audits.docs[0].data().newState.name, 'Coastal');
    await assert.rejects(f.edit({ name: 'Stale' }), /concurrently/);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('SDK managed edits reject authority loss, protected fields and occupied retirement without writes', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    for (const data of [{ name: 'Changed', districtManagerId: null }, { name: 'Changed', leadershipVersion: 99 }, { name: 'Changed', regionId: 'missing' }, { name: 'Changed', extra: true }, { status: 'Retired' }]) {
      await assert.rejects(f.edit(data));
    }
    await f.db.doc('users/admin').update({ status: 'Inactive' });
    await assert.rejects(f.edit({ name: 'Changed' }), /authority/);
    await f.db.doc('users/admin').update({ status: 'Active' });
    await f.db.doc('users/duplicate').set({ firebaseUid: actor.uid, role: actor.role, status: 'Active', accessScope: actor.accessScope });
    await assert.rejects(f.edit({ name: 'Changed' }), /authority/);
    assert.equal((await f.db.doc('districts/01').get()).data()!.version, 3);
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

test('SDK vacant retirement and reactivation retain managed authority and never revive a manager', { timeout: 90_000 }, async () => {
  const f = await fixture(true);
  try {
    await f.edit({ status: 'Retired' });
    await f.db.doc('regions/01').update({ status: 'Retired' });
    await f.edit({ name: 'Dormant rename' }, 4);
    await assert.rejects(f.edit({ status: 'Active' }, 5), /active parent Region/);
    await f.db.doc('regions/01').update({ status: 'Active' });
    await f.edit({ status: 'Active' }, 5);
    const unit = (await f.db.doc('districts/01').get()).data()!;
    assert.equal(unit.status, 'Active'); assert.equal(unit.version, 6);
    assert.equal(unit.leadershipModelVersion, 1); assert.equal(unit.leadershipVersion, 2); assert.equal(unit.districtManagerId, null);
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 0);
    assert.equal((await f.db.collection('audit_logs').get()).size, 3);
  } finally { await f.db.terminate(); }
});

test('SDK linked locations prevent vacant-unit retirement', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await f.db.doc('districts/01').update({ districtManagerId: null });
    await f.db.doc('leadership_assignments/existing').update({ status: 'ended' });
    await assert.rejects(f.edit({ status: 'Retired' }), /depend/);
    assert.equal((await f.db.doc('districts/01').get()).data()!.status, 'Active');
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

test('SDK concurrent renames admit one version and one audit', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const result = await Promise.allSettled([f.edit({ name: 'Coastal' }), f.edit({ name: 'Inland' })]);
    assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(result.filter(r => r.status === 'rejected').length, 1);
    assert.equal((await f.db.doc('districts/01').get()).data()!.version, 4);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('SDK managed Region rename and empty retirement preserve its canonical pointer/model', { timeout: 90_000 }, async () => {
  const f = await fixture(true);
  try {
    await f.db.doc('districts/01').update({ status: 'Retired' });
    await f.db.doc('regions/01').update({ leadershipModelVersion: 1, leadershipVersion: 0, regionalManagerId: null });
    const edit = (name: string, status: string, expectedVersion: number) => f.store.commit([
      { collection: 'regions', id: '01', operation: 'set', expectedVersion, data: { name, status } },
    ], null, actor);
    await edit('Pacific', 'Active', 1);
    await edit('Pacific', 'Retired', 2);
    await edit('Pacific', 'Active', 3);
    const region = (await f.db.doc('regions/01').get()).data()!;
    assert.equal(region.name, 'Pacific'); assert.equal(region.version, 4);
    assert.equal(region.regionalManagerId, null); assert.equal(region.leadershipVersion, 0); assert.equal(region.leadershipModelVersion, 1);
    assert.equal((await f.db.doc('districts/01').get()).data()!.regionId, '01');
    assert.equal((await f.db.collection('audit_logs').get()).size, 3);
  } finally { await f.db.terminate(); }
});
