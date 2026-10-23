import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { clearProtectedStorage, type SessionState } from '../src/lib/authSession';
import { TRANSITION_RECOVERY_PREFIX, openTransitionRecoveryVault, parseTransitionRecoveryMarker, parseTransitionRecoveryOutcome, reconcileTransitionRecovery } from '../src/lib/personTransitionRecovery';
import { normalizeTransitionPreparation, newPreparedTransitionReceipt, storedTransitionReview, transitionCommitAuditId, cancelledTransitionReceipt, transitionRecoveryOutcome } from '../server/personTransitionOperation';
import { personTransitionIntentHash } from '../server/personTransitionPlanner';
import { PersonTransitionReviewSigner, TRANSITION_REVIEW_TTL_MS } from '../server/personTransitionReviewEnvelope';

const actorUid = 'synthetic-client-admin', operationId = '11111111-1111-4111-8111-111111111111';
const time = Date.parse('2026-10-23T22:00:00Z');
const intent = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'PRIVATE_REASON', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
const signer = new PersonTransitionReviewSigner({ activeKeyId: 'synthetic', keys: [{ id: 'synthetic', secret: Buffer.alloc(32, 0x72).toString('base64url') }] });
const claims = { actorUid, personId: intent.personId, intentHash: personTransitionIntentHash(intent), stateHash: 'a'.repeat(64), planHash: 'b'.repeat(64), issuedAt: time, expiresAt: time + TRANSITION_REVIEW_TTL_MS };
const reviewEnvelope = signer.sign(claims), command = normalizeTransitionPreparation({ schemaVersion: 1, operationId, intent, reviewEnvelope }, actorUid);
const marker = { schemaVersion: 1 as const, operationId, personId: intent.personId, commandDigest: command.identity.commandDigest };
const prepared = newPreparedTransitionReceipt(command.identity, storedTransitionReview(signer.verify(reviewEnvelope, claims, time), command.envelopeHash), time);
const outcomes = {
  unknown: transitionRecoveryOutcome(command.identity, null), prepared: transitionRecoveryOutcome(command.identity, prepared),
  cancelled: transitionRecoveryOutcome(command.identity, cancelledTransitionReceipt(command.identity, prepared, time + 1)),
  committed: transitionRecoveryOutcome(command.identity, { ...prepared, state: 'committed', updatedAt: time + 1, auditId: transitionCommitAuditId(command.identity), changes: [{ collection: 'people', id: intent.personId, version: 2 }] }),
};
const list = (operations: unknown[] = []) => ({ schemaVersion: 1, operations, complete: true, canCommit: false });
function session(uid = actorUid): SessionState {
  return { status: 'authorized', user: { uid, getIdToken: async () => 'PRIVATE_TOKEN_NEVER_CALLED' }, account: { uid, name: 'PRIVATE_NAME', email: 'PRIVATE_EMAIL', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' }, error: '' };
}
function storage(): Storage {
  const data: any = {};
  Object.defineProperties(data, {
    length: { get: () => Object.keys(data).length }, key: { value: (i: number) => Object.keys(data)[i] ?? null },
    getItem: { value: (key: string) => Object.hasOwn(data, key) ? data[key] : null, writable: true },
    setItem: { value: (key: string, value: string) => { data[key] = value; }, writable: true },
    removeItem: { value: (key: string) => { delete data[key]; }, writable: true },
  }); return data;
}
function locks() {
  const queues = new Map<string, Promise<void>>();
  return { async request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const previous = queues.get(name) ?? Promise.resolve(); let release!: () => void;
    queues.set(name, new Promise<void>(resolve => { release = resolve; })); await previous;
    try { return await callback(); } finally { release(); }
  } };
}
async function fixture() {
  const data = storage(), lock = locks(); let current = session(), generation = 0;
  const getSession = () => current;
  const getGeneration = () => generation;
  const vault = await openTransitionRecoveryVault(data, getSession, lock, webcrypto.subtle as SubtleCrypto, getGeneration);
  return { data, lock, vault, getSession, getGeneration, advanceGeneration: () => { generation++; }, setSession: (value: SessionState) => { current = value; } };
}

test('browser marker derivation matches authoritative server identity without persisting token/intent/contact', async () => {
  const f = await fixture();
  assert.deepEqual(await f.vault.markerForReviewedCommand({ operationId, personId: marker.personId, intentHash: claims.intentHash, reviewEnvelope }), marker);
  assert.deepEqual(parseTransitionRecoveryMarker(marker), marker);
  await f.vault.persist(marker); assert.deepEqual(f.vault.read(), [marker]);
  assert.equal(f.data.length, 1); assert.doesNotMatch(f.data.key(0)!, new RegExp(actorUid));
  assert.doesNotMatch(JSON.stringify(f.data), /PRIVATE|ptv1\.|reason|positionIds|email|phone|intentHash/);
  const restored = await openTransitionRecoveryVault(f.data, f.getSession, f.lock, webcrypto.subtle as SubtleCrypto, f.getGeneration);
  assert.deepEqual(restored.read(), [marker]);
  for (const raw of [{ ...marker, reason: 'PRIVATE' }, { ...marker, operationId: '../bad' }, { ...marker, commandDigest: 'bad' }]) { assert.throws(() => parseTransitionRecoveryMarker(raw)); await assert.rejects(f.vault.persist(raw)); }
});

test('only current unique-session Company-wide admin can access a bound vault; actor changes fence delayed work', async () => {
  const f = await fixture(); await f.vault.persist(marker);
  for (const changed of [{ ...session(), status: 'signed-out', user: null, account: null }, { ...session(), status: 'denied' }, { ...session(), user: { ...session().user!, uid: 'different' } }, { ...session(), account: { ...session().account!, role: 'Viewer' } }, { ...session(), account: { ...session().account!, accessScope: 'Store' } }, session('other')]) {
    f.setSession(changed as SessionState); assert.throws(f.vault.read); await assert.rejects(f.vault.persist(marker));
  }
  f.setSession(session()); assert.deepEqual(f.vault.read(), [marker]);
  let release!: () => void;
  const holding = f.lock.request(Object.keys(f.data)[0].slice(0, -operationId.length), () => new Promise<void>(resolve => { release = resolve; }));
  await new Promise(resolve => setTimeout(resolve, 0));
  const pending = f.vault.persist({ ...marker, operationId: '22222222-2222-4222-8222-222222222222' }); f.setSession(session('other')); release(); await holding;
  await assert.rejects(pending); assert.equal(f.data.length, 1);
  const otherVault = await openTransitionRecoveryVault(f.data, f.getSession, f.lock, webcrypto.subtle as SubtleCrypto, f.getGeneration); assert.deepEqual(otherVault.read(), []);
  f.setSession(session()); f.advanceGeneration(); assert.throws(f.vault.read, /session changed/);
  const rebound = await openTransitionRecoveryVault(f.data, f.getSession, f.lock, webcrypto.subtle as SubtleCrypto, f.getGeneration); assert.deepEqual(rebound.read(), [marker]);
});

test('storage/API availability, read-back, corruption and same-ID content conflicts fail closed', async () => {
  const f = await fixture();
  await assert.rejects(openTransitionRecoveryVault(f.data, f.getSession, null as any, webcrypto.subtle as SubtleCrypto, f.getGeneration));
  await assert.rejects(openTransitionRecoveryVault(f.data, f.getSession, f.lock, null as any, f.getGeneration));
  await assert.rejects(openTransitionRecoveryVault(f.data, f.getSession, f.lock, webcrypto.subtle as SubtleCrypto, null as any));
  const originalSet = f.data.setItem; f.data.setItem = () => { throw new Error('Quota blocked'); }; await assert.rejects(f.vault.persist(marker), /Quota/);
  f.data.setItem = () => {}; await assert.rejects(f.vault.persist(marker)); assert.equal(f.data.length, 0);
  f.data.setItem = originalSet; await f.vault.persist(marker); await assert.rejects(f.vault.persist({ ...marker, commandDigest: 'f'.repeat(64) })); assert.deepEqual(f.vault.read(), [marker]);
  f.data.setItem(f.data.key(0)!, '{PRIVATE_MALFORMED'); assert.throws(f.vault.read, error => { assert.doesNotMatch(String(error), /PRIVATE/); return true; });
});

test('serialized per-actor marker updates preserve two-tab records and stop at the 50-record boundary', async () => {
  const f = await fixture(), other = await openTransitionRecoveryVault(f.data, f.getSession, f.lock, webcrypto.subtle as SubtleCrypto, f.getGeneration);
  const second = { ...marker, operationId: '22222222-2222-4222-8222-222222222222' };
  await Promise.all([f.vault.persist(marker), other.persist(second)]); assert.equal(f.vault.read().length, 2);
  for (let index = 2; index < 50; index++) await f.vault.persist({ ...marker, operationId: `11111111-1111-4111-8111-${index.toString().padStart(12, '0')}` });
  assert.equal(f.vault.read().length, 50);
  await assert.rejects(other.persist({ ...marker, operationId: '33333333-3333-4333-8333-333333333333' })); assert.equal(f.vault.read().length, 50);
  f.data.setItem(f.data.key(0)!.slice(0, -operationId.length) + '44444444-4444-4444-8444-444444444444', JSON.stringify({ ...marker, operationId: '44444444-4444-4444-8444-444444444444' })); assert.throws(f.vault.read);
});

test('strict response parsing matches server outcomes and rejects malformed/private/foreign outcomes', () => {
  for (const outcome of Object.values(outcomes)) assert.deepEqual(parseTransitionRecoveryOutcome(outcome, marker), outcome);
  for (const changed of [{ ...outcomes.prepared, canCommit: true }, { ...outcomes.prepared, reviewEnvelope }, { ...outcomes.prepared, operationId: '22222222-2222-4222-8222-222222222222' }, { ...outcomes.unknown, createdAt: new Date(time).toISOString() }, { ...outcomes.prepared, preparedAt: null }, { ...outcomes.committed, auditId: 'wrong' }, { ...outcomes.committed, changes: [{ collection: 'users', id: 'admin', version: 2 }] }, { ...outcomes.cancelled, resolvedAt: new Date(time - 1).toISOString() }, { ...outcomes.committed, changes: [...outcomes.committed.changes, ...outcomes.committed.changes] }]) assert.throws(() => parseTransitionRecoveryOutcome(changed, marker));
});

test('reconciliation keeps missing/unknown/prepared operations blocked and never invents an editable draft', () => {
  for (const outcome of [outcomes.unknown, outcomes.prepared]) for (const remote of [list(), list([outcomes.prepared])]) {
    const plan = reconcileTransitionRecovery([marker], remote, [outcome]); assert.deepEqual(plan.unresolvedPersonIds, [marker.personId]); assert.equal(plan.canSubmit, false); assert.equal(plan.operations.length, 1);
  }
  const adopted = reconcileTransitionRecovery([], list([outcomes.prepared]), []); assert.equal(adopted.operations[0].source, 'server'); assert.deepEqual(adopted.unresolvedPersonIds, [marker.personId]);
  const done = reconcileTransitionRecovery([marker], list([outcomes.prepared]), [outcomes.committed]); assert.equal(done.operations[0].outcome.state, 'committed'); assert.deepEqual(done.refreshPersonIds, [marker.personId]); assert.deepEqual(done.unresolvedPersonIds, []); assert.equal(done.canSubmit, false);
  assert.throws(() => reconcileTransitionRecovery([marker], list([{ ...outcomes.prepared, createdAt: new Date(time + 1).toISOString(), preparedAt: new Date(time + 1).toISOString() }]), [outcomes.committed]));
  for (const action of [() => reconcileTransitionRecovery([marker], list(), []), () => reconcileTransitionRecovery([marker, marker], list(), [outcomes.unknown, outcomes.unknown]), () => reconcileTransitionRecovery([], { ...list(), complete: false }, []), () => reconcileTransitionRecovery([], list([outcomes.prepared, outcomes.prepared]), []), () => reconcileTransitionRecovery([], list(Array(51).fill(outcomes.prepared)), []), () => reconcileTransitionRecovery([marker], list([{ ...outcomes.prepared, commandDigest: 'f'.repeat(64) }]), [outcomes.prepared])]) assert.throws(action);
});

test('terminal resolution requires exact identity and fresh saved-state refresh before clearing a committed marker', async () => {
  const f = await fixture(); await f.vault.persist(marker);
  for (const outcome of [outcomes.unknown, outcomes.prepared, { ...outcomes.cancelled, personId: 'other' }]) await assert.rejects(f.vault.resolve(marker, outcome));
  await assert.rejects(f.vault.resolve(marker, outcomes.committed)); assert.equal(f.vault.read().length, 1);
  await assert.rejects(f.vault.resolve(marker, outcomes.committed, async () => { throw new Error('Refresh failed'); })); assert.equal(f.vault.read().length, 1);
  let refreshed = 0;
  await f.vault.resolve(marker, outcomes.committed, async () => { assert.equal(f.vault.read().length, 1); refreshed++; });
  assert.equal(refreshed, 1); assert.deepEqual(f.vault.read(), []);
  await f.vault.persist(marker); await f.vault.resolve(marker, outcomes.cancelled); assert.deepEqual(f.vault.read(), []);
});

test('permission loss during refresh retains the marker; explicit sign-out removes protected markers, not preferences', async () => {
  const f = await fixture(); await f.vault.persist(marker);
  await assert.rejects(f.vault.resolve(marker, outcomes.committed, async () => { f.setSession({ ...session(), status: 'denied' }); }));
  f.setSession(session()); assert.equal(f.vault.read().length, 1);
  f.data.setItem('app-theme', 'dark'); clearProtectedStorage(f.data);
  assert.equal(f.data.getItem('app-theme'), 'dark'); assert.deepEqual(f.vault.read(), []);
  assert(!Object.keys(f.data).some(k => k.startsWith(TRANSITION_RECOVERY_PREFIX)));
});
