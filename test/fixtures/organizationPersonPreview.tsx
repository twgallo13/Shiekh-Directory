// Actual editor/detail components; all auth, network and business data are synthetic.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AuthContext } from '../../src/context/AuthContext';
import { DirectoryProvider } from '../../src/context/DirectoryContext';
import { PersonEditorForm } from '../../src/components/people/PersonEditorForm';
import { PersonDetailModal } from '../../src/components/people/PersonDetailModal';
import { createSessionBoundary, type SessionState } from '../../src/lib/authSession';
import type { OrganizationCatalog } from '../../src/lib/organizationLeadershipContract';

const boundary = createSessionBoundary();
const session = { status: 'authorized', user: { uid: 'staff-preview', getIdToken: async () => 'synthetic-token' }, account: { uid: 'staff-preview', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', name: 'Synthetic Admin', email: null, emailVerified: true, authenticationMethod: 'test', personId: null }, error: '' } as SessionState;
boundary.update(session);
const auth = { ...session, currentSession: boundary.snapshot, sessionGeneration: boundary.generation, onSessionBoundary: boundary.subscribe, signOut: async () => {}, retry() {}, emailLink: null, clearEmailLink() {} };
const person: any = { id: 'subject', fullName: 'Synthetic Manager', version: 1, status: 'Active', activeStatus: true, positionIds: ['district-manager', 'regional-manager'], phonePrivacy: 'Internal' };
const seed: any = { locations: [], people: [person], users: [], regions: [{ id: '01', name: 'West', status: 'Active', version: 1 }], districts: [{ id: '01', name: 'Central', regionId: '01', status: 'Active', version: 1, districtManagerId: 'other' }], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], customFieldDefinitions: [], requests: [], auditLogs: [], serverNow: new Date().toISOString() };
const catalog: OrganizationCatalog = { schemaVersion: 1, evaluatedAt: new Date().toISOString(), complete: true, issues: [], people: [{ id: 'subject', fullName: person.fullName, eligibleUnitTypes: ['district', 'region'] }, { id: 'other', fullName: 'Current Primary', eligibleUnitTypes: ['district'] }], units: [{ unitType: 'district', id: '01', name: 'Central', regionId: '01', status: 'Active', version: 1, leadershipVersion: 1, ownership: 'managed', assignmentState: 'assigned', primaryPersonId: 'other', members: [{ personId: 'other', fullName: 'Current Primary', isPrimary: true, eligible: true, issues: [] }, { personId: 'subject', fullName: person.fullName, isPrimary: false, eligible: true, issues: [] }], storeCount: 0, issues: [] }] };
let failed = false;
const originalFetch = window.fetch.bind(window);
window.fetch = async (url, init) => {
  const path = String(url); if (!path.startsWith('/api/')) return originalFetch(url, init);
  if (init?.method === 'POST') throw new Error('This visual fixture does not permit server mutations.');
  if (failed) return new Response('{}', { status: 503 });
  const value = path.endsWith('/capabilities') ? { schemaVersion: 1, catalogEnabled: !new URLSearchParams(window.location.search).has('recoveryOnly'), newCommandsEnabled: !new URLSearchParams(window.location.search).has('recoveryOnly'), recoveryEnabled: true } : path.endsWith('/catalog') ? catalog : path.endsWith('/operations') ? { schemaVersion: 1, complete: true, operations: [] } : seed;
  return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
};
function Preview() {
  const [mode, setMode] = useState<'edit' | 'card'>('edit'), [result, setResult] = useState('');
  return <AuthContext.Provider value={auth}><DirectoryProvider seed={seed}><main className="mx-auto max-w-xl space-y-4 p-5"><h1 className="font-semibold">Synthetic staff review</h1><div className="flex gap-3"><button onClick={() => setMode(mode === 'edit' ? 'card' : 'edit')}>Switch editor/card</button><button onClick={() => { failed = !failed; boundary.invalidate(); }}>Toggle read failure</button></div>{mode === 'edit' ? <PersonEditorForm person={person} locations={[]} submitLabel="Save Person" onCancel={() => setResult('Editor closed')} onSubmit={async () => setResult('Synthetic profile saved')} /> : <PersonDetailModal person={person} onClose={() => setMode('edit')} />}<p role="status">{result}</p></main></DirectoryProvider></AuthContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
