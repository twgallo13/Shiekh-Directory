import type { SessionState } from './authSession';
import type { OrganizationCapabilities, OrganizationCatalog, OrganizationLeadershipIntent, OrganizationOperationList, OrganizationOperationOutcome, OrganizationPreparation } from './organizationLeadershipContract';
import { acquireOrganizationLease, organizationMarkerStore } from './organizationLeadershipRecovery';
import { createOrganizationHttpPort, OrganizationTransportError } from './organizationLeadershipClient';

export interface OrganizationWorkflowState {
  phase: 'loading' | 'disabled' | 'editing' | 'review' | 'recovery' | 'saved' | 'refresh-needed' | 'blocked';
  busy: boolean; error: string; capabilities: OrganizationCapabilities | null; catalog: OrganizationCatalog | null;
  confirmedState: 'committed' | 'cancelled' | null;
  preparation: OrganizationPreparation | null; operationId: string | null; pending: OrganizationOperationList['operations'];
}
const initial = (): OrganizationWorkflowState => ({ phase: 'loading', busy: true, error: '', capabilities: null, catalog: null, preparation: null, operationId: null, pending: [], confirmedState: null });
type Auth = { currentSession(): SessionState; sessionGeneration(): number; onSessionBoundary(listener: () => void): () => void };
type Port = ReturnType<typeof createOrganizationHttpPort>;

/** Owns the actor lease and durable marker. No optimistic success, blind retry or editable reviewed
 * intent. A missing receipt is NOT terminal proof: cancellation seals the ID before a new review.
 * Dispose/auth loss fences late callbacks and retains unresolved markers for the next session.
 */
