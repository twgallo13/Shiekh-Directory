// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminView } from '../src/components/AdminView';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    authUser: { uid: 'admin', email: 'admin@test.com', role: 'Admin', displayName: 'Admin' },
    user: { email: 'admin@test.com' },
    isStoreSession: false,
    storeSession: null,
    signOut: vi.fn(),
    getIdToken: async () => 'test-token',
  }),
}));

const client = {
  id: 'api-public',
  name: 'Public profile',
  scopes: ['public-profile:read'],
  active: true,
  version: 1,
  createdAt: '2026-11-21T00:00:00.000Z',
  rateLimit: 120,
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

describe('rate limit dialog', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the server error and stays open when the save is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rate-limit')) {
        return jsonResponse({
          error: { code: 'rate_limit_required', message: 'An explicit rateLimit from 1 to 10000 is required.' },
        }, 400);
      }
      if (url.includes('/api/app/api-clients')) {
        return jsonResponse({ clients: [client] });
      }
      return jsonResponse({ users: [], stores: [] });
    }));

    render(<MemoryRouter><AdminView /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: 'API clients' }));
    fireEvent.click(await screen.findByRole('button', { name: '120/min' }));
    expect(screen.getByRole('dialog', { name: 'Edit Rate Limit' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('An explicit rateLimit from 1 to 10000 is required.');
    expect(screen.getByRole('dialog', { name: 'Edit Rate Limit' })).toBeTruthy();
  });
});
