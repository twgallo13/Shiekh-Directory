import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBoundary, type SessionState } from '../src/lib/authSession';
import { createOrganizationHttpPort, parseOrganizationCapabilities, parseOrganizationCatalog, parseOrganizationOutcome, parseOrganizationPreparation, parseOrganizationList } from '../src/lib/organizationLeadershipClient';
import { beginOrganizationRoster, buildOrganizationRosterIntent } from '../src/lib/organizationRosterDraft';
import { organizationCatalogFixture, organizationPreparedFixture } from './helpers/organizationWorkflowFixture';

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(request: typeof fetch) {
  const b = createSessionBoundary(); b.update({ status: 'authorized', user: { uid: 'actor', getIdToken: async () => 'synthetic-token' }, account: { uid: 'actor', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide' }, error: '' } as SessionState);
  return { b, port: createOrganizationHttpPort({ session: b.snapshot, generation: b.generation, request, timeoutMs: 30 }) };
}
test('client rejects partial, malformed and contact-enriched catalogs instead of adopting them', () => {
  const good = organizationCatalogFixture(); assert.deepEqual(parseOrganizationCatalog(good), good);
  for (const edit of [(v: any) => v.complete = false, (v: any) => v.units.push(v.units[0]), (v: any) => v.people[0].workEmail = 'PRIVATE@example.test', (v: any) => v.units[0].members = [null], (v: any) => v.units[0].id = '01/other', (v: any) => v.people = [null]]) {
    const bad = structuredClone(good); edit(bad); assert.throws(() => parseOrganizationCatalog(bad));
  }
});
test('prepared response must match the exact operation, members, Primary, unit namespaces and reason', () => {
  const c = organizationCatalogFixture(), intent = { operationId: 'operation-1', units: buildOrganizationRosterIntent(c, [beginOrganizationRoster(c.units[1], c, 'new-hire')], '') };
  const good = organizationPreparedFixture(intent); assert.deepEqual(parseOrganizationPreparation(good, intent), good);
  for (const edit of [(v: any) => v.operationId = 'different', (v: any) => v.review[0].primaryPersonId = 'new-hire', (v: any) => v.review[0].unitType = 'region', (v: any) => v.review[0].members.pop(), (v: any) => v.review[0].reason = 'different', (v: any) => v.review[0].members[0].isPrimary = false]) {
    const bad = structuredClone(good); edit(bad); assert.throws(() => parseOrganizationPreparation(bad, intent));
  }
});
test('capability, terminal identity and complete pending-list schemas are strict', () => {
  assert.throws(() => parseOrganizationCapabilities({ schemaVersion: 1, newCommandsEnabled: true, recoveryEnabled: false, catalogEnabled: true }));
  assert.throws(() => parseOrganizationOutcome({ schemaVersion: 1, operationId: 'other', state: 'missing' }, 'original'));
  assert.throws(() => parseOrganizationList({ schemaVersion: 1, complete: false, operations: [] }));
  assert.throws(() => parseOrganizationList({ schemaVersion: 1, complete: true, operations: [{ operationId: 'original', state: 'prepared', updatedAt: 'bad', expiresAt: 'bad' }] }));
});
test('session loss during token loading prevents sending a request', async () => {
  let calls = 0, release: (value: string) => void;
  const f = fixture(async () => { calls++; return response({}); });
  const s = f.b.snapshot(); s.user!.getIdToken = () => new Promise(resolve => { release = resolve; });
  const pending = f.port.catalog(); f.b.update({ ...s, status: 'signed-out', user: null, account: null }); release!('synthetic-token');
  await assert.rejects(pending); assert.equal(calls, 0); f.port.dispose();
});
test('deadline stops an unresolved token read and cannot later start a stale request', async () => {
  let calls = 0, release: (value: string) => void;
  const f = fixture(async () => { calls++; return response({}); });
  f.b.snapshot().user!.getIdToken = () => new Promise(resolve => { release = resolve; });
  await assert.rejects(f.port.catalog()); release!('synthetic-token'); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls, 0); f.port.dispose();
});
test('one failed commit is not retried; infrastructure text stays private and requests are noncacheable', async () => {
  let calls = 0;
  const f = fixture(async (url, init) => {
    calls++; assert.equal(url, '/api/directory/organization-leadership/commit'); assert.equal(init?.cache, 'no-store'); assert.equal(init?.redirect, 'error');
    return response({ error: { code: 'unknown', message: 'PRIVATE infrastructure' } }, 503);
  });
  try { await assert.rejects(f.port.commit('operation-1', 'a'.repeat(64)), error => error instanceof Error && !error.message.includes('PRIVATE')); assert.equal(calls, 1); }
  finally { f.port.dispose(); }
});
test('late success after auth generation changes cannot be applied', async () => {
  let release: (value: Response) => void;
  const f = fixture(async () => new Promise<Response>(resolve => { release = resolve; }));
  const pending = f.port.catalog(); await Promise.resolve(); await Promise.resolve(); f.b.invalidate();
  release!(response(organizationCatalogFixture())); await assert.rejects(pending); f.port.dispose();
});
