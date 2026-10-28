import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createSessionBoundary, clearProtectedStorage, type SessionState } from '../src/lib/authSession';
import { clearLegacyDirectoryCaches } from '../src/lib/personTransitionRecovery';
import { openOrganizationWorkflow } from '../src/lib/organizationLeadershipWorkflow';
import { ORGANIZATION_RECOVERY_PREFIX } from '../src/lib/organizationLeadershipRecovery';
import { beginOrganizationRoster, buildOrganizationRosterIntent } from '../src/lib/organizationRosterDraft';
import { organizationCatalogFixture, organizationPreparedFixture } from './helpers/organizationWorkflowFixture';

function fixture() {
  const catalog = organizationCatalogFixture(), boundary = createSessionBoundary();
  const session = { status: 'authorized', user: { uid: 'actor', getIdToken: async () => 'token' }, account: { uid: 'actor', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide' }, error: '' } as SessionState;
  boundary.update(session);
  const auth = { currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe };
  let failWrites = false, refreshFails = false, refreshCount = 0, next = 0;
  const storage: any = { getItem(key: string) { return Object.hasOwn(this, key) ? this[key] : null; }, setItem(key: string, value: string) { if (failWrites) throw new Error('Storage unavailable'); this[key] = value; }, removeItem(key: string) { delete this[key]; } };
  const held = new Set<string>();
  const locks = { request: async (key: string, _options: unknown, callback: any) => {
    if (held.has(key)) return callback(null);
    held.add(key); try { return await callback({ name: key }); } finally { held.delete(key); }
  } } as unknown as LockManager;
  const calls: string[] = [];
  let pending: any[] = [], statusValue: any = null;
  const port: any = {
    capabilities: async () => ({ schemaVersion: 1, catalogEnabled: true, recoveryEnabled: true, newCommandsEnabled: true }),
    catalog: async () => structuredClone(catalog), list: async () => ({ schemaVersion: 1, complete: true, operations: pending }),
    prepare: async (intent: any) => { calls.push('prepare'); return organizationPreparedFixture(intent); },
    commit: async (id: string) => { calls.push('commit'); return committed(id); },
    status: async (id: string) => { calls.push('status'); return statusValue ?? { schemaVersion: 1, operationId: id, state: 'missing' }; },
    cancel: async (id: string) => { calls.push('cancel'); return { schemaVersion: 1, operationId: id, state: 'cancelled', updatedAt: catalog.evaluatedAt }; },
    dispose() { calls.push('dispose'); },
  };
  const committed = (id: string) => ({ schemaVersion: 1, operationId: id, state: 'committed', updatedAt: catalog.evaluatedAt, changedRecords: 2, auditId: 'organization-' + createHash('sha256').update(JSON.stringify(['organization-leadership-v1', 'actor', id])).digest('hex') });
  const units = () => buildOrganizationRosterIntent(catalog, [beginOrganizationRoster(catalog.units[1], catalog, 'new-hire')], '');
  const open = () => openOrganizationWorkflow({ auth, port, storage, locks, subtle: webcrypto.subtle as SubtleCrypto, newOperationId: () => `operation-${++next}`,
    refreshSavedDirectory: async () => { refreshCount++; if (refreshFails) throw new Error('Refresh unavailable'); }, onChange() {} });
  const key = ORGANIZATION_RECOVERY_PREFIX + 'actor';
  return { open, auth, boundary, session, storage, key, calls, port, units, committed, held, failWrites: () => { failWrites = true; }, setRefreshFails: (v: boolean) => { refreshFails = v; }, refreshes: () => refreshCount, setStatus: (v: any) => { statusValue = v; }, setPending: (v: any[]) => { pending = v; } };
}

test('durable marker precedes preparation; confirmed commit refreshes saved records before forgetting identity', async () => {
  const f = fixture(), c = await f.open();
  try {
    const prepare = f.port.prepare; f.port.prepare = async (i: any) => { assert.equal(JSON.parse(f.storage.getItem(f.key)).operationId, i.operationId); return prepare(i); };
    await c.prepare(f.units()); assert.equal(c.snapshot().phase, 'review');
    assert.doesNotMatch(f.storage.getItem(f.key), /Manager|personId|reviewHash|reason|token/);
    await c.commit(); assert.equal(c.snapshot().phase, 'saved'); assert.equal(f.refreshes(), 1); assert.equal(f.storage.getItem(f.key), null);
    assert.deepEqual(f.calls.filter(x => x === 'commit'), ['commit']);
  } finally { c.dispose(); }
});

test('blocked storage prevents any preparation request', async () => {
  const f = fixture(), c = await f.open(); f.failWrites();
  try { await c.prepare(f.units()); assert(!f.calls.includes('prepare')); assert.equal(c.snapshot().phase, 'editing'); }
  finally { c.dispose(); }
});

test('unknown prepare outcome and missing receipt remain fenced until cancellation seals the original ID', async () => {
  const f = fixture(), c = await f.open(); f.port.prepare = async () => { f.calls.push('prepare'); throw new Error('Dropped reply'); };
  try {
    await c.prepare(f.units()); const id = c.snapshot().operationId!; assert.equal(c.snapshot().phase, 'recovery');
    await c.recover(id); assert.equal(c.snapshot().phase, 'recovery'); assert(f.storage.getItem(f.key));
    await c.prepare(f.units()); assert.equal(f.calls.filter(x => x === 'prepare').length, 1);
    await c.cancel(id); assert.equal(c.snapshot().phase, 'editing'); assert.equal(f.storage.getItem(f.key), null);
  } finally { c.dispose(); }
});

test('confirmed save with failed refresh keeps its marker and never submits a second commit', async () => {
  const f = fixture(), c = await f.open();
  try {
    await c.prepare(f.units()); const id = c.snapshot().operationId!; f.setRefreshFails(true);
    await c.commit(); assert.equal(c.snapshot().phase, 'refresh-needed'); assert.equal(c.snapshot().confirmedState, 'committed'); assert(f.storage.getItem(f.key));
    f.setRefreshFails(false); f.setStatus(f.committed(id)); await c.recover(id);
    assert.equal(c.snapshot().phase, 'saved'); assert.equal(f.storage.getItem(f.key), null); assert.equal(f.calls.filter(x => x === 'commit').length, 1);
  } finally { c.dispose(); }
});

test('cross-actor audit identity cannot clear a committed marker', async () => {
  const f = fixture(), c = await f.open();
  try {
    await c.prepare(f.units()); f.port.commit = async (id: string) => ({ ...f.committed(id), auditId: 'organization-' + '0'.repeat(64) });
    await c.commit(); assert.equal(c.snapshot().phase, 'refresh-needed'); assert(f.storage.getItem(f.key)); assert.equal(f.refreshes(), 0);
  } finally { c.dispose(); }
});

test('a second tab cannot acquire the actor lease or overwrite the first review marker', async () => {
  const f = fixture(), c = await f.open();
  try { await c.prepare(f.units()); const before = f.storage.getItem(f.key); await assert.rejects(f.open(), /Another tab/); assert.equal(f.storage.getItem(f.key), before); }
  finally { c.dispose(); }
});

test('auth change fences late preparation callbacks, clears displayed records and retains recovery identity', async () => {
  const f = fixture(), c = await f.open(); let release: (value: any) => void, sent: any;
  f.port.prepare = async (intent: any) => { sent = intent; return new Promise(resolve => { release = resolve; }); };
  const preparing = c.prepare(f.units()); await Promise.resolve();
  f.boundary.update({ ...f.session, status: 'signed-out', user: null, account: null });
  release!(organizationPreparedFixture(sent)); await preparing;
  assert.equal(c.snapshot().phase, 'blocked'); assert.equal(c.snapshot().catalog, null); assert(f.storage.getItem(f.key)); assert.equal(f.refreshes(), 0); c.dispose();
});

test('duplicate clicks cannot run two overlapping commit requests', async () => {
  const f = fixture(), c = await f.open(); let release: (value: any) => void;
  try {
    await c.prepare(f.units()); const id = c.snapshot().operationId!;
    f.port.commit = async () => { f.calls.push('commit'); return new Promise(resolve => { release = resolve; }); };
    const one = c.commit(); await assert.rejects(c.commit(), /already running/);
    release!(f.committed(id)); await one; assert.equal(f.calls.filter(x => x === 'commit').length, 1);
  } finally { c.dispose(); }
});

test('opening with a retained marker checks the original status rather than creating a replacement', async () => {
  const f = fixture(); f.storage.setItem(f.key, JSON.stringify({ schemaVersion: 1, operationId: 'original' })); f.setStatus(f.committed('original'));
  const c = await f.open(); try { assert.equal(c.snapshot().phase, 'saved'); assert.deepEqual(f.calls, ['status']); assert.equal(f.storage.getItem(f.key), null); } finally { c.dispose(); }
});

test('routine cache cleanup preserves both operation namespaces; explicit sign-out clears protected markers', () => {
  const f = fixture(); f.storage.setItem(f.key, JSON.stringify({ schemaVersion: 1, operationId: 'original' })); f.storage.setItem('shiekh_old_people_cache', 'PRIVATE');
  clearLegacyDirectoryCaches(f.storage); assert(f.storage.getItem(f.key)); assert.equal(f.storage.getItem('shiekh_old_people_cache'), null);
  clearProtectedStorage(f.storage); assert.equal(f.storage.getItem(f.key), null);
});
