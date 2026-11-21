// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DirectoryView } from '../src/components/DirectoryView';
import { ProtectedRoute, StoreLocationRoute } from '../src/App';

const authState = vi.hoisted(() => ({
  user: null as null | { email: string },
  authUser: null as null | { uid: string; email: string; displayName: string; role: 'Viewer' },
  loading: false,
  isStoreSession: false,
  storeSession: null as null | { locationId: string },
  authError: null as null | { code: string; message: string },
  signOut: async () => {},
  getIdToken: async () => 'token-1',
}));

vi.mock('../src/context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../src/context/AuthContext')>('../src/context/AuthContext');
  return {
    ...actual,
    useAuth: () => authState,
  };
});

afterEach(() => {
  cleanup();
  authState.user = null;
  authState.authUser = null;
  authState.loading = false;
  authState.isStoreSession = false;
  authState.storeSession = null;
  authState.authError = null;
  vi.unstubAllGlobals();
});

describe('route guards wait for the profile', () => {
  it('ProtectedRoute and StoreLocationRoute show the spinner until authUser arrives', () => {
    authState.user = { email: 'new@shiekhshoes.org' };

    const directory = render(
      <MemoryRouter>
        <ProtectedRoute>
          <div>directory-ready</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(directory.getByText('Loading...')).toBeTruthy();
    expect(directory.queryByText('directory-ready')).toBeNull();

    authState.authUser = {
      uid: 'new-user',
      email: 'new@shiekhshoes.org',
      displayName: 'New',
      role: 'Viewer',
    };
    directory.rerender(
      <MemoryRouter>
        <ProtectedRoute>
          <div>directory-ready</div>
        </ProtectedRoute>
      </MemoryRouter>,
    );
    expect(directory.getByText('directory-ready')).toBeTruthy();
    directory.unmount();

    authState.authUser = null;
    const location = render(
      <MemoryRouter initialEntries={['/location/loc-1']}>
        <Routes>
          <Route
            path="/location/:id"
            element={
              <StoreLocationRoute>
                <div>location-ready</div>
              </StoreLocationRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(location.getByText('Loading...')).toBeTruthy();
    expect(location.queryByText('location-ready')).toBeNull();

    authState.authUser = {
      uid: 'new-user',
      email: 'new@shiekhshoes.org',
      displayName: 'New',
      role: 'Viewer',
    };
    location.rerender(
      <MemoryRouter initialEntries={['/location/loc-1']}>
        <Routes>
          <Route
            path="/location/:id"
            element={
              <StoreLocationRoute>
                <div>location-ready</div>
              </StoreLocationRoute>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(location.getByText('location-ready')).toBeTruthy();
  });
});

describe('profile errors', () => {
  it('explains account_disabled and not_registered instead of the generic error', async () => {
    const { describeProfileError } = await vi.importActual<typeof import('../src/context/AuthContext')>('../src/context/AuthContext');
    expect(describeProfileError(403, 'account_disabled')).toBe('Your account is disabled. Please contact an Admin.');
    expect(describeProfileError(403, 'not_registered')).toBe("Your account isn't registered. Please contact an Admin and ask them to add you.");
    expect(describeProfileError(500, 'http_500')).toMatch(/Something went wrong/);
  });
});

describe('DirectoryView waits for the profile', () => {
  it('does not fetch regions or districts until authUser is available, then fetches them', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ data: [] }),
      };
    }));

    const view = render(
      <MemoryRouter>
        <DirectoryView />
      </MemoryRouter>,
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls.filter((url) => url.includes('/api/app/regions') || url.includes('/api/app/districts') || url.includes('/api/app/locations'))).toEqual([]);

    authState.authUser = {
      uid: 'new-user',
      email: 'new@shiekhshoes.org',
      displayName: 'New',
      role: 'Viewer',
    };
    view.rerender(
      <MemoryRouter>
        <DirectoryView />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(calls.some((url) => url.includes('/api/app/regions'))).toBe(true);
      expect(calls.some((url) => url.includes('/api/app/districts'))).toBe(true);
      expect(calls.some((url) => url.includes('/api/app/locations'))).toBe(true);
    });
  });
});
