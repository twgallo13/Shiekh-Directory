import React, { useEffect, useState } from 'react';
import { Check, Clipboard, KeyRound, Plus, RefreshCw, ShieldOff, ShieldCheck, X } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  createApiClient,
  disableApiClient,
  enableApiClient,
  listApiClients,
  revokeApiClient,
  rotateApiClient,
  type ApiClientSummary,
} from '../../lib/apiClientAdminClient';

type PendingAction = {
  kind: 'disable' | 'rotate' | 'rotate-immediate' | 'revoke';
  client: ApiClientSummary;
};

export function ApiClientsPanel() {
  const [clients, setClients] = useState<ApiClientSummary[]>([]);
  const [name, setName] = useState('');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmationValue, setConfirmationValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try { setClients(await listApiClients()); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'API clients could not be loaded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const replaceClient = (client: ApiClientSummary) => {
    setClients(previous => [...previous.filter(item => item.id !== client.id), client].sort((left, right) => left.name.localeCompare(right.name)));
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError(''); setNotice(''); setIssuedToken(null);
    try {
      const issued = await createApiClient(name.trim());
      replaceClient(issued.client); setIssuedToken(issued.token); setName('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The API client could not be created.'); }
    finally { setBusy(false); }
  };

  const enable = async (client: ApiClientSummary) => {
    setBusy(true); setError(''); setNotice('');
    try { replaceClient(await enableApiClient(client.id)); setNotice(`${client.name} re-enabled.`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'The API client could not be re-enabled.'); }
    finally { setBusy(false); }
  };

  const confirmAction = async () => {
    if (!pending || busy) return;
    const action = pending;
    setBusy(true); setError(''); setNotice(''); setIssuedToken(null);
    try {
      if (action.kind === 'disable') {
        replaceClient(await disableApiClient(action.client.id)); setNotice(`${action.client.name} disabled.`);
      } else if (action.kind === 'revoke') {
        replaceClient(await revokeApiClient(action.client.id)); setNotice(`${action.client.name} permanently revoked.`);
      } else {
        const issued = await rotateApiClient(action.client.id, action.kind === 'rotate-immediate');
        replaceClient(issued.client); setIssuedToken(issued.token);
      }
      setPending(null); setConfirmationValue('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'The API client could not be updated.'); }
    finally { setBusy(false); }
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    try { await navigator.clipboard.writeText(issuedToken); setNotice('Token copied. Store it in the consuming server secret store now.'); }
    catch { setError('The browser could not copy the token. Select it and copy it manually.'); }
  };

  return (
    <section className="space-y-4 border-t border-neutral-200 pt-5" aria-labelledby="api-clients-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 id="api-clients-title" className="text-sm font-bold text-neutral-900">API Clients</h3><p className="text-xs text-neutral-500">System Administrator managed server credentials</p></div>
        <button type="button" title="Refresh clients" aria-label="Refresh API clients" disabled={loading || busy} onClick={() => void load()} className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 text-neutral-700 disabled:opacity-50"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {issuedToken && <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4" role="status">
        <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-amber-950">Store this token now</p><p className="text-xs text-amber-900">It will not be shown again after dismissal.</p></div><button type="button" title="Dismiss token" aria-label="Dismiss one-time token" onClick={() => setIssuedToken(null)} className="rounded p-1 text-amber-900 hover:bg-amber-100"><X className="h-4 w-4" /></button></div>
        <code className="block break-all rounded border border-amber-300 bg-white p-3 text-xs text-neutral-900">{issuedToken}</code>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyToken()} className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"><Clipboard className="h-4 w-4" />Copy token</button><button type="button" onClick={() => setIssuedToken(null)} className="inline-flex items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700"><Check className="h-4 w-4" />I stored it</button></div>
      </div>}

      <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
        <label className="min-w-0 flex-1 text-xs font-semibold text-neutral-700">Client name<input required maxLength={100} autoComplete="off" value={name} onChange={event => setName(event.target.value)} placeholder="Store Manager sync" className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm" /></label>
        <button type="submit" disabled={busy || !name.trim()} className="mt-auto inline-flex items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Create client</button>
      </form>

      <div className="divide-y divide-neutral-200 border-y border-neutral-200">
        {loading && <p className="py-5 text-sm text-neutral-500">Loading API clients...</p>}
        {!loading && clients.length === 0 && <p className="py-5 text-sm text-neutral-500">No API clients have been created.</p>}
        {clients.map(client => <article key={client.id} className="space-y-3 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-neutral-900">{client.name}</h4><p className="mt-1 font-mono text-xs text-neutral-500">locations:read</p></div><span className={`rounded px-2 py-1 text-xs font-semibold ${client.status === 'Active' ? 'bg-emerald-100 text-emerald-800' : client.status === 'Disabled' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>{client.status}</span></div>
          <dl className="grid gap-1 text-xs text-neutral-600 sm:grid-cols-2"><div><dt className="inline font-semibold text-neutral-800">Last used: </dt><dd className="inline">{client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleString() : 'Never'}</dd></div><div><dt className="inline font-semibold text-neutral-800">Token versions: </dt><dd className="inline">{client.tokenVersions.length}</dd></div></dl>
          {client.status !== 'Revoked' && <div className="flex flex-wrap gap-2">
            {client.status === 'Active' ? <button type="button" disabled={busy} onClick={() => setPending({ kind: 'disable', client })} className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-900"><ShieldOff className="h-3.5 w-3.5" />Disable</button> : <button type="button" disabled={busy} onClick={() => void enable(client)} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-emerald-800"><ShieldCheck className="h-3.5 w-3.5" />Re-enable</button>}
            {client.status === 'Active' && <><button type="button" disabled={busy} onClick={() => setPending({ kind: 'rotate', client })} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-700"><KeyRound className="h-3.5 w-3.5" />Rotate, 24h overlap</button><button type="button" disabled={busy} onClick={() => setPending({ kind: 'rotate-immediate', client })} className="inline-flex items-center gap-1.5 rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700"><KeyRound className="h-3.5 w-3.5" />Rotate immediately</button></>}
            <button type="button" disabled={busy} onClick={() => { setConfirmationValue(''); setPending({ kind: 'revoke', client }); }} className="inline-flex items-center gap-1.5 rounded-md bg-red-700 px-2.5 py-1.5 text-xs font-semibold text-white">Revoke</button>
          </div>}
        </article>)}
      </div>

      <ConfirmDialog isOpen={Boolean(pending)} title={confirmationTitle(pending)} description={confirmationDescription(pending)} confirmLabel={confirmationLabel(pending)} confirmationText={pending?.kind === 'revoke' ? pending.client.name : undefined} confirmationValue={confirmationValue} onConfirmationValueChange={setConfirmationValue} tone={pending?.kind === 'revoke' || pending?.kind === 'rotate-immediate' ? 'danger' : 'primary'} confirmDisabled={busy} cancelDisabled={busy} onConfirm={() => void confirmAction()} onCancel={() => { if (!busy) { setPending(null); setConfirmationValue(''); } }} />
    </section>
  );
}

function confirmationTitle(pending: PendingAction | null): string {
  if (pending?.kind === 'disable') return `Disable ${pending.client.name}?`;
  if (pending?.kind === 'rotate') return `Rotate ${pending.client.name}?`;
  if (pending?.kind === 'rotate-immediate') return `Retire old token immediately?`;
  return pending ? `Revoke ${pending.client.name}?` : '';
}

function confirmationDescription(pending: PendingAction | null): string {
  if (pending?.kind === 'disable') return 'Requests from every token for this client will be denied until the client is re-enabled.';
  if (pending?.kind === 'rotate') return 'A new token will be shown once. Existing active tokens will remain valid for at most 24 hours.';
  if (pending?.kind === 'rotate-immediate') return 'A new token will be shown once and every previous token will stop working immediately.';
  return pending ? 'Revocation is permanent and immediately invalidates every token for this client.' : '';
}

function confirmationLabel(pending: PendingAction | null): string {
  if (pending?.kind === 'disable') return 'Disable client';
  if (pending?.kind === 'rotate') return 'Rotate with overlap';
  if (pending?.kind === 'rotate-immediate') return 'Rotate and retire now';
  return 'Permanently revoke';
}