import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import type { Firestore } from '@google-cloud/firestore';
import type { Account } from '../server/authAuthority';
import { previewPersonTransition, TRANSITION_PREVIEW_LIMITS } from '../server/personTransitionPreview';
import { createDirectoryDataRouter } from '../server/directoryDataApi';

const actor: Account = { uid: 'admin', name: 'Admin', email: null, emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
const clock = () => new Date('2026-10-22T18:00:00Z');
function fixture() {
  const records = new Map<string, Record<string, any>>([
    ['users/admin', { firebaseUid: 'admin', role: actor.role, status: 'Active', accessScope: 'Company-wide' }],
    ['people/person', { fullName: 'Private name', workEmail: 'private@example.test', version: 2, status: 'Active', primaryLocationId: 'missing', supportedLocationIds: ['store'] }],
    ['districts/owned', { name: 'Owned', status: 'Retired', regionId: 'west', districtManagerId: 'person', version: 3 }],
    ['districts/vacant', { name: 'Vacant', status: 'Active', regionId: 'west', districtManagerId: null }],
    ['regions/west', { name: 'West', status: 'Active', version: 1 }],
    ['locations/store', { name: 'Store', storeNumber: '007', type: 'Enclosed Mall', recordStatus: 'Active', districtId: 'owned', storeManagerId: 'person', districtManagerId: 'other', locationInboxEmail: 'private-store@example.test', version: 5 }],
    ['locations/stale', { name: 'Stale', storeNumber: '008', type: 'Enclosed Mall', recordStatus: 'Retired', districtId: 'vacant', districtManagerId: 'person' }],
    ['users/linked', { personId: 'person', role: 'Viewer', status: 'Revoked', email: 'private-user@example.test', version: 4 }],
    ['requests/pending', { status: 'Pending', targetId: 'unrelated', targetType: 'Location', changeType: 'Store Manager Change', requestedChanges: { districtManagerId: 'person', secret: 'private prose' }, currentSnapshot: {}, reason: 'private reason', version: 1 }],
    ['requests/old', { status: 'Approved', targetId: 'person', targetType: 'Person', reason: 'private historical prose' }],
  ]);
  const reads: string[] = [];
  let fail = false;
  class Query {
    keys?: string[]; field?: string; value?: unknown; max = Infinity;
    constructor(public name: string) {}
    select(...keys: string[]) { this.keys = keys; return this; }
    limit(n: number) { this.max = n; return this; }
    where(field: string, op: string, value: unknown) { assert.equal(op, '=='); this.field = field; this.value = value; return this; }
    doc(id: string) { return { path: this.name + '/' + id }; }
  }
  const snapshot = (path: string, keys?: string[]) => ({ id: path.split('/')[1], exists: records.has(path), data: () => {
    const source = records.get(path); if (!source) return undefined;
    if (!keys) return structuredClone(source);
    const result: Record<string, any> = {};
    for (const key of keys) {
      const [parent, child] = key.split('.');
      if (!child && Object.hasOwn(source, parent)) result[parent] = structuredClone(source[parent]);
      else if (child && source[parent] && Object.hasOwn(source[parent], child)) { result[parent] ||= {}; result[parent][child] = structuredClone(source[parent][child]); }
    }
    return result;
  } });
  const firestore = { collection: (name: string) => new Query(name), runTransaction: async (fn: any, options: unknown) => {
    assert.deepEqual(options, { readOnly: true });
    return fn({ get: async (q: Query | { path: string }) => {
      if (fail) throw new Error('database unavailable');
      if ('path' in q) { reads.push(q.path); return snapshot(q.path); }
      assert(Number.isFinite(q.max)); assert(q.keys?.length); reads.push(q.name);
      const docs = [...records].filter(([path, value]) => path.startsWith(q.name + '/') && (!q.field || value[q.field] === q.value)).slice(0, q.max).map(([path]) => snapshot(path, q.keys));
      return { docs, size: docs.length };
    } });
  } } as unknown as Firestore;
  return { records, firestore, reads, fail: () => { fail = true; } };
}

test('coherent bounded preview separates authority/history and projects no contacts or private prose', async () => {
  const f = fixture(), before = structuredClone([...f.records]);
  const p = await previewPersonTransition(f.firestore, 'person', actor, clock);
  assert.equal(p.completeWithinScope, true); assert.equal(p.personVersion, 2);
  assert.equal(p.evaluatedAt, clock().toISOString()); assert.equal(p.expiresAt, '2026-10-22T18:05:00.000Z');
  assert.deepEqual(p.review.responsibilities.map(r => r.key), ['district:owned', 'store:storeManagerId']);
  assert.equal(p.review.inheritedStores[0].locationId, 'store');
  assert.equal(p.review.historicalCopies[0].id, 'stale');
  assert(p.review.workplaces.some(row => row.locationId === 'missing' && row.unavailable));
  assert.equal(p.review.accounts[0].status, 'Revoked');
  assert.deepEqual(p.review.pendingRequests.map(r => r.id), ['pending']);
  assert.equal(p.scanned.requests, 1); assert.equal(p.versions.find(r => r.id === 'vacant')?.version, null);
  assert(!JSON.stringify(p).includes('private')); assert(!JSON.stringify(p).includes('Private name'));
  assert.deepEqual([...f.records], before);
});

test('digest is deterministic, changes on unversioned authority edits/additions/removal, not private contact edits', async () => {
  const f = fixture(), read = () => previewPersonTransition(f.firestore, 'person', actor, clock);
  const first = await read(); assert.equal((await read()).digest, first.digest);
  f.records.get('people/person')!.workEmail = 'other@example.test'; assert.equal((await read()).digest, first.digest);
  f.records.get('districts/vacant')!.districtManagerId = 'person'; const changed = await read(); assert.notEqual(changed.digest, first.digest);
  f.records.set('districts/new', { name: 'New', regionId: 'west', status: 'Active', districtManagerId: 'person' }); const added = await read(); assert.notEqual(added.digest, changed.digest);
  f.records.delete('districts/new'); assert.equal((await read()).digest, changed.digest);
});

test('malformed projected relationships or metadata fail closed instead of certifying an incomplete review', async () => {
  const cases: [string, string, unknown][] = [
    ['people/person', 'supportedLocationIds', 'store'], ['people/person', 'supportedLocationIds', [null]],
    ['people/person', 'primaryLocationId', 12], ['people/person', 'activeStatus', 'false'], ['people/person', 'positionIds', 'district-manager'],
    ['locations/store', 'assistantStoreManagerIds', 'person'], ['locations/store', 'keyHolderIds', [42]],
    ['locations/store', 'districtManagerId', ['person']], ['locations/store', 'storeNumber', 7], ['locations/store', 'districtId', {}],
    ['districts/owned', 'districtManagerId', ['person']], ['districts/owned', 'regionId', {}],
    ['regions/west', 'name', {}], ['users/linked', 'personId', ['person']], ['users/linked', 'role', {}],
    ['requests/pending', 'targetId', {}], ['requests/pending', 'targetType', 'Unknown'],
    ['requests/pending', 'requestedChanges', { assistantStoreManagerIds: 'person' }],
    ['requests/pending', 'currentSnapshot', { districtManagerId: ['person'] }], ['people/person', 'version', -1],
  ];
  for (const [path, key, value] of cases) {
    const f = fixture(); f.records.get(path)![key] = value; const before = structuredClone([...f.records]);
    await assert.rejects(previewPersonTransition(f.firestore, 'person', actor, clock), /invalid projected fields/, `${path}.${key}`);
    assert.deepEqual([...f.records], before);
  }
});

test('empty dependencies are scoped, missing Person conflicts; no read is a clearance or mutation', async () => {
  const f = fixture(); for (const key of [...f.records.keys()]) if (!['people/person', 'users/admin'].includes(key)) f.records.delete(key);
  const p = await previewPersonTransition(f.firestore, 'person', actor, clock);
  assert.equal(p.review.responsibilities.length, 0); assert.equal(p.review.accounts.length, 0);
  assert(p.warnings.join(' ').includes('not a lock')); assert(p.warnings.join(' ').includes('other apps'));
  f.records.delete('people/person'); await assert.rejects(previewPersonTransition(f.firestore, 'person', actor, clock), /no longer exists/);
});

test('role/scope denial happens before inventory; current revoked/downgraded/duplicate account fails closed', async () => {
  for (const change of [{ role: 'Viewer' }, { role: 'Editor' }, { accessScope: 'Store 007' }]) {
    const f = fixture(); await assert.rejects(previewPersonTransition(f.firestore, 'person', { ...actor, ...change } as Account, clock)); assert.equal(f.reads.length, 0);
  }
  for (const mode of ['revoked', 'role', 'scope', 'duplicate', 'missing']) {
    const f = fixture();
    if (mode === 'revoked') f.records.get('users/admin')!.status = 'Suspended';
    if (mode === 'role') f.records.get('users/admin')!.role = 'Editor';
    if (mode === 'scope') f.records.get('users/admin')!.accessScope = 'Store 007';
    if (mode === 'duplicate') f.records.set('users/duplicate', { ...f.records.get('users/admin')! });
    if (mode === 'missing') f.records.delete('users/admin');
    await assert.rejects(previewPersonTransition(f.firestore, 'person', actor, clock)); assert.deepEqual(f.reads, ['users']);
  }
  const f = fixture(); await previewPersonTransition(f.firestore, 'person', { ...actor, role: 'Directory Data Steward' }, clock);
});

test('overflow of each collection, large payload, expired read and database failure return no partial preview', async () => {
  for (const [collection, maximum] of Object.entries(TRANSITION_PREVIEW_LIMITS)) {
    const f = fixture(); for (let n = 0; n <= maximum; n++) f.records.set(`${collection}/extra-${n}`, { status: 'Pending' });
    await assert.rejects(previewPersonTransition(f.firestore, 'person', actor, clock), /capacity exceeded/);
  }
  const large = fixture(); large.records.get('districts/owned')!.name = 'x'.repeat(4_000_001);
  await assert.rejects(previewPersonTransition(large.firestore, 'person', actor, clock), /unavailable/);
  const slow = fixture(); let calls = 0;
  await assert.rejects(previewPersonTransition(slow.firestore, 'person', actor, () => new Date(clock().getTime() + (calls++ ? 300_000 : 0))), /unavailable/);
  const failed = fixture(); failed.fail(); await assert.rejects(previewPersonTransition(failed.firestore, 'person', actor, clock), /unavailable/);
  await assert.rejects(previewPersonTransition(fixture().firestore, '../bad', actor, clock), /Invalid Person ID/);
});

test('internal GET requires authentication and company-wide admin/steward; failures never masquerade as empty inventory', async () => {
  let calls = 0, failure = false, selected = actor;
  const app = express();
  app.use('/api/directory', createDirectoryDataRouter(async () => selected, { commit: async () => { throw new Error('No writes'); }, previewPersonTransition: async (id, current) => { calls++; assert.equal(id, 'person'); assert.equal(current.uid, actor.uid); if (failure) throw new Error('secret backend failure'); return previewPersonTransition(fixture().firestore, id, current, clock); } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const get = (token = true, id = 'person') => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/directory/people/${id}/transition-preview`, { headers: token ? { Authorization: 'Bearer token' } : {} });
  try {
    assert.equal((await get(false)).status, 401); assert.equal(calls, 0);
    for (const role of ['Viewer', 'Editor'] as const) { selected = { ...actor, role }; assert.equal((await get()).status, 403); }
    selected = { ...actor, accessScope: 'Store 007' }; assert.equal((await get()).status, 403); assert.equal(calls, 0);
    selected = actor; assert.equal((await get(true, 'bad!')).status, 400);
    const success = await get(); assert.equal(success.status, 200); assert.equal(success.headers.get('cache-control'), 'no-store'); assert.equal(success.headers.get('etag'), null);
    assert.equal((await success.json()).completeWithinScope, true);
    failure = true; const unavailable = await get(); assert.equal(unavailable.status, 503); assert(!JSON.stringify(await unavailable.json()).includes('secret'));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
