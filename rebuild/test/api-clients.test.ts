import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { hashToken, generateApiToken } from '../server/middleware/legacyApiAuth';
import { seedTestUsers } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('API Client Token Functions', () => {
  describe('generateApiToken', () => {
    it('generates token with shk_ prefix', () => {
      const token = generateApiToken();
      assert.ok(token.startsWith('shk_'), 'token should start with shk_');
    });

    it('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateApiToken());
      }
      assert.strictEqual(tokens.size, 100, 'all tokens should be unique');
    });

    it('generates tokens of consistent length', () => {
      const token = generateApiToken();
      assert.ok(token.length > 40, 'token should be at least 40 characters');
      assert.ok(token.length < 100, 'token should be less than 100 characters');
    });
  });

  describe('hashToken', () => {
    it('produces consistent hash for same token', () => {
      const token = 'test-token-123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      assert.strictEqual(hash1, hash2, 'same token should produce same hash');
    });

    it('produces different hashes for different tokens', () => {
      const hash1 = hashToken('token-1');
      const hash2 = hashToken('token-2');
      assert.notStrictEqual(hash1, hash2, 'different tokens should produce different hashes');
    });

    it('produces 64 character hex hash', () => {
      const hash = hashToken('test-token');
      assert.strictEqual(hash.length, 64, 'SHA-256 hash should be 64 hex chars');
      assert.ok(/^[a-f0-9]{64}$/.test(hash), 'hash should be lowercase hex');
    });
  });
});

describe('API Client Endpoints', () => {
  before(async () => {
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

  describe('GET /api/app/api-clients', () => {
    it('requires admin role', async () => {
      const res = await fetch(`${API_BASE}/api/app/api-clients`, {
        headers: {
          'Authorization': 'Bearer test-token-viewer',
        },
      });
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns list of clients for admin', async () => {
      const res = await fetchApi('/api/app/api-clients');
      assert.strictEqual(res.status, 200, 'should return 200 for admin');
      
      const body = await res.json();
      assert.ok(Array.isArray(body.clients), 'should return clients array');
    });
  });

  describe('POST /api/app/api-clients', () => {
    it('requires name', async () => {
      const res = await fetchApi('/api/app/api-clients', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400, 'should return 400 without name');
    });

    it('validates scopes', async () => {
      const res = await fetchApi('/api/app/api-clients', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Client', scopes: ['invalid:scope'] }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for invalid scope');
    });
  });

  describe('POST /api/app/api-clients/:id/rate-limit', () => {
    it('requires admin role', async () => {
      const res = await fetch(`${API_BASE}/api/app/api-clients/test-id/rate-limit`, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token-viewer',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rateLimit: 100 }),
      });
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('validates rate limit is a number', async () => {
      const res = await fetchApi('/api/app/api-clients/test-id/rate-limit', {
        method: 'POST',
        body: JSON.stringify({ rateLimit: 'unlimited' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for non-numeric rate limit');
    });

    it('validates rate limit is within range', async () => {
      const res = await fetchApi('/api/app/api-clients/test-id/rate-limit', {
        method: 'POST',
        body: JSON.stringify({ rateLimit: 20000 }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for rate limit > 10000');
    });

    it('accepts 0 for unlimited', async () => {
      const createRes = await fetchApi('/api/app/api-clients', {
        method: 'POST',
        body: JSON.stringify({ name: `Rate Limit Test ${Date.now()}`, scopes: ['locations:read'] }),
      });
      assert.strictEqual(createRes.status, 201);
      const { client } = await createRes.json();

      const res = await fetchApi(`/api/app/api-clients/${client.id}/rate-limit`, {
        method: 'POST',
        body: JSON.stringify({ rateLimit: 0 }),
      });
      assert.strictEqual(res.status, 200, 'should accept 0 for unlimited');
      const body = await res.json();
      assert.strictEqual(body.client.rateLimit, 0);
    });

    it('updates rate limit successfully', async () => {
      const createRes = await fetchApi('/api/app/api-clients', {
        method: 'POST',
        body: JSON.stringify({ name: `Rate Limit Test ${Date.now()}`, scopes: ['locations:read'] }),
      });
      assert.strictEqual(createRes.status, 201);
      const { client } = await createRes.json();

      const res = await fetchApi(`/api/app/api-clients/${client.id}/rate-limit`, {
        method: 'POST',
        body: JSON.stringify({ rateLimit: 120 }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.client.rateLimit, 120);
    });
  });

  describe('DELETE /api/app/api-clients/:id', () => {
    it('cannot delete active client', async () => {
      const createRes = await fetchApi('/api/app/api-clients', {
        method: 'POST',
        body: JSON.stringify({ name: `Delete Test ${Date.now()}`, scopes: ['locations:read'] }),
      });
      assert.strictEqual(createRes.status, 201);
      const { client } = await createRes.json();

      const deleteRes = await fetchApi(`/api/app/api-clients/${client.id}`, {
        method: 'DELETE',
      });
      assert.strictEqual(deleteRes.status, 400, 'should return 400 for active client');

      const body = await deleteRes.json();
      assert.ok(body.error?.message?.includes('Revoke'), 'error should mention revoking first');
    });

    it('deletes revoked client successfully', async () => {
      const createRes = await fetchApi('/api/app/api-clients', {
        method: 'POST',
        body: JSON.stringify({ name: `Delete Test ${Date.now()}`, scopes: ['locations:read'] }),
      });
      assert.strictEqual(createRes.status, 201);
      const { client } = await createRes.json();

      const revokeRes = await fetchApi(`/api/app/api-clients/${client.id}/revoke`, {
        method: 'POST',
      });
      assert.strictEqual(revokeRes.status, 200, 'should revoke successfully');

      const deleteRes = await fetchApi(`/api/app/api-clients/${client.id}`, {
        method: 'DELETE',
      });
      assert.strictEqual(deleteRes.status, 200, 'should delete revoked client');

      const body = await deleteRes.json();
      assert.strictEqual(body.success, true);
    });

    it('returns 404 for non-existent client', async () => {
      const res = await fetchApi('/api/app/api-clients/non-existent-id', {
        method: 'DELETE',
      });
      assert.strictEqual(res.status, 404);
    });
  });
});
