import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { useAuth, type AuthContextValue } from '../../context/AuthContext';
import { useDirectory } from '../../context/DirectoryContext';
import type { LocationRecord } from '../../types';
import { createOrganizationMoveHttpPort } from '../../lib/organizationMoveClient';
import { openOrganizationMoveWorkflow, type OrganizationMoveWorkflowState } from '../../lib/organizationMoveWorkflow';
import { buildOrganizationMoveDraft, emptyMoveSelection, moveStoreReady, moveUnitReady } from '../../lib/organizationMoveDraft';
import type { OrganizationMoveHierarchy } from '../../lib/organizationMoveContract';
import { parseTransitionDirectory } from '../../lib/transitionSavedRefresh';
import { OrganizationTransportError } from '../../lib/organizationLeadershipClient';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';

type Controller = Awaited<ReturnType<typeof openOrganizationMoveWorkflow>>;
interface Props { onClose(): void; registerClose?(close: (() => void) | null): void; footerTarget?: HTMLElement | null }
const input = 'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus-visible:outline-red-700';
export function OrganizationMoves(props: Props) {
  const auth = useAuth(), directory = useDirectory();
  return <OrganizationMovesRuntime {...props} auth={auth} refreshSavedDirectory={read => directory.refreshTransitionDirectory(read)} />;
}
/** Explicit dependencies support isolated component acceptance; production authority stays on server. */
export function OrganizationMovesRuntime({ auth, refreshSavedDirectory, onClose, registerClose, footerTarget }: Props & {
  auth: Pick<AuthContextValue, 'currentSession' | 'sessionGeneration' | 'onSessionBoundary'>;
  refreshSavedDirectory(read: () => Promise<unknown>): Promise<void>;
}) {
  const [state, setState] = useState<OrganizationMoveWorkflowState | null>(null), [error, setError] = useState('');
  const [locations, setLocations] = useState<LocationRecord[] | null>(null), [selection, setSelection] = useState(emptyMoveSelection);
  const [reapply, setReapply] = useState(false), [discard, setDiscard] = useState(false), [attempt, setAttempt] = useState(0);
  const controller = useRef<Controller | null>(null), lifecycle = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const closing = useRef({ busy: true, draft: false, phase: 'loading' });
  closing.current = { busy: state?.busy ?? true, draft: !!(selection.id || selection.reason), phase: state?.phase ?? 'loading' };
  const close = () => { const s = closing.current; if (s.busy) return; if (s.draft && s.phase === 'editing') setDiscard(true); else onClose(); };
  useEffect(() => { registerClose?.(close); return () => registerClose?.(null); });
  useEffect(() => {
    const generation = ++lifecycle.current, authGeneration = auth.sessionGeneration(); let bound: Controller | null = null, protectedState = true, refreshed = false;
    const alive = () => lifecycle.current === generation;
    setState(null); setLocations(null); setError(''); setSelection(emptyMoveSelection()); setReapply(false);
    const port = createOrganizationMoveHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch });
    const refresh = async () => {
      let saved: LocationRecord[] | null = null;
      try { await refreshSavedDirectory(async () => { const raw = await port.directory(); saved = parseTransitionDirectory(raw).locations; return raw; }); }
      catch (e) { if (alive() && e instanceof OrganizationTransportError && [401, 403].includes(e.status ?? 0)) {
        protectedState = false; bound?.dispose(); port.dispose(); setLocations(null); setSelection(emptyMoveSelection()); setReapply(false);
        setState({ phase: 'blocked', busy: false, error: 'Your access changed. Sign in again to recover the original move.', capabilities: null, catalog: null, confirmedState: null, preparation: null, operationId: null, pending: [] });
      } throw e; }
      if (!alive() || !protectedState || auth.sessionGeneration() !== authGeneration) throw new Error('Session changed.');
      refreshed = true; setLocations(saved);
    };
    void openOrganizationMoveWorkflow({ auth, port, storage: localStorage, locks: navigator.locks, subtle: crypto.subtle, newOperationId: () => crypto.randomUUID(), refreshSavedDirectory: refresh,
      onChange: value => { if (!alive()) return; setState(value); if (value.phase === 'blocked') { protectedState = false; setLocations(null); setSelection(emptyMoveSelection()); setReapply(false); } }
    }).then(async value => {
      bound = value; if (!alive()) { value.dispose(); return; } controller.current = value;
      if (!refreshed && value.snapshot().capabilities?.catalogEnabled && value.snapshot().phase === 'editing') {
        try { await refresh(); } catch { if (alive()) setError('Saved stores could not be loaded. Reopen to retry before making a move.'); }
      }
    }).catch(() => { if (alive()) { setLocations(null); setSelection(emptyMoveSelection()); setError('Moves are unavailable. Reopen to check your saved review.'); } });
    return () => { lifecycle.current++; bound?.dispose(); controller.current = null; port.dispose(); };
  }, [attempt]);
  useEffect(() => { heading.current?.focus(); }, [state?.phase, state?.error, error]);
  const act = (run: () => Promise<void>) => { setError(''); void run().catch(() => setError('Reopen this window to check the original review.')); };
  const catalog = state?.catalog, editing = state?.phase === 'editing', busy = state?.busy ?? true;
  const canEdit = editing && !!catalog && !!locations && !!state?.capabilities?.newCommandsEnabled && !busy;
  const regions = catalog?.units.filter(u => u.unitType === 'region' && moveUnitReady(u)) ?? [];
  const districts = catalog?.units.filter(u => u.unitType === 'district' && moveUnitReady(u)) ?? [];
  const district = districts.find(u => u.id === selection.id), store = locations?.find(l => l.id === selection.id);
  const oldDistrict = selection.kind === 'district' ? district : districts.find(u => u.id === store?.districtId);
  const oldRegion = regions.find(u => u.id === oldDistrict?.regionId);
  const review = () => { try { if (reapply) throw new Error('Review your retained selection against the refreshed records first.'); const draft = buildOrganizationMoveDraft(catalog!, locations!, selection); act(() => controller.current!.prepare(draft)); } catch (e) { setError((e as Error).message); } };
  const cancel = (op: string) => { setReapply(true); act(() => controller.current!.cancel(op)); };
  let actions: React.ReactNode = <Button disabled={busy} onClick={close}>Close</Button>;
  if (editing) actions = <><Button disabled={busy} onClick={close}>Close</Button><Button variant="primary" disabled={!canEdit || reapply} onClick={review}>Review move<ArrowRight className="h-4 w-4" /></Button></>;
  if (state?.phase === 'review') actions = <><Button disabled={busy} onClick={() => cancel(state.operationId!)}>Back to selection</Button><Button variant="primary" isLoading={busy} onClick={() => act(() => controller.current!.commit())}>Confirm move</Button></>;
  if (state?.phase === 'saved') actions = <Button variant="primary" onClick={onClose}>Done</Button>;
  const footer = <div className="flex flex-wrap justify-end gap-2">{actions}</div>;
  const r = state?.preparation?.review;
  const displayError = state?.phase === 'refresh-needed' && state.confirmedState
    ? `The ${state.confirmedState === 'committed' ? 'move was saved' : 'review was cancelled'}, but saved records could not be refreshed. Check status to finish.` : error || state?.error;
  return <>
    <div className="space-y-5">
      <div><p className="text-xs font-medium text-neutral-500">Region → District → Store</p><h2 ref={heading} tabIndex={-1} className="mt-1 text-lg font-semibold text-neutral-900 outline-none">{state?.phase === 'saved' ? 'Move saved' : state?.phase === 'review' ? 'Review move' : state?.phase === 'recovery' || state?.phase === 'refresh-needed' ? 'Finish your previous review' : 'Move a store or District'}</h2></div>
      {displayError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{displayError}</p>}
      {!state && !error && <p role="status" className="text-sm text-neutral-500">Loading saved organization…</p>}
      {state?.phase === 'blocked' && <Button onClick={() => setAttempt(a => a + 1)}>Reopen review</Button>}
      {state?.phase === 'disabled' && <p className="text-sm text-neutral-600">Organization moves are not available on this release.</p>}
      {state?.phase === 'saved' && <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" />The Directory now shows the confirmed hierarchy and inherited managers.</div>}
      {editing && catalog && <>
        {!locations && <div className="text-sm text-neutral-600"><p>Loading saved stores…</p>{error && <Button className="mt-2" onClick={() => setAttempt(a => a + 1)}>Reopen review</Button>}</div>}
        {!state.capabilities?.newCommandsEnabled && <p className="text-sm text-neutral-600">New moves are currently paused. Existing reviews can still be recovered.</p>}
        {!!catalog.issues.length && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Organization records need review before making moves.</p>}
        {reapply && <div role="status" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p>Your review was cancelled. The choices below are kept; saved records have been refreshed.</p><Button disabled={!canEdit} onClick={() => { try { buildOrganizationMoveDraft(catalog, locations!, selection); setReapply(false); setError(''); } catch (e) { setError((e as Error).message); } }}>Use selection with refreshed records</Button></div>}
        <fieldset disabled={!canEdit} className="min-w-0 space-y-4">
          <label className="block text-sm font-medium">Move<select className={input} value={selection.kind} onChange={e => { setSelection({ ...emptyMoveSelection(), kind: e.target.value as 'store' | 'district' }); }}><option value="store">Store to another District</option><option value="district">District to another Region</option></select></label>
          <label className="block text-sm font-medium">{selection.kind === 'store' ? 'Store' : 'District'}<select className={input} value={selection.id} onChange={e => setSelection(s => ({ ...s, id: e.target.value, regionId: '', districtId: '' }))}><option value="">Choose {selection.kind === 'store' ? 'a store' : 'a District'}…</option>{selection.kind === 'store' ? locations?.filter(moveStoreReady).sort((a,b) => a.storeNumber.localeCompare(b.storeNumber, undefined, { numeric: true })).map(l => <option key={l.id} value={l.id}>#{l.storeNumber} · {l.name}{l.recordStatus !== 'Active' ? ` · ${l.recordStatus}` : ''}</option>) : districts.map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}</select></label>
          {selection.id && <div className="rounded-lg bg-neutral-50 p-3 text-sm"><span className="text-xs text-neutral-500">Current hierarchy</span><p className="mt-1">{oldRegion?.name ?? 'Region needs review'} → {oldDistrict?.name ?? 'District needs review'}</p></div>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">Destination Region<select disabled={!selection.id} className={input} value={selection.regionId} onChange={e => setSelection(s => ({ ...s, regionId: e.target.value, districtId: '' }))}><option value="">Choose a Region…</option>{regions.filter(u => selection.kind === 'store' || u.id !== oldRegion?.id).map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}</select></label>
          {selection.kind === 'store' && <label className="block text-sm font-medium">Destination District<select disabled={!selection.regionId} className={input} value={selection.districtId} onChange={e => setSelection(s => ({ ...s, districtId: e.target.value }))}><option value="">Choose a District…</option>{districts.filter(u => u.regionId === selection.regionId && u.id !== oldDistrict?.id).map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}</select></label>}</div>
          <label className="block text-sm font-medium">Reason for move<textarea className={input} rows={2} maxLength={500} value={selection.reason} onChange={e => setSelection(s => ({ ...s, reason: e.target.value }))} /></label>
          <p className="text-xs text-neutral-500">Only Regions and Districts with completed manager setup are available. Store staff, contact details and account access stay unchanged.</p>
        </fieldset>
      </>}
      {state?.phase === 'review' && r && <>
        <section className="rounded-xl border border-neutral-200 p-4"><h3 className="font-semibold">{r.kind === 'store' ? `Store #${r.stores[0].storeNumber} · ` : 'District · '}{r.name}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><HierarchySummary label="Current" value={r.before} /><HierarchySummary label="After confirmation" value={r.after} /></div><p className="mt-4 border-t border-neutral-100 pt-3 text-sm text-neutral-600">{r.reason}</p></section>
        <section className="rounded-xl border border-neutral-200 p-4"><h3 className="text-sm font-semibold">{r.stores.length} {r.stores.length === 1 ? 'store' : 'stores'} affected</h3><ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-sm">{r.stores.map(l => <li key={l.id} className="flex flex-wrap justify-between gap-2 border-b border-neutral-100 pb-2"><span>#{l.storeNumber} · {l.name}</span><span className="text-xs text-neutral-500">{l.recordStatus}</span></li>)}</ul>{!!r.excludedNonRetail && <p className="mt-3 text-xs text-neutral-500">{r.excludedNonRetail} non-retail locations excluded.</p>}<p className="mt-3 text-xs text-neutral-500">{r.kind === 'district' ? 'The District Manager and manager roster stay the same. Stores inherit the new Region’s Primary Manager.' : 'The store inherits the destination District and Region’s Primary Managers.'} Store staff stay assigned.</p></section>
      </>}
      {(state?.phase === 'recovery' || state?.phase === 'refresh-needed') && <div className="space-y-3">
        {state.confirmedState && <p className="text-sm font-medium">{state.confirmedState === 'committed' ? 'The move was saved. Refresh saved records to finish.' : 'The review was cancelled. Refresh saved records to continue.'}</p>}
        {[...new Set([...(state.operationId ? [state.operationId] : []), ...state.pending.map(p => p.operationId)])].map((op, i) => <div key={op} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"><span className="text-sm font-medium">Unfinished move {i + 1}</span><div className="flex flex-wrap gap-2"><Button disabled={busy || !state.capabilities?.recoveryEnabled || !!state.operationId && state.operationId !== op} onClick={() => act(() => controller.current!.recover(op))}><RefreshCw className="h-4 w-4" />Check status</Button><Button disabled={busy || !state.capabilities?.recoveryEnabled || !!state.operationId && state.operationId !== op} onClick={() => cancel(op)}>Cancel review</Button></div></div>)}
        <p className="text-xs text-neutral-500">Cancel review does not undo a saved move. Unfinished reviews remain available when you return.</p>
      </div>}
    </div>
    <div className="mt-5">{footerTarget ? createPortal(footer, footerTarget) : footer}</div>
    <ConfirmDialog isOpen={discard} title="Leave move choices?" description="Your unsubmitted choices will be discarded." confirmLabel="Leave choices" onConfirm={onClose} onCancel={() => setDiscard(false)} />
  </>;
}
function HierarchySummary({ label, value }: { label: string; value: OrganizationMoveHierarchy }) {
  return <div className="min-w-0 rounded-lg bg-neutral-50 p-3"><h4 className="text-xs font-semibold text-neutral-500">{label}</h4><p className="mt-2 break-words text-sm font-medium">{value.regionName} → {value.districtName}</p><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-xs text-neutral-500">District Manager</dt><dd className="break-words">{value.districtManager.name || 'Vacant'}</dd></div><div><dt className="text-xs text-neutral-500">Regional Manager</dt><dd className="break-words">{value.regionalManager.name || 'Vacant'}</dd></div></dl></div>;
}
