import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { Firestore } from '@google-cloud/firestore';
import express from 'express';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { parseOrganizationMovePreparation, parseOrganizationMoveOutcome } from '../src/lib/organizationMoveClient';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
test('HTTP → Store → SDK move admission, paused recovery, strict review, cancellation and one commit', { timeout: 90_000 }, async () => {
  const keys = ['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED', 'ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED', 'ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'];
  const previous = keys.map(k => process.env[k]);
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `move-http-${randomUUID()}` });
  const f = moveFixture(), batch = db.batch(); for (const [path, data] of f.records) batch.create(db.doc(path), data); await batch.commit();
  const app = express();
  // Provider authentication is mocked only here; live Directory authority uses actual SDK reads.
  app.use('/api/directory', createDirectoryDataRouter(async token => { assert.equal(token, 'synthetic-token'); return actor; }, new FirestoreDirectoryStore(db)));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const request = (mode: string, body?: unknown) => fetch(`http://127.0.0.1:${(server.address() as any).port}/api/directory/organization-moves/${mode}`, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    keys.forEach(k => delete process.env[k]);
    assert.equal((await request('prepare', f.intent)).status, 503); assert.equal((await db.collection('organization_move_operations').get()).size, 0);
    keys.forEach(k => process.env[k] = 'true');
    const catalog = await (await request('catalog')).json(); assert.equal(catalog.complete, true); assert.equal(catalog.units.length, 4); assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE|workEmail|firebaseUid/);
    const prepared = parseOrganizationMovePreparation(await (await request('prepare', f.intent)).json(), f.intent), marker = { operationId: prepared.operationId, reviewHash: prepared.reviewHash };
    assert.equal(prepared.state, 'prepared'); assert.equal((await (await request('operations')).json()).operations.length, 1);
    process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED = 'false'; assert.equal((await request('commit', marker)).status, 503);
    assert.equal((await (await request('status', marker)).json()).state, 'prepared'); assert.equal((await (await request('cancel', marker)).json()).state, 'cancelled');
    assert.equal((await db.doc('locations/007').get()).data()!.districtId, '01');
    process.env.ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED = 'true';
    const nextIntent = { ...f.intent, operationId: 'fresh-move' }, next = parseOrganizationMovePreparation(await (await request('prepare', nextIntent)).json(), nextIntent);
    const confirmation = { operationId: next.operationId, reviewHash: next.reviewHash };
    const saved = parseOrganizationMoveOutcome(await (await request('commit', confirmation)).json(), next.operationId); assert.equal(saved.state, 'committed');
    assert.deepEqual(await (await request('commit', confirmation)).json(), saved);
    assert.equal((await db.doc('locations/007').get()).data()!.districtId, '02'); assert.equal((await db.collection('audit_logs').get()).size, 1);
    assert.equal((await (await request('operations')).json()).operations.length, 0);
    await db.doc('users/admin').update({ role: 'Viewer' });
    assert.equal((await request('catalog')).status, 403); assert.equal((await request('status', confirmation)).status, 403);
  } finally {
    keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.terminate();
  }
});
