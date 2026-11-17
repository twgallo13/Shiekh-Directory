// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LocationDetailView } from '../src/components/LocationDetailView';
import { HierarchyView } from '../src/components/HierarchyView';
import { CloseStoreDialog } from '../src/components/CloseStoreDialog';

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

const authMock = {
  uid: 'test-uid',
  email: 'admin@test.com',
  role: 'Admin' as string,
  displayName: 'Test Admin',
};

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    authUser: authMock,
    user: { email: authMock.email },
    isStoreSession: false,
    storeSession: null,
    signOut: vi.fn(),
    getIdToken: async () => 'test-token',
  }),
}));

vi.mock('../src/lib/api', () => ({
  apiGet: (...args: unknown[]) => api.apiGet(...args),
  apiPost: (...args: unknown[]) => api.apiPost(...args),
  setAuthGetter: () => {},
}));

function locationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loc-1',
    storeNumber: '1234',
    name: 'Test Store',
    lifecycle: 'active',
    updatedAt: '2026-03-04T15:00:00.000Z',
    updatedBy: 'test-uid',
    address: { street: '1 Main', city: 'LA', state: 'CA', zip: '90001' },
    addressFormatted: '1 Main, LA, CA 90001',
    phoneFormatted: '(213) 555-0100',
    mainPhone: '+12135550100',
    timeZone: 'America/Los_Angeles',
    mapsUrl: 'https://maps.example/store',
    regionName: 'West',
    districtName: 'District 1',
    districtId: 'dist-1',
    statusNow: { state: 'Open', reason: 'Open now', localDate: '2026-03-04' },
    todaySchedule: { dayName: 'Wednesday', hours: null },
    weekSchedule: [],
    hoursExceptions: [],
    activeClosure: null,
    activeNotices: [],
    leadership: {
      smStatus: 'vacant',
      hasPrimarySm: false,
      smCoverage: [],
      dmStatus: 'vacant',
      rmStatus: 'vacant',
      asmStatus: 'vacant',
      khStatus: 'vacant',
      asm: [],
      kh: [],
    },
    ...overrides,
  };
}

const activePeople = [
  { personName: 'John Smith', role: 'SM', isActive: true, endDate: null },
  { personName: 'Former Lead', role: 'ASM', isActive: false, endDate: '2026-01-01' },
];

function mockLocationApis(location = locationFixture(), assignments: unknown[] | 'error' | 'hang' = activePeople) {
  let releaseHang: (value: unknown) => void = () => {};
  api.apiGet.mockImplementation(async (url: string) => {
    if (url === `/api/app/locations/${location.id}`) {
      return { ok: true, status: 200, json: async () => ({ data: location }) };
    }
    if (url === `/api/app/assignments/location/${location.id}`) {
      if (assignments === 'error') {
        return { ok: false, status: 404, json: async () => ({ error: { code: 'not_found' } }) };
      }
      if (assignments === 'hang') {
        return new Promise((resolve) => {
          releaseHang = resolve;
        });
      }
      return { ok: true, status: 200, json: async () => ({ data: assignments }) };
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  });
  api.apiPost.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { success: true } }) });
  return {
    releaseHang: (value: unknown) => releaseHang(value),
  };
}

function renderStore(id = 'loc-1') {
  return render(
    <MemoryRouter initialEntries={[`/location/${id}`]}>
      <Routes>
        <Route path="/location/:id" element={<LocationDetailView />} />
      </Routes>
    </MemoryRouter>
  );
}

async function openCloseDialog() {
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Close store permanently/i })).toBeTruthy();
  });
  fireEvent.click(screen.getByRole('button', { name: /Close store permanently/i }));
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
}

beforeEach(() => {
  authMock.role = 'Admin';
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ data: [] }) })));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CloseStoreDialog', () => {
  it('loads staff from the real assignments route and lists only active people', async () => {
    mockLocationApis();
    render(
      <MemoryRouter>
        <CloseStoreDialog
          isOpen
          onClose={() => {}}
          locationId="loc-1"
          storeNumber="1234"
          storeName="Test Store"
          isAdmin
          onClosed={() => {}}
        />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.apiGet).toHaveBeenCalledWith('/api/app/assignments/location/loc-1');
    });
    expect(await screen.findByText(/John Smith/)).toBeTruthy();
    expect(screen.getByText(/1 person will be taken off/)).toBeTruthy();
    expect(screen.queryByText(/Former Lead/)).toBeNull();
    expect(screen.getByText(/removed from the directory, search, exports and the consumer API/)).toBeTruthy();
    expect(screen.getByText(/Open checks, temporary closures and DM tasks/)).toBeTruthy();
  });
});

