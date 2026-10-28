import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBoundary, type SessionState } from '../src/lib/authSession';
import { createOrganizationMoveHttpPort, parseOrganizationMovePreparation, parseOrganizationMoveOutcome } from '../src/lib/organizationMoveClient';
import { createOrganizationSessionTransport } from '../src/lib/organizationLeadershipClient';
import { moveFixture } from './helpers/organizationMoveFixture';
import { leadershipActor as actor, leadershipNow } from './helpers/organizationLeadershipFixture';
import { prepareOrganizationMove } from '../server/organizationMoveOperations';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(request: typeof fetch) {
  const b = createSessionBoundary(); b.update({ status: 'authorized', user: { uid: 'actor', getIdToken: async () => 'synthetic-token' }, account: { uid: 'actor', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide' }, error: '' } as SessionState);
  return { b, port: createOrganizationMoveHttpPort({ session: b.snapshot, generation: b.generation, request, timeoutMs: 30 }) };
}
test('actual prepared store/parent reviews parse strictly and preserve exact intended destination', async () => {
  for (const kind of ['store', 'district'] as const) {
    const f = moveFixture(); if (kind === 'district') Object.assign(f.intent, { kind, id: '01', expectedVersion: 3 });
    const good = await prepareOrganizationMove(f.firestore, f.intent, actor, () => new Date(leadershipNow));
    assert.deepEqual(parseOrganizationMovePreparation(good, f.intent), good);
    for (const edit of [(v: any) => v.operationId = 'other', (v: any) => v.review.after.districtManager.workEmail = 'PRIVATE', (v: any) => v.review.kind = 'unknown', (v: any) => v.review.after[kind === 'store' ? 'districtId' : 'regionId'] = 'wrong', (v: any) => v.review.businessDocuments++, (v: any) => v.expiresAt = v.updatedAt, (v: any) => v.review.stores[0].phone = 'PRIVATE']) {
      const bad = structuredClone(good); edit(bad); assert.throws(() => parseOrganizationMovePreparation(bad, f.intent));
    }
  }
});
test('terminal move outcomes reject other operation identities, audit domains and enriched bodies', () => {
  const good = { schemaVersion: 1, operationId: 'move-1', state: 'committed', updatedAt: leadershipNow, auditId: `organization-move-${'a'.repeat(64)}`, changedRecords: 1 };
  assert.deepEqual(parseOrganizationMoveOutcome(good, 'move-1'), good);
  for (const edit of [{ operationId: 'other' }, { auditId: `organization-${'a'.repeat(64)}` }, { privateContact: 'PRIVATE' }, { changedRecords: 0 }]) assert.throws(() => parseOrganizationMoveOutcome({ ...good, ...edit }, 'move-1'));
});
test('move transport uses only its fixed private route and never retries a failed confirmation', async () => {
  let calls = 0;
  const f = fixture(async (url, init) => { calls++; assert.equal(url, '/api/directory/organization-moves/commit'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error'); return response({ error: { code: 'unknown', message: 'PRIVATE infrastructure' } }, 503); });
  await assert.rejects(f.port.commit('move-1', 'a'.repeat(64)), error => error instanceof Error && !error.message.includes('PRIVATE'));
  assert.equal(calls, 1); f.port.dispose();
});
test('bad intent and unsupported transport modes cannot transmit credentials or arbitrary data', async () => {
  let calls = 0; const f = fixture(async () => { calls++; return response({}); });
  await assert.rejects(f.port.prepare({ ...moveFixture().intent, privateContact: 'PRIVATE' } as any));
  const transport = createOrganizationSessionTransport({ session: f.b.snapshot, generation: f.b.generation, request: async () => { calls++; return response({}); } }, 'moves');
  await assert.rejects(transport.call('../arbitrary'));
  assert.equal(calls, 0); transport.dispose(); f.port.dispose();
});
test('auth generation changes fence late move replies and token work before a request', async () => {
  let release: (r: Response) => void;
  const f = fixture(async () => new Promise<Response>(resolve => { release = resolve; }));
  const pending = f.port.status('move-1'); await Promise.resolve(); await Promise.resolve(); f.b.invalidate();
  release!(response({ schemaVersion: 1, operationId: 'move-1', state: 'missing' })); await assert.rejects(pending); f.port.dispose();
  let calls = 0, token: (t: string) => void; const g = fixture(async () => { calls++; return response({}); });
  g.b.snapshot().user!.getIdToken = () => new Promise(resolve => { token = resolve; });
  const waiting = g.port.status('move-1'); g.b.update({ ...g.b.snapshot(), status: 'signed-out', user: null, account: null }); token!('synthetic-token'); await assert.rejects(waiting);
  assert.equal(calls, 0); g.port.dispose();
});
test('move deadlines abort unresolved token reads and cannot later send stale work', async () => {
  let calls = 0, release: (t: string) => void; const f = fixture(async () => { calls++; return response({}); });
  f.b.snapshot().user!.getIdToken = () => new Promise(resolve => { release = resolve; });
  await assert.rejects(f.port.status('move-1')); release!('synthetic-token'); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 0); f.port.dispose();
});
