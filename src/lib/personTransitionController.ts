import type { SessionState } from './authSession';
import { canonicalTransitionId, canonicalTransitionJSON, normalizePersonTransitionIntent, object, type PersonTransitionIntent } from './personTransitionIntent';
import { openTransitionRecoveryVault, parseTransitionPreparations, parseTransitionRecoveryMarker, parseTransitionRecoveryOutcome, type TransitionRecoveryMarker, type TransitionRecoveryOutcome } from './personTransitionRecovery';

export interface ClientTransitionCommand { schemaVersion: 1; operationId: string; intent: PersonTransitionIntent; reviewEnvelope: string }
export interface TransitionCommandPort {
  list(): Promise<unknown>; status(marker: TransitionRecoveryMarker): Promise<unknown>;
  prepare(command: ClientTransitionCommand): Promise<unknown>; commit(command: ClientTransitionCommand): Promise<unknown>; cancel(marker: TransitionRecoveryMarker): Promise<unknown>;
  dispose?(): void;
}
export type TransitionClientPhase = 'recovery-required' | 'review-required' | 'review-ready' | 'preparing' | 'prepared' | 'saving' | 'outcome-unknown' | 'saved' | 'cancellation-confirmed';
export interface TransitionClientSnapshot {
  phase: TransitionClientPhase; message: string; operationId: string | null; unresolved: TransitionRecoveryMarker[];
  canReview: boolean; canPrepare: boolean; canCommit: boolean; canCancel: boolean; busy: boolean;
}
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const markerOf = (v: TransitionRecoveryMarker) => parseTransitionRecoveryMarker({ schemaVersion: v.schemaVersion, operationId: v.operationId, personId: v.personId, commandDigest: v.commandDigest });
function fail(message = 'Transition outcome could not be confirmed. Recover the original operation.'): never { throw new Error(message); }
function actor(session: SessionState) {
  if (session.status !== 'authorized' || !session.user || !session.account || session.user.uid !== session.account.uid || session.account.role !== 'System Administrator' || session.account.status !== 'Active' || session.account.accessScope !== 'Company-wide') fail('Current administrator sign-in is required.');
  return session.account.uid;
}
function freeze<T>(value: T): T { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
async function digest(value: string, subtle: Pick<SubtleCrypto, 'digest'>) { return [...new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join(''); }

/** Decode/bind only: the server, never the browser, verifies the secret signature and current plan. */
async function bindReviewedCommand(raw: unknown, envelope: unknown, uid: string, operationId: string, subtle: Pick<SubtleCrypto, 'digest'>) {
  const intent = normalizePersonTransitionIntent(raw);
  if (typeof envelope !== 'string' || envelope.length > 4096) fail('A fresh server review is required.');
  const parts = envelope.split('.'); if (parts.length !== 3 || parts[0] !== 'ptv1' || !/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) fail('A fresh server review is required.');
  let claims: any, text: string;
  try {
    const binary = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    if (btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== parts[1]) fail();
    text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    claims = JSON.parse(text);
  } catch { fail('A valid server review is required.'); }
  if (!exact(claims, ['schemaVersion', 'audience', 'keyId', 'actorUid', 'personId', 'intentHash', 'stateHash', 'planHash', 'issuedAt', 'expiresAt'])
    || JSON.stringify(claims) !== text || claims.schemaVersion !== 1 || claims.audience !== 'directory-person-transition-review-v1'
    || typeof claims.keyId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(claims.keyId) || claims.actorUid !== uid || claims.personId !== intent.personId
    || ![claims.intentHash, claims.stateHash, claims.planHash].every(hash) || !Number.isSafeInteger(claims.issuedAt) || claims.issuedAt < 0 || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt - claims.issuedAt !== 300_000) fail('The server review does not match this change.');
  const intentHash = await digest(canonicalTransitionJSON(intent), subtle);
  if (intentHash !== claims.intentHash) fail('The intent changed after review. Request a fresh preview.');
  const body = freeze({ schemaVersion: 1 as const, operationId, intent, reviewEnvelope: envelope });
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > 128 * 1024) fail('The reviewed command exceeds the request limit.');
  return { body, intentHash, issuedAt: claims.issuedAt as number, expiresAt: claims.expiresAt as number };
}

/** Unwired controller: injected transport only. It does not make routes available or grant access.
 * AuthProvider must dispose it on every auth boundary and supply a trusted monotonic generation.
 */
export async function createPersonTransitionController(options: {
  personId: string; storage: Storage; session(): SessionState; generation(): number;
  locks: Parameters<typeof openTransitionRecoveryVault>[2]; subtle: Pick<SubtleCrypto, 'digest'>;
  port: TransitionCommandPort; refreshSavedDirectory(): Promise<void>; publish?(state: TransitionClientSnapshot): void;
  admissionEnabled?(): boolean;
  newOperationId(): string; clock?(): number;
}) {
  if (!canonicalTransitionId(options.personId)) fail();
  const uid = actor(options.session()), generation = options.generation();
  const vault = await openTransitionRecoveryVault(options.storage, options.session, options.locks, options.subtle, options.generation);
  let stopped = false, busy = false, recovered = false, revision = 0, phase: TransitionClientPhase = 'recovery-required', message = 'Check unresolved changes before reviewing a new change.';
  let reviewed: Awaited<ReturnType<typeof bindReviewedCommand>> & { marker: TransitionRecoveryMarker } | null = null;
  let unresolved: TransitionRecoveryMarker[] = [];
  const stop = () => { stopped = true; revision++; reviewed = null; options.port.dispose?.(); };
  const check = () => { if (stopped || actor(options.session()) !== uid || options.generation() !== generation) fail('The transition session changed. Sign in and recover before continuing.'); };
  const clock = options.clock ?? Date.now;
  const admission = () => options.admissionEnabled?.() === true;
  const requireAdmission = () => { if (!admission()) fail('New transitions are disabled. Recovery and cancellation remain available.'); };
  const fresh = () => { const now = clock(); return reviewed && Number.isSafeInteger(now) && now >= reviewed.issuedAt && now < reviewed.expiresAt; };
  const snapshot = (): TransitionClientSnapshot => {
    check(); return { phase, message, operationId: reviewed?.marker.operationId ?? null, unresolved: structuredClone(unresolved), busy,
      canReview: admission() && !busy && recovered && !unresolved.length && ['review-required', 'saved', 'cancellation-confirmed'].includes(phase),
      canPrepare: admission() && !busy && phase === 'review-ready' && !!fresh(), canCommit: admission() && !busy && phase === 'prepared' && !!fresh(), canCancel: !busy && unresolved.length > 0 };
  };
  const emit = () => { check(); options.publish?.(snapshot()); check(); };
  const set = (next: TransitionClientPhase, text: string) => { check(); phase = next; message = text; emit(); };
  const updateUnresolved = () => { unresolved = vault.read().filter(m => m.personId === options.personId); };
  const exclusive = async <T>(action: () => Promise<T>): Promise<T> => {
    check(); if (busy) fail('Wait for the current recovery action to finish.'); busy = true;
    try { emit(); const result = await action(); check(); return result; }
    finally { busy = false; if (!stopped) { try { emit(); } catch (error) { stop(); throw error; } } }
  };
  const uncertain = () => { recovered = false; try { updateUnresolved(); } catch { /* Keep known markers when storage fails. */ } set('outcome-unknown', 'Outcome unknown. Keep this operation and check its status or cancel it explicitly.'); };
  const resolve = async (raw: unknown, marker: TransitionRecoveryMarker) => {
    const outcome = parseTransitionRecoveryOutcome(raw, marker);
    if (!['committed', 'cancelled'].includes(outcome.state)) fail();
    await vault.resolve(marker, outcome, options.refreshSavedDirectory); check(); updateUnresolved();
    if (reviewed?.marker.operationId === marker.operationId) reviewed = null;
    recovered = false;
    set(outcome.state === 'committed' ? 'saved' : 'cancellation-confirmed', outcome.state === 'committed' ? 'Saved. The current Directory was refreshed.' : 'Cancellation confirmed. Check recovery before reviewing a new change.');
    return outcome;
  };
  const sendPrepare = async () => {
    requireAdmission();
    if (!reviewed) fail('The original reviewed command is no longer in memory. Recover or cancel it; do not reconstruct it.');
    if (!fresh()) { if (!unresolved.length) { reviewed = null; set('review-required', 'The preview expired. Request a fresh review.'); } else uncertain(); fail('The preview expired. Recover/cancel this operation before a new review.'); }
    const command = reviewed;
    set('preparing', 'Preparing this reviewed change; no staffing change is confirmed.');
    try {
      await vault.persist(command.marker); check(); updateUnresolved(); recovered = false;
      const raw = await options.port.prepare(command.body); check();
      const outcome = parseTransitionRecoveryOutcome(raw, command.marker);
      if (outcome.state === 'prepared') { set('prepared', 'Prepared. Confirm to save the reviewed staffing change.'); return outcome; }
      return await resolve(outcome, command.marker);
    } catch { check(); uncertain(); fail(); }
  };
  emit();
  return {
    snapshot,
    async recover() { await exclusive(async () => {
      try {
        const local = vault.read(), remoteRaw = await options.port.list(); check(); const remote = parseTransitionPreparations(remoteRaw);
        const all = new Map(local.map(m => [m.operationId, m]));
        for (const outcome of remote) {
          const marker = markerOf(outcome), previous = all.get(marker.operationId);
          if (previous && (previous.personId !== marker.personId || previous.commandDigest !== marker.commandDigest)) fail();
          all.set(marker.operationId, marker);
        }
        if (all.size > 50) fail();
        for (const marker of all.values()) { await vault.persist(marker); check(); }
        const statuses = await Promise.all([...all.values()].map(m => options.port.status(m))); check();
        const plan = await vault.reconcile(remoteRaw, statuses); check();
        let refreshed = false; let lastTerminal: TransitionRecoveryOutcome | null = null;
        for (const op of plan.operations) if (['committed', 'cancelled'].includes(op.outcome.state)) {
          await vault.resolve(op.marker, op.outcome, async () => { if (!refreshed) { await options.refreshSavedDirectory(); check(); refreshed = true; } }); check();
          if (op.marker.personId === options.personId) { lastTerminal = op.outcome; if (reviewed?.marker.operationId === op.marker.operationId) reviewed = null; }
        }
        updateUnresolved(); recovered = true;
        const current = reviewed && plan.operations.find(o => o.marker.operationId === reviewed!.marker.operationId);
        if (unresolved.length) set(current?.outcome.state === 'prepared' ? 'prepared' : 'outcome-unknown', current?.outcome.state === 'prepared' ? 'Prepared original command recovered. Confirm or cancel it.' : 'Unresolved change recovered. Inspect/cancel it; a missing receipt is not cancellation.');
        else { reviewed = null; set(lastTerminal?.state === 'committed' ? 'saved' : lastTerminal?.state === 'cancelled' ? 'cancellation-confirmed' : 'review-required', lastTerminal?.state === 'committed' ? 'Original save confirmed and current Directory refreshed.' : 'Recovery is clear. Request a fresh review before a new change.'); }
        return snapshot();
      } catch { check(); recovered = false; try { updateUnresolved(); } catch {} set(unresolved.length ? 'outcome-unknown' : 'recovery-required', 'Recovery could not be confirmed. New submissions remain disabled.'); fail('Recovery could not be confirmed. New submissions remain disabled.'); }
    }); return snapshot(); },
    async stageReviewed(rawIntent: unknown, envelope: unknown) { await exclusive(async () => {
      requireAdmission();
      updateUnresolved(); if (!recovered || unresolved.length || !['review-required', 'saved', 'cancellation-confirmed', 'review-ready'].includes(phase)) fail('Recover existing operations before staging a new change.');
      reviewed = null; set('review-required', 'Validating this fresh server review.');
      const currentRevision = ++revision;
      const candidate = await bindReviewedCommand(rawIntent, envelope, uid, options.newOperationId(), options.subtle); check();
      if (currentRevision !== revision || candidate.body.intent.personId !== options.personId) fail('This review changed or belongs to another Person.');
      const marker = await vault.markerForReviewedCommand({ operationId: candidate.body.operationId, personId: options.personId, intentHash: candidate.intentHash, reviewEnvelope: candidate.body.reviewEnvelope }); check();
      if (currentRevision !== revision) fail('The reviewed draft changed.');
      reviewed = { ...candidate, marker }; if (!fresh()) { reviewed = null; set('review-required', 'Request a fresh server review.'); fail('The preview expired or is not yet valid.'); }
      set('review-ready', 'Review ready. No preparation or staffing change has been submitted.'); return snapshot();
    }); return snapshot(); },
    invalidateReview() { check(); updateUnresolved(); if (unresolved.length || ['preparing', 'prepared', 'saving', 'outcome-unknown'].includes(phase)) fail('Resolve the original operation before editing.'); revision++; reviewed = null; set('review-required', 'Draft changed. Request a fresh server review.'); },
    async prepare() { return exclusive(async () => { if (phase !== 'review-ready') fail('A fresh reviewed draft is required.'); return sendPrepare(); }); },
    async retryPreparation() { return exclusive(async () => { if (phase !== 'outcome-unknown') fail(); return sendPrepare(); }); },
    async commit() { return exclusive(async () => {
      requireAdmission();
      if (phase !== 'prepared' || !reviewed) fail('Recover the original preparation before saving.');
      if (!fresh()) { uncertain(); fail('The review expired. Recover/cancel before a new preview.'); }
      const command = reviewed; set('saving', 'Saving the reviewed change. Keep this operation until its result is confirmed.');
      try { await vault.persist(command.marker); check(); const outcome = await options.port.commit(command.body); check(); return await resolve(outcome, command.marker); }
      catch { check(); uncertain(); fail(); }
    }); },
    async cancel(rawMarker: unknown) { return exclusive(async () => {
      const marker = parseTransitionRecoveryMarker(rawMarker); if (marker.personId !== options.personId) fail();
      const known = vault.read().some(m => m.operationId === marker.operationId && m.commandDigest === marker.commandDigest && m.personId === marker.personId);
      if (!known) fail('Recover this operation before cancelling it.');
      try { await vault.persist(marker); check(); updateUnresolved(); const outcome = await options.port.cancel(marker); check(); return await resolve(outcome, marker); }
      catch { check(); uncertain(); fail(); }
    }); },
    dispose: stop,
  };
}