describe('LocationDetailView close and restore', () => {
  it('shows the loading state and keeps the close button off', async () => {
    const pending = mockLocationApis(locationFixture(), 'hang');
    renderStore();
    await openCloseDialog();
    expect(screen.getByText(/Checking who's assigned/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Close store #1234/i }) as HTMLButtonElement).disabled).toBe(true);
    pending.releaseHang({ ok: true, status: 200, json: async () => ({ data: [] }) });
    await waitFor(() => {
      expect(screen.queryByText(/Checking who's assigned/)).toBeNull();
    });
  });

  it('lists active people from the assignments route', async () => {
    mockLocationApis();
    renderStore();
    await openCloseDialog();
    await waitFor(() => {
      expect(api.apiGet).toHaveBeenCalledWith('/api/app/assignments/location/loc-1');
    });
    expect(screen.getByText(/John Smith/)).toBeTruthy();
    expect(screen.queryByText(/Former Lead/)).toBeNull();
    expect(screen.getByText(/1 person will be taken off/)).toBeTruthy();
  });

  it('shows the empty state when nobody is active', async () => {
    mockLocationApis(locationFixture(), []);
    renderStore();
    await openCloseDialog();
    expect(await screen.findByText(/No one is assigned to this store/)).toBeTruthy();
  });

  it('shows a load error instead of the empty state when the assignments fetch fails', async () => {
    mockLocationApis(locationFixture(), 'error');
    renderStore();
    await openCloseDialog();
    expect(await screen.findByText(/Couldn't load who's assigned/)).toBeTruthy();
    expect(screen.queryByText(/No one is assigned to this store/)).toBeNull();
    fireEvent.change(screen.getByPlaceholderText('1234'), { target: { value: '1234' } });
    expect((screen.getByRole('button', { name: /Close store #1234/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the close button only when the typed number matches, including trimmed spaces', async () => {
    mockLocationApis(locationFixture(), []);
    renderStore();
    await openCloseDialog();
    await screen.findByText(/No one is assigned to this store/);
    const button = screen.getByRole('button', { name: /Close store #1234/i }) as HTMLButtonElement;
    const input = screen.getByPlaceholderText('1234');
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: '123' } });
    expect(button.disabled).toBe(true);
    fireEvent.change(input, { target: { value: ' 1234 ' } });
    expect(button.disabled).toBe(false);
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });

  it('shows Steward wording', async () => {
    authMock.role = 'Steward';
    mockLocationApis(locationFixture(), []);
    renderStore();
    await openCloseDialog();
    expect(await screen.findByText(/Only an Admin can undo this/)).toBeTruthy();
    expect(screen.queryByText(/You can restore it later from the Directory/)).toBeNull();
  });

  it('shows Admin wording', async () => {
    mockLocationApis(locationFixture(), []);
    renderStore();
    await openCloseDialog();
    expect(await screen.findByText(/You can restore it later from the Directory/)).toBeTruthy();
  });

  it('shows an inline close error', async () => {
    mockLocationApis(locationFixture(), []);
    api.apiPost.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: 'retire_error' } }),
    });
    renderStore();
    await openCloseDialog();
    await screen.findByText(/No one is assigned to this store/);
    fireEvent.change(screen.getByPlaceholderText('1234'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /Close store #1234/i }));
    expect(await screen.findByText(/Couldn't close the store. Nothing was changed. Try again./)).toBeTruthy();
  });

  it('shows inline restore errors for each conflict code', async () => {
    const retired = locationFixture({ id: 'loc-retired', lifecycle: 'retired' });
    mockLocationApis(retired, []);
    const cases = [
      ['duplicate_store_number', /Store #1234 is already used by an open store/],
      ['district_retired', /set the district up again in Hierarchy/],
      ['region_retired', /set the region up again in Hierarchy/],
    ] as const;

    for (const [code, pattern] of cases) {
      cleanup();
      api.apiPost.mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: { code } }),
      });
      renderStore('loc-retired');
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^Restore store$/i })).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /^Restore store$/i }));
      const dialog = await screen.findByRole('dialog');
      fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Restore store')!);
      expect(await screen.findByText(pattern)).toBeTruthy();
    }
  });

  it('shows Restore only for Admin', async () => {
    mockLocationApis(locationFixture({ lifecycle: 'retired' }), []);
    renderStore();
    expect(await screen.findByRole('button', { name: /^Restore store$/i })).toBeTruthy();
    cleanup();
    authMock.role = 'Steward';
    mockLocationApis(locationFixture({ lifecycle: 'retired' }), []);
    renderStore();
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Restore store$/i })).toBeNull();
  });

  it('shows the permanently closed banner and drops the old retired line', async () => {
    mockLocationApis(locationFixture({
      lifecycle: 'retired',
      statusNow: { state: 'Closed', reason: 'Location retired', localDate: '2026-03-04' },
    }), []);
    renderStore();
    const banner = await screen.findByRole('status');
    const expectedDate = new Date('2026-03-04T15:00:00.000Z').toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    expect(banner.textContent).toContain(`Permanently closed on ${expectedDate} by Test Admin`);
    expect(screen.queryByText('Location retired')).toBeNull();
  });
});

describe('HierarchyView close dialog', () => {
  it('uses the same close dialog and the real assignments route', async () => {
    mockLocationApis();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/app/hierarchy/tree')) {
        return {
          ok: true,
          json: async () => ({
            data: {
              regions: [{ id: 'reg-1', code: 'WEST', name: 'West Region' }],
              districts: [{ id: 'dist-1', code: 'D1', name: 'District 1', regionId: 'reg-1' }],
              locations: [{
                id: 'loc-1',
                storeNumber: '5678',
                name: 'Hierarchy Test Store',
                kind: 'store',
                districtId: 'dist-1',
                regionId: 'reg-1',
              }],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ data: [] }) };
    }));

    render(
      <MemoryRouter>
        <HierarchyView />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /Expand West Region/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Expand District 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Close store permanently/ }));

    expect(await screen.findByText(/Close #5678 Hierarchy Test Store permanently/)).toBeTruthy();
    await waitFor(() => {
      expect(api.apiGet).toHaveBeenCalledWith('/api/app/assignments/location/loc-1');
    });
    expect(screen.getByText(/John Smith/)).toBeTruthy();
  });
});
