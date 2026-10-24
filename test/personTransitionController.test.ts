import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import type { SessionState } from '../src/lib/authSession';
import { createPersonTransitionController, type ClientTransitionCommand, type TransitionCommandPort } from '../src/lib/personTransitionController';
import { normalizePersonTransitionIntent, canonicalTransitionJSON } from '../src/lib/personTransitionIntent';
import { PersonTransitionReviewSigner } from '../server/personTransitionReviewEnvelope';
import { personTransitionIntentHash } from '../server/personTransitionPlanner';
import { normalizeTransitionPreparation, transitionOperationIdentity, newPreparedTransitionReceipt, readTransitionReceipt, storedTransitionReview, transitionCommitAuditId, cancelledTransitionReceipt, transitionRecoveryOutcome } from '../server/personTransitionOperation';

const time = Date.parse('2026-10-23T23:00:00Z'), uid = 'synthetic-controller-admin';
const intent = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'PRIVATE_REASON', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x75).toString('base64url') }] });
const envelope = (value = intent) => signer.sign({ actorUid: uid, personId: value.personId, intentHash: personTransitionIntentHash(value), stateHash: 'a'.repeat(64), planHash: 'b'.repeat(64), issuedAt: time, expiresAt: time + 300_000 });
function storage(): Storage {
  const value: any = {}; Object.defineProperties(value, {
    length: { get: () => Object.keys(value).length }, key: { value: (i: number) => Object.keys(value)[i] ?? null },
    getItem: { value: (k: string) => Object.hasOwn(value, k) ? value[k] : null }, setItem: { value: (k: string, v: string) => { value[k] = v; }, writable: true }, removeItem: { value: (k: string) => { delete value[k]; } },
  }); return value;
}
function locks() { let queue = Promise.resolve(); return { async request<T>(_name: string, action: () => Promise<T>) { const previous = queue; let release!: () => void; queue = new Promise<void>(r => { release = r; }); await previous; try { return await action(); } finally { release(); } } }; }
async function fixture() {
  const data = storage(), lock = locks(), records = new Map<string, any>(), calls: { type: string; body?: ClientTransitionCommand; operationId?: string }[] = [], events: any[] = [];
  const state = { now: time, generation: 0, enabled: true, failPrepare: '' as '' | 'before' | 'after', failCommit: false, failRefresh: false, badAudit: false, incomplete: false, refreshes: 0, ids: 0, holdPrepare: null as null | (() => Promise<void>) };
  let session: SessionState = { status: 'authorized', user: { uid, getIdToken: async () => 'PRIVATE_TOKEN' }, account: { uid, name: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' }, error: '' };
  const identity = (marker: unknown) => transitionOperationIdentity(marker, uid);
  const port: TransitionCommandPort = {
    async list() { calls.push({ type: 'list' }); return { schemaVersion: 1, operations: [...records.values()].filter(r => r.state === 'prepared').map(r => transitionRecoveryOutcome(r, r)), complete: !state.incomplete, canCommit: false }; },
    async status(marker) { calls.push({ type: 'status', operationId: marker.operationId }); return transitionRecoveryOutcome(identity(marker), records.get(marker.operationId) ?? null); },
    async prepare(body) {
      calls.push({ type: 'prepare', operationId: body.operationId, body: structuredClone(body) }); assert(Object.isFrozen(body)); assert(Object.isFrozen(body.intent.positionIds));
      assert(Object.values(data).some(v => JSON.parse(v as string).operationId === body.operationId), 'Marker must be durable before dispatch');
      await state.holdPrepare?.(); if (state.failPrepare === 'before') throw new Error('PRIVATE_NETWORK');
      const command = normalizeTransitionPreparation(body, uid), claims = signer.verify(body.reviewEnvelope, { actorUid: uid, personId: body.intent.personId, intentHash: command.intentHash }, state.now);
      if (!records.has(body.operationId)) records.set(body.operationId, newPreparedTransitionReceipt(command.identity, storedTransitionReview(claims, command.envelopeHash), state.now));
      if (state.failPrepare === 'after') throw new Error('PRIVATE_NETWORK');
      const record = records.get(body.operationId); if (record.state === 'cancelled') throw new Error('Cancelled'); return transitionRecoveryOutcome(command.identity, record);
    },
    async commit(body) {
      calls.push({ type: 'commit', operationId: body.operationId, body: structuredClone(body) }); const command = normalizeTransitionPreparation(body, uid), previous = records.get(body.operationId); assert(previous);
      if (previous.state === 'prepared') records.set(body.operationId, readTransitionReceipt({ ...previous, state: 'committed', updatedAt: Math.max(previous.updatedAt, state.now), auditId: transitionCommitAuditId(command.identity), changes: [{ collection: 'people', id: body.intent.personId, version: 1 }] }, command.identity));
      if (state.failCommit) throw new Error('PRIVATE_NETWORK'); const result = transitionRecoveryOutcome(command.identity, records.get(body.operationId));
      return state.badAudit ? { ...result, auditId: 'aud-person-transition-' + 'f'.repeat(64) } : result;
    },
    async cancel(marker) { calls.push({ type: 'cancel', operationId: marker.operationId }); const record = cancelledTransitionReceipt(identity(marker), records.get(marker.operationId) ?? null, state.now); records.set(marker.operationId, record); return transitionRecoveryOutcome(identity(marker), record); },
  };
  const options = () => ({ personId: 'subject', storage: data, session: () => session, generation: () => state.generation, locks: lock, subtle: webcrypto.subtle as SubtleCrypto, port,
    admissionEnabled: () => state.enabled,
    refreshSavedDirectory: async () => { state.refreshes++; if (state.failRefresh) throw new Error('PRIVATE_REFRESH_ERROR'); }, publish: (s: any) => events.push(s),
    newOperationId: () => `11111111-1111-4111-8111-${(++state.ids).toString().padStart(12, '0')}`, clock: () => state.now });
  const controller = await createPersonTransitionController(options());
  return { controller, data, state, calls, events, records, port, recreate: () => createPersonTransitionController(options()), setSession: (value: SessionState) => { session = value; }, currentSession: () => session };
}
async function staged(f: Awaited<ReturnType<typeof fixture>>) { await f.controller.recover(); await f.controller.stageReviewed(intent, envelope()); }

test('shared normalization/canonical identity is stable across browser/server and rejects non-JSON cycles', () => {
  assert.equal(canonicalTransitionJSON(normalizePersonTransitionIntent(intent)), canonicalTransitionJSON(normalizePersonTransitionIntent({ ...intent, positionIds: [...intent.positionIds].reverse() })));
  const cycle: any = {}; cycle.self = cycle; assert.throws(() => canonicalTransitionJSON(cycle)); assert.throws(() => canonicalTransitionJSON(undefined));
});

test('controller requires complete recovery, binds immutable review and persists before prepare; saved result refreshes before release', async () => {
  const f = await fixture(); assert.equal(f.controller.snapshot().canReview, false); await assert.rejects(f.controller.stageReviewed(intent, envelope()));
  await staged(f); assert.equal(f.controller.snapshot().canPrepare, true); assert.equal(f.controller.snapshot().busy, false); assert.equal(f.data.length, 0);
  await f.controller.prepare(); assert.equal(f.controller.snapshot().canCommit, true); assert.equal(f.data.length, 1);
  await f.controller.commit(); assert.equal(f.controller.snapshot().phase, 'saved'); assert.equal(f.data.length, 0); assert.equal(f.state.refreshes, 1); assert.equal(f.controller.snapshot().canReview, false);
  await f.controller.recover(); assert.equal(f.controller.snapshot().canReview, true); assert.equal(f.state.ids, 1);
  assert.doesNotMatch(JSON.stringify([f.events, f.data]), /PRIVATE|ptv1\./);
});

test('changed, cross-person or malformed reviews cannot keep an older confirmation ready', async () => {
  const f = await fixture(); await staged(f);
  for (const [raw, token] of [[{ ...intent, reason: 'Changed' }, envelope()], [intent, 'bad'], [{ ...intent, personId: 'other' }, envelope({ ...intent, personId: 'other' })]] as const) {
    await assert.rejects(f.controller.stageReviewed(raw, token)); assert.equal(f.controller.snapshot().canPrepare, false); assert.equal(f.data.length, 0);
  }
  assert(!f.calls.some(c => c.type === 'prepare'));
});

test('lost prepare response keeps immutable operation and explicit retry reuses exactly the same body/UUID', async () => {
  const f = await fixture(); await staged(f); f.state.failPrepare = 'after';
  await assert.rejects(f.controller.prepare(), e => { assert.doesNotMatch(String(e), /PRIVATE/); return true; }); assert.equal(f.controller.snapshot().phase, 'outcome-unknown'); assert.equal(f.data.length, 1);
  await assert.rejects(f.controller.stageReviewed(intent, envelope())); assert.equal(f.state.ids, 1);
  f.state.failPrepare = ''; await f.controller.retryPreparation(); assert.equal(f.controller.snapshot().phase, 'prepared');
  const calls = f.calls.filter(c => c.type === 'prepare'); assert.equal(calls.length, 2); assert.deepEqual(calls[0].body, calls[1].body);
});

test('lost commit response recovers terminal status without another business commit or old-state overlay', async () => {
  const f = await fixture(); await staged(f); await f.controller.prepare(); f.state.failCommit = true;
  await assert.rejects(f.controller.commit()); assert.equal(f.controller.snapshot().phase, 'outcome-unknown'); assert.equal(f.data.length, 1);
  await assert.rejects(f.controller.commit()); await f.controller.recover(); assert.equal(f.controller.snapshot().phase, 'saved'); assert.equal(f.data.length, 0);
  assert.equal(f.calls.filter(c => c.type === 'commit').length, 1); assert.equal(f.state.refreshes, 1);
});

test('missing receipt remains unknown until an explicit cancellation seal; new review requires recovery again', async () => {
  const f = await fixture(); await staged(f); f.state.failPrepare = 'before'; await assert.rejects(f.controller.prepare());
  await f.controller.recover(); assert.equal(f.controller.snapshot().phase, 'outcome-unknown'); assert.equal(f.controller.snapshot().canReview, false);
  const marker = f.controller.snapshot().unresolved[0]; await f.controller.cancel(marker); assert.equal(f.controller.snapshot().phase, 'cancellation-confirmed'); assert.equal(f.data.length, 0);
  await assert.rejects(f.controller.stageReviewed(intent, envelope())); await f.controller.recover(); assert.equal(f.controller.snapshot().canReview, true);
});

test('reload/server-only preparation is inspect/cancel only and never reconstructs an original command', async () => {
  const f = await fixture(); await staged(f); await f.controller.prepare(); f.controller.dispose();
  const restored = await f.recreate(); await restored.recover(); assert.equal(restored.snapshot().phase, 'outcome-unknown'); assert.equal(restored.snapshot().canCommit, false);
  await assert.rejects(restored.commit()); await assert.rejects(restored.retryPreparation()); await restored.cancel(restored.snapshot().unresolved[0]); assert.equal(f.data.length, 0);
});

test('storage failure or incomplete recovery disables dispatch; prepared expiry preserves original recovery', async () => {
  const f = await fixture(); f.state.incomplete = true; await assert.rejects(f.controller.recover()); assert.equal(f.controller.snapshot().canReview, false);
  f.state.incomplete = false; await staged(f); const originalSet = f.data.setItem; f.data.setItem = () => { throw new Error('PRIVATE_STORAGE'); };
  await assert.rejects(f.controller.prepare()); assert(!f.calls.some(c => c.type === 'prepare'));
  f.data.setItem = originalSet; await f.controller.recover(); await f.controller.stageReviewed(intent, envelope()); await f.controller.prepare(); f.state.now = time + 300_001;
  assert.equal(f.controller.snapshot().canCommit, false); await assert.rejects(f.controller.commit()); assert.equal(f.data.length, 1); assert(!f.calls.some(c => c.type === 'commit'));
});

test('duplicate actions and draft edits are blocked in-flight; disposed/same-UID new session cannot publish late success', async () => {
  const f = await fixture(); await staged(f); let release!: () => void; f.state.holdPrepare = () => new Promise<void>(r => { release = r; });
  const pending = f.controller.prepare(); await new Promise(resolve => setTimeout(resolve, 0));
  await assert.rejects(f.controller.prepare()); await assert.rejects(f.controller.commit()); assert.throws(() => f.controller.invalidateReview());
  f.state.generation++; release(); await assert.rejects(pending); assert.equal(f.calls.filter(c => c.type === 'prepare').length, 1); assert.equal(f.data.length, 1);
  assert(!f.events.some(e => e.phase === 'prepared' || e.phase === 'saved')); assert.throws(f.controller.snapshot);
});

test('foreign audit or failed saved-state refresh never clears an uncertain marker', async () => {
  for (const mode of ['audit', 'refresh']) {
    const f = await fixture(); await staged(f); await f.controller.prepare(); f.state.badAudit = mode === 'audit'; f.state.failRefresh = mode === 'refresh';
    await assert.rejects(f.controller.commit()); assert.equal(f.data.length, 1); assert.equal(f.controller.snapshot().phase, 'outcome-unknown');
    f.state.badAudit = false; f.state.failRefresh = false; await f.controller.recover(); assert.equal(f.data.length, 0); assert.equal(f.controller.snapshot().phase, 'saved');
  }
});

test('disabled admission blocks new review/prepare/commit but preserves original status recovery and cancellation', async () => {
  const f = await fixture(); await staged(f); await f.controller.prepare(); f.state.enabled = false;
  assert.equal(f.controller.snapshot().canCommit, false); await assert.rejects(f.controller.commit(), /disabled/);
  await f.controller.recover(); assert.equal(f.controller.snapshot().canCancel, true); assert.equal(f.controller.snapshot().canReview, false);
  await f.controller.cancel(f.controller.snapshot().unresolved[0]); assert.equal(f.data.length, 0);
  await f.controller.recover(); await assert.rejects(f.controller.stageReviewed(intent, envelope()), /disabled/); assert.equal(f.calls.filter(c => c.type === 'commit').length, 0);
});
