// Isolated component regression fixture: mock auth/bootstrap/capabilities only. No live app or cloud calls.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AuthContext } from '../../src/context/AuthContext';
import { DirectoryProvider } from '../../src/context/DirectoryContext';
import { HierarchyRegistryPanel } from '../../src/components/admin/HierarchyRegistryPanel';
import { createSessionBoundary, type SessionState } from '../../src/lib/authSession';

const boundary = createSessionBoundary();
const session = { status: 'authorized', user: { uid: 'registry-preview', getIdToken: async () => 'synthetic-token' }, account: { uid: 'registry-preview', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', name: 'Synthetic Administrator', email: null, emailVerified: true, authenticationMethod: 'test', personId: null }, error: '' } as SessionState;
boundary.update(session);
const seed: any = { locations: [], people: [], users: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], customFieldDefinitions: [], requests: [], auditLogs: [], serverNow: new Date().toISOString(),
  regions: [{ id: '01', name: 'West', status: 'Active', version: 1 }], districts: [{ id: '01', name: 'Central', regionId: '01', status: 'Active', version: 1 }] };
const auth = { ...session, currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe, signOut: async () => {}, retry() {}, emailLink: null, clearEmailLink() {} };
let mode: 'pending' | 'legacy' | 'organization' | 'failed' = 'pending';
const waiters: ((r: Response) => void)[] = [], originalFetch = window.fetch.bind(window);
const caps = () => new Response(JSON.stringify(mode === 'failed' ? { error: { code: 'synthetic_failure' } } : { schemaVersion: 1, catalogEnabled: mode === 'organization', recoveryEnabled: mode === 'organization', newCommandsEnabled: mode === 'organization' }), { status: mode === 'failed' ? 503 : 200, headers: { 'Content-Type': 'application/json' } });
window.fetch = async (url, init) => {
  if (!String(url).startsWith('/api/')) return originalFetch(url, init);
  if (String(url).endsWith('/organization-leadership/capabilities')) return mode === 'pending' ? new Promise<Response>(resolve => waiters.push(resolve)) : caps();
  return new Response(JSON.stringify(seed), { headers: { 'Content-Type': 'application/json' } });
};
function select(next: typeof mode) { const initial = mode === 'pending'; mode = next; for (const resolve of waiters.splice(0)) resolve(caps()); if (!initial) boundary.invalidate(); }
function Preview() {
  return <AuthContext.Provider value={auth}><DirectoryProvider seed={seed}><main className="mx-auto max-w-5xl space-y-4 p-5 font-sans"><h1 className="text-lg font-semibold">Synthetic capability transition</h1><p className="text-sm text-neutral-600">Capabilities start unresolved. No live app or cloud data.</p><div className="flex flex-wrap gap-3"><button className="rounded border px-3 py-2" onClick={() => select('legacy')}>Admit legacy controls</button><button className="rounded border px-3 py-2" onClick={() => select('organization')}>Admit organization controls</button><button className="rounded border px-3 py-2" onClick={() => select('failed')}>Fail capability check</button></div><HierarchyRegistryPanel /></main></DirectoryProvider></AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
