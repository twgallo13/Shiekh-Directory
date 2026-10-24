import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useDirectory } from '../../context/DirectoryContext';
import type { DirectorySeed } from '../../lib/directorySeed';
import { PERSON_POSITIONS, personPositions, type PersonPositionId } from '../../lib/personPositions';
import { buildPositionRemovalIntent, positionRemovalRows, removalCandidates } from '../../lib/positionRemovalReview';
import { personTransitionReview } from '../../lib/personTransitionReview';
import { parseTransitionDirectory } from '../../lib/transitionSavedRefresh';
import { createTransitionCommandHttpPort } from '../../lib/personTransitionHttp';
import { openSessionBoundTransition } from '../../lib/personTransitionSession';
import type { TransitionClientSnapshot } from '../../lib/personTransitionController';
import { Button } from '../common/Button';

type Controller = Awaited<ReturnType<typeof openSessionBoundTransition>>;
const input = 'mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm focus-visible:outline-red-700';
export function PositionRemovalReview({ personId, expectedVersion, originalPositions, desiredPositions, recoveryOnly, onClose, onSaved, registerClose, footerTarget }: {
  personId: string; expectedVersion: number; originalPositions: PersonPositionId[]; desiredPositions: PersonPositionId[]; recoveryOnly: boolean;
  onClose(): void; onSaved(): void; registerClose(close: (() => void) | null): void;
  footerTarget?: HTMLElement | null;
}) {
  const auth = useAuth(), directory = useDirectory();
  const [seed, setSeed] = useState<DirectorySeed | null>(null), [state, setState] = useState<TransitionClientSnapshot | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [choices, setChoices] = useState<Record<string, string>>({}), [reason, setReason] = useState('');
  const [pending, setPending] = useState<{ id: string; reasons: string[] }[]>([]), [acknowledged, setAcknowledged] = useState<string[]>([]), [warnings, setWarnings] = useState<string[]>([]);
  const controller = useRef<Controller | null>(null), port = useRef<ReturnType<typeof createTransitionCommandHttpPort> | null>(null), live = useRef(true), action = useRef(false);
  const effectGeneration = useRef(0);
  const closeState = useRef({ busy: true, unresolved: 0 }); closeState.current = { busy: busy || !!state?.busy, unresolved: state?.unresolved.length ?? 0 };
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (state && ['review-ready', 'saved', 'outcome-unknown', 'cancellation-confirmed'].includes(state.phase)) heading.current?.focus(); }, [state?.phase]);
  const close = () => {
    if (action.current || closeState.current.busy || closeState.current.unresolved) return;
    try { const current = controller.current?.snapshot(); if (current?.busy || current?.unresolved.length) return; } catch { return; }
    controller.current?.dispose(); onClose();
  };
  useEffect(() => { registerClose(close); return () => registerClose(null); });
  useEffect(() => {
    live.current = true; const current = ++effectGeneration.current; const active = () => live.current && effectGeneration.current === current; heading.current?.focus();
    const readPort = createTransitionCommandHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch });
    let bound: Controller | null = null;
    void (async () => {
      try {
        const caps: any = await readPort.capabilities();
        if (!caps || Object.keys(caps).sort().join(',') !== 'newCommandsEnabled,recoveryEnabled,schemaVersion' || caps.schemaVersion !== 1 || typeof caps.newCommandsEnabled !== 'boolean' || typeof caps.recoveryEnabled !== 'boolean' || !caps.recoveryEnabled) throw new Error('This workflow is not available on this release. No changes were submitted.');
        if (!active()) return;
        const transport = createTransitionCommandHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch, enabled: caps.newCommandsEnabled, recoveryEnabled: caps.recoveryEnabled }); port.current = transport;
        bound = await openSessionBoundTransition(auth, { personId, storage: localStorage, locks: navigator.locks, subtle: crypto.subtle, port: transport, admissionEnabled: () => caps.newCommandsEnabled,
          newOperationId: () => crypto.randomUUID(), refreshSavedDirectory: () => directory.refreshTransitionDirectory(transport.directory), publish: snapshot => { if (active()) setState(snapshot); } });
        if (!active()) { bound.dispose(); return; } controller.current = bound;
        await bound.recover();
        if (!active() || recoveryOnly || bound.snapshot().unresolved.length || !caps.newCommandsEnabled) return;
        const fresh = parseTransitionDirectory(await transport.directory());
        const subject = fresh.people.find(p => p.id === personId);
        if (!subject || (subject.version ?? 0) !== expectedVersion || JSON.stringify([...personPositions(subject).ids].sort()) !== JSON.stringify([...originalPositions].sort())) throw new Error('The saved Person changed. Return to the profile and reload before reviewing this position change.');
        if (active()) { setSeed(fresh); setPending(personTransitionReview(subject, fresh.locations, fresh.districts, fresh.regions, fresh.users, fresh.requests).pendingRequests); }
      } catch (failure) { if (active()) setError(failure instanceof Error ? failure.message : 'Review unavailable. Keep any original operation and use recovery.'); }
      finally { readPort.dispose(); if (active()) setBusy(false); }
    })();
    return () => { live.current = false; readPort.dispose(); bound?.dispose(); port.current?.dispose(); };
  }, []);
  const run = async (job: () => Promise<unknown>) => {
    if (action.current) return; action.current = true; setBusy(true); setError('');
    try { await job(); } catch (failure) { if (live.current) setError(failure instanceof Error ? failure.message : 'Outcome unknown. Check the original operation.'); }
    finally { action.current = false; if (live.current) setBusy(false); }
  };
  const rows = seed ? positionRemovalRows(seed, personId, desiredPositions) : [];
  const editing = !busy && !!seed && state?.canReview === true;
  const preview = () => run(async () => {
    if (!seed || !controller.current || !port.current) return;
    const intent = buildPositionRemovalIntent(seed, personId, desiredPositions, choices, reason, acknowledged);
    const result: any = await port.current.preview(intent);
    if (!result || result.schemaVersion !== 1 || result.personId !== personId || typeof result.ready !== 'boolean' || result.canCommit !== false || !result.review || !Array.isArray(result.review.blockers) || !result.review.blockers.every((v: unknown) => typeof v === 'string') || !Array.isArray(result.review.warnings) || !result.review.warnings.every((v: unknown) => typeof v === 'string') || !Array.isArray(result.review.pendingRequests) || !result.review.pendingRequests.every((r: any) => typeof r.id === 'string' && Array.isArray(r.reasons) && r.reasons.every((v: unknown) => typeof v === 'string'))) throw new Error('The server review could not be verified. No change was submitted.');
    if (!live.current) return;
    setPending(result.review.pendingRequests); setWarnings(result.review.warnings);
    if (!result.ready) throw new Error(result.review.blockers.join(' ') || 'Resolve the current review before saving.');
    await controller.current.stageReviewed(intent, result.reviewEnvelope);
  });
  const actions = <div className="flex flex-wrap justify-end gap-2">
    <Button disabled={busy || !!state?.busy || !!state?.unresolved.length} onClick={state?.phase === 'saved' ? onSaved : close}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{state?.phase === 'saved' ? 'Done' : 'Back to profile'}</Button>
    {editing && <Button variant="primary" onClick={preview}>Review with server</Button>}
    {state?.phase === 'review-ready' && <><Button disabled={busy} onClick={() => { controller.current!.invalidateReview(); setWarnings([]); }}>Edit choices</Button><Button variant="primary" disabled={busy || !state.canPrepare} onClick={() => void run(async () => { await controller.current!.prepare(); if (controller.current!.snapshot().phase === 'prepared') await controller.current!.commit(); })}>Confirm and save</Button></>}
    {state?.phase === 'prepared' && <Button variant="primary" disabled={busy || !state.canCommit} onClick={() => void run(() => controller.current!.commit())}>Confirm and save</Button>}
    {controller.current && (!seed || state?.unresolved.length || state?.phase === 'outcome-unknown') && <Button disabled={busy || !!state?.busy} onClick={() => void run(() => controller.current!.recover())}>Check original result</Button>}
  </div>;
  return <><section aria-label="Position replacement and vacancy review" className="space-y-5 text-sm">
    <div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" /><div><h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">{recoveryOnly ? 'Recover a staffing change' : 'Review affected assignments'}</h2><p className="mt-1 text-neutral-600">{recoveryOnly ? 'Check the original result before making another change.' : 'Choose a replacement or explicitly leave a vacancy. Nothing is selected for you.'}</p></div></div>
    <p className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs leading-5">Store → District → Region stays unchanged. District DM changes apply once to its linked stores, including retired stores. Workplace/support links, contacts and account access are not changed by this review.</p>
    <div role="status" aria-live="polite" className="text-neutral-700">{busy ? 'Checking the current Directory…' : state?.message}</div>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {seed && <fieldset disabled={!editing} className="min-w-0 space-y-4">
      <div><h3 className="font-semibold">Positions after this change</h3><p className="mt-1 text-neutral-600">{PERSON_POSITIONS.filter(p => desiredPositions.includes(p.id)).map(p => p.label).join(' · ') || 'No linked positions'}</p></div>
      <div className="space-y-3">{rows.map(row => <div key={row.key} className="rounded-xl border border-neutral-200 bg-white p-4"><h3 className="font-semibold">{row.label}</h3><p className="mt-1 text-xs text-neutral-500">{row.role}{row.storeCount === undefined ? '' : ` · ${row.storeCount} inherited stores · one District decision`}</p>{row.required ? <label className="mt-3 block font-medium">Replacement or vacancy — {row.role}<select aria-label={`Replacement or vacancy: ${row.label} — ${row.role}`} className={input} value={choices[row.key] || ''} onChange={event => setChoices(previous => ({ ...previous, [row.key]: event.target.value }))}><option value="">Choose intentionally…</option><option value="__vacant__">Leave vacant</option>{removalCandidates(seed, personId, row).map(p => <option key={p.id} value={p.id}>{p.fullName} · {p.id}</option>)}</select></label> : <p className="mt-3 text-xs text-neutral-600">Retained — this position remains selected.</p>}</div>)}</div>
      {pending.length > 0 && <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="font-semibold">Review Pending corrections</h3><p className="text-xs">Acknowledgment does not approve or rewrite these requests. <a href="/requests" target="_blank" rel="noopener noreferrer" className="underline">Open change requests</a></p>{pending.map(r => <label key={r.id} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={acknowledged.includes(r.id)} onChange={event => setAcknowledged(previous => event.target.checked ? [...previous, r.id] : previous.filter(id => id !== r.id))} /><span>I reviewed {r.id} · {r.reasons.join('; ')}</span></label>)}</div>}
      <label className="block font-medium">Reason for this change<textarea maxLength={1000} rows={3} className={input} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the handover or vacancy for the audit history." /></label>
    </fieldset>}
    {warnings.map(warning => <p key={warning} className="rounded-lg bg-amber-50 p-3 text-xs text-amber-950">{warning}</p>)}
    {state?.unresolved.map(marker => <div key={marker.operationId} className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="font-semibold">Original submission needs confirmation</p><p className="break-all font-mono text-xs">{marker.operationId}</p><p className="text-xs">A missing reply is not cancellation. Cancellation seals an uncommitted submission; it cannot undo a confirmed save.</p><Button disabled={busy || !!state.busy} onClick={() => void run(() => controller.current!.cancel(marker))}>Cancel this submission</Button></div>)}
    {!footerTarget && <div className="border-t border-neutral-200 pt-4">{actions}</div>}
  </section>{footerTarget && createPortal(actions, footerTarget)}</>;
}
