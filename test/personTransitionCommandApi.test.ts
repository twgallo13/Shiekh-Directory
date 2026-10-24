import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import type { Account } from '../server/authAuthority';
import { AuthenticationUnavailable } from '../server/authAuthority';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import { DirectoryConflict, DirectoryWriteDenied, FirestoreDirectoryStore, type DirectoryWriter } from '../server/firestoreDirectory';
import { personTransitionCapabilities } from '../server/personTransitionConfiguration';

const actor: Account = { uid: 'synthetic-admin', name: 'Synthetic', email: null, emailVerified: false, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'test' };
const intent = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager'], lifecycle: 'keep', reason: 'Synthetic', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
const command = { schemaVersion: 1, operationId: '11111111-1111-4111-8111-111111111111', intent, reviewEnvelope: 'synthetic-envelope' };
const marker = { schemaVersion: 1, operationId: command.operationId, personId: 'subject', commandDigest: 'a'.repeat(64) };
async function fixture() {
  const state = { actor, authError: null as Error | null, command: false, recovery: false, failure: null as Error | null }, calls: { mode: string; body?: unknown; uid: string }[] = [];
  const call = async (mode: string, body: unknown, current: Account) => { calls.push({ mode, body, uid: current.uid }); if (state.failure) throw state.failure; return { synthetic: mode }; };
  const store: DirectoryWriter = {
    commit: async () => { throw new Error('Generic commit forbidden'); }, personTransitionCapabilities: () => ({ schemaVersion: 1, newCommandsEnabled: state.command, recoveryEnabled: state.recovery }),
    previewPersonTransitionCommand: (async (body, current) => call('preview', body, current)) as any,
    preparePersonTransitionCommand: (async (body, current) => call('prepare', body, current)) as any,
    commitPersonTransitionCommand: (async (body, current) => call('commit', body, current)) as any,
    readPersonTransitionOperation: (async (body, current) => call('status', body, current)) as any,
    cancelPersonTransitionOperation: (async (body, current) => call('cancel', body, current)) as any,
    listPersonTransitionOperations: (async current => call('operations', undefined, current)) as any,
  };
  const app = express(); app.use('/api/directory', createDirectoryDataRouter(async () => { if (state.authError) throw state.authError; return state.actor; }, store));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as any).port}/api/directory/person-transitions`;
  const request = (mode: string, body?: unknown, token = true) => fetch(`${url}/${mode}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(token ? { Authorization: 'Bearer synthetic' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) });
  return { state, calls, store, request, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}
