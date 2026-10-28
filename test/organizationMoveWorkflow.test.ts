import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { createSessionBoundary, clearProtectedStorage, type SessionState } from '../src/lib/authSession';
import { clearLegacyDirectoryCaches } from '../src/lib/personTransitionRecovery';
import { openOrganizationMoveWorkflow } from '../src/lib/organizationMoveWorkflow';
import { ORGANIZATION_MOVE_RECOVERY_PREFIX, ORGANIZATION_RECOVERY_PREFIX, organizationMarkerStore, acquireOrganizationLease } from '../src/lib/organizationLeadershipRecovery';
import { moveFixture } from './helpers/organizationMoveFixture';
import { prepareOrganizationMove } from '../server/organizationMoveOperations';
import { leadershipActor, leadershipNow } from './helpers/organizationLeadershipFixture';
import { organizationCatalogFixture } from './helpers/organizationWorkflowFixture';
import { OrganizationTransportError } from '../src/lib/organizationLeadershipClient';
async function organizationPreparedFixture(intent: any) { const f = moveFixture(); return prepareOrganizationMove(f.firestore, intent, leadershipActor, () => new Date(leadershipNow)); }

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
  const calls: string[] = [], events: any[] = [];
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
  const committed = (id: string) => ({ schemaVersion: 1, operationId: id, state: 'committed', updatedAt: catalog.evaluatedAt, changedRecords: 2, auditId: 'organization-move-' + createHash('sha256').update(JSON.stringify(['organization-move-v1', 'actor', id])).digest('hex') });
  const units = () => { const { operationId, ...draft } = moveFixture().intent; return draft; };
  const open = () => openOrganizationMoveWorkflow({ auth, port, storage, locks, subtle: webcrypto.subtle as SubtleCrypto, newOperationId: () => `operation-${++next}`,
    refreshSavedDirectory: async () => { refreshCount++; if (refreshFails) throw new Error('Refresh unavailable'); }, onChange(value) { events.push(value); } });
  const key = ORGANIZATION_MOVE_RECOVERY_PREFIX + 'actor';
  return { open, auth, boundary, session, storage, key, calls, events, locks, port, units, committed, held, failWrites: () => { failWrites = true; }, setRefreshFails: (v: boolean) => { refreshFails = v; }, refreshes: () => refreshCount, setStatus: (v: any) => { statusValue = v; }, setPending: (v: any[]) => { pending = v; } };
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
    await c.prepare(f.units()); f.port.commit = async (id: string) => ({ ...f.committed(id), auditId: 'organization-move-' + '0'.repeat(64) });
    await c.commit(); assert.equal(c.snapshot().phase, 'recovery'); assert.equal(c.snapshot().confirmedState, null); assert(f.storage.getItem(f.key)); assert.equal(f.refreshes(), 0);
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

test('invalid draft creates no marker or request; missing receipt cannot be a confirmed save', async () => {
  const f = fixture(), c = await f.open();
  try {
    await c.prepare({ ...f.units(), reason: '' }); assert.equal(f.storage.getItem(f.key), null); assert(!f.calls.includes('prepare'));
    await c.prepare(f.units()); const id = c.snapshot().operationId!; await c.recover(id);
    assert.equal(c.snapshot().phase, 'recovery'); assert.equal(c.snapshot().confirmedState, null); assert(f.storage.getItem(f.key));
  } finally { c.dispose(); }
});
test('HTTP access denial clears displayed protected state, releases transport and retains original move identity', async () => {
  const f = fixture(), c = await f.open();
  try {
    await c.prepare(f.units()); const marker = f.storage.getItem(f.key);
    f.port.commit = async () => { throw new OrganizationTransportError('Access changed', 403); };
    await c.commit(); const state = c.snapshot();
    assert.equal(state.phase, 'blocked'); assert.equal(state.catalog, null); assert.equal(state.preparation, null); assert.deepEqual(state.pending, []);
    assert.equal(f.storage.getItem(f.key), marker); assert(f.calls.includes('dispose'));
  } finally { c.dispose(); }
});
test('disabled recovery keeps a retained move visible and does not overwrite or transmit it', async () => {
  const f = fixture(); f.storage.setItem(f.key, JSON.stringify({ schemaVersion: 1, operationId: 'original' }));
  f.port.capabilities = async () => ({ schemaVersion: 1, catalogEnabled: false, recoveryEnabled: false, newCommandsEnabled: false });
  const c = await f.open();
  try { assert.equal(c.snapshot().phase, 'recovery'); assert.equal(c.snapshot().operationId, 'original'); assert(f.storage.getItem(f.key)); assert(!f.calls.includes('prepare')); }
  finally { c.dispose(); }
});
test('startup access denial clears a catalog already delivered before the failing read', async () => {
  const f = fixture(); f.storage.setItem(f.key, JSON.stringify({ schemaVersion: 1, operationId: 'original' }));
  f.port.list = async () => { throw new OrganizationTransportError('Access changed', 403); };
  await assert.rejects(f.open());
  assert(f.events.some(state => state.catalog));
  assert.equal(f.events.at(-1).phase, 'blocked'); assert.equal(f.events.at(-1).catalog, null); assert.equal(f.events.at(-1).preparation, null);
  assert(f.storage.getItem(f.key)); assert(f.calls.includes('dispose'));
});
test('roster and move identities/leases are independent and cannot overwrite each other', async () => {
  const f = fixture(), c = await f.open();
  let release = () => {};
  try {
    await c.prepare(f.units()); const move = f.storage.getItem(f.key);
    release = await acquireOrganizationLease(f.locks, 'actor');
    organizationMarkerStore(f.storage, 'actor', () => {}).persist('roster-original');
    assert.equal(f.storage.getItem(f.key), move); assert(f.storage.getItem(ORGANIZATION_RECOVERY_PREFIX + 'actor'));
  } finally { release(); c.dispose(); }
});
test('routine cleanup preserves all three operation families; explicit sign-out clears them', () => {
  const f = fixture(), keys = [f.key, ORGANIZATION_RECOVERY_PREFIX + 'actor', 'shiekh_person_transition_v1:actor'];
  keys.forEach(key => f.storage.setItem(key, 'retained-marker'));
  clearLegacyDirectoryCaches(f.storage); keys.forEach(key => assert.equal(f.storage.getItem(key), 'retained-marker'));
  clearProtectedStorage(f.storage); keys.forEach(key => assert.equal(f.storage.getItem(key), null));
});
test('cancel refresh failure retains terminal identity until saved Location versions refresh', async () => {
  const f = fixture(), c = await f.open();
  try {
    await c.prepare(f.units()); const id = c.snapshot().operationId!; f.setRefreshFails(true);
    await c.cancel(id); assert.equal(c.snapshot().phase, 'refresh-needed'); assert.equal(c.snapshot().confirmedState, 'cancelled'); assert(f.storage.getItem(f.key));
    f.setRefreshFails(false); f.setStatus({ schemaVersion: 1, operationId: id, state: 'cancelled', updatedAt: '2026-10-28T12:00:00.000Z' });
    await c.recover(id); assert.equal(c.snapshot().phase, 'editing'); assert.equal(f.storage.getItem(f.key), null);
    assert.equal(f.calls.filter(call => call === 'prepare').length, 1); assert.equal(f.calls.filter(call => call === 'commit').length, 0);
  } finally { c.dispose(); }
});
