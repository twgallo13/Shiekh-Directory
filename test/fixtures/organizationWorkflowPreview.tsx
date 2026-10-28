// Explicit Vite-only synthetic component harness. Never imported by the app/server or included in a release.
// Authentication, API outcomes and saved-directory refresh are mocked. No Firebase/cloud/business data access.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { OrganizationResponsibilitiesRuntime } from '../../src/components/people/OrganizationResponsibilities';
import { Modal } from '../../src/components/common/Modal';
import { createSessionBoundary } from '../../src/lib/authSession';
import { ORGANIZATION_RECOVERY_PREFIX } from '../../src/lib/organizationLeadershipRecovery';
import { organizationCatalogFixture, organizationPreparedFixture } from '../helpers/organizationWorkflowFixture';

const uid = 'synthetic-organization-preview', boundary = createSessionBoundary();
boundary.update({ status: 'authorized', user: { uid, getIdToken: async () => 'synthetic-token' }, account: { uid, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, email: null, emailVerified: true, name: 'Synthetic Admin', authenticationMethod: 'test' }, error: '' });
const auth = { currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe };
let catalog = organizationCatalogFixture(), dropNextCommitReply = false;
const ops = new Map<string, any>(), nativeFetch = window.fetch.bind(window);
const reply = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, init) => {
  const path = String(url); if (!path.startsWith('/api/')) return nativeFetch(url, init);
  if (path === '/api/auth/bootstrap') return reply({ synthetic: true });
  const mode = path.split('/').at(-1), body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (mode === 'capabilities') return reply({ schemaVersion: 1, catalogEnabled: true, newCommandsEnabled: true, recoveryEnabled: true });
  if (mode === 'catalog') return reply(catalog);
  if (mode === 'operations') return reply({ schemaVersion: 1, complete: true, operations: [...ops.values()].filter(o => o.state === 'prepared').map(o => ({ operationId: o.operationId, state: 'prepared', updatedAt: o.updatedAt, expiresAt: o.expiresAt })) });
  const operationId = body.operationId, current = ops.get(operationId);
  if (mode === 'prepare') {
    if (current) return reply(current);
    const p = organizationPreparedFixture(body, catalog); ops.set(operationId, { ...p, intent: body }); return reply(p);
  }
  const result = (o: any) => !o ? { schemaVersion: 1, operationId, state: 'missing' } : o.state === 'committed' ? o : { schemaVersion: 1, operationId, state: o.state, updatedAt: o.updatedAt };
  if (mode === 'status') return reply(result(current));
  if (mode === 'cancel') {
    if (current?.state === 'committed') return reply(current);
    const cancelled = { schemaVersion: 1, operationId, state: 'cancelled', updatedAt: new Date().toISOString() }; ops.set(operationId, cancelled); return reply(cancelled);
  }
  if (mode === 'commit' && current?.state === 'prepared') {
    for (const u of current.intent.units) {
      const row = catalog.units.find(r => r.id === u.unitId && r.unitType === u.unitType)!;
      Object.assign(row, { ownership: 'managed', assignmentState: u.memberPersonIds.length ? 'assigned' : 'vacant', primaryPersonId: u.primaryPersonId, version: row.version! + 1, leadershipVersion: row.leadershipVersion! + 1,
        members: u.memberPersonIds.map((id: string) => ({ personId: id, fullName: catalog.people.find(p => p.id === id)!.fullName, isPrimary: u.primaryPersonId === id, eligible: true, issues: [] })) });
    }
    catalog.evaluatedAt = new Date().toISOString();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['organization-leadership-v1', uid, operationId])));
    const saved = { schemaVersion: 1, operationId, state: 'committed', updatedAt: catalog.evaluatedAt, changedRecords: 2, auditId: 'organization-' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('') };
    ops.set(operationId, saved);
    if (dropNextCommitReply) { dropNextCommitReply = false; throw new TypeError('Synthetic dropped reply'); }
    return reply(saved);
  }
  if (mode === 'commit' && current?.state === 'committed') return reply(current);
  return reply({ error: { code: 'organization_conflict', message: 'Review the assignments again.' } }, 409);
};
function Preview() {
  const [open, setOpen] = useState(true), [key, setKey] = useState(0), [drop, setDrop] = useState(false);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const close = useRef<(() => void) | null>(null);
  return <main className="min-h-screen bg-neutral-100 p-4 font-sans text-neutral-900"><div className="mx-auto max-w-3xl space-y-3"><h1 className="text-lg font-semibold">Synthetic component preview</h1><p className="text-sm text-neutral-600">Local fixtures only. No app or cloud changes.</p><div className="flex flex-wrap gap-3 text-sm"><button onClick={() => setOpen(true)} className="rounded border bg-white px-3 py-2">Open setup</button><button onClick={() => { setOpen(false); ops.clear(); catalog = organizationCatalogFixture(); localStorage.removeItem(ORGANIZATION_RECOVERY_PREFIX + uid); setTimeout(() => { setKey(v => v + 1); setOpen(true); }, 100); }} className="rounded border bg-white px-3 py-2">Reset synthetic preview</button><label className="flex items-center gap-2"><input type="checkbox" checked={drop} onChange={e => { setDrop(e.target.checked); dropNextCommitReply = e.target.checked; }} />Simulate lost save reply</label></div></div>
    {open && <Modal isOpen title="New Manager" description="District Manager · Regional Manager" size="lg" footer={<div ref={setFooter} className="w-full" />} onClose={() => close.current?.()}><OrganizationResponsibilitiesRuntime key={key} auth={auth} footerTarget={footer} personId="new-hire" profileSaved registerClose={value => { close.current = value; }} onClose={() => setOpen(false)} refreshSavedDirectory={async read => { const result: any = await read(); if (result.synthetic !== true) throw new Error('Invalid synthetic refresh'); }} /></Modal>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
