import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import { once } from 'node:events';
import { Firestore } from '@google-cloud/firestore';
import express from 'express';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor } from './helpers/organizationLeadershipFixture';
import { FirestoreDirectoryStore } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { createSessionBoundary, type SessionState } from '../src/lib/authSession';
import { createOrganizationMoveHttpPort } from '../src/lib/organizationMoveClient';
import { openOrganizationMoveWorkflow } from '../src/lib/organizationMoveWorkflow';
import { ORGANIZATION_MOVE_RECOVERY_PREFIX } from '../src/lib/organizationLeadershipRecovery';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Use only the isolated loopback emulator at 127.0.0.1:8089.');
test('controller → HTTP → SDK lost confirmation reply recovers one move without another submission', { timeout: 90_000 }, async () => {
  const keys = ['ORGANIZATION_LEADERSHIP_CATALOG_ENABLED', 'ORGANIZATION_LEADERSHIP_RECOVERY_ENABLED', 'ORGANIZATION_LEADERSHIP_COMMANDS_ENABLED'], previous = keys.map(k => process.env[k]);
  const db = new Firestore({ projectId: 'demo-directory-transitions', databaseId: `move-recovery-${randomUUID()}` });
  const f = moveFixture(), batch = db.batch(); for (const [path, data] of f.records) batch.create(db.doc(path), data); await batch.commit();
  const app = express(); app.use('/api/directory', createDirectoryDataRouter(async token => { assert.equal(token, 'synthetic-token'); return actor; }, new FirestoreDirectoryStore(db)));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as any).port}`, boundary = createSessionBoundary();
  boundary.update({ status: 'authorized', user: { uid: actor.uid, getIdToken: async () => 'synthetic-token' }, account: { ...actor }, error: '' } as SessionState);
  const storage: any = { getItem(key: string) { return Object.hasOwn(this, key) ? this[key] : null; }, setItem(key: string, value: string) { this[key] = value; }, removeItem(key: string) { delete this[key]; } };
  const held = new Set<string>(), locks = { request: async (key: string, _opts: unknown, callback: any) => { if (held.has(key)) return callback(null); held.add(key); try { return await callback({ name: key }); } finally { held.delete(key); } } } as unknown as LockManager;
  let lost = true, commits = 0, prepares = 0, refreshes = 0;
  const port = createOrganizationMoveHttpPort({ session: boundary.snapshot, generation: boundary.generation, request: async (url, init) => {
    if (String(url).endsWith('/prepare')) prepares++; if (String(url).endsWith('/commit')) commits++;
    const response = await fetch(origin + url, init);
    if (String(url).endsWith('/commit') && lost) { lost = false; assert.equal(response.status, 200); throw new Error('Synthetic lost response after server commit'); }
    return response;
  } });
  let controller: Awaited<ReturnType<typeof openOrganizationMoveWorkflow>> | undefined;
  try {
    keys.forEach(k => process.env[k] = 'true');
    controller = await openOrganizationMoveWorkflow({ auth: { currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe }, port, storage, locks, subtle: webcrypto.subtle as SubtleCrypto,
      newOperationId: () => randomUUID(), onChange() {}, refreshSavedDirectory: async () => {
        // Actual saved-record verification callback; this harness is not the app/bootstrap/DOM.
        const saved = (await db.doc('locations/007').get()).data()!; assert.equal(saved.districtId, '02'); assert.equal(saved.regionId, '02'); assert.equal(saved.version, 5); refreshes++;
      } });
    const { operationId: _unused, ...draft } = f.intent;
    await controller.prepare(draft); const id = controller.snapshot().operationId!;
    const key = ORGANIZATION_MOVE_RECOVERY_PREFIX + encodeURIComponent(actor.uid);
    assert.equal(JSON.parse(storage.getItem(key)).operationId, id);
    await controller.commit(); assert.equal(controller.snapshot().phase, 'recovery'); assert(storage.getItem(key));
    assert.equal((await db.collection('audit_logs').get()).size, 1);
    await controller.recover(id); assert.equal(controller.snapshot().phase, 'saved'); assert.equal(storage.getItem(key), null);
    assert.equal(refreshes, 1); assert.equal(prepares, 1); assert.equal(commits, 1);
    assert.equal((await db.collection('audit_logs').get()).size, 1);
  } finally {
    controller?.dispose(); port.dispose(); keys.forEach((k, i) => { if (previous[i] === undefined) delete process.env[k]; else process.env[k] = previous[i]; });
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await db.terminate();
  }
});
