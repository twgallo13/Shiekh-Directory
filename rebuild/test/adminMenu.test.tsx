// @vitest-environment jsdom
/**
 * Admin menu redesign (plan round 2, tests T1-T21, T26 + structural parts of T22-T25).
 * Browser-only layout checks (real widths, no sideways scroll, sticky offset, axe)
 * run separately against a local harness; see the PR description.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppRoutes } from '../src/App';
import { ADMIN_SECTIONS, ADMIN_GROUPS, isAdminPath } from '../src/components/admin/adminSections';
import { UNSAVED_CHANGES_MESSAGE } from '../src/components/admin/AdminUnsavedChanges';

const auth = vi.hoisted(() => ({
  role: 'Admin' as string,
  // Stable function identities, like the real AuthContext, so section effects don't refetch on every render.
  getIdToken: async () => 'test-token',
  signOut: async () => {},
  refreshAuthUser: async () => {},
  getStoreSessionHeader: () => null,
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    authUser: { uid: 'test-uid', email: 'qa@test.invalid', role: auth.role, displayName: `Test ${auth.role}` },
    user: { uid: 'test-uid', email: 'qa@test.invalid' },
    authError: null,
    loading: false,
    isStoreSession: false,
    storeSession: null,
    signOut: auth.signOut,
    getIdToken: auth.getIdToken,
    getStoreSessionHeader: auth.getStoreSessionHeader,
    refreshAuthUser: auth.refreshAuthUser,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The home page isn't under test; a light stand-in keeps redirects to "/" fast.
vi.mock('../src/components/DirectoryView', () => ({ DirectoryView: () => <div>Directory home (test stand-in)</div> }));

// ---------- viewport (matchMedia) ----------
let width = 1280;
const mqListeners = new Set<() => void>();
function installMatchMedia() {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() { return width >= min; },
      media: query,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => mqListeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => mqListeners.delete(cb),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as unknown as typeof window.matchMedia;
}
function setWidth(w: number) {
  width = w;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  act(() => { mqListeners.forEach((cb) => cb()); });
}

// ---------- fetch fixtures (test data only; no network) ----------
const EMAIL_SETTINGS = {
  masterEnabled: false, effectiveEnabled: false, envCutoverEnabled: false,
  emailTypes: [{ id: 'verification_request', name: 'Verification request', description: 'Asks a store to confirm hours', audience: 'store', placeholders: ['storeName'] }],
  typeSettings: {},
  defaultTemplates: { verification_request: { subject: 'Please confirm', bodyHtml: '<p>Hi</p>', bodyText: 'Hi' } },
  stats: { last7Days: { sent: 0, logged: 0, failed: 0 }, pendingRecipients: { verifications: 0, invitations: 0 } },
  sender: { fromName: 'Test', fromAddress: 'noreply@test.invalid', replyTo: '', footerText: '' },
  schedule: { quietHoursStart: '20:00', quietHoursEnd: '08:00', sendDays: ['monday'] },
  appBaseUrl: 'https://example.test',
  smtp: { configured: false },
};
const tile = (label: string) => ({ label, url: null, show: false });
const STORE_PAGE_DEFAULTS = {
  version: 1, updatedAt: null, findStoreUrl: null, defaultStoreImageUrl: null,
  defaultImage: { source: 'none', label: 'None' },
  tiles: {
    app: { label: 'App', iosUrl: null, androidUrl: null, show: false },
    rewards: tile('Rewards'), instagram: tile('Instagram'), launch: tile('Launch'), card: tile('Card'), returns: tile('Returns'),
  },
};
const RULES = {
  verificationCycleDays: 30, requestExpiryDays: 7, reminderLeadDays: [3, 1], maxReminders: 3, minReminderGapHours: 24,
  dmEscalationDays: 3, dmExpiryDays: 7, invitationExpiryDays: 7, storeOneClickLinkDays: 7, signInLinkHours: 1,
  storeSessionHours: 12, correctionExpiryDays: 14, hoursWrongDmTaskEnabled: true, hoursWrongDmTaskDueDays: 2,
  storeHoursNeedApproval: false, reminderSendTime: '09:00', dmEscalationEnabled: true,
};
const RANGES = Object.fromEntries(Object.entries(RULES).map(([k, v]) => [k,
  Array.isArray(v) ? { type: 'array', min: 0, max: 30 } : typeof v === 'boolean' ? { type: 'boolean' } : typeof v === 'string' ? { type: 'time' } : { type: 'number', min: 0, max: 365 }]));

const fetchLog: string[] = [];
function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}
function installFetch() {
  fetchLog.length = 0;
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    fetchLog.push(`${init?.method || 'GET'} ${url}`);
    if (url.startsWith('/api/app/email-settings/schedule')) return json({ data: {} });
    if (url.startsWith('/api/app/email-settings/outbox')) return json({ data: [] });
    if (url.startsWith('/api/app/email-settings')) return json({ data: EMAIL_SETTINGS });
    if (url.startsWith('/api/app/admin/store-page-defaults')) return json({ data: STORE_PAGE_DEFAULTS });
    if (url.startsWith('/api/app/workflow-rules/history')) return json({ data: [] });
    if (url.startsWith('/api/app/workflow-rules')) return json({ data: RULES, defaults: RULES, ranges: RANGES });
    if (url.startsWith('/api/app/hours-templates')) return json({ data: [] });
    return json({ data: [], users: [], clients: [], fields: [], stores: [], items: [], entries: [], snapshots: [], invitations: [] });
  }));
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}
function path() {
  return screen.getByTestId('location').textContent;
}
function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppRoutes />
      <LocationProbe />
    </MemoryRouter>,
  );
}
function sidebar() {
  return document.querySelector('[data-admin-nav="sidebar"]') as HTMLElement | null;
}
function list() {
  return document.querySelector('[data-admin-nav="list"]') as HTMLElement | null;
}
function navLinks(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-section-id]'));
}

const EXPECTED_IDS = [
  'data-quality', 'hours-templates', 'store-page-defaults', 'workflow-rules',
  'email',
  'users', 'communications', 'api-clients',
  'custom-fields', 'import', 'backups', 'audit-log',
];
const OLD_TAB_IDS = ['users', 'api-clients', 'custom-fields', 'import', 'communications', 'email', 'workflow-rules', 'audit-log', 'hours-templates', 'backups', 'data-quality', 'store-page-defaults'];

beforeEach(() => {
  auth.role = 'Admin';
  width = 1280;
  mqListeners.clear();
  installMatchMedia();
  installFetch();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Admin menu: access is unchanged (T1-T3)', () => {
  it('T1 Admin sees exactly the same 12 sections as before, in the round-2 groups and order', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    const ids = navLinks(sidebar()!).map((a) => a.dataset.sectionId);
    expect(ids).toEqual(EXPECTED_IDS);
    expect([...ids].sort()).toEqual([...OLD_TAB_IDS].sort());
    const groups = Array.from(sidebar()!.querySelectorAll('[role="group"]')).map((g) => ({
      label: g.querySelector('p')!.textContent,
      items: Array.from(g.querySelectorAll('a')).map((a) => a.textContent),
    }));
    expect(groups).toEqual([
      { label: 'Stores', items: ['Data quality', 'Hours templates', 'Store landing page defaults', 'Workflow rules'] },
      { label: 'Email', items: ['Email setup'] },
      { label: 'People & access', items: ['Users', 'Invitations', 'API clients'] },
      { label: 'Data & system', items: ['Custom fields', 'Import', 'Backups', 'Change history'] },
    ]);
  });

  for (const role of ['Steward', 'Leader', 'Store', 'Viewer']) {
    it(`T2 ${role}: no Admin link, and /admin plus every /admin/<id> shows Access Denied with no admin calls`, async () => {
      auth.role = role;
      for (const p of ['/admin', ...EXPECTED_IDS.map((id) => `/admin/${id}`)]) {
        fetchLog.length = 0;
        const { unmount } = renderApp(p);
        expect(await screen.findByText("You don't have access")).toBeTruthy();
        expect(path()).toBe(p);
        expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
        expect(screen.queryAllByRole('button', { name: 'Admin' })).toHaveLength(0);
        expect(document.querySelector('[data-admin-nav]')).toBeNull();
        expect(document.querySelector('[data-admin-section]')).toBeNull();
        expect(fetchLog.filter((u) => /\/api\/app\/(admin|api-clients|email-settings|workflow-rules|hours-templates|backups|audit)/.test(u))).toEqual([]);
        unmount();
      }
    });
  }

  it('T3 server and Firestore rules are untouched by this change (admin router still Admin-only)', () => {
    const adminRouter = readFileSync(resolve(__dirname, '../server/routes/admin.ts'), 'utf8');
    expect(adminRouter).toContain("authUser.role !== 'Admin'");
    expect(adminRouter).toContain("code: 'access_denied'");
    const view = readFileSync(resolve(__dirname, '../src/components/AdminView.tsx'), 'utf8');
    expect(view).toContain("if (authUser?.role !== 'Admin') {");
    const layout = readFileSync(resolve(__dirname, '../src/components/AppLayout.tsx'), 'utf8');
    expect(layout).toContain("const isAdmin = authUser?.role === 'Admin';");
    expect((layout.match(/\{isAdmin && \(/g) || []).length).toBe(2);
  });
});

describe('Admin menu: grouping and labels (T4-T7)', () => {
  it('T4 Invitations (id communications) sits in People & access right after Users; no "Send" item', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    const people = within(sidebar()!).getByRole('group', { name: 'People & access' });
    const items = Array.from(people.querySelectorAll('a')).map((a) => [a.dataset.sectionId, a.textContent]);
    expect(items[0]).toEqual(['users', 'Users']);
    expect(items[1]).toEqual(['communications', 'Invitations']);
    const labels = navLinks(sidebar()!).map((a) => a.textContent);
    expect(labels).not.toContain('Send');
    expect(labels).not.toContain('Send an email');
  });

  it('T5 Workflow rules is the 4th item under Stores; no Workflows group; Email has only Email setup', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    const stores = within(sidebar()!).getByRole('group', { name: 'Stores' });
    expect(Array.from(stores.querySelectorAll('a'))[3].dataset.sectionId).toBe('workflow-rules');
    expect(within(sidebar()!).queryByRole('group', { name: /workflows/i })).toBeNull();
    const email = within(sidebar()!).getByRole('group', { name: 'Email' });
    expect(Array.from(email.querySelectorAll('a')).map((a) => a.textContent)).toEqual(['Email setup']);
  });

  it('T6 /admin/audit-log shows "Change history" as heading and in the document title; no "Audit Log" text', async () => {
    renderApp('/admin/audit-log');
    await waitFor(() => expect(document.querySelector('[data-admin-section="audit-log"] h2')?.textContent).toBe('Change history'));
    expect(document.title).toBe('Change history - Admin · Shiekh Directory');
    expect(document.body.textContent).not.toMatch(/Audit Log/);
  });

  it('T7 no old people-facing words remain in any of the 12 sections', async () => {
    const banned = /Audit Log|User Invitations|Email Sending Settings|Workflow Rules|Hours Templates/;
    for (const id of EXPECTED_IDS) {
      const { unmount } = renderApp(`/admin/${id}`);
      await waitFor(() => expect(document.querySelector(`[data-admin-section="${id}"]`)).toBeTruthy());
      // let async section bodies load
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      expect({ id, text: document.body.textContent?.match(banned)?.[0] ?? null }).toEqual({ id, text: null });
      unmount();
    }
  }, 30000);
});

describe('Admin menu: URLs and default section (T8-T13)', () => {
  for (const w of [1280, 1024]) {
    it(`T8 at ${w}px /admin replaces to /admin/users and highlights Users`, async () => {
      width = w;
      renderApp('/admin');
      await waitFor(() => expect(path()).toBe('/admin/users'));
      await waitFor(() => expect(sidebar()).toBeTruthy());
      const active = sidebar()!.querySelectorAll('[aria-current="page"]');
      expect(active).toHaveLength(1);
      expect((active[0] as HTMLElement).dataset.sectionId).toBe('users');
    });
  }

  it('T8 the /admin redirect replaces history (Back does not loop back to /admin)', async () => {
    width = 1280;
    let goBack: (() => void) | null = null;
    function BackHandle() {
      const navigate = useNavigate();
      goBack = () => navigate(-1);
      return null;
    }
    render(
      <MemoryRouter initialEntries={['/people', '/admin']} initialIndex={1}>
        <AppRoutes />
        <LocationProbe />
        <BackHandle />
      </MemoryRouter>,
    );
    await waitFor(() => expect(path()).toBe('/admin/users'));
    act(() => goBack!());
    await waitFor(() => expect(path()).toBe('/people'));
  });

  for (const w of [390, 768, 1023]) {
    it(`T9 at ${w}px /admin shows the grouped section list with nothing open`, async () => {
      width = w;
      renderApp('/admin');
      await waitFor(() => expect(list()).toBeTruthy());
      expect(path()).toBe('/admin');
      expect(sidebar()).toBeNull();
      expect(document.querySelector('[data-admin-section]')).toBeNull();
      expect(navLinks(list()!).map((a) => a.dataset.sectionId)).toEqual(EXPECTED_IDS);
      expect(list()!.querySelectorAll('[aria-current="page"]')).toHaveLength(0);
    });
  }

  it('T10 at 390px opening /admin/users directly shows Users with the back button, not the list', async () => {
    width = 390;
    renderApp('/admin/users');
    await waitFor(() => expect(document.querySelector('[data-admin-section="users"]')).toBeTruthy());
    expect(list()).toBeNull();
    expect(screen.getByRole('link', { name: 'Admin', current: false })).toBeTruthy();
    expect(document.querySelector('[data-admin-back]')).toBeTruthy();
  });

  it('T11 resizing from 1280 to 390 on /admin/users keeps the URL and the section', async () => {
    width = 1280;
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    setWidth(390);
    await waitFor(() => expect(document.querySelector('[data-admin-back]')).toBeTruthy());
    expect(path()).toBe('/admin/users');
    expect(list()).toBeNull();
    expect(document.querySelector('[data-admin-section="users"]')).toBeTruthy();
  });

  it('T12 /admin/backups direct load opens Backups highlighted; clicking another section changes the URL', async () => {
    renderApp('/admin/backups');
    await waitFor(() => expect(document.querySelector('[data-admin-section="backups"]')).toBeTruthy());
    const current = sidebar()!.querySelector('[aria-current="page"]') as HTMLElement;
    expect(current.dataset.sectionId).toBe('backups');
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Import' }));
    await waitFor(() => expect(path()).toBe('/admin/import'));
    expect((sidebar()!.querySelector('[aria-current="page"]') as HTMLElement).dataset.sectionId).toBe('import');
  });

  it('T12 the app has a real /admin/:section route (deep link survives a reload)', async () => {
    const app = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
    expect(app).toMatch(/path="\/admin\/:section"/);
  });

  it('T13 /admin/nonsense goes to /admin (then wide screens open Users)', async () => {
    width = 390;
    const { unmount } = renderApp('/admin/nonsense');
    await waitFor(() => expect(path()).toBe('/admin'));
    expect(list()).toBeTruthy();
    unmount();
    width = 1280;
    renderApp('/admin/nonsense');
    await waitFor(() => expect(path()).toBe('/admin/users'));
  });
});

describe('Admin menu: top bar active state (T14-T15)', () => {
  for (const p of ['/admin/users', '/admin/audit-log']) {
    it(`T14 top bar and phone menu mark Admin current on ${p}`, async () => {
      renderApp(p);
      await waitFor(() => expect(document.querySelector('[data-admin-section]')).toBeTruthy());
      const topBar = screen.getAllByRole('button', { name: 'Admin' });
      expect(topBar.some((b) => b.getAttribute('aria-current') === 'page')).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
      const panel = screen.getByRole('dialog', { name: 'Navigation menu' });
      expect(within(panel).getByRole('button', { name: 'Admin' }).getAttribute('aria-current')).toBe('page');
    });
  }

  it('T14 /admin (phone list) also marks Admin current', async () => {
    width = 390;
    renderApp('/admin');
    await waitFor(() => expect(list()).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const panel = screen.getByRole('dialog', { name: 'Navigation menu' });
    expect(within(panel).getByRole('button', { name: 'Admin' }).getAttribute('aria-current')).toBe('page');
  });

  it('T15 Admin is not current on other pages; matcher rejects look-alike paths', async () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/users')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isAdminPath('/admins')).toBe(false);
    expect(isAdminPath('/')).toBe(false);
    expect(isAdminPath('/people')).toBe(false);
    expect(isAdminPath('/location/x')).toBe(false);
    renderApp('/people');
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const admin = screen.getAllByRole('button', { name: 'Admin' });
    expect(admin.every((b) => b.getAttribute('aria-current') !== 'page')).toBe(true);
  });
});

describe('Admin menu: back button (T16)', () => {
  it('T16 below 1024px: left arrow + "Admin", 44px+, goes to /admin; hidden at 1024px+', async () => {
    width = 390;
    renderApp('/admin/backups');
    await waitFor(() => expect(document.querySelector('[data-admin-back]')).toBeTruthy());
    const back = document.querySelector('[data-admin-back]') as HTMLAnchorElement;
    expect(back.textContent?.trim()).toBe('Admin');
    expect(back.getAttribute('href')).toBe('/admin');
    expect(back.querySelector('svg.lucide-arrow-left')).toBeTruthy();
    expect(back.className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(back);
    await waitFor(() => expect(path()).toBe('/admin'));
    expect(list()).toBeTruthy();
    cleanup();
    width = 1024;
    renderApp('/admin/backups');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    expect(document.querySelector('[data-admin-back]')).toBeNull();
  });
});

async function openEmailSchedule() {
  renderApp('/admin/email');
  fireEvent.click(await screen.findByRole('tab', { name: 'Schedule' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tue' }));
}

describe('Admin menu: unsaved changes (T17-T21)', () => {
  it('T17 Email setup: Stay keeps the edit and URL; Leave without saving goes to the chosen section', async () => {
    await openEmailSchedule();
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Change history' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(within(dialog).getByText(UNSAVED_CHANGES_MESSAGE)).toBeTruthy();
    expect(UNSAVED_CHANGES_MESSAGE).toBe('You have unsaved changes. Leave without saving, or stay and save.');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(path()).toBe('/admin/email');
    expect(screen.getByRole('button', { name: 'Tue' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Change history' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(path()).toBe('/admin/audit-log'));
  });

  it('T18 Store landing page defaults (sidebar at 1280) asks before leaving', async () => {
    renderApp('/admin/store-page-defaults');
    const input = await screen.findByLabelText('Find-a-store page URL');
    fireEvent.change(input, { target: { value: 'https://www.shiekh.com/stores' } });
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Users' }));
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
    expect(path()).toBe('/admin/store-page-defaults');
  });

  it('T18 Workflow rules template edit (back button at 390) asks before leaving', async () => {
    width = 390;
    renderApp('/admin/workflow-rules');
    fireEvent.click(await screen.findByRole('button', { name: 'Edit template for Verification request' }, { timeout: 3000 }));
    fireEvent.change(await screen.findByLabelText('Subject Line'), { target: { value: 'Changed' } });
    fireEvent.click(document.querySelector('[data-admin-back]')!);
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
    expect(path()).toBe('/admin/workflow-rules');
  });

  it('T18 Hours templates editor with changes asks before leaving', async () => {
    renderApp('/admin/hours-templates');
    fireEvent.click(await screen.findByRole('button', { name: /Create Template/ }));
    const nameInput = await screen.findByPlaceholderText('e.g., Standard Store Hours');
    fireEvent.change(nameInput, { target: { value: 'Holiday' } });
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Backups' }));
    expect(await screen.findByRole('dialog', { name: 'Unsaved changes' })).toBeTruthy();
  });

  it('T19 opening the Hours templates editor without typing does not warn', async () => {
    renderApp('/admin/hours-templates');
    fireEvent.click(await screen.findByRole('button', { name: /Create Template/ }));
    await screen.findByPlaceholderText('e.g., Standard Store Hours');
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Backups' }));
    await waitFor(() => expect(path()).toBe('/admin/backups'));
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
  });

  it('T19 no dialog when nothing changed', async () => {
    renderApp('/admin/email');
    await screen.findByRole('tab', { name: 'Schedule' });
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Backups' }));
    await waitFor(() => expect(path()).toBe('/admin/backups'));
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
  });

  it('T19 no dialog after a successful Save', async () => {
    await openEmailSchedule();
    fireEvent.click(screen.getByRole('button', { name: 'Save Schedule' }));
    await waitFor(() => expect(fetchLog).toContain('PUT /api/app/email-settings/schedule'));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Save Schedule' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Backups' }));
    await waitFor(() => expect(path()).toBe('/admin/backups'));
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
  });

  it('T20 Esc = Stay; dialog is labelled; Stay gets focus; focus returns to the clicked item', async () => {
    await openEmailSchedule();
    const link = within(sidebar()!).getByRole('link', { name: 'Backups' });
    link.focus();
    fireEvent.click(link);
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Stay' })));
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull();
    expect(path()).toBe('/admin/email');
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it('T21 beforeunload is registered only while dirty and removed after leaving', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    renderApp('/admin/email');
    fireEvent.click(await screen.findByRole('tab', { name: 'Schedule' }));
    expect(add.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tue' }));
    await waitFor(() => expect(add.mock.calls.filter(([t]) => t === 'beforeunload')).toHaveLength(1));
    const handler = add.mock.calls.find(([t]) => t === 'beforeunload')![1] as (e: Event) => void;
    const evt = new Event('beforeunload', { cancelable: true });
    handler(evt);
    expect(evt.defaultPrevented).toBe(true);
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Backups' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Unsaved changes' })).getByRole('button', { name: 'Leave without saving' }));
    await waitFor(() => expect(path()).toBe('/admin/backups'));
    expect(remove.mock.calls.some(([t, h]) => t === 'beforeunload' && h === handler)).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });
});

describe('Admin menu: layout structure (T22-T25, structural part)', () => {
  it('T23 sidebar items never wrap (nowrap + truncate, full name in title)', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    for (const a of navLinks(sidebar()!)) {
      expect(a.className).toContain('whitespace-nowrap');
      expect(a.getAttribute('title')).toBe(a.textContent);
      const label = a.querySelector('span')!;
      expect(label.className).toContain('truncate');
      expect(label.className).toContain('whitespace-nowrap');
    }
  });

  it('T24 768 and 1023 use the phone pattern, 1024 uses the sidebar', async () => {
    for (const [w, expectSidebar] of [[768, false], [1023, false], [1024, true]] as const) {
      width = w;
      const { unmount } = renderApp('/admin/users');
      await waitFor(() => expect(document.querySelector('[data-admin-section="users"]')).toBeTruthy());
      expect(!!sidebar()).toBe(expectSidebar);
      expect(!!document.querySelector('[data-admin-back]')).toBe(!expectSidebar);
      unmount();
    }
  });

  it('T25 the sticky sidebar uses the measured header height, not a fixed top-14', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    const aside = sidebar()!.closest('aside')!;
    expect(aside.className).toContain('sticky');
    expect(aside.className).not.toContain('top-14');
    expect(aside.getAttribute('style')).toContain('var(--app-chrome-height');
  });
});

describe('Admin menu: keyboard and screen reader (T26)', () => {
  it('T26 every item is a focusable link in order; group headings are not focusable; one aria-current', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    const nav = within(sidebar()!.closest('nav')!.parentElement!).getByRole('navigation', { name: 'Admin sections' });
    const links = navLinks(nav);
    expect(links).toHaveLength(12);
    for (const a of links) {
      expect(a.tagName).toBe('A');
      expect(a.getAttribute('href')).toBe(`/admin/${a.dataset.sectionId}`);
      expect(a.tabIndex).toBe(0);
    }
    expect(nav.querySelectorAll('[role="tab"]')).toHaveLength(0);
    for (const p of nav.querySelectorAll('[role="group"] > p')) {
      expect((p as HTMLElement).tabIndex).toBe(-1);
      expect(p.tagName).toBe('P');
    }
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('T26 opening a section moves focus to its heading and updates the title', async () => {
    renderApp('/admin/users');
    await waitFor(() => expect(sidebar()).toBeTruthy());
    fireEvent.click(within(sidebar()!).getByRole('link', { name: 'Backups' }));
    await waitFor(() => expect(path()).toBe('/admin/backups'));
    const heading = document.getElementById('admin-section-title')!;
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.textContent).toBe('Backups');
    expect(heading.tagName).toBe('H2');
    expect(document.title).toBe('Backups - Admin · Shiekh Directory');
  });
});

describe('Admin menu: section list sanity', () => {
  it('section and group lists are consistent', () => {
    expect(ADMIN_SECTIONS.map((s) => s.id)).toEqual(EXPECTED_IDS);
    expect(ADMIN_GROUPS.map((g) => g.label)).toEqual(['Stores', 'Email', 'People & access', 'Data & system']);
    for (const s of ADMIN_SECTIONS) expect(ADMIN_GROUPS.some((g) => g.id === s.group)).toBe(true);
  });
});