export async function openOrganizationWorkflow(options: {
  auth: Auth; port: Port; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; locks: Pick<LockManager, 'request'>; subtle: SubtleCrypto;
  newOperationId(): string; refreshSavedDirectory(): Promise<void>; onChange(state: OrganizationWorkflowState): void;
}) {
  const { auth, port } = options, start = auth.currentSession(), uid = start.user?.uid, generation = auth.sessionGeneration();
  let disposed = false, release = () => {}, unsubscribe = () => {}, state = initial();
  const check = () => {
    const s = auth.currentSession();
    if (disposed || s.status !== 'authorized' || !uid || s.user?.uid !== uid || s.account?.uid !== uid || s.account.role !== 'System Administrator' || s.account.status !== 'Active' || s.account.accessScope !== 'Company-wide' || auth.sessionGeneration() !== generation) throw new Error('Session changed. Sign in and recover the existing review.');
  };
  const marker = organizationMarkerStore(options.storage, uid ?? '', check);
  const publish = (changes: Partial<OrganizationWorkflowState>) => { check(); state = { ...state, ...changes }; options.onChange(structuredClone(state)); };
  function dispose() { if (disposed) return; disposed = true; port.dispose(); release(); unsubscribe(); }
  unsubscribe = auth.onSessionBoundary(() => {
    state = { ...initial(), phase: 'blocked', busy: false, error: 'Your session changed. Sign in again to recover the review.' };
    options.onChange(structuredClone(state)); dispose();
  });
  const terminal = async (outcome: OrganizationOperationOutcome) => {
    check();
    if (outcome.state === 'committed') {
      publish({ phase: 'refresh-needed', preparation: null, confirmedState: 'committed' });
      const bytes = await options.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['organization-leadership-v1', uid, outcome.operationId]))); check();
      const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      if (outcome.auditId !== `organization-${digest}`) throw new Error('Saved confirmation could not be verified.');
      await options.refreshSavedDirectory(); check();
      if (state.capabilities!.catalogEnabled) { const catalog = await port.catalog(); check(); publish({ catalog }); }
      marker.resolve(outcome.operationId);
      publish({ phase: 'saved', operationId: null, error: '' });
      try { const list = await port.list(); check(); publish({ pending: list.operations }); }
      catch { if (!disposed) publish({ error: 'Assignments saved. Other pending reviews could not be refreshed.' }); }
    } else if (outcome.state === 'cancelled') {
      publish({ phase: 'refresh-needed', preparation: null, confirmedState: 'cancelled' });
      marker.resolve(outcome.operationId);
      const list = await port.list(); check();
      if (state.capabilities!.catalogEnabled) { const catalog = await port.catalog(); check(); publish({ catalog }); }
      publish({ phase: list.operations.length ? 'recovery' : 'editing', operationId: null, error: '', pending: list.operations });
    } else {
      publish({ phase: 'recovery', preparation: null, operationId: outcome.operationId,
        error: outcome.state === 'missing' ? 'No confirmation was found. Cancel this review before starting another.' : 'This review has not been saved. Cancel it before preparing new changes.' });
    }
  };
  const run = async (job: () => Promise<void>) => {
    check(); if (state.busy) throw new Error('A review action is already running.');
    publish({ busy: true, error: '' });
    try { await job(); check(); }
    catch (error) {
      if (!disposed) publish({ phase: state.operationId ? state.phase === 'refresh-needed' ? 'refresh-needed' : 'recovery' : state.phase,
        error: error instanceof OrganizationTransportError ? error.message : 'The review could not be confirmed. Keep it and check recovery before continuing.' });
    } finally { if (!disposed) publish({ busy: false }); }
  };
  try {
    check(); const capabilities = await port.capabilities(); check(); publish({ capabilities });
    if (!capabilities.catalogEnabled && !capabilities.recoveryEnabled) { publish({ phase: 'disabled', busy: false }); return { snapshot: () => structuredClone(state), dispose, prepare: async () => {}, commit: async () => {}, recover: async () => {}, cancel: async () => {} }; }
    const lease = await acquireOrganizationLease(options.locks, uid!);
    if (disposed) { lease(); throw new Error('Session changed.'); } release = lease; check();
    if (capabilities.catalogEnabled) { const catalog = await port.catalog(); check(); publish({ catalog }); }
    const local = marker.read();
    if (capabilities.recoveryEnabled) {
      const list = await port.list(); check(); publish({ pending: list.operations, operationId: local });
      if (local) await terminal(await port.status(local));
      else publish({ phase: list.operations.length ? 'recovery' : 'editing' });
    } else publish({ phase: local ? 'recovery' : 'editing', operationId: local, error: local ? 'Recovery is temporarily unavailable. Keep this review and return later.' : '' });
    publish({ busy: false });
  } catch (error) { dispose(); throw error; }
  return {
    snapshot: () => structuredClone(state), dispose,
    prepare: (units: OrganizationLeadershipIntent['units']) => run(async () => {
      if (!state.capabilities!.newCommandsEnabled || state.operationId || state.pending.length || marker.read()) throw new Error('Resolve the existing review first.');
      const operationId = options.newOperationId(); marker.persist(operationId);
      publish({ operationId, confirmedState: null });
      const intent = { operationId, units: structuredClone(units) }, preparation = await port.prepare(intent); check();
      if (preparation.state === 'prepared' && preparation.reviewHash && preparation.review) publish({ phase: 'review', preparation });
      else await terminal(preparation);
    }),
    commit: () => run(async () => {
      const p = state.preparation;
      if (!state.capabilities!.newCommandsEnabled || state.phase !== 'review' || !p?.reviewHash || marker.read() !== p.operationId) throw new Error('Prepare and review the exact assignments first.');
      await terminal(await port.commit(p.operationId, p.reviewHash));
    }),
    recover: (operationId: string) => run(async () => {
      if (!state.capabilities!.recoveryEnabled) throw new Error('Recovery is unavailable.');
      marker.persist(operationId); publish({ operationId }); await terminal(await port.status(operationId));
    }),
    cancel: (operationId: string) => run(async () => {
      if (!state.capabilities!.recoveryEnabled) throw new Error('Recovery is unavailable.');
      marker.persist(operationId); publish({ operationId }); await terminal(await port.cancel(operationId));
    }),
  };
}
