import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTransitionCommandHttpPort, TransitionTransportError } from '../src/lib/personTransitionHttp';
import type { SessionState } from '../src/lib/authSession';
import type { ClientTransitionCommand } from '../src/lib/personTransitionController';

const marker = { schemaVersion: 1 as const, operationId: '11111111-1111-4111-8111-111111111111', personId: 'subject', commandDigest: 'a'.repeat(64) };
const command: ClientTransitionCommand = { schemaVersion: 1, operationId: marker.operationId, intent: { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager'], lifecycle: 'keep', reason: 'Synthetic', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] }, reviewEnvelope: 'SYNTHETIC_REVIEW' };
function fixture(enabled = true, timeoutMs = 1000, recoveryEnabled = enabled) {
  let generation = 0, tokenCalls = 0, token = async () => 'SYNTHETIC_ID_TOKEN';
  const state: SessionState = { status: 'authorized', user: { uid: 'synthetic-admin', getIdToken: async () => { tokenCalls++; return token(); } }, account: { uid: 'synthetic-admin', name: 'Synthetic', email: null, emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' }, error: '' };
  const calls: { url: string; init: RequestInit }[] = []; let respond: (url: string, init: RequestInit) => Promise<Response> = async () => Response.json({ accepted: true });
  const port = createTransitionCommandHttpPort({ session: () => state, generation: () => generation, enabled, recoveryEnabled, timeoutMs, request: (async (url, init) => { calls.push({ url: String(url), init: init! }); return respond(String(url), init!); }) as typeof fetch });
  return { port, state, calls, generation: () => { generation++; }, tokens: () => tokenCalls, token: (value: typeof token) => { token = value; }, respond: (value: typeof respond) => { respond = value; } };
}

test('HTTP port is disabled unless explicitly enabled; actor/scope/generation checks precede token or network calls', async () => {
  const f = fixture(false);
  for (const action of [() => f.port.list(), () => f.port.status(marker), () => f.port.prepare(command), () => f.port.commit(command), () => f.port.cancel(marker)]) await assert.rejects(action, TransitionTransportError);
  assert.equal(f.tokens(), 0); assert.equal(f.calls.length, 0);
  const denied = fixture(); denied.state.account!.role = 'Viewer'; await assert.rejects(denied.port.list()); assert.equal(denied.tokens(), 0);
  const changed = fixture(); changed.generation(); await assert.rejects(changed.port.list()); assert.equal(changed.calls.length, 0);
});

test('HTTP port uses only fixed same-origin paths, header authentication, no-store/error redirects and detached fixed bodies', async () => {
  const f = fixture(); await f.port.list(); await f.port.status(marker); await f.port.prepare(command); await f.port.commit(command); await f.port.cancel(marker);
  assert.deepEqual(f.calls.map(c => c.url), ['operations', 'status', 'prepare', 'commit', 'cancel'].map(p => '/api/directory/person-transitions/' + p));
  for (const [index, call] of f.calls.entries()) {
    assert.equal(call.init.method, index === 0 ? 'GET' : 'POST'); assert.equal(call.init.cache, 'no-store'); assert.equal(call.init.redirect, 'error'); assert(call.init.signal);
    assert.equal((call.init.headers as Record<string, string>).Authorization, 'Bearer SYNTHETIC_ID_TOKEN'); assert.doesNotMatch(call.url + (call.init.body ?? ''), /SYNTHETIC_ID_TOKEN/);
  }
  assert.deepEqual(JSON.parse(f.calls[2].init.body as string), command);
});

test('HTTP port rejects arbitrary command/marker fields or invalid token without dispatch', async () => {
  const f = fixture(); await assert.rejects(async () => f.port.prepare({ ...command, writes: [] } as any)); await assert.rejects(async () => f.port.cancel({ ...marker, actorId: 'forged' } as any)); assert.equal(f.calls.length, 0);
  for (const value of ['', 'has whitespace', 'x'.repeat(8193)]) { f.token(async () => value); await assert.rejects(f.port.list()); }
  assert.equal(f.calls.length, 0);
});

test('delayed token cannot dispatch after same-UID session generation changes', async () => {
  const f = fixture(); let release!: (value: string) => void; f.token(() => new Promise(resolve => { release = resolve; }));
  const pending = f.port.prepare(command); f.generation(); release('SYNTHETIC_ID_TOKEN'); await assert.rejects(pending); assert.equal(f.calls.length, 0);
});

test('session changes during response parsing prevent late successful completion', async () => {
  const f = fixture(); let release!: (value: unknown) => void;
  f.respond(async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: () => new Promise(resolve => { release = resolve; }) }) as Response);
  const pending = f.port.commit(command); await new Promise(resolve => setTimeout(resolve, 0)); f.generation(); release({ accepted: true }); await assert.rejects(pending); assert.equal(f.calls.length, 1);
});

test('token/body deadlines and disposal abort without hidden late dispatch or automatic retries', async () => {
  const token = fixture(true, 10); let releaseToken!: (value: string) => void; token.token(() => new Promise(resolve => { releaseToken = resolve; }));
  await assert.rejects(token.port.prepare(command)); releaseToken('SYNTHETIC_ID_TOKEN'); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(token.calls.length, 0);
  const body = fixture(true, 10); let releaseBody!: (value: unknown) => void;
  body.respond(async () => ({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: () => new Promise(resolve => { releaseBody = resolve; }) }) as Response);
  await assert.rejects(body.port.commit(command)); assert.equal(body.calls.length, 1); assert.equal(body.calls[0].init.signal!.aborted, true); releaseBody({ accepted: true }); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(body.calls.length, 1);
  const disposed = fixture(true, 1000); let finish!: (value: string) => void; disposed.token(() => new Promise(resolve => { finish = resolve; }));
  const pending = disposed.port.prepare(command); disposed.port.dispose(); await assert.rejects(pending); finish('SYNTHETIC_ID_TOKEN'); await new Promise(resolve => setTimeout(resolve, 0)); assert.equal(disposed.calls.length, 0);
});

test('HTTP/network errors and malformed success never expose private server details or retry', async () => {
  for (const status of [400, 401, 403, 409, 413, 429, 503]) {
    const f = fixture(); f.respond(async () => new Response('PRIVATE_SERVER_DETAIL', { status }));
    await assert.rejects(f.port.commit(command), error => { assert(error instanceof TransitionTransportError); assert.equal(error.status, status); assert.doesNotMatch(error.message, /PRIVATE/); return true; }); assert.equal(f.calls.length, 1);
  }
  for (const response of [() => new Response('PRIVATE_HTML', { headers: { 'content-type': 'text/html' } }), () => new Response('PRIVATE_BAD_JSON', { headers: { 'content-type': 'application/json' } })]) {
    const f = fixture(); f.respond(async () => response()); await assert.rejects(f.port.commit(command), error => { assert.doesNotMatch(String(error), /PRIVATE/); return true; }); assert.equal(f.calls.length, 1);
  }
});

test('recovery-only transport can inspect/seal old operations while new admission stays disabled', async () => {
  const f = fixture(false, 1000, true); await f.port.list(); await f.port.status(marker); await f.port.cancel(marker);
  await assert.rejects(f.port.prepare(command)); await assert.rejects(f.port.commit(command)); assert.equal(f.calls.length, 3);
});
