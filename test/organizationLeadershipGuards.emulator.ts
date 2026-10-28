import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
    const intent = { schemaVersion: 1, personId: 'new-hire', positionIds: ['district-manager', 'regional-manager'], lifecycle: 'keep', reason: 'Synthetic review', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
    await assert.rejects(previewPersonTransitionCommand(f.db, intent, actor, signer, f.clock), /roster-aware/);
    assert.equal((await f.db.collection('audit_logs').get()).size, 1);
  } finally { await f.db.terminate(); }
});
