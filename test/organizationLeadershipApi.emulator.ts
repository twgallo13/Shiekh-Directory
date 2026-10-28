import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { Firestore } from '@google-cloud/firestore';
import express from 'express';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { leadershipFixture, leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { prepareOrganizationLeadership, listOrganizationLeadershipOperations, ORGANIZATION_OPERATION_COLLECTION, ORGANIZATION_ADMISSION_COLLECTION, ORGANIZATION_REVIEW_TTL_MS } from '../server/organizationLeadershipOperations';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
test('HTTP → Store → SDK: gated catalog, prepared review, paused-command recovery, one commit and live authority loss', { timeout: 90_000 }, async () => {
  const keys = ['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED', 'ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED', 'ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'];
  const previous = keys.map(key => process.env[key]);
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `http-${randomUUID()}` });
  const f = leadershipFixture(), batch = db.batch();
  for (const [path, data] of f.records) batch.create(db.doc(path), data);
  await batch.commit();
  const app = express();
  // Authentication is mocked ONLY in this isolated harness. Live Directory authority uses the real SDK.
  app.use('/api/directory', createDirectoryDataRouter(async token => { assert.equal(token, 'synthetic-token'); return actor; }, new FirestoreDirectoryStore(db)));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (mode: string, body?: unknown) => fetch(`http://127.0.0.1:${(server.address() as any).port}/api/directory/organization-leadership/${mode}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    keys.forEach(key => delete process.env[key]);
    assert.equal((await request('prepare', f.intent)).status, 503);
    assert.equal((await db.collection('organization_leadership_operations').get()).size, 0);
    keys.forEach(key => process.env[key] = 'true');
    const catalogResponse = await request('catalog'); assert.equal(catalogResponse.status, 200);
    const catalog = await catalogResponse.json(); assert.equal(catalog.complete, true); assert.equal(catalog.units.length, 2);
    assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE|workEmail|firebaseUid/);
    const pResponse = await request('prepare', f.intent); assert.equal(pResponse.status, 200);
    const p = await pResponse.json(), marker = { operationId: p.operationId, reviewHash: p.reviewHash };
    assert.equal(p.state, 'prepared');
    assert.equal((await (await request('operations')).json()).operations.length, 1);
    process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED = 'false';
    assert.equal((await request('commit', marker)).status, 503);
    assert.equal((await (await request('status', marker)).json()).state, 'prepared');
    process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED = 'true';
    const savedResponse = await request('commit', marker); assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json(); assert.equal(saved.state, 'committed');
    assert.deepEqual(await (await request('commit', marker)).json(), saved);
    assert.equal((await db.collection('audit_logs').get()).size, 1);
    assert.equal((await (await request('operations')).json()).operations.length, 0);
    await db.doc('users/admin').update({ role: 'Viewer' });
    assert.equal((await request('catalog')).status, 403);
    assert.equal((await request('status', marker)).status, 403);
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.terminate();
  }
});

test('SDK: competing preparations at the pending-review limit serialize through one actor admission record', { timeout: 90_000 }, async () => {
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `admission-${randomUUID()}` });
  try {
    const f = leadershipFixture(), batch = db.batch(), createdAt = Date.now();
    for (const [path, data] of f.records) batch.create(db.doc(path), data);
    // Metadata-only synthetic backlog: the masked admission/list query must count every prepared row.
    for (let i = 0; i < 99; i++) {
      const operationId = `backlog-${i}`, key = createHash('sha256').update(JSON.stringify(['organization-leadership-v1', actor.uid, operationId])).digest('hex');
      batch.create(db.collection(ORGANIZATION_OPERATION_COLLECTION).doc(key), { schemaVersion: 1, actorUid: actor.uid, operationId, state: 'prepared', createdAt, updatedAt: createdAt, expiresAt: createdAt + ORGANIZATION_REVIEW_TTL_MS });
    }
    await batch.commit();
    const attempts = await Promise.allSettled(['one', 'two'].map(suffix => prepareOrganizationLeadership(db, { ...f.intent, operationId: `candidate-${suffix}` }, actor)));
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
    const refused = attempts.find(r => r.status === 'rejected') as PromiseRejectedResult;
    assert.equal(refused.reason.code, 'capacity');
    assert.equal((await listOrganizationLeadershipOperations(db, actor)).operations.length, 100);
    const barriers = await db.collection(ORGANIZATION_ADMISSION_COLLECTION).get();
    assert.equal(barriers.size, 1); assert.equal(barriers.docs[0].data().version, 1);
    assert.equal((await db.doc('districts/01').get()).data()!.version, 3);
  } finally { await db.terminate(); }
});
