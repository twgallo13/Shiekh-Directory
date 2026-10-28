import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { AuthContextValue } from '../../context/AuthContext';
import { useDirectory } from '../../context/DirectoryContext';
import { createOrganizationHttpPort } from '../../lib/organizationLeadershipClient';
import { openOrganizationWorkflow, type OrganizationWorkflowState } from '../../lib/organizationLeadershipWorkflow';
import { beginOrganizationRoster, buildOrganizationRosterIntent, organizationUnitKey, reapplyOrganizationRosters, type OrganizationRosterDraft } from '../../lib/organizationRosterDraft';
import type { OrganizationCatalog, OrganizationUnitSummary } from '../../lib/organizationLeadershipContract';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';

const input = 'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus-visible:outline-red-700';
type Controller = Awaited<ReturnType<typeof openOrganizationWorkflow>>;
interface OrganizationResponsibilitiesProps {
  personId?: string; profileSaved?: boolean; onClose(): void; registerClose?(close: (() => void) | null): void; footerTarget?: HTMLElement | null;
}
export function OrganizationResponsibilities(props: OrganizationResponsibilitiesProps) {
  const auth = useAuth(), directory = useDirectory();
  return <OrganizationResponsibilitiesRuntime {...props} auth={auth} refreshSavedDirectory={read => directory.refreshTransitionDirectory(read)} />;
}
/** Runtime dependencies are explicit for isolated component acceptance; server authorization is unchanged. */
export function OrganizationResponsibilitiesRuntime({ auth, refreshSavedDirectory, personId, profileSaved = false, onClose, registerClose, footerTarget }: OrganizationResponsibilitiesProps & {
  auth: Pick<AuthContextValue, 'currentSession' | 'sessionGeneration' | 'onSessionBoundary'>; refreshSavedDirectory(read: () => Promise<unknown>): Promise<void>;
}) {
  const [state, setState] = useState<OrganizationWorkflowState | null>(null), [error, setError] = useState('');
  const [drafts, setDrafts] = useState<OrganizationRosterDraft[]>([]), [base, setBase] = useState<OrganizationCatalog | null>(null), [reason, setReason] = useState('');
  const [discard, setDiscard] = useState(false), [filter, setFilter] = useState<'all' | 'district' | 'region'>('all');
  const controller = useRef<Controller | null>(null), generation = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  const closeState = useRef({ busy: true, draft: false, phase: 'loading' }); closeState.current = { busy: !state || state.busy, draft: drafts.length > 0, phase: state?.phase ?? 'loading' };
  const close = () => { if (closeState.current.busy) return; if (closeState.current.draft && closeState.current.phase === 'editing') setDiscard(true); else onClose(); };
  useEffect(() => { registerClose?.(close); return () => registerClose?.(null); });
  useEffect(() => {
    const current = ++generation.current;
    const port = createOrganizationHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch });
    let bound: Controller | null = null;
    void openOrganizationWorkflow({ auth, port, storage: localStorage, locks: navigator.locks, subtle: crypto.subtle, newOperationId: () => crypto.randomUUID(), refreshSavedDirectory: () => refreshSavedDirectory(() => port.directory()),
      onChange: value => { if (generation.current === current) setState(value); } }).then(value => { bound = value; if (generation.current !== current) value.dispose(); else controller.current = value; })
      .catch(e => { if (generation.current === current) { setError(e instanceof Error ? e.message : 'Assignments are unavailable.'); setState({ phase: 'blocked', busy: false, error: '', capabilities: null, catalog: null, preparation: null, operationId: null, pending: [], confirmedState: null }); } });
    return () => { generation.current++; bound?.dispose(); port.dispose(); controller.current = null; };
  }, [personId]);
  useEffect(() => { heading.current?.focus(); }, [state?.phase, error, state?.error]);
  const catalog = state?.catalog ?? null;
  const source = base ?? catalog;
  const selectedKey = (d: OrganizationRosterDraft) => organizationUnitKey(d.unitType, d.unitId);
  const relevant = (c: OrganizationCatalog) => JSON.stringify([c.issues, drafts.map(d => c.units.find(u => u.unitType === d.unitType && u.id === d.unitId)), c.people.filter(p => drafts.some(d => d.members.includes(p.id)))]);
  const stale = !!base && !!catalog && relevant(base) !== relevant(catalog);
  const act = (run: () => Promise<void>) => { setError(''); void run().catch(() => setError('This review is unavailable. Reopen it to check recovery.')); };
  const toggle = (u: OrganizationUnitSummary) => {
    setError(''); const exists = drafts.some(d => selectedKey(d) === organizationUnitKey(u.unitType, u.id));
    if (exists) { const next = drafts.filter(d => selectedKey(d) !== organizationUnitKey(u.unitType, u.id)); setDrafts(next); if (!next.length) setBase(null); }
    else try { setDrafts([...drafts, beginOrganizationRoster(u, catalog!, personId)]); if (!base) setBase(catalog); } catch (e) { setError((e as Error).message); }
  };
  const change = (draft: OrganizationRosterDraft) => { setError(''); setDrafts(drafts.map(d => selectedKey(d) === selectedKey(draft) ? draft : d)); };
  const review = () => {
    try { if (stale) throw new Error('Review the refreshed assignments before continuing.'); const units = buildOrganizationRosterIntent(source!, drafts, reason); act(() => controller.current!.prepare(units)); }
    catch (e) { setError((e as Error).message); }
  };
  const names = (id: string | null) => !id ? 'Vacant' : catalog?.people.find(p => p.id === id)?.fullName ?? id;
  let actions: React.ReactNode = <Button onClick={close}>Close</Button>;
  if (state?.phase === 'editing') actions = <><Button disabled={state.busy} onClick={close}>{profileSaved ? 'Assign later' : 'Close'}</Button><Button variant="primary" disabled={state.busy || !state.capabilities?.newCommandsEnabled || !drafts.length || stale} isLoading={state.busy} onClick={review}>Review assignments<ChevronRight className="h-4 w-4" /></Button></>;
  else if (state?.phase === 'review') actions = <><Button disabled={state.busy} onClick={() => act(() => controller.current!.cancel(state.operationId!))}><ArrowLeft className="h-4 w-4" />Back to responsibilities</Button><Button variant="primary" isLoading={state.busy} onClick={() => act(() => controller.current!.commit())}>Confirm assignments</Button></>;
  else if (state?.phase === 'saved') actions = <Button variant="primary" onClick={onClose}>Done</Button>;
  const footer = <div className="flex flex-wrap justify-end gap-2">{actions}</div>;
  return <>
    <div className="space-y-5">
      <ol aria-label="Setup progress" className="flex flex-wrap items-center gap-2 text-xs text-neutral-500"><li className="flex items-center gap-1"><Check className="h-3.5 w-3.5 text-emerald-600" />{personId ? 'Profile' : 'Organization'}</li><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /><li className={state?.phase === 'editing' ? 'font-semibold text-neutral-900' : ''}>Responsibilities</li><ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /><li className={state?.phase === 'review' ? 'font-semibold text-neutral-900' : ''}>Review</li></ol>
      <div><h2 ref={heading} tabIndex={-1} className="text-lg font-semibold text-neutral-900 outline-none">{state?.phase === 'saved' ? 'Assignments saved' : state?.phase === 'review' ? 'Review assignments' : state?.phase === 'recovery' ? 'Review needs attention' : 'Management responsibilities'}</h2>
        {profileSaved && <p className="mt-1 text-sm text-emerald-700">Profile saved.</p>}
        {state?.phase === 'editing' && <p className="mt-1 text-sm text-neutral-600">Choose the Districts or Regions to manage. Workplace is optional and can be a store or Corporate Office.</p>}</div>
      {(error || state?.error) && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{error || state?.error}</p>}
      {!state && !error && <p role="status" className="text-sm text-neutral-500">Loading current assignments…</p>}
      {state?.phase === 'disabled' && <p className="text-sm text-neutral-600">Management assignments are not available on this release. Your saved profile is ready.</p>}
      {state?.phase === 'saved' && <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 className="h-5 w-5 shrink-0" />The Directory now shows the confirmed responsibilities.</div>}
      {state?.phase === 'editing' && catalog && <>
        {personId && <section aria-label="Current responsibilities" className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"><h3 className="text-xs font-semibold text-neutral-700">Current responsibilities</h3><ul className="mt-2 space-y-2 text-sm">{catalog.units.filter(u => u.members.some(m => m.personId === personId)).map(u => <li key={organizationUnitKey(u.unitType, u.id)} className="flex flex-wrap justify-between gap-2"><span>{u.name} <span className="text-xs text-neutral-500">· {u.unitType === 'district' ? 'District' : 'Region'} {u.id}</span></span><span className="text-xs font-medium text-neutral-600">{u.members.find(m => m.personId === personId)!.isPrimary ? 'Primary Manager' : 'Additional Manager'}</span></li>)}</ul>{!catalog.units.some(u => u.members.some(m => m.personId === personId)) && <p className="mt-1 text-sm text-neutral-500">No District or Region assignments yet.</p>}</section>}
        {!state.capabilities?.newCommandsEnabled && <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">Assignments are available to view. New changes are currently paused.</p>}
        {!!catalog.issues.length && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Organization records need review before new assignments. {catalog.issues.join(' ')}</p>}
        {stale && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><p>Organization records changed. Your draft is kept.</p><Button className="mt-2" onClick={() => { try { setDrafts(reapplyOrganizationRosters(base!, catalog, drafts)); setBase(catalog); setError(''); } catch (e) { setError((e as Error).message); } }}>Review updated assignments</Button></div>}
        <fieldset disabled={state.busy || !state.capabilities?.newCommandsEnabled} className="min-w-0 space-y-4">
          <label className="block text-xs font-medium text-neutral-600">Show<select className={input} value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="all">Regions & Districts</option><option value="region">Regions</option><option value="district">Districts</option></select></label>
          <div className="grid gap-2 sm:grid-cols-2">{catalog.units.filter(u => filter === 'all' || u.unitType === filter).filter(u => !personId || u.members.some(m => m.personId === personId) || catalog.people.find(p => p.id === personId)?.eligibleUnitTypes.includes(u.unitType)).map(u => {
            const selected = drafts.some(d => selectedKey(d) === organizationUnitKey(u.unitType, u.id));
            return <button type="button" key={organizationUnitKey(u.unitType, u.id)} aria-pressed={selected} disabled={!selected && (drafts.length >= 5 || u.status !== 'Active' || !!u.issues.length || !!catalog.issues.length || u.ownership === 'unsupported')} onClick={() => toggle(u)} className={'rounded-xl border p-3 text-left focus-visible:outline-red-700 disabled:opacity-50 ' + (selected ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-white hover:border-neutral-400')}>
              <span className="flex items-start justify-between gap-2"><span className="text-sm font-semibold text-neutral-900">{u.name}</span>{selected && <Check className="h-4 w-4 shrink-0 text-red-700" />}</span>
              <span className="mt-1 block text-xs text-neutral-500">{u.unitType === 'district' ? 'District' : 'Region'} {u.id} · {u.storeCount} retail {u.storeCount === 1 ? 'store' : 'stores'}</span>
              <span className="mt-2 block text-xs text-neutral-700">{u.assignmentState === 'unmanaged' ? 'Manager setup required' : u.assignmentState === 'vacant' ? 'Primary Manager vacant' : `Primary: ${names(u.primaryPersonId)}`}</span>
              {!!u.issues.length && <span className="mt-2 block text-xs text-amber-800">{u.issues.join(' ')}</span>}
            </button>;
          })}</div>
          {drafts.map(d => { const u = source!.units.find(u => u.unitType === d.unitType && u.id === d.unitId)!; return <OrganizationRosterFields key={selectedKey(d)} unit={u} catalog={source!} draft={d} onChange={change} />; })}
          {!!drafts.length && <label className="block text-sm font-medium text-neutral-700">Reason for change<input value={reason} maxLength={500} onChange={e => setReason(e.target.value)} className={input} /><span className="mt-1 block text-xs font-normal text-neutral-500">Required for setup, a Primary change or an assignment ending.</span></label>}
        </fieldset>
      </>}
      {state?.phase === 'review' && state.preparation?.review?.map(u => <section key={organizationUnitKey(u.unitType, u.unitId)} className="space-y-3 rounded-xl border border-neutral-200 p-4">
        <h3 className="font-semibold text-neutral-900">{u.name} <span className="font-normal text-neutral-500">· {u.unitType === 'district' ? 'District' : 'Region'} {u.unitId}</span></h3>
        <div className="grid gap-2 text-sm sm:grid-cols-2"><div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Current Primary</p><p className="mt-1 font-medium">{names(u.beforePrimaryPersonId)}</p></div><div className="rounded-lg bg-red-50 p-3"><p className="text-xs text-red-700">After confirmation</p><p className="mt-1 font-medium">{names(u.primaryPersonId)}</p></div></div>
        <ul className="space-y-2 text-sm">{u.members.map(m => <li key={m.personId} className="flex flex-wrap justify-between gap-2"><span>{m.fullName}{m.eligibilityIssue && <span className="block text-xs text-amber-800">{m.eligibilityIssue}</span>}</span><span className={m.isPrimary ? 'font-semibold text-neutral-900' : 'text-neutral-500'}>{m.isPrimary ? 'Primary Manager' : 'Additional Manager'}</span></li>)}</ul>
        {!!u.ended.length && <p className="text-sm text-red-800">Assignments ending: {u.ended.map(names).join(', ')}</p>}
        {!u.members.length && <p className="text-sm text-amber-900">This unit will be vacant.</p>}
        {!!u.compatibilityStores && <p className="text-xs text-neutral-500">Leadership updated for {u.compatibilityStores} linked retail {u.compatibilityStores === 1 ? 'store' : 'stores'}.</p>}
        {u.reason && <p className="border-t border-neutral-100 pt-3 text-sm text-neutral-600">{u.reason}</p>}
      </section>)}
      {(state?.phase === 'recovery' || state?.phase === 'refresh-needed') && <div className="space-y-3">
        {state.confirmedState && <p className="text-sm font-medium text-neutral-800">{state.confirmedState === 'committed' ? 'The assignments were saved. Refresh the records to finish.' : 'The review was cancelled. Refresh to continue.'}</p>}
        {[...new Set([...(state.operationId ? [state.operationId] : []), ...state.pending.map(p => p.operationId)])].map((op, index) => <div key={op} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"><span className="text-sm font-medium">Unfinished review {index + 1}</span><div className="flex flex-wrap gap-2"><Button disabled={state.busy || !state.capabilities?.recoveryEnabled || !!state.operationId && state.operationId !== op} onClick={() => act(() => controller.current!.recover(op))}><RefreshCw className="h-3.5 w-3.5" />Check status</Button><Button disabled={state.busy || !state.capabilities?.recoveryEnabled || !!state.operationId && state.operationId !== op} onClick={() => act(() => controller.current!.cancel(op))}>Cancel review</Button></div></div>)}
        <p className="text-xs text-neutral-500">A cancelled review keeps saved assignments. Unfinished reviews stay available when you return.</p>
      </div>}
    </div>
    <div className="mt-5">{footerTarget ? createPortal(footer, footerTarget) : footer}</div>
    <ConfirmDialog isOpen={discard} title="Leave assignment choices?" description={(personId ? 'The profile is saved. ' : '') + 'These unsubmitted assignment choices will be discarded.'} confirmLabel="Leave choices" onConfirm={onClose} onCancel={() => setDiscard(false)} />
  </>;
}

export function OrganizationRosterFields({ unit, catalog, draft, onChange }: { unit: OrganizationUnitSummary; catalog: OrganizationCatalog; draft: OrganizationRosterDraft; onChange(draft: OrganizationRosterDraft): void }) {
  const group = useId(), ids = [...new Set([...unit.members.map(m => m.personId), ...draft.members])];
  const candidates = catalog.people.filter(p => p.eligibleUnitTypes.includes(unit.unitType) && !draft.members.includes(p.id));
  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
    <legend className="px-1 text-sm font-semibold text-neutral-900">{unit.name} · {unit.unitType === 'district' ? 'District' : 'Region'} {unit.id}</legend>
    <p className="text-xs text-neutral-500">Choose one Primary Manager. Other selected managers provide Additional coverage.</p>
    {ids.map(id => { const p = catalog.people.find(p => p.id === id), existing = unit.members.find(m => m.personId === id), included = draft.members.includes(id), name = p?.fullName ?? existing?.fullName ?? id;
      return <div key={id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm"><label className="flex min-h-8 min-w-0 items-center gap-2"><input type="checkbox" aria-label={`Include ${name} in ${unit.name}`} checked={included} onChange={e => onChange({ ...draft, members: e.target.checked ? [...draft.members, id] : draft.members.filter(x => x !== id), primary: !e.target.checked && draft.primary === id ? null : draft.primary })} className="accent-red-700" /><span className="break-words">{name}{included && draft.primary !== id && <span className="block text-xs text-neutral-500">Additional Manager</span>}{existing?.issues.length ? <span className="block text-xs text-amber-800">Needs review</span> : null}</span></label>
        {included ? <label className="flex min-h-8 items-center gap-2 whitespace-nowrap text-xs"><input type="radio" name={group} aria-label={`${name} as Primary Manager for ${unit.name}`} checked={draft.primary === id} disabled={id !== unit.primaryPersonId && !p?.eligibleUnitTypes.includes(unit.unitType)} onChange={() => onChange({ ...draft, primary: id })} className="accent-red-700" />{draft.primary === id ? 'Primary Manager' : 'Make Primary'}</label> : <span className="text-xs text-red-800">Assignment ending</span>}
      </div>;
    })}
    {!draft.members.length && <p className="text-sm text-amber-900">No managers selected. This unit will be vacant after confirmation.</p>}
    {!!draft.members.length && !draft.primary && <p className="text-sm text-amber-900">Choose a Primary Manager to continue.</p>}
    <label className="block text-xs font-medium text-neutral-600">Add manager<select aria-label={`Add manager to ${unit.name}`} value="" disabled={draft.members.length >= 25} onChange={e => { if (e.target.value) onChange({ ...draft, members: [...draft.members, e.target.value] }); }} className={input}><option value="">Choose eligible manager…</option>{candidates.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>
    {unit.ownership === 'legacy' && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><input type="checkbox" checked={draft.activationReviewed} onChange={e => onChange({ ...draft, activationReviewed: e.target.checked })} className="mt-0.5 accent-red-700" /><span>Use these reviewed assignments for {unit.name}. Linked retail stores will follow this unit after confirmation.</span></label>}
  </fieldset>;
}
