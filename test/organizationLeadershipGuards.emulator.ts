import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { preparePersonTransitionRecovery } from '../server/firestorePersonTransitionRecovery';
import { commitPersonTransitionAtomic } from '../server/firestorePersonTransitionAtomic';
import { Firestore } from '@google-cloud/firestore';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { prepareOrganizationLeadership, commitOrganizationLeadership } from '../server/organizationLeadershipOperations';
import { previewPersonTransitionCommand } from '../server/personTransitionCommandPreview';
import { PersonTransitionReviewSigner } from '../server/personTransitionReviewEnvelope';
import { leadershipFixture, leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback Firestore emulator at 127.0.0.1:8089.');
async function fixture() {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `guards-${randomUUID()}` });
  const f = leadershipFixture(), batch = db.batch();
  for (const [path, data] of f.records) batch.create(db.doc(path), data);
  await batch.commit();
  const clock = () => new Date(leadershipNow);
  const prepared = await prepareOrganizationLeadership(db, f.intent, actor, clock);
  assert('reviewHash' in prepared);
  await commitOrganizationLeadership(db, { operationId: prepared.operationId, reviewHash: prepared.reviewHash }, actor, clock);
  return { db, store: new FirestoreDirectoryStore(db), clock };
}

test('SDK Store: generic deletion cannot remove a saved Additional manager; no extra audit is written', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.store.commit([{ collection: 'people', id: 'new-hire', operation: 'delete', expectedVersion: 1 }], null, actor), /responsibilities/);
    assert((await f.db.doc('people/new-hire').get()).exists);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
    assert.equal((await f.db.collection('leadership_assignments').get()).size, 2);
  } finally { await f.db.terminate(); }
});

test('SDK Store: generic Region activation cannot mint command-owned metadata', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.store.commit([{ collection: 'regions', id: '01', operation: 'set', expectedVersion: 1,
      data: { name: 'West', status: 'Active', leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: null } }], null, actor), /server-command/);
    assert.equal((await f.db.doc('regions/01').get()).data()!.leadershipModelVersion, undefined);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('SDK signed preview: roster-aware Person cannot use the old position-removal workflow', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x71).toString('base64url') }] });
    const intent = { schemaVersion: 1, personId: 'new-hire', positionIds: ['regional-manager'], lifecycle: 'keep', reason: 'Synthetic review', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
    await assert.rejects(previewPersonTransitionCommand(f.db, intent, actor, signer, f.clock), /roster-aware/);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});

test('SDK signed Person changes preserve Primary and Additional rosters through commit', { timeout: 90_000 }, async () => {
  for (const personId of ['incumbent', 'new-hire']) {
    const f = await fixture();
    try {
      await f.db.doc('locations/corporate').update({ storeNumber: 'CORP' });
      const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x71).toString('base64url') }] });
      const intent = { schemaVersion: 1, personId, positionIds: ['district-manager', 'regional-manager', 'store-manager'], lifecycle: 'keep', reason: 'Synthetic role extension',
        responsibilities: personId === 'incumbent' ? [{ owner: 'districts', id: '01', field: 'districtManagerId', action: 'retain' }] : [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
      const unitBefore = (await f.db.doc('districts/01').get()).data();
      const storeBefore = (await f.db.doc('locations/007').get()).data();
      const tenuresBefore = (await f.db.collection('leadership_assignments').get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => a.id.localeCompare(b.id));
      const preview = await previewPersonTransitionCommand(f.db, intent, actor, signer, f.clock);
      assert.equal(preview.ready, true, preview.review.blockers.join('; '));
      const command = { schemaVersion: 1, operationId: randomUUID(), intent, reviewEnvelope: preview.reviewEnvelope };
      await preparePersonTransitionRecovery(f.db, command, actor, signer, f.clock);
      const saved = await commitPersonTransitionAtomic(f.db, command, actor, signer, f.clock);
      assert.equal(saved.state, 'committed');
      assert.deepEqual(await commitPersonTransitionAtomic(f.db, command, actor, signer, f.clock), saved);
      assert.deepEqual((await f.db.doc('districts/01').get()).data(), unitBefore);
      assert.deepEqual((await f.db.doc('locations/007').get()).data(), storeBefore);
      assert.deepEqual((await f.db.collection('leadership_assignments').get()).docs.map(d => ({ id: d.id, data: d.data() })).sort((a, b) => a.id.localeCompare(b.id)), tenuresBefore);
      assert.deepEqual((await f.db.doc(`people/${personId}`).get()).data()!.positionIds, ['district-manager', 'regional-manager', 'store-manager']);
      assert.equal((await f.db.collection('audit_logs').get()).size, 2);
    } finally { await f.db.terminate(); }
  }
});

test('SDK commit rejects a new required Region responsibility acquired after preview', { timeout: 90_000 }, async () => {
  const f = await fixture();
  try {
    await f.db.doc('locations/corporate').update({ storeNumber: 'CORP' });
    const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x71).toString('base64url') }] });
    const intent = { schemaVersion: 1, personId: 'new-hire', positionIds: ['district-manager'], lifecycle: 'keep', reason: 'Synthetic unrelated position removal', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
    const preview = await previewPersonTransitionCommand(f.db, intent, actor, signer, f.clock); assert.equal(preview.ready, true);
    const command = { schemaVersion: 1, operationId: randomUUID(), intent, reviewEnvelope: preview.reviewEnvelope };
    await preparePersonTransitionRecovery(f.db, command, actor, signer, f.clock);
    const batch = f.db.batch();
    batch.update(f.db.doc('regions/01'), { leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: 'new-hire' });
    batch.create(f.db.doc('leadership_assignments/new-region'), { unitType: 'region', unitId: '01', personId: 'new-hire', status: 'active', startedAt: leadershipNow, endedAt: null, version: 1 });
    await batch.commit();
    await assert.rejects(commitPersonTransitionAtomic(f.db, command, actor, signer, f.clock), /roster-aware/);
    assert.deepEqual((await f.db.doc('people/new-hire').get()).data()!.positionIds, ['district-manager', 'regional-manager']);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});
