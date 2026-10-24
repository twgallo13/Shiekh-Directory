import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { createSessionBoundary, type SessionState } from '../src/lib/authSession';
import { openSessionBoundTransition } from '../src/lib/personTransitionSession';
import { openTransitionRecoveryVault } from '../src/lib/personTransitionRecovery';

const state: SessionState = { status: 'authorized', user: { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' }, account: { uid: 'synthetic-admin', name: 'Synthetic', email: null, emailVerified: false, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'test' }, error: '' };
const marker = { schemaVersion: 1 as const, operationId: '11111111-1111-4111-8111-111111111111', personId: 'subject', commandDigest: 'a'.repeat(64) };
async function fixture() {
  const boundary = createSessionBoundary(); boundary.update(state);
  const data: any = {}; Object.defineProperties(data, {
    length: { get: () => Object.keys(data).length }, key: { value: (i: number) => Object.keys(data)[i] ?? null }, getItem: { value: (k: string) => data[k] ?? null }, setItem: { value: (k: string, v: string) => { data[k] = v; } }, removeItem: { value: (k: string) => { delete data[k]; } },
  });
  let disposed = 0;
  const port = { list: async () => ({ schemaVersion: 1, operations: [], complete: true, canCommit: false }), status: async () => { throw new Error('Synthetic unavailable'); }, prepare: async () => { throw new Error('No writer'); }, commit: async () => { throw new Error('No writer'); }, cancel: async () => { throw new Error('No writer'); }, dispose() { disposed++; } };
  const auth = { currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe };
  const options = { personId: 'subject', storage: data as Storage, locks: { request: async <T>(_name: string, action: () => Promise<T>) => action() }, subtle: webcrypto.subtle as SubtleCrypto, port, admissionEnabled: () => false, newOperationId: () => marker.operationId, refreshSavedDirectory: async () => {} };
  return { boundary, auth, options, port, data, disposed: () => disposed };
}
test('session-bound transition immediately disposes on permission loss without removing unresolved markers', async () => {
  const f = await fixture();
  const vault = await openTransitionRecoveryVault(f.data, f.auth.currentSession, f.options.locks, f.options.subtle, f.auth.sessionGeneration); await vault.persist(marker);
  const controller = await openSessionBoundTransition(f.auth, f.options);
  f.boundary.update({ ...state, account: { ...state.account!, role: 'Viewer' } });
  assert.ok(f.disposed() > 0); assert.throws(controller.snapshot); assert.equal(Object.keys(f.data).length, 1);
  f.boundary.update(state); assert.throws(controller.snapshot); controller.dispose();
});
test('same-authority refresh remains usable but same-UID explicit boundary invalidation stops the old controller', async () => {
  const f = await fixture(); const controller = await openSessionBoundTransition(f.auth, f.options);
  f.boundary.update({ ...state, account: { ...state.account!, name: 'Display-only change' } });
  await controller.recover(); assert.equal(controller.snapshot().phase, 'review-required'); assert.equal(f.disposed(), 0);
  f.boundary.invalidate(); assert.throws(controller.snapshot); assert.ok(f.disposed() > 0); controller.dispose();
});
test('boundary during async vault creation rejects late initialization and never dispatches', async () => {
  const f = await fixture();
  const realDigest = webcrypto.subtle.digest.bind(webcrypto.subtle);
  const opening = openSessionBoundTransition(f.auth, { ...f.options, subtle: { digest: (...args: Parameters<SubtleCrypto['digest']>) => realDigest(...args) } });
  f.boundary.invalidate(); await assert.rejects(opening); assert.ok(f.disposed() > 0); assert.equal(Object.keys(f.data).length, 0);
});
test('dispose unsubscribes so later sign-out does not retain a dead dialog listener', async () => {
  const f = await fixture(); const controller = await openSessionBoundTransition(f.auth, f.options); controller.dispose();
  const before = f.disposed(); f.boundary.invalidate(); assert.equal(f.disposed(), before);
});
