import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchPersonTransitionPreview, type PersonTransitionPreview } from '../../lib/personTransitionPreviewClient';

/** Separate from the loaded-data report: failed refreshes never relabel old data as fresh. */
export function PersonServerTransitionPreview({ personId, personVersion }: { personId: string; personVersion?: number }) {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<PersonTransitionPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [expired, setExpired] = useState(false);
  const generation = useRef(0), request = useRef<AbortController | null>(null), deadline = useRef(0);
  useEffect(() => {
    generation.current++; request.current?.abort(); setSnapshot(null); setBusy(false); setError('');
    return () => { generation.current++; request.current?.abort(); };
  }, [personId, personVersion, user?.uid]);
  useEffect(() => {
    if (!snapshot) return;
    const tick = () => setExpired(performance.now() >= deadline.current);
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [snapshot]);
  const refresh = async () => {
    if (!user || busy) return;
    const current = ++generation.current, controller = new AbortController(), started = performance.now();
    request.current?.abort(); request.current = controller;
    setSnapshot(null); setError(''); setBusy(true); setExpired(false);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([fetchPersonTransitionPreview(user, personId, controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Server review timed out. Retry the read; no changes were made.')); }, 20_000); })]);
      if (generation.current !== current) return;
      deadline.current = started + 300_000;
      setSnapshot(result);
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error ? failure.message : 'Server review unavailable. No changes were made.');
    } finally { clearTimeout(timer); if (generation.current === current) setBusy(false); }
  };
  return <section aria-label="Server dependency snapshot" className="space-y-3 rounded-lg border border-neutral-300 bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Server dependency snapshot</h3><button type="button" className="rounded-lg border px-3 py-2 font-semibold focus-visible:outline-red-700 disabled:opacity-50" disabled={!user || busy} onClick={refresh}>{busy ? 'Reading server…' : 'Refresh from server'}</button></div>
    <p>Read-only Directory snapshot—not an offboarding clearance or access check. The loaded-data review below remains separate. No staffing, accounts or permissions are changed.</p>
    <div role="status" aria-live="polite">{busy && 'Reading current Directory dependencies…'}{error && <p className="text-red-800">{error}</p>}{snapshot && <p>{expired ? 'Snapshot expired. Refresh before using this review.' : 'Snapshot read completed; records may already have changed.'}</p>}</div>
    {snapshot && <div className="space-y-3">
      <p>Reviewed at {snapshot.evaluatedAt} · expires {snapshot.expiresAt}. {snapshot.personVersion !== (personVersion ?? null) ? 'The loaded Person card differs; reload the directory before making a separate change.' : ''}</p>
      <p>Inventory: {Object.entries(snapshot.scanned).map(([key, count]) => `${count} ${key}`).join(' · ')}. Requests include Pending only. No external app, mailbox, Firebase or historical attribution inventory.</p>
      <details><summary className="cursor-pointer font-semibold">View snapshot dependencies</summary><div className="space-y-3 pt-2">
        <div><h4 className="font-semibold">Management responsibilities ({snapshot.review.responsibilities.length})</h4>{snapshot.review.responsibilities.map(row => <p key={row.key}>{row.label} · {row.source}</p>)}{snapshot.review.issues.map(row => <p key={row} className="text-amber-900">{row}</p>)}</div>
        <div><h4 className="font-semibold">Inherited stores ({snapshot.review.inheritedStores.length})</h4>{snapshot.review.inheritedStores.map(row => <p key={row.locationId}>#{row.storeNumber} · {row.name} · {row.locationId}</p>)}</div>
        <div><h4 className="font-semibold">Historical DM copies ({snapshot.review.historicalCopies.length})</h4>{snapshot.review.historicalCopies.map(row => <p key={row.id}>#{row.storeNumber} · {row.id} · not current authority</p>)}</div>
        <div><h4 className="font-semibold">Workplace / support ({snapshot.review.workplaces.length})</h4>{snapshot.review.workplaces.map(row => <p key={row.locationId}>{row.locationId} · {row.labels.join(', ')}{row.unavailable ? ' · Unavailable / retired' : ''}</p>)}</div>
        <div><h4 className="font-semibold">Linked Directory accounts ({snapshot.review.accounts.length})</h4>{snapshot.review.accounts.map(row => <p key={row.id}>{row.id} · {row.role} · {row.status || 'Unknown status'}</p>)}</div>
        <div><h4 className="font-semibold">Pending corrections ({snapshot.review.pendingRequests.length})</h4>{snapshot.review.pendingRequests.map(row => <p key={row.id}>{row.id} · {row.changeType} · {row.reasons.join('; ')}</p>)}</div>
      </div></details>
      <p className="break-all text-neutral-600">Review digest: {snapshot.digest}. Informational only, not a lock or authorization for a later write.</p>
    </div>}
  </section>;
}
