// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../src/components/AppLayout';
import { PeopleListView } from '../src/components/PeopleListView';
import { StaleStoresView } from '../src/components/StaleStoresView';
import { MyRequestsView } from '../src/components/MyRequestsView';
import { ClosuresBoard } from '../src/components/ClosuresBoard';
import { CorrectionsQueue } from '../src/components/CorrectionsQueue';
import { HierarchyView } from '../src/components/HierarchyView';
import { canAccessBackups } from '../src/lib/permissions';
import type { AuthUser } from '../src/types';

const authMock = { 
  uid: 'test-uid',
  email: 'qa@test.invalid', 
  role: 'Admin' as string,
  fullName: 'Test Admin'
};
const signOutMock = vi.fn();
vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({ 
    authUser: authMock, 
    user: { email: authMock.email, getIdToken: async () => '' }, 
    signOut: signOutMock, 
    getIdToken: async () => '' 
  }),
}));
vi.mock('../src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/api')>();
  return { ...actual, apiGet: vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })) };
});
const renderNow = (node: React.ReactNode) => render(<MemoryRouter>{node}</MemoryRouter>);

describe('Desktop navigation role-based visibility', () => {
  for (const role of ['Store', 'Viewer', 'Leader', 'Steward', 'Admin']) {
    it(`${role}: correct items visible in desktop nav`, () => {
      authMock.role = role;
      renderNow(<AppLayout>Page</AppLayout>);
      
      // Tools menu should be hidden for Store/Viewer (no items), visible for Leader+
      const toolsButton = screen.queryByRole('button', { name: 'Tools' });
      const hasToolsAccess = role === 'Leader' || role === 'Steward' || role === 'Admin';
      expect(toolsButton !== null).toBe(hasToolsAccess);
      
      // Account menu should always exist for authenticated users
      const accountButton = screen.getByRole('button', { name: 'Account menu' });
      expect(accountButton).toBeTruthy();
      
      // DM Tasks (main bar) should be visible for Leader, Steward, Admin
      const dmTasksLink = screen.queryByText('DM Tasks');
      expect(dmTasksLink !== null).toBe(role === 'Leader' || role === 'Steward' || role === 'Admin');
      
      cleanup();
    });
  }
});

describe('Phone drawer navigation role-based visibility', () => {
  for (const role of ['Store', 'Viewer', 'Leader', 'Steward', 'Admin']) {
    it(`${role}: correct items in phone drawer`, () => {
      authMock.role = role;
      renderNow(<AppLayout>Page</AppLayout>);
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      
      const isLeaderOrAbove = role === 'Leader' || role === 'Steward' || role === 'Admin';
      const isStewardOrAdmin = role === 'Steward' || role === 'Admin';
      const isAdmin = role === 'Admin';
      
      // Directory is always visible (using getAllByText since desktop nav may also show it)
      expect(screen.getAllByText('Directory').length).toBeGreaterThan(0);
      
      // Approvals only for Steward/Admin (canApproveCorrections)
      const approvalsLinks = screen.queryAllByText('Approvals');
      expect(approvalsLinks.length > 0).toBe(isStewardOrAdmin);
      
      // Verification, DM Tasks, Closures for Leader+ only
      const verificationLinks = screen.queryAllByText('Verification');
      expect(verificationLinks.length > 0).toBe(isLeaderOrAbove);
      
      const dmTasksLinks = screen.queryAllByText('DM Tasks');
      expect(dmTasksLinks.length > 0).toBe(isLeaderOrAbove);
      
      const closuresLinks = screen.queryAllByText('Closures');
      expect(closuresLinks.length > 0).toBe(isLeaderOrAbove);
      
      // People and Hierarchy for Steward/Admin only
      const peopleLinks = screen.queryAllByText('People');
      expect(peopleLinks.length > 0).toBe(isStewardOrAdmin);
      
      // Admin link should only show for Admin
      const adminLinks = screen.queryAllByText('Admin');
      expect(adminLinks.length > 0).toBe(isAdmin);
      
      // My Requests and Sign Out should always be visible in drawer
      expect(screen.getAllByText('My Requests').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sign Out').length).toBeGreaterThan(0);
      
      // Print / Export in Tools section only for Leader+ (canPrint = isLeaderOrAbove)
      // Note: label has spaces around slash: "Print / Export"
      const printLinks = screen.queryAllByText('Print / Export');
      expect(printLinks.length > 0).toBe(isLeaderOrAbove);
      
      // Backups permission check
      expect(canAccessBackups({ uid: 'qa', email: 'qa@test.invalid', role } as AuthUser)).toBe(isAdmin);
      
      cleanup();
    });
  }
});

it('Account menu Sign Out calls the real handler', async () => {
  renderNow(<AppLayout>Page</AppLayout>);
  // Open account menu dropdown
  fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  // Find and click Sign Out button in the dropdown (should be the first one now that dropdown is open)
  const signOutButtons = screen.getAllByRole('button', { name: /Sign Out/i });
  fireEvent.click(signOutButtons[0]);
  expect(signOutMock).toHaveBeenCalledOnce();
});

it('phone drawer keeps sign out pinned at bottom outside scrolling nav', () => {
  const { container } = renderNow(<AppLayout>Page</AppLayout>);
  fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
  // Sign Out should be visible in drawer
  const signOutButton = screen.getByText('Sign Out');
  expect(signOutButton).toBeTruthy();
  // Check it's inside the fixed drawer (which has the shrink-0 class for the bottom section)
  const bottomSection = container.querySelector('[class*="shrink-0"][class*="border-t"]');
  expect(bottomSection?.textContent).toContain('Sign Out');
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
it('HierarchyView shows skeleton loading then content after fetch', async () => {
  const hierarchyData = {data:{regions:[{id:'r1',code:'WEST',name:'West Region',lifecycle:'active'}],districts:[]}};
  let fetchCount = 0;
  vi.mocked(fetch).mockImplementation(async () => {
    fetchCount++;
    return new Response(JSON.stringify(hierarchyData),{status:200,headers:{'Content-Type':'application/json'}});
  });
  const { container } = renderNow(<HierarchyView />);
  expect(screen.getByLabelText('Loading hierarchy')).toBeTruthy();
  expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
  await waitFor(() => expect(screen.queryByLabelText('Loading hierarchy')).toBeNull(), { timeout: 2000 });
  expect(screen.getByText('West Region')).toBeTruthy();
  expect(fetchCount).toBeGreaterThan(0);
});

beforeEach(() => {
  cleanup();
  authMock.role = 'Admin';
  signOutMock.mockClear();
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    let body: unknown = { data: [] };
    if (String(url).includes('stale-stores')) body = { staleStores: [], districts: [], thresholdDays: 90, totalCount: 0 };
    return new Response(JSON.stringify(body), {status:200,headers:{'Content-Type':'application/json'}});
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
