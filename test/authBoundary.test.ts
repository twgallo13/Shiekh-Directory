import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionBoundary, createSessionController, type Account } from '../src/lib/authSession';

const account: Account = { uid: 'synthetic-admin', name: 'Synthetic', email: null, emailVerified: false, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'test' };
const user = { uid: account.uid, getIdToken: async () => 'synthetic' };
test('synchronous boundary precedes publication and same-authority refresh preserves its generation', async () => {
  const boundary = createSessionBoundary(); let notifications = 0;
  boundary.subscribe(() => { notifications++; assert.equal(boundary.snapshot().status === 'authorized' ? boundary.snapshot().account?.uid : null, boundary.snapshot().account?.uid ?? null); });
  let current = account;
  const controller = createSessionController(state => { assert.equal(boundary.snapshot(), state); }, async () => current, boundary);
  await controller.restore(user); const original = boundary.generation();
  await controller.restore(user, true); assert.equal(boundary.generation(), original);
  current = { ...account, name: 'Changed display only', email: 'new@example.test' };
  await controller.restore(user, true); assert.equal(boundary.generation(), original);
  current = { ...current, role: 'Viewer' }; await controller.restore(user, true);
  assert.ok(boundary.generation() > original); assert.equal(boundary.snapshot().account?.role, 'Viewer'); assert.ok(notifications >= 3);
});
test('direct UID switch fences before async authorization and late previous identity cannot return', async () => {
  const boundary = createSessionBoundary(); let resolve!: (value: Account) => void;
  let delayed = false;
  const controller = createSessionController(() => {}, async () => delayed ? new Promise(done => { resolve = done; }) : account, boundary);
  await controller.restore(user); const original = boundary.generation(); delayed = true;
  const pending = controller.restore({ ...user, uid: 'other' }, true);
  assert.ok(boundary.generation() > original); assert.equal(boundary.snapshot().status, 'loading'); assert.equal(boundary.snapshot().account, null);
  controller.clear(); resolve({ ...account, uid: 'other' }); await pending; assert.equal(boundary.snapshot().status, 'signed-out');
});
test('deny, implicit sign-out, stop and same-provider controller recreation never reuse a generation', async () => {
  const boundary = createSessionBoundary(); const controller = createSessionController(() => {}, async () => account, boundary);
  await controller.restore(user); const generations = [boundary.generation()];
  controller.deny('Synthetic denied'); generations.push(boundary.generation());
  await controller.restore(user); generations.push(boundary.generation());
  await controller.restore(null); generations.push(boundary.generation());
  controller.stop(); generations.push(boundary.generation());
  await controller.restore(user); assert.equal(boundary.generation(), generations.at(-1));
  const replacement = createSessionController(() => {}, async () => account, boundary); await replacement.restore(user); generations.push(boundary.generation());
  assert.ok(generations.every((v, i) => !i || v > generations[i - 1]));
});
test('background denial invalidates synchronous authority and throwing subscriber cannot suppress fences', async () => {
  const boundary = createSessionBoundary(); let denied = false, observed = 0;
  const controller = createSessionController(() => {}, async () => { if (denied) throw new Error('Synthetic revoked'); return account; }, boundary);
  await controller.restore(user); const original = boundary.generation();
  boundary.subscribe(() => { throw new Error('Disposed listener'); }); boundary.subscribe(() => observed++);
  denied = true; await controller.restore(user, true);
  assert.equal(boundary.snapshot().status, 'denied'); assert.ok(boundary.generation() > original); assert.equal(observed, 1);
});
