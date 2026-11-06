// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../src/components/AppLayout';
import { SettingsView } from '../src/components/SettingsView';
import { PeopleListView } from '../src/components/PeopleListView';
import { StaleStoresView } from '../src/components/StaleStoresView';
import { MyRequestsView } from '../src/components/MyRequestsView';
import { ClosuresBoard } from '../src/components/ClosuresBoard';
import { CorrectionsQueue } from '../src/components/CorrectionsQueue';
import { canAccessBackups } from '../src/lib/permissions';
import type { AuthUser } from '../src/types';

const auth: { role: string; signOut: ReturnType<typeof vi.fn> } = { role: 'Admin', signOut: vi.fn() };
const authUser = { email: 'qa@test.invalid', getIdToken: async () => '' };
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ authUser: auth, user: authUser, signOut: auth.signOut, getIdToken: async () => '' }),
}));
vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, apiGet: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })) };
});
const renderNow = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);
describe('Backups navigation uses real route permission', () => {
  for (const role of ['Steward', 'Leader', 'Viewer', 'Admin']) {
    it(`${role}: hidden or visible in desktop More and phone drawer`, async () => {
      auth.role = role;
      renderNow(<AppLayout>Page</AppLayout>);
      fireEvent.click(screen.getByRole('button',{name:'More'}));
      expect(screen.queryByText('Backups') !== null).toBe(role === 'Admin');
      cleanup();
      renderNow(<AppLayout>Page</AppLayout>);
      fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
      expect(screen.queryByText('Backups') !== null).toBe(role === 'Admin');
      expect(canAccessBackups({ uid: 'qa', email: 'qa@test.invalid', role } as AuthUser)).toBe(role === 'Admin');
    });
  }
});
it('Settings Sign Out calls the real handler', async () => {
  renderNow(<SettingsView />);
  fireEvent.click(screen.getByRole('button',{name:'Sign Out'}));
  expect(auth.signOut).toHaveBeenCalledOnce();
});
it('phone drawer keeps sign out outside the scrolling nav', () => {
  const {container} = renderNow(<AppLayout>Page</AppLayout>);
  fireEvent.click(screen.getByRole('button',{name:'Open menu'}));
  expect(container.querySelector('.overflow-y-auto + div.shrink-0')?.textContent).toContain('Sign Out');
});
it('People pagination, role cell shows role NOT email, inactive checkbox larger', async () => {
  const people = Array.from({length:51},(_,i)=>({id:String(i),fullName:`Person ${i}`,workEmail:`p${i}@notshownhere.invalid`,primaryRole:'DM',primaryScopeName:'Central',lifecycle:'active'}));
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({data:people}),{status:200,headers:{'Content-Type':'application/json'}}));
  renderNow(<PeopleListView />);
  await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeTruthy());
  expect(screen.getByLabelText('Show inactive').className).toContain('w-5 h-5');
  const roleCell = screen.getAllByText('DM - Central')[0];
  expect(roleCell).toBeTruthy();
  expect(roleCell.textContent).not.toContain('@');
  expect(roleCell.textContent).not.toContain('notshownhere');
});
it('Stale Stores labels overdue values and action buttons', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ staleStores:[{id:'x',storeNumber:'2',name:'Test',daysSinceVerification:null}],thresholdDays:90,totalCount:1,districts:[] }),{status:200,headers:{'Content-Type':'application/json'}}));
  renderNow(<StaleStoresView />);
  await waitFor(() => expect(screen.getByText('Send Verification')).toBeTruthy());
  expect(screen.getByText('Days overdue')).toBeTruthy();
  expect(screen.getByText('Not set')).toBeTruthy();
  expect(screen.getByText('Requests')).toBeTruthy();
});
it('My Requests has a New request link',async()=>{ renderNow(<MyRequestsView/>); await waitFor(()=>expect(screen.getByText('New request')).toBeTruthy()); });
it('Closures board shows skeleton on load', () => {
  renderNow(<ClosuresBoard />);
  expect(screen.getByLabelText('Loading closures')).toBeTruthy();
});
it('Approvals queue shows submitter identification in rendered row', async () => {
  const corrections = [{id:'c1',locationId:'loc1',storeNumber:'42',locationName:'Test Store',status:'pending',correctionType:'hours',submittedByEmail:'submitter@test.invalid',submittedAt:new Date().toISOString()}];
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({data:corrections}),{status:200,headers:{'Content-Type':'application/json'}}));
  renderNow(<CorrectionsQueue onBack={() => {}} />);
  await waitFor(() => expect(screen.getByText(/Submitted by/)).toBeTruthy());
  expect(screen.getByText(/submitter@test.invalid/)).toBeTruthy();
});

beforeEach(() => {
  cleanup();
  auth.role = 'Admin';
  auth.signOut = vi.fn(async () => undefined);
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    let body: unknown = { data: [] };
    if (String(url).includes('stale-stores')) body = { staleStores: [], districts: [], thresholdDays: 90, totalCount: 0 };
    return new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json'}});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
