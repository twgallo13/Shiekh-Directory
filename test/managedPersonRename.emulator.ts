import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore, type DirectoryWrite } from '../server/firestoreDirectory';
import { leadershipFixture, leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { reconcileLocationLeadershipCopy } from '../src/lib/personLocationRelationships';
import { serializePersonUpdate } from '../src/lib/personContacts';
import type { LocationRecord, PersonRecord } from '../src/types';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
async function fixture() {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `person-name-${randomUUID()}` });
  const f = leadershipFixture(), batch = db.batch();
  for (const [path, data] of f.records) batch.create(db.doc(path), data);
  await batch.commit();
  const store = new FirestoreDirectoryStore(db);
  const build = async (id = 'incumbent') => {
    const current = { ...(await db.doc(`people/${id}`).get()).data(), id } as PersonRecord;
    const updated = serializePersonUpdate(current, { fullName: 'Updated Manager', name: 'Updated Manager' });
    const locations = (await db.collection('locations').get()).docs.map(d => ({ ...d.data(), id: d.id })) as LocationRecord[];
    const writes: DirectoryWrite[] = [{ collection: 'people', id, operation: 'set', expectedVersion: current.version, data: updated.data }];
    for (const l of locations) {
      const changed = reconcileLocationLeadershipCopy(l, id, updated.person, '', () => 'unused', ['fullName']);
      if (changed !== l) writes.push({ collection: 'locations', id: l.id, operation: 'set', expectedVersion: l.version, data: changed as unknown as Record<string, unknown> });
    }
    return writes;
  };
  return { db, store, build };
}
test('SDK coordinated rename updates Person and all matching names with one mandatory audit and preserved assignments', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const beforeUnit = (await f.db.doc('districts/01').get()).data(), beforeTenure = (await f.db.doc('leadership_assignments/existing').get()).data();
    await f.store.commit(await f.build(), null, actor);
    assert.equal((await f.db.doc('people/incumbent').get()).data()!.fullName, 'Updated Manager');
    assert.equal((await f.db.doc('locations/007').get()).data()!.districtManagerName, 'Updated Manager');
    assert.equal((await f.db.doc('locations/007').get()).data()!.districtManagerId, 'incumbent');
    assert.deepEqual((await f.db.doc('districts/01').get()).data(), beforeUnit);
    assert.deepEqual((await f.db.doc('leadership_assignments/existing').get()).data(), beforeTenure);
    const audits = await f.db.collection('audit_logs').get(); assert.equal(audits.size, 1); assert.equal(audits.docs[0].data().action, 'Manager Name Updated');
  } finally { await f.db.terminate(); }
});

test('SDK lifecycle-owned retail store permits only complete validated manager-name propagation',{timeout:90_000},async()=>{
  const f=await fixture();
  try{
    await f.db.doc('regions/01').update({leadershipModelVersion:1,leadershipVersion:1,regionalManagerId:null});
    await f.db.doc('locations/007').update({locationLifecycleModelVersion:1,hierarchyApplicability:'Applicable',regionalManagerId:null,regionalManagerName:''});
    const manifest=await f.build();
    await assert.rejects(f.store.commit(manifest.slice(0,1),null,actor),/every affected/);
    const tampered=structuredClone(manifest);tampered[1].data!.districtManagerId='new-hire';await assert.rejects(f.store.commit(tampered,null,actor));
    await f.store.commit(manifest,null,actor);
    const saved=(await f.db.doc('locations/007').get()).data()!;assert.equal(saved.districtManagerName,'Updated Manager');assert.equal(saved.districtManagerId,'incumbent');assert.equal(saved.locationLifecycleModelVersion,1);assert.equal(saved.districtId,'01');assert.equal(saved.regionId,'01');
    assert.equal((await f.db.collection('audit_logs').get()).size,1);
  }finally{await f.db.terminate();}
});
test('SDK omitted, stale, extra and unauthorized name batches leave every business record unchanged', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const writes = await f.build();
    await assert.rejects(f.store.commit(writes.slice(0, 1), null, actor), /every affected/);
    const altered = structuredClone(writes); altered[1].data!.districtId = 'other'; await assert.rejects(f.store.commit(altered, null, actor));
    await f.db.doc('locations/007').update({ version: 5 }); await assert.rejects(f.store.commit(writes, null, actor), /concurrently/);
    const fresh = await f.build(); await f.db.doc('users/admin').update({ status: 'Inactive' });
    await assert.rejects(f.store.commit(fresh, null, actor), /authority/);
    assert.equal((await f.db.doc('people/incumbent').get()).data()!.fullName, 'Current Manager');
    assert.equal((await f.db.doc('locations/007').get()).data()!.districtManagerName, 'Current Manager');
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});
test('SDK concurrent handover invalidates a prepared generic name manifest without a partial save', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const writes = await f.build();
    // Simulates another reviewed handover committing after the browser read.
    const batch = f.db.batch(); batch.update(f.db.doc('districts/01'), { districtManagerId: null, version: 4, leadershipVersion: 3 });
    batch.update(f.db.doc('leadership_assignments/existing'), { status: 'ended', endedAt: '2026-10-28T12:00:00.000Z' });
    batch.update(f.db.doc('locations/007'), { districtManagerId: null, districtManagerName: '', version: 5 }); await batch.commit();
    await assert.rejects(f.store.commit(writes, null, actor), /concurrently/);
    assert.equal((await f.db.doc('people/incumbent').get()).data()!.fullName, 'Current Manager');
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});

test('SDK Additional manager without a copied Location label renames without changing the Primary', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await f.db.doc('leadership_assignments/additional').create({ unitType: 'district', unitId: '01', personId: 'new-hire', status: 'active', startedAt: '2026-10-28T12:00:00.000Z', endedAt: null, version: 1 });
    await f.store.commit(await f.build('new-hire'), null, actor);
    assert.equal((await f.db.doc('people/new-hire').get()).data()!.fullName, 'Updated Manager');
    assert.equal((await f.db.doc('districts/01').get()).data()!.districtManagerId, 'incumbent');
    assert.equal((await f.db.doc('locations/007').get()).data()!.districtManagerName, 'Current Manager');
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 2);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('SDK newly linked Location and oversized audit both reject without partial rename', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const writes = await f.build();
    await f.db.doc('locations/new-link').create({ ...(await f.db.doc('locations/007').get()).data(), storeNumber: '008' });
    await assert.rejects(f.store.commit(writes, null, actor), /every affected/);
    // A preserved unrelated document field makes the complete before/after audit too large.
    await f.db.doc('people/incumbent').update({ preservedNote: 'x'.repeat(500_000) });
    await assert.rejects(f.store.commit(await f.build(), null, actor), /audit exceeds/);
    assert.equal((await f.db.doc('people/incumbent').get()).data()!.fullName, 'Current Manager');
    for (const id of ['007', 'new-link']) assert.equal((await f.db.doc(`locations/${id}`).get()).data()!.districtManagerName, 'Current Manager');
    assert.equal((await f.db.collection('audit_logs').get()).size, 0);
  } finally { await f.db.terminate(); }
});