test('configuration requires both literal gates and dedicated valid key; recovery survives missing or malformed key', () => {
  const key = JSON.stringify({ activeKeyId: 'test', keys: [{ id: 'test', secret: Buffer.alloc(32, 0x71).toString('base64url') }] });
  const env = { PERSON_TRANSITION_COMMANDS_ENABLED: 'true', PERSON_TRANSITION_RECOVERY_ENABLED: 'true', PERSON_TRANSITION_REVIEW_KEYRING: key };
  assert.deepEqual(personTransitionCapabilities({}), { schemaVersion: 1, newCommandsEnabled: false, recoveryEnabled: false });
  assert.equal(personTransitionCapabilities(env).newCommandsEnabled, true);
  for (const patch of [{ PERSON_TRANSITION_COMMANDS_ENABLED: 'TRUE' }, { PERSON_TRANSITION_RECOVERY_ENABLED: 'false' }, { PERSON_TRANSITION_REVIEW_KEYRING: '' }, { PERSON_TRANSITION_REVIEW_KEYRING: '{' }]) assert.equal(personTransitionCapabilities({ ...env, ...patch }).newCommandsEnabled, false);
  assert.equal(personTransitionCapabilities({ ...env, PERSON_TRANSITION_REVIEW_KEYRING: '{' }).recoveryEnabled, true);
  const store = new FirestoreDirectoryStore({} as any), previous = process.env.PERSON_TRANSITION_COMMANDS_ENABLED, oldRecovery = process.env.PERSON_TRANSITION_RECOVERY_ENABLED;
  try { delete process.env.PERSON_TRANSITION_COMMANDS_ENABLED; delete process.env.PERSON_TRANSITION_RECOVERY_ENABLED;
    assert.throws(() => store.preparePersonTransitionCommand(command, actor), /disabled/); assert.throws(() => store.commitPersonTransitionCommand(command, actor), /disabled/);
    assert.throws(() => store.readPersonTransitionOperation(marker, actor), /disabled/); assert.throws(() => store.cancelPersonTransitionOperation(marker, actor), /disabled/); assert.throws(() => store.listPersonTransitionOperations(actor), /disabled/);
  } finally { if (previous === undefined) delete process.env.PERSON_TRANSITION_COMMANDS_ENABLED; else process.env.PERSON_TRANSITION_COMMANDS_ENABLED = previous; if (oldRecovery === undefined) delete process.env.PERSON_TRANSITION_RECOVERY_ENABLED; else process.env.PERSON_TRANSITION_RECOVERY_ENABLED = oldRecovery; }
});
test('all command/recovery/capability routes authenticate first and default-disabled gates never invoke helpers', async () => {
  const f = await fixture();
  try {
    for (const mode of ['capabilities', 'operations', 'prepare', 'commit', 'status', 'cancel']) {
      const body = ['capabilities', 'operations'].includes(mode) ? undefined : '{';
      assert.equal((await f.request(mode, body, false)).status, 401);
      f.state.actor = { ...actor, role: 'Viewer' }; assert.equal((await f.request(mode, body)).status, 403); f.state.actor = actor;
    }
    assert.deepEqual(await (await f.request('capabilities')).json(), { schemaVersion: 1, newCommandsEnabled: false, recoveryEnabled: false });
    for (const mode of ['prepare', 'commit', 'status', 'cancel']) assert.equal((await f.request(mode, '{}')).status, 503);
    assert.equal((await f.request('operations')).status, 503); assert.equal(f.calls.length, 0);
    f.state.authError = new AuthenticationUnavailable(); assert.equal((await f.request('capabilities')).status, 503);
  } finally { await f.close(); }
});
test('fixed command/marker bodies are normalized and bounded; private results have no ETag and arbitrary writes never pass', async () => {
  const f = await fixture(); f.state.command = f.state.recovery = true;
  try {
    for (const mode of ['prepare', 'commit']) {
      const response = await f.request(mode, command); assert.equal(response.status, 200); assert.equal(response.headers.get('etag'), null); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await f.request(mode, { ...command, writes: [] })).status, 400);
    }
    for (const mode of ['status', 'cancel']) { assert.equal((await f.request(mode, marker)).status, 200); assert.equal((await f.request(mode, { ...marker, actorUid: 'other' })).status, 400); }
    assert.equal((await f.request('status', '{')).status, 400); assert.equal((await f.request('cancel', ' '.repeat(128 * 1024) + JSON.stringify(marker))).status, 413);
    assert.deepEqual(f.calls.map(c => c.mode), ['prepare', 'commit', 'status', 'cancel']); assert.ok(f.calls.every(c => c.uid === actor.uid));
    assert.deepEqual(f.calls[0].body, command);
  } finally { await f.close(); }
});
test('new-command kill switch and incomplete writer methods do not strand keyless recovery', async () => {
  const f = await fixture(); f.state.command = f.state.recovery = true;
  try {
    delete f.store.commitPersonTransitionCommand;
    assert.deepEqual(await (await f.request('capabilities')).json(), { schemaVersion: 1, newCommandsEnabled: false, recoveryEnabled: true });
    assert.equal((await f.request('prepare', command)).status, 503);
    f.state.command = false;
    for (const mode of ['status', 'cancel']) assert.equal((await f.request(mode, marker)).status, 200);
    assert.equal((await f.request('operations')).status, 200);
    assert.deepEqual(f.calls.map(c => c.mode), ['status', 'cancel', 'operations']);
  } finally { await f.close(); }
});
test('conflicts and revoked authority map to fixed errors without leaking backend details; 50-marker recovery fits its rate budget', async () => {
  const f = await fixture(); f.state.recovery = true;
  try {
    for (const [error, expected] of [[new DirectoryConflict('PRIVATE'), 409], [new DirectoryWriteDenied('PRIVATE'), 403], [new Error('PRIVATE'), 503]] as const) { f.state.failure = error; const r = await f.request('status', marker); assert.equal(r.status, expected); assert.doesNotMatch(await r.text(), /PRIVATE/); }
    f.state.failure = null;
    const statuses = await Promise.all(Array.from({ length: 50 }, () => f.request('status', marker))); assert.ok(statuses.every(r => r.status === 200));
    assert.equal((await f.request('operations')).status, 200);
  } finally { await f.close(); }
});
