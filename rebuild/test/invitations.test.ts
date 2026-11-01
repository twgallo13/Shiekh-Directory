import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function checkServerAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

describe('Invitations API', async () => {
  let serverAvailable = false;

  before(async () => {
    serverAvailable = await checkServerAvailable();
    if (!serverAvailable) {
      console.log('[Invitations API] Server not available at', API_BASE, '- tests will be skipped');
      return;
    }
    await seedTestUsers();
  });

  async function fetchApi(path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${API_BASE}${path}`, {
      headers: {
        'Authorization': 'Bearer test-token-admin',
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });
  }

  describe('GET /api/app/invitations', () => {
    it('requires admin or steward role', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const res = await fetch(`${API_BASE}/api/app/invitations`, {
        headers: { 'Authorization': 'Bearer test-token-viewer' },
      });
      assert.strictEqual(res.status, 403, 'should return 403 for viewer');
    });

    it('returns list of invitations for admin', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const res = await fetchApi('/api/app/invitations');
      assert.strictEqual(res.status, 200);
      
      const body = await res.json();
      assert.ok(Array.isArray(body.invitations), 'should return invitations array');
    });
  });

  describe('POST /api/app/invitations', () => {
    it('requires email', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const res = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ role: 'Viewer' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 without email');
    });

    it('validates role', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const res = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@shiekhshoes.com', role: 'InvalidRole' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for invalid role');
    });

    it('validates email domain', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const res = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@gmail.com', role: 'Viewer' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for invalid domain');
      
      const body = await res.json();
      assert.ok(body.error?.code === 'invalid_domain');
    });

    it('creates invitation with valid data', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const testEmail = `test-invite-${Date.now()}@shiekhshoes.org`;
      
      const res = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ 
          email: testEmail, 
          role: 'Viewer',
          personalMessage: 'Welcome to the team!',
        }),
      });
      
      assert.strictEqual(res.status, 201);
      
      const body = await res.json();
      assert.ok(body.invitation?.id, 'should have invitation id');
      assert.strictEqual(body.invitation.email, testEmail.toLowerCase());
      assert.strictEqual(body.invitation.role, 'Viewer');
      assert.strictEqual(body.invitation.status, 'pending');
    });

    it('rejects duplicate pending invitation', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const testEmail = `test-dup-${Date.now()}@shiekhshoes.org`;
      
      const res1 = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, role: 'Viewer' }),
      });
      assert.strictEqual(res1.status, 201);
      
      const res2 = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, role: 'Steward' }),
      });
      assert.strictEqual(res2.status, 409, 'should reject duplicate invitation');
    });

    it('steward cannot invite admin', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const testEmail = `test-steward-admin-${Date.now()}@shiekhshoes.org`;
      
      const res = await fetch(`${API_BASE}/api/app/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token-steward',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: testEmail, role: 'Admin' }),
      });
      assert.strictEqual(res.status, 403, 'steward should not be able to invite admin');
    });
  });

  describe('POST /api/app/invitations/:id/revoke', () => {
    it('revokes pending invitation', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const testEmail = `test-revoke-${Date.now()}@shiekhshoes.org`;
      
      const createRes = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, role: 'Viewer' }),
      });
      assert.strictEqual(createRes.status, 201);
      const { invitation } = await createRes.json();
      
      const revokeRes = await fetchApi(`/api/app/invitations/${invitation.id}/revoke`, {
        method: 'POST',
      });
      assert.strictEqual(revokeRes.status, 200);
      
      const body = await revokeRes.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.invitation.status, 'revoked');
    });

    it('returns 404 for non-existent invitation', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const res = await fetchApi('/api/app/invitations/inv_nonexistent/revoke', {
        method: 'POST',
      });
      assert.strictEqual(res.status, 404);
    });
  });

  describe('POST /api/app/invitations/:id/resend', () => {
    it('resends pending invitation', async (t) => {
      if (!serverAvailable) { t.skip('Server not available'); return; }
      const testEmail = `test-resend-${Date.now()}@shiekhshoes.org`;
      
      const createRes = await fetchApi('/api/app/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: testEmail, role: 'Viewer' }),
      });
      assert.strictEqual(createRes.status, 201);
      const { invitation } = await createRes.json();
      
      const resendRes = await fetchApi(`/api/app/invitations/${invitation.id}/resend`, {
        method: 'POST',
      });
      assert.strictEqual(resendRes.status, 200);
      
      const body = await resendRes.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.newExpiresAt, 'should have new expiry date');
    });
  });
});
