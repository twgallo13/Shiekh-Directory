import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { hashToken, generateApiToken } from '../server/middleware/legacyApiAuth';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder';

function getTestDb() {
  if (getApps().length === 0) {
    initializeApp({ projectId: PROJECT_ID });
  }
  const db = getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

async function seedTestUsers(): Promise<void> {
  const db = getTestDb();
  const users = [
    { id: 'admin', email: 'admin@test.com', displayName: 'Test Admin', role: 'Admin', status: 'active', version: 1 },
    { id: 'viewer', email: 'viewer@test.com', displayName: 'Test Viewer', role: 'Viewer', status: 'active', version: 1 },
    { id: 'steward', email: 'steward@test.com', displayName: 'Test Steward', role: 'Steward', status: 'active', version: 1 },
    { id: 'leader', email: 'leader@test.com', displayName: 'Test Leader', role: 'Leader', status: 'active', version: 1 },
  ];

  for (const user of users) {
    await db.collection('users').doc(user.id).set({
      ...user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

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
});
