import React, { useRef, useState } from 'react';
import type { LocationRecord } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { canManageOperatingState } from '../../lib/operatingPermission';
import { resolveOperatingState } from '../../lib/operatingState';
import { DirectoryCommitError } from '../../lib/directoryClient';
import type { OperatingCommand } from '../../../server/operatingCommand';
import type { OperatingPreview } from '../../../server/firestoreOperating';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { Button } from '../common/Button';

/** Dedicated immediate path, independent of correction approval and permanent Location editing. */
export function OperatingStatusPanel({ location }: { location: LocationRecord }) {
  const { currentUser, people, districts, regions, operatingNow, operatingRefreshError, previewOperatingUpdate, saveOperatingUpdate, cancelOperatingUpdate, refreshOperatingDirectory } = useDirectory();
  const key = `directory-operating-operation:${currentUser.id}`;
  const [stored] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key), value = raw ? JSON.parse(raw) : null;
      if (value && (typeof value.operationId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.operationId) || typeof value.locationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.locationId) || !['close', 'renew', 'reopen'].includes(value.action) || typeof value.reason !== 'string')) throw new Error('Operating recovery data needs administrator review. Do not create a replacement blindly.');
      return { command: value as OperatingCommand | null, error: '' };
    } catch (error) { return { command: null, error: error instanceof Error ? error.message : 'Operating recovery is unavailable.' }; }
  });
  const [pending, setPending] = useState(stored.command);
  const [preview, setPreview] = useState<OperatingPreview | null>(null);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const state = resolveOperatingState(location, operatingNow);
  const canOperate = canManageOperatingState(currentUser, location, people, districts, regions);
  const ownPending = pending?.locationId === location.id;
  const expiryLabel = (iso: string, zone = location.timeZone) => { try { return new Intl.DateTimeFormat('en-US', { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) + ` (${zone})`; } catch { return iso; } };
  const begin = async (action: OperatingCommand['action']) => {
    if (busyRef.current || pending || stored.error) return;
    busyRef.current = true; setBusy(true); setError(''); setMessage('');
    try { setPreview(await previewOperatingUpdate(location.id, action)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Preview unavailable. Nothing was changed.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const attempt = async (command: OperatingCommand, recovering: boolean) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      try { sessionStorage.setItem(key, JSON.stringify(command)); }
      catch { setError('No new update was sent. Enable tab session storage to retain safe recovery; the draft is unchanged.'); return; }
      setPending(command);
      const result = await saveOperatingUpdate(command);
      try { sessionStorage.removeItem(key); } catch { /* Durable replay remains safe. */ }
      setPending(null); setPreview(null); setReason('');
      void refreshOperatingDirectory();
      setMessage(`${result.replayed ? 'Saved operation recovered' : 'Operating update saved'}. Current state: ${result.state.state === 'Unknown' ? 'Needs verification' : result.state.state}. ${result.state.reason}`);
    } catch (e) {
      const definite = !recovering && e instanceof DirectoryCommitError && ['operating_conflict', 'operating_access_denied', 'invalid_operating_update'].includes(e.code || '');
      if (definite) { try { sessionStorage.removeItem(key); setPending(null); } catch { /* Keep recovery if storage cannot be cleared. */ } }
      setPreview(null);
      setError(`${e instanceof Error ? e.message : 'The save result is unknown.'}${definite ? ' Refresh saved state and review a new confirmation.' : ' Recover this same operation before starting another update.'}`);
    } finally { busyRef.current = false; setBusy(false); }
  };
  const reconcileOrCancel = async () => {
    if (!pending || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const cancelled = await cancelOperatingUpdate(pending);
      try { sessionStorage.removeItem(key); } catch { /* Server-confirmed seal/receipt remains authoritative. */ }
      setReason(pending.reason); setPending(null); setPreview(null);
      setMessage(cancelled ? 'Uncommitted update safely cancelled. Refresh saved state and prepare a new confirmation if needed.' : 'The original update was already saved. Saved state has not been reopened or changed.');
      await refreshOperatingDirectory();
    } catch (e) { setError(e instanceof Error ? e.message : 'Recovery is unavailable. Keep the same operation.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const confirm = () => { if (!preview || !reason.trim()) return; void attempt({ operationId: crypto.randomUUID(), locationId: preview.locationId, action: preview.action, reason: reason.trim(), expectedVersion: preview.expectedVersion, expectedClosureId: preview.expectedClosureId, expectedExpiresAt: preview.expectedExpiresAt }, false); };
  const active = Boolean(state.temporaryClosure);
  return <section aria-label="Current operating state" className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-bold">{state.state === 'Unknown' ? 'Needs verification' : state.state}</h3><p className="text-neutral-600">{state.reason}</p></div><p className="text-[11px] text-neutral-500">Store-local time · {location.timeZone}</p></div>
    {state.temporaryClosure && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">Temporary closure automatically ends {expiryLabel(state.temporaryClosure.expiresAt, state.temporaryClosure.timeZone)}. After expiry, the applicable schedule/lifecycle applies—not forced opening.</p>}
    {state.issues.length > 0 && <p className="text-amber-800">{state.issues.join(' ')}</p>}
    {operatingRefreshError && <p role="alert" className="text-amber-900">{operatingRefreshError}</p>}
    {stored.error && <p role="alert" className="text-red-800">{stored.error}</p>}
    {error && <p role="alert" className="text-red-800">{error}</p>}
    {message && <p role="status" className="text-emerald-800">{message}</p>}
    {pending ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
      <p>An unconfirmed {pending.action} update is retained for Location {pending.locationId}. Its original reason and confirmation are locked.</p><p>{pending.reason}</p>
      {ownPending ? <div className="flex flex-wrap gap-2"><Button disabled={busy} size="sm" onClick={() => void attempt(pending, true)}>Recover operating update</Button><Button disabled={busy} size="sm" onClick={() => void reconcileOrCancel()}>Check saved state / cancel if not saved</Button></div> : <a className="underline font-semibold" href={`/locations/${encodeURIComponent(pending.locationId)}`}>Open that Location to recover</a>}
    </div> : canOperate && !stored.error && <div className="flex flex-wrap gap-2">
      {active ? <Button variant="secondary" disabled={busy} size="sm" onClick={() => void begin('reopen')}>End temporary closure</Button> : <Button variant="danger" disabled={busy} size="sm" onClick={() => void begin(location.temporaryClosure ? 'renew' : 'close')}>{location.temporaryClosure ? 'Confirm closure for today' : 'Report temporary closure'}</Button>}
      <Button variant="ghost" disabled={busy} size="sm" onClick={() => void refreshOperatingDirectory()}>Refresh saved state</Button>
    </div>}
    <p className="text-[11px] text-neutral-500">Hours modifiers and permanent lifecycle are separate. Connected visible screens refresh within a target of 60 seconds; offline changes cannot be guaranteed current.</p>
    <ConfirmDialog isOpen={Boolean(preview)} title={preview?.action === 'reopen' ? 'End this temporary closure?' : 'Confirm immediate temporary closure'} description={preview ? `Store #${preview.storeNumber} — ${preview.locationName}. ${preview.action === 'reopen' ? 'Return to the applicable schedule and lifecycle. This does not force the store open.' : `Publish immediately, without steward approval, until ${expiryLabel(preview.expectedExpiresAt!, preview.timeZone)}. Continuing closure on another day requires explicit confirmation.`}` : ''} confirmLabel={busy ? 'Saving…' : preview?.action === 'reopen' ? 'End temporary closure' : 'Confirm closure'} confirmDisabled={busy || !reason.trim() || reason.trim().length > 500} cancelDisabled={busy} onCancel={() => { if (!busyRef.current) setPreview(null); }} onConfirm={confirm}>
      <label className="block text-xs font-semibold">Reason for operating update<textarea aria-label="Reason for operating update" value={reason} maxLength={500} disabled={busy} onChange={e => setReason(e.target.value)} className="mt-1 w-full rounded-lg border border-neutral-300 p-2 font-normal" /></label>
      <p className="text-xs text-neutral-600">Customer-facing information, also shared through the Directory API. Do not include personal or confidential details.</p>
    </ConfirmDialog>
  </section>;
}
