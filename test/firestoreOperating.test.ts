import assert from 'node:assert/strict';
import { test } from 'node:test';
import { transactionDatabase } from './fixtures/transactionDatabase';
import { cancelOperating, commitOperating, previewOperating } from '../server/firestoreOperating';
import type { Account } from '../server/authAuthority';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';
const now = () => new Date('2026-10-22T18:00:00Z');
function fixture() {
  const f = transactionDatabase();
  const actor: Account = { uid: 'operator', name: 'Operator', email: null, emailVerified: true, role: 'Viewer', status: 'Active', accessScope: 'Company-wide', personId: 'sm', authenticationMethod: 'password' };
  f.records.set('users/account', { firebaseUid: actor.uid, name: actor.name, role: actor.role, status: 'Active', accessScope: actor.accessScope, personId: 'sm' });
  f.records.set('people/sm', { fullName: 'SM', status: 'Active' });
  f.records.set('locations/store', { id: 'store', name: 'Synthetic Store', storeNumber: '007', recordStatus: 'Active', type: 'Enclosed Mall', storeManagerId: 'sm', timeZone: 'America/Los_Angeles', operationalStatus: 'Open — Normal Operations', version: 3, standardHours: DEFAULT_WEEKLY_HOURS });
  return { ...f, actor };
}
test('assigned SM closure commits atomically, replays once and expires without a cleanup write', async () => {
  const f = fixture(); const before = structuredClone([...f.records]);
  const p = await previewOperating(f.firestore, 'store', 'close', f.actor, now);
  assert.deepEqual([...f.records], before);
  const command = { operationId: '12345678-1234-1234-1234-123456789abc', locationId: p.locationId, action: p.action, reason: 'Power outage', expectedVersion: p.expectedVersion, expectedClosureId: p.expectedClosureId, expectedExpiresAt: p.expectedExpiresAt };
  const results = await Promise.all([commitOperating(f.firestore, command, f.actor, now), commitOperating(f.firestore, command, f.actor, now)]);
  assert.equal(results.filter(r => r.replayed).length, 1);
  assert.equal(results[0].state.state, 'Closed');
  const saved = f.records.get('locations/store')!;
  assert.equal(saved.version, 4); assert.equal(saved.operationalStatus, 'Open — Normal Operations');
  assert.deepEqual(saved.standardHours, DEFAULT_WEEKLY_HOURS); assert.equal(saved.storeManagerId, 'sm');
  assert.equal([...f.records.keys()].filter(k => k.startsWith('operating_events/')).length, 1);
  assert.equal([...f.records.keys()].filter(k => k.startsWith('audit_logs/')).length, 1);
  assert.equal((await commitOperating(f.firestore, command, f.actor, () => new Date('2026-10-23T18:00:00Z'))).state.state, 'Open');
  await assert.rejects(commitOperating(f.firestore, { ...command, reason: 'different' }, f.actor, now), /different content/);
});
test('current account, canonical assignment and versions are rechecked with no partial writes on denial', async () => {
  for (const mode of ['suspended', 'unlinked', 'inactive', 'other-store', 'scope', 'stale'] as const) {
    const f = fixture(), p = await previewOperating(f.firestore, 'store', 'close', f.actor, now);
    if (mode === 'suspended') Object.assign(f.records.get('users/account')!, { status: 'Suspended' });
    if (mode === 'unlinked') Object.assign(f.records.get('users/account')!, { personId: 'someone-else' });
    if (mode === 'inactive') Object.assign(f.records.get('people/sm')!, { status: 'Inactive' });
    if (mode === 'other-store') Object.assign(f.records.get('locations/store')!, { storeManagerId: 'someone-else' });
    if (mode === 'scope') Object.assign(f.records.get('users/account')!, { accessScope: 'Store 008' });
    if (mode === 'stale') Object.assign(f.records.get('locations/store')!, { version: 4 });
    const before = structuredClone([...f.records]);
    await assert.rejects(commitOperating(f.firestore, { operationId: '12345678-1234-1234-1234-123456789abc', locationId: 'store', action: 'close', reason: 'Outage', expectedVersion: p.expectedVersion, expectedClosureId: p.expectedClosureId, expectedExpiresAt: p.expectedExpiresAt }, f.actor, now));
    assert.deepEqual([...f.records], before, mode);
  }
});

test('cancellation seals late arrivals, while recovery of an already saved closure cannot reopen it', async () => {
  for (const saved of [false, true]) {
    const f = fixture(), p = await previewOperating(f.firestore, 'store', 'close', f.actor, now);
    const command = { operationId: '12345678-1234-1234-1234-123456789abc', locationId: 'store', action: p.action, reason: 'Outage', expectedVersion: p.expectedVersion, expectedClosureId: p.expectedClosureId, expectedExpiresAt: p.expectedExpiresAt };
    if (saved) await commitOperating(f.firestore, command, f.actor, now);
    assert.equal((await cancelOperating(f.firestore, command, f.actor, now)).cancelled, !saved);
    if (saved) {
      assert.equal((await commitOperating(f.firestore, command, f.actor, now)).replayed, true);
      assert.ok(f.records.get('locations/store')!.temporaryClosure);
    } else {
      await assert.rejects(commitOperating(f.firestore, command, f.actor, now), /cancelled/);
      assert.equal(f.records.get('locations/store')!.temporaryClosure, undefined);
    }
    await assert.rejects(cancelOperating(f.firestore, { ...command, reason: 'changed' }, f.actor, now), /different content/);
  }
});
