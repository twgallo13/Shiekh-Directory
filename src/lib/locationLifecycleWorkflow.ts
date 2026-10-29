import type { SessionState } from './authSession';
import type { OrganizationCapabilities, OrganizationCatalog, OrganizationOperationList, OrganizationOperationOutcome } from './organizationLeadershipContract';
import type { LocationLifecycleIntent, LocationLifecyclePreparation, LocationLifecycleDraft, LocationLifecycleReview } from './locationLifecycleContract';
import { acquireOrganizationLease, organizationMarkerStore } from './organizationLeadershipRecovery';
import { OrganizationTransportError } from './organizationLeadershipClient';
import { createLocationLifecycleHttpPort, isLocationLifecycleIntent } from './locationLifecycleClient';

export interface LocationLifecycleWorkflowState {
  phase: 'loading' | 'disabled' | 'editing' | 'review' | 'recovery' | 'saved' | 'refresh-needed' | 'blocked';
  busy: boolean; error: string; capabilities: OrganizationCapabilities | null; catalog: OrganizationCatalog | null;
  confirmedState: 'committed' | 'cancelled' | null;
  preparation: LocationLifecyclePreparation | null; operationId: string | null; pending: OrganizationOperationList['operations'];
  preview:LocationLifecycleReview|null;
}
const initial = (): LocationLifecycleWorkflowState => ({ phase: 'loading', busy: true, error: '', capabilities: null, catalog: null, preparation: null, operationId: null, pending: [], confirmedState: null,preview:null });
type Auth = { currentSession(): SessionState; sessionGeneration(): number; onSessionBoundary(listener: () => void): () => void };
type Port = ReturnType<typeof createLocationLifecycleHttpPort>;

/** Owns the actor lease and durable marker. No optimistic success, blind retry or editable reviewed
 * intent. A missing receipt is NOT terminal proof: cancellation seals the ID before a new review.
 * Dispose/auth loss fences late callbacks and retains unresolved markers for the next session.
 */
