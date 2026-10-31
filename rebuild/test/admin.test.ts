import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

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

describe('Admin API', () => {
  before(async () => {
    await seedTestUsers();
  });

  describe('GET /api/app/admin/users', () => {
    it('requires admin role', async () => {
      const res = await fetch(`${API_BASE}/api/app/admin/users`, {
        headers: { 'Authorization': 'Bearer test-token-viewer' },
      });
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns list of users for admin', async () => {
      const res = await fetchApi('/api/app/admin/users');
      assert.strictEqual(res.status, 200, 'should return 200 for admin');
      
      const body = await res.json();
      assert.ok(Array.isArray(body.users), 'should return users array');
      assert.ok(typeof body.total === 'number', 'should return total count');
    });

    it('filters by role', async () => {
      const res = await fetchApi('/api/app/admin/users?role=Admin');
      assert.strictEqual(res.status, 200);
      
      const body = await res.json();
      for (const user of body.users) {
        assert.strictEqual(user.role, 'Admin', 'all users should be Admin');
      }
    });
  });

  describe('POST /api/app/admin/users', () => {
    it('requires email', async () => {
      const res = await fetchApi('/api/app/admin/users', {
        method: 'POST',
        body: JSON.stringify({ displayName: 'Test', role: 'Viewer' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 without email');
    });

    it('requires display name', async () => {
      const res = await fetchApi('/api/app/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', role: 'Viewer' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 without displayName');
    });

    it('validates role', async () => {
      const res = await fetchApi('/api/app/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email: 'test@example.com', displayName: 'Test', role: 'InvalidRole' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for invalid role');
    });

    it('creates user successfully', async () => {
      const email = `test-${Date.now()}@example.com`;
      const res = await fetchApi('/api/app/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, displayName: 'Test User', role: 'Viewer' }),
      });
      assert.strictEqual(res.status, 201, 'should return 201 for created user');
      
      const body = await res.json();
      assert.ok(body.user, 'should return user object');
      assert.strictEqual(body.user.email, email.toLowerCase());
      assert.strictEqual(body.user.role, 'Viewer');
    });
  });

  describe('GET /api/app/admin/custom-fields', () => {
    it('requires admin role', async () => {
      const res = await fetch(`${API_BASE}/api/app/admin/custom-fields`, {
        headers: { 'Authorization': 'Bearer test-token-viewer' },
      });
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns fields and version for admin', async () => {
      const res = await fetchApi('/api/app/admin/custom-fields');
      assert.strictEqual(res.status, 200);
      
      const body = await res.json();
      assert.ok(typeof body.version === 'number', 'should have version');
      assert.ok(Array.isArray(body.fields), 'should have fields array');
    });
  });

  describe('POST /api/app/admin/custom-fields', () => {
    it('requires name', async () => {
      const res = await fetchApi('/api/app/admin/custom-fields', {
        method: 'POST',
        body: JSON.stringify({ type: 'text' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 without name');
    });

    it('validates type', async () => {
      const res = await fetchApi('/api/app/admin/custom-fields', {
        method: 'POST',
        body: JSON.stringify({ name: 'Test Field', type: 'invalid' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 for invalid type');
    });

    it('creates text field successfully', async () => {
      const name = `Test Field ${Date.now()}`;
      const res = await fetchApi('/api/app/admin/custom-fields', {
        method: 'POST',
        body: JSON.stringify({ name, type: 'text', description: 'Test description' }),
      });
      assert.strictEqual(res.status, 201, 'should return 201 for created field');
      
      const body = await res.json();
      assert.ok(body.field, 'should return field object');
      assert.strictEqual(body.field.name, name);
      assert.strictEqual(body.field.type, 'text');
    });

    it('requires options for select type', async () => {
      const res = await fetchApi('/api/app/admin/custom-fields', {
        method: 'POST',
        body: JSON.stringify({ name: 'Select Field', type: 'select' }),
      });
      assert.strictEqual(res.status, 400, 'should return 400 without options for select');
    });
  });

  describe('GET /api/app/admin/stores', () => {
    it('requires admin role', async () => {
      const res = await fetch(`${API_BASE}/api/app/admin/stores`, {
        headers: { 'Authorization': 'Bearer test-token-viewer' },
      });
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns stores list for admin', async () => {
      const res = await fetchApi('/api/app/admin/stores');
      assert.strictEqual(res.status, 200);
      
      const body = await res.json();
      assert.ok(Array.isArray(body.stores), 'should return stores array');
    });
  });

  describe('DELETE /api/app/admin/users/:id', () => {
    it('requires admin role', async () => {
      const res = await fetch(`${API_BASE}/api/app/admin/users/some-user-id`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token-viewer' },
      });
      assert.strictEqual(res.status, 403, 'should return 403 for non-admin');
    });

    it('returns 404 for non-existent user', async () => {
      const res = await fetchApi('/api/app/admin/users/non-existent-user-id', {
        method: 'DELETE',
      });
      assert.strictEqual(res.status, 404, 'should return 404 for non-existent user');
    });

    it('deletes user and returns success', async () => {
      const email = `delete-test-${Date.now()}@example.com`;
      const createRes = await fetchApi('/api/app/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, displayName: 'Delete Test', role: 'Viewer' }),
      });
      assert.strictEqual(createRes.status, 201);
      const { user } = await createRes.json();

      const deleteRes = await fetchApi(`/api/app/admin/users/${user.id}`, {
        method: 'DELETE',
      });
      assert.strictEqual(deleteRes.status, 200, 'should return 200 on successful delete');

      const body = await deleteRes.json();
      assert.strictEqual(body.success, true, 'should return success: true');

      const getRes = await fetchApi(`/api/app/admin/users/${user.id}`);
      const getBody = await getRes.json();
      const found = getBody.users?.find((u: { id: string }) => u.id === user.id);
      assert.ok(!found, 'deleted user should not be found');
    });
  });
});
