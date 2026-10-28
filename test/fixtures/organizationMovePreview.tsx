// Vite-only local acceptance harness. Auth, HTTP responses and refresh are synthetic. No cloud access.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { OrganizationMovesRuntime } from '../../src/components/admin/OrganizationMoves';
import { Modal } from '../../src/components/common/Modal';
import { createSessionBoundary } from '../../src/lib/authSession';
import { ORGANIZATION_MOVE_RECOVERY_PREFIX } from '../../src/lib/organizationLeadershipRecovery';
import { moveBrowserFixture, moveBrowserPreparation } from '../helpers/organizationMoveBrowserFixture';

const uid = 'synthetic-move-preview', boundary = createSessionBoundary();
const session = { status: 'authorized' as const, user: { uid, getIdToken: async () => 'synthetic-token' }, account: { uid, role: 'System Administrator' as const, status: 'Active' as const, accessScope: 'Company-wide', personId: null, email: null, emailVerified: true, name: 'Synthetic Admin', authenticationMethod: 'test' }, error: '' };
boundary.update(session);
const auth = { currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe };
let data = moveBrowserFixture(), drop = false, failRefresh = false, commits = 0, prepares = 0;
const ops = new Map<string, any>(), nativeFetch = window.fetch.bind(window);
const reply = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });
const bootstrap = () => ({ serverNow: new Date().toISOString(), locations: data.locations, people: [], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], regions: [], districts: [] });
window.fetch = async (url, init) => {
  const path = String(url); if (!path.startsWith('/api/')) return nativeFetch(url, init);
  if (path === '/api/auth/bootstrap') return failRefresh && commits > 0 ? reply({}, 503) : reply(bootstrap());
  const mode = path.split('/').at(-1), body = init?.body ? JSON.parse(String(init.body)) : undefined;
  if (mode === 'capabilities') return reply({ schemaVersion: 1, catalogEnabled: true, newCommandsEnabled: true, recoveryEnabled: true });
  if (mode === 'catalog') return reply(data.catalog);
  if (mode === 'operations') return reply({ schemaVersion: 1, complete: true, operations: [...ops.values()].filter(o => o.state === 'prepared').map(o => ({ operationId: o.operationId, state: o.state, updatedAt: o.updatedAt, expiresAt: o.expiresAt })) });
  const id = body.operationId, current = ops.get(id);
  const outcome = (v: any) => !v ? { schemaVersion: 1, operationId: id, state: 'missing' } : v.state === 'committed' ? v : { schemaVersion: 1, operationId: id, state: v.state, updatedAt: v.updatedAt };
  if (mode === 'prepare') { prepares++; const p = moveBrowserPreparation(body, data.catalog, data.locations); ops.set(id, { ...p, intent: body }); return reply(p); }
  if (mode === 'status') return reply(outcome(current));
  if (mode === 'cancel') { if (current?.state === 'committed') return reply(current); const v = { schemaVersion: 1, operationId: id, state: 'cancelled', updatedAt: new Date().toISOString() }; ops.set(id,v); return reply(v); }
  if (mode === 'commit' && current?.state === 'committed') return reply(current);
  if (mode === 'commit' && current?.state === 'prepared') {
    commits++; const r = current.review, intent = current.intent;
    for (const l of data.locations.filter(l => r.stores.some((s: any) => s.id === l.id))) Object.assign(l, { districtId: r.after.districtId, regionId: r.after.regionId, districtManagerId: r.after.districtManager.id, districtManagerName: r.after.districtManager.name, regionalManagerId: r.after.regionalManager.id, regionalManagerName: r.after.regionalManager.name, version: l.version! + 1 });
    if (intent.kind === 'district') { const u = data.catalog.units.find(u => u.unitType === 'district' && u.id === intent.id)!; u.regionId = intent.targetId; u.version!++; }
    data.catalog.evaluatedAt = new Date().toISOString();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(['organization-move-v1',uid,id])));
    const saved = { schemaVersion: 1, operationId: id, state: 'committed', updatedAt: data.catalog.evaluatedAt, changedRecords: r.businessDocuments, auditId: 'organization-move-' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('') };
    ops.set(id,saved); if (drop) { drop = false; throw new TypeError('Synthetic lost reply'); } return reply(saved);
  }
  return reply({},409);
};
function Preview() {
  const [open,setOpen] = useState(true), [key,setKey] = useState(0), [footer,setFooter] = useState<HTMLDivElement|null>(null), [version,setVersion] = useState(4), [counts,setCounts] = useState('');
  const close = useRef<(() => void)|null>(null);
  return <main className="min-h-screen bg-neutral-100 p-4 font-sans"><div className="mx-auto max-w-3xl space-y-3"><h1 className="font-semibold">Synthetic move preview</h1><div className="flex flex-wrap gap-3 text-sm"><button onClick={() => setOpen(true)}>Open moves</button><button onClick={() => { setOpen(false); data = moveBrowserFixture(); ops.clear(); prepares=0; commits=0; drop=false; failRefresh=false; boundary.update(session); localStorage.removeItem(ORGANIZATION_MOVE_RECOVERY_PREFIX + uid); setTimeout(() => { setVersion(4); setKey(v=>v+1);setOpen(true); },100); }}>Reset preview</button><button onClick={() => { boundary.update({ status:'signed-out',user:null,account:null,error:'' }); }}>Simulate sign-out</button><label><input type="checkbox" onChange={e=>{drop=e.target.checked;}} />Lose next save reply</label><label><input type="checkbox" onChange={e=>{failRefresh=e.target.checked;}} />Fail saved refresh</label></div><p>Saved store version: <span data-testid="saved-version">{version}</span></p><button onClick={() => setCounts(`prepares=${prepares}, commits=${commits}`)}>Show synthetic counts</button><p>{counts}</p></div>
    {open && <Modal isOpen title="Organization move" size="lg" footer={<div ref={setFooter} className="w-full" />} onClose={()=>close.current?.()}><div className="mb-3 text-xs"><button onClick={() => boundary.update({ status: 'signed-out', user: null, account: null, error: '' })}>Simulate session ending</button></div><OrganizationMovesRuntime key={key} auth={auth} footerTarget={footer} registerClose={c=>{close.current=c;}} onClose={()=>setOpen(false)} refreshSavedDirectory={async read=>{const raw:any=await read(); if (!Array.isArray(raw.locations)) throw new Error('Invalid preview');setVersion(raw.locations[0].version);}} /></Modal>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