export async function openLocationLifecycleWorkflow(options: {
  auth: Auth; port: Port; storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>; locks: Pick<LockManager, 'request'>; subtle: SubtleCrypto;
  newOperationId(): string; refreshSavedDirectory(): Promise<void>; onChange(state: LocationLifecycleWorkflowState): void;signal?:AbortSignal;
}) {
  const { auth, port } = options, start = auth.currentSession(), uid = start.user?.uid, generation = auth.sessionGeneration();
  let disposed = false, release = () => {}, unsubscribe = () => {}, state = initial();
  const check = () => {
    const s = auth.currentSession();
    if (disposed || options.signal?.aborted || s.status !== 'authorized' || !uid || s.user?.uid !== uid || s.account?.uid !== uid || s.account.role !== 'System Administrator' || s.account.status !== 'Active' || s.account.accessScope !== 'Company-wide' || auth.sessionGeneration() !== generation) throw new Error('Session changed. Sign in and recover the existing review.');
  };
  const marker = organizationMarkerStore(options.storage, uid ?? '', check, 'lifecycle');
  const publish = (changes: Partial<LocationLifecycleWorkflowState>) => { check(); state = { ...state, ...changes }; options.onChange(structuredClone(state)); };
  function dispose() { if (disposed) return; disposed = true; port.dispose(); release(); unsubscribe();options.signal?.removeEventListener('abort',dispose); }
  options.signal?.addEventListener('abort',dispose,{once:true});
  const block = (message: string) => {
    state = { ...initial(), phase: 'blocked', busy: false, error: message, operationId: state.operationId };
    options.onChange(structuredClone(state)); dispose();
  };
  const deny = () => block('Your access changed. Sign in again to recover the original Location review.');
  unsubscribe = auth.onSessionBoundary(() => {
    state = { ...initial(), phase: 'blocked', busy: false, error: 'Your session changed. Sign in again to recover the review.' };
    options.onChange(structuredClone(state)); dispose();
  });
  const terminal = async (outcome: OrganizationOperationOutcome) => {
    check();
    if (!state.operationId || outcome.operationId !== state.operationId || marker.read() !== outcome.operationId) throw new Error('The Location confirmation identity changed.');
    if (outcome.state === 'committed') {
      const bytes = await options.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['location-lifecycle-v1', uid, outcome.operationId]))); check();
      const digest = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
      if (outcome.auditId !== `location-lifecycle-${digest}`) throw new Error('Saved confirmation could not be verified.');
      publish({ phase: 'refresh-needed', preparation: null,preview:null, confirmedState: 'committed' });
      await options.refreshSavedDirectory(); check();
      if (state.capabilities!.catalogEnabled) { const catalog = await port.catalog(); check(); publish({ catalog }); }
      marker.resolve(outcome.operationId);
      publish({ phase: 'saved', operationId: null, error: '' });
      try { const list = await port.list(); check(); publish({ pending: list.operations }); }
      catch (error) { if (!disposed) { if (error instanceof OrganizationTransportError && [401, 403].includes(error.status ?? 0)) deny(); else publish({ error: 'Location change saved. Other pending reviews could not be refreshed.' }); } }
    } else if (outcome.state === 'cancelled') {
      publish({ phase: 'refresh-needed', preparation: null,preview:null, confirmedState: 'cancelled' });
      // Location use choices also depend on Location versions, which are not in the unit catalog.
      // Reapply a retained draft only after a strict saved Directory refresh, even after cancel.
      await options.refreshSavedDirectory(); check();
      const list = await port.list(); check();
      if (state.capabilities!.catalogEnabled) { const catalog = await port.catalog(); check(); publish({ catalog }); }
      marker.resolve(outcome.operationId);
      publish({ phase: list.operations.length ? 'recovery' : 'editing', operationId: null, error: '', pending: list.operations });
    } else {
      publish({ phase: 'recovery', preparation: null, operationId: outcome.operationId,
        error: outcome.state === 'missing' ? 'No confirmation was found. Cancel this review before starting another.' : 'This review has not been saved. Cancel it before preparing new changes.' });
    }
  };
  const run = async (job: () => Promise<void>) => {
    try { check(); } catch (error) { if (!disposed) deny(); throw error; }
    if (state.busy) throw new Error('A review action is already running.');
    publish({ busy: true, error: '' });
    try { await job(); check(); }
    catch (error) {
      if (!disposed && error instanceof OrganizationTransportError && [401, 403].includes(error.status ?? 0)) deny();
      else if (!disposed) {
        // Storage may have accepted an identity before a read-back threw. Adopt it rather
        // than leaving an editable screen that can only discover the marker on reopen.
        let retained=state.operationId;try{retained??=marker.read();}catch{}
        publish({operationId:retained,phase:retained?state.phase==='refresh-needed'?'refresh-needed':'recovery':state.phase,
          error:error instanceof OrganizationTransportError?error.message:'The review could not be confirmed. Keep it and check recovery before continuing.'});
      }
    } finally { if (!disposed) publish({ busy: false }); }
  };
  try {
    check(); const capabilities = await port.capabilities(); check(); publish({ capabilities });
    if (!capabilities.catalogEnabled && !capabilities.recoveryEnabled) { const local = marker.read(); publish({ phase: local ? 'recovery' : 'disabled', operationId: local, error: local ? 'Location recovery is temporarily unavailable. Keep this review and return later.' : '', busy: false }); return { snapshot: () => structuredClone(state), dispose,clearPreview:()=>{}, prepare: async (_draft:LocationLifecycleDraft) => {}, commit: async () => {}, recover: async (_id:string) => {}, cancel: async (_id:string) => {} }; }
    const lease = await acquireOrganizationLease(options.locks, uid!, 'lifecycle',options.signal);
    if (disposed) { lease(); throw new Error('Session changed.'); } release = lease; check();
    if (capabilities.catalogEnabled) { const catalog = await port.catalog(); check(); publish({ catalog }); }
    const local = marker.read();
    if (capabilities.recoveryEnabled) {
      const list = await port.list(); check(); publish({ pending: list.operations, operationId: local });
      if (local) await terminal(await port.status(local));
      else publish({ phase: list.operations.length ? 'recovery' : 'editing' });
    } else publish({ phase: local ? 'recovery' : 'editing', operationId: local, error: local ? 'Recovery is temporarily unavailable. Keep this review and return later.' : '' });
    publish({ busy: false });
  } catch (error) { if (!disposed) { if (error instanceof OrganizationTransportError && [401, 403].includes(error.status ?? 0)) deny(); else block('The Location review is unavailable. Keep any original operation and open recovery again.'); } throw error; }
  return {
    snapshot: () => structuredClone(state), dispose,
    clearPreview:()=>{check();if(!state.busy&&state.phase==='editing')publish({preview:null,error:''});},
    prepare: (draft: LocationLifecycleDraft) => run(async () => {
      if (!state.capabilities!.newCommandsEnabled || state.phase !== 'editing' || state.operationId || state.pending.length || marker.read()) throw new Error('Resolve the existing review first.');
      const operationId = options.newOperationId(), intent = { ...structuredClone(draft), operationId };
      if (!isLocationLifecycleIntent(intent)) throw new Error('Review the Location use choices before submitting.');
      const preview=await port.preview(intent);check();
      if(!preview.review.ready){publish({preview:preview.review,error:''});return;}
      marker.persist(operationId);
      publish({ operationId, confirmedState: null,preview:null });
      const preparation = await port.prepare(intent); check();
      if (preparation.state === 'prepared' && preparation.reviewHash && preparation.review) publish({ phase: 'review', preparation });
      else await terminal(preparation);
    }),
    commit: () => run(async () => {
      const p = state.preparation;
      if (!state.capabilities!.newCommandsEnabled || state.phase !== 'review' || !p?.reviewHash || marker.read() !== p.operationId) throw new Error('Prepare and review the exact Location change first.');
      await terminal(await port.commit(p.operationId, p.reviewHash));
    }),
    recover: (operationId: string) => run(async () => {
      if (!state.capabilities!.recoveryEnabled) throw new Error('Recovery is unavailable.');
      marker.persist(operationId); publish({ operationId, ...(state.operationId !== operationId ? { confirmedState: null, preparation: null } : {}) }); await terminal(await port.status(operationId));
    }),
    cancel: (operationId: string) => run(async () => {
      if (!state.capabilities!.recoveryEnabled) throw new Error('Recovery is unavailable.');
      marker.persist(operationId); publish({ operationId, ...(state.operationId !== operationId ? { confirmedState: null, preparation: null } : {}) }); await terminal(await port.cancel(operationId));
    }),
  };
}
