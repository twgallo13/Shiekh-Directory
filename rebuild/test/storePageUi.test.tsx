// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AuthUser } from '../src/types';
import { LocationDetailView } from '../src/components/LocationDetailView';
import { StorePageCard } from '../src/components/StorePageCard';
import { StorePageDefaultsTab } from '../src/components/StorePageDefaultsTab';
import { DEFAULT_STORE_PAGE_TILES } from '../src/constants/storePage';

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiFetch: vi.fn(),
}));

const authMock: AuthUser = {
  uid: 'test-uid',
  email: 'admin@test.com',
  role: 'Admin',
  displayName: 'Test Admin',
  storeLocationId: 'other-store',
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
  apiPatch: (...args: unknown[]) => api.apiPatch(...args),
  apiFetch: (...args: unknown[]) => api.apiFetch(...args),
  setAuthGetter: () => {},
}));

function locationFixture() {
  return {
    id: 'loc-1',
    storeNumber: '48',
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
  };
}

function pageFixture(pageEnabled = false) {
  return {
    reviewUrl: null,
    magentoStoreId: '4207',
    shopTileVisible: true,
    pageEnabled,
    version: 2,
    updatedAt: '2026-11-21T16:00:00.000Z',
    pageUrl: 'https://qr.shiekh.store/s/48',
    storeNumber: '48',
    pendingRequest: null,
    tiles: [
      { key: 'review', label: 'Review', locked: false, visible: true, note: null, order: 1 },
      { key: 'instagram', label: 'Instagram', locked: true, visible: true, note: 'Set by Shiekh', order: 7 },
    ],
    defaultImage: { source: 'dynamic-qr', label: 'Company default image · Set by Shiekh' },
  };
}

function mockLocationApis() {
  const location = locationFixture();
  api.apiGet.mockImplementation(async (url: string) => {
    if (url === `/api/app/locations/${location.id}`) {
      return { ok: true, status: 200, json: async () => ({ data: location }) };
    }
    if (url === `/api/app/store-pages/${location.id}`) {
      return { ok: true, status: 200, json: async () => ({ data: pageFixture() }) };
    }
    return { ok: false, status: 404, json: async () => ({ error: { code: 'not_found' } }) };
  });
}

function renderStore() {
  return render(
    <MemoryRouter initialEntries={['/location/loc-1']}>
      <Routes>
        <Route path="/location/:id" element={<LocationDetailView />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authMock.role = 'Admin';
  authMock.storeLocationId = 'other-store';
  api.apiPost.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: { success: true } }) });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('store page screens', () => {
  it('hides the card for a Viewer and for a Store login on another store', async () => {
    mockLocationApis();
    authMock.role = 'Viewer';
    renderStore();
    expect((await screen.findAllByText('#48 Test Store')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Store page' })).toBeNull();

    cleanup();
    authMock.role = 'Store';
    authMock.storeLocationId = 'other-store';
    renderStore();
    expect(await screen.findByText('You can only report a problem for your own store.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Store page' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Report a Problem' })).toBeNull();
    expect(screen.queryByText('See something wrong?')).toBeNull();
  });

  it('shows the lock and confirms on/off once for an Admin', async () => {
    api.apiGet.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: pageFixture(false) }) });
    const admin: AuthUser = { uid: 'admin', email: 'admin@test.com', role: 'Admin', displayName: 'Admin' };
    render(
      <MemoryRouter>
        <StorePageCard locationId="loc-1" storeNumber="48" lifecycle="active" authUser={admin} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Set by Shiekh')).toBeTruthy();
    expect(screen.getByText('Company default image · Set by Shiekh')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch'));
    expect(api.apiPost).not.toHaveBeenCalled();
    expect(screen.getByText('Turn on the store page for #48? Customers who scan the code will see it within 15 minutes.')).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Yes, turn it on' }));
    await waitFor(() => {
      expect(api.apiPost).toHaveBeenCalledTimes(1);
    });
    expect(api.apiPost).toHaveBeenCalledWith('/api/app/store-pages/loc-1/visibility', {
      enabled: true,
      expectedVersion: 2,
    });
  });

  it('does not offer on/off to a Steward', async () => {
    api.apiGet.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: pageFixture(true) }) });
    const steward: AuthUser = { uid: 'steward', email: 'steward@test.com', role: 'Steward', displayName: 'Steward' };
    render(
      <MemoryRouter>
        <StorePageCard locationId="loc-1" storeNumber="48" lifecycle="active" authUser={steward} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Live')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByText(/Theo adds IDs Monday/)).toBeTruthy();
  });

  it('Admin tab has no add-tile control', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          version: 1,
          updatedAt: null,
          tiles: DEFAULT_STORE_PAGE_TILES,
          defaultImage: { source: 'dynamic-qr', label: 'Company default image · Set by Shiekh' },
        },
      }),
    })));
    render(<StorePageDefaultsTab getIdToken={async () => 'token'} />);
    expect(await screen.findByRole('heading', { name: 'Store page defaults' })).toBeTruthy();
    expect(screen.getAllByText('Fixed tile').length).toBe(6);
    expect(screen.queryByRole('button', { name: /add tile/i })).toBeNull();
    expect(screen.queryByText(/add tile/i)).toBeNull();
    expect(screen.getByText('Hosted by Dynamic QR. This directory does not store an image URL.')).toBeTruthy();
  });
});
