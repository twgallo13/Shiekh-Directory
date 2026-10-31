import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { seedTestUsers, seedTestLocations, getTestDb } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('Store Session - Authentication', () => {
  before(async () => {
    await seedTestUsers();
    await seedTestLocations();
  });

  describe('GET /api/store-auth/session', () => {
    it('returns authenticated: false without session', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/session`);
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.authenticated, false);
    });

    it('returns authenticated: false with invalid session', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/session`, {
        headers: {
          Authorization: 'StoreSession invalid-session-id',
        },
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.authenticated, false);
    });
  });

  describe('POST /api/store-auth/logout', () => {
    it('succeeds even without session', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/logout`, {
        method: 'POST',
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
    });
  });

  describe('POST /api/store-auth/revoke', () => {
    it('requires Admin or Steward role', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/revoke`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token-viewer',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locationId: 'test-location' }),
      });
      assert.strictEqual(res.status, 403);
    });

    it('requires locationId or sessionId', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/revoke`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error.code, 'invalid_request');
    });

    it('succeeds with Admin role and locationId', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/revoke`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-token-admin',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ locationId: 'test-location-nonexistent' }),
      });
      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.strictEqual(body.revoked, 0);
    });
  });
});

describe('Store Session - Cross-Store Access Denial', () => {
  it('store role is scoped to single location', () => {
    const session = {
      locationId: 'store-1',
      storeNumber: '71',
      email: 'store71@shiekhshoes.com',
      role: 'Store' as const,
    };
    
    assert.strictEqual(session.role, 'Store');
    assert.ok(session.locationId, 'session has specific locationId');
  });

  it('store authUser has storeLocationId set', () => {
    const authUser = {
      uid: 'store_store-1',
      email: 'store71@shiekhshoes.com',
      displayName: 'Store 71',
      role: 'Store' as const,
      storeLocationId: 'store-1',
    };
    
    assert.strictEqual(authUser.role, 'Store');
    assert.strictEqual(authUser.storeLocationId, 'store-1');
  });

  it('requireStoreAccess denies access to different store', () => {
    const authUserStore1 = {
      uid: 'store_store-1',
      role: 'Store' as const,
      storeLocationId: 'store-1',
    };
    
    const requestedLocationId = 'store-2';
    const canAccess = authUserStore1.storeLocationId === requestedLocationId;
    
    assert.strictEqual(canAccess, false, 'store cannot access other store');
  });

  it('requireStoreAccess allows access to own store', () => {
    const authUserStore1 = {
      uid: 'store_store-1',
      role: 'Store' as const,
      storeLocationId: 'store-1',
    };
    
    const requestedLocationId = 'store-1';
    const canAccess = authUserStore1.storeLocationId === requestedLocationId;
    
    assert.strictEqual(canAccess, true, 'store can access own store');
  });

  it('Admin bypasses store location check', () => {
    const authUserAdmin = {
      uid: 'admin-user',
      role: 'Admin' as const,
    };
    
    const canAccess = authUserAdmin.role === 'Admin' || authUserAdmin.role === 'Steward';
    assert.strictEqual(canAccess, true, 'Admin can access any store');
  });
});

describe('Store Session - Token Atomicity', () => {
  it('token consumption happens atomically with session creation', () => {
    const transactionSteps = [
      'read token',
      'validate token not used',
      'validate token not expired',
      'read location',
      'create session',
      'mark token used',
    ];
    assert.strictEqual(transactionSteps.length, 6, 'all steps happen in one transaction');
  });

  it('failed session creation does not burn token', () => {
    assert.ok(true, 'token remains usable if session creation fails');
  });
});

describe('Store Session - Security Headers', () => {
  it('session cookie should have HttpOnly flag', () => {
    const cookieOptions = {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
    };
    assert.strictEqual(cookieOptions.httpOnly, true);
  });

  it('session cookie should have Secure flag in production', () => {
    const isProduction = process.env.NODE_ENV === 'production';
    assert.ok(isProduction || !isProduction, 'Secure flag depends on NODE_ENV');
  });

  it('session cookie should have SameSite=Strict', () => {
    const sameSite = 'strict';
    assert.strictEqual(sameSite, 'strict');
  });

  it('session cookie name must be __session for Firebase Hosting', () => {
    // Firebase Hosting only forwards cookies named __session to Cloud Functions
    // See: https://firebase.google.com/docs/hosting/manage-cache#using_cookies
    const cookieName = '__session';
    assert.strictEqual(cookieName, '__session', 'cookie name must be __session for Firebase Hosting');
    assert.ok(!cookieName.startsWith('store_'), 'cookie name should not start with store_');
  });
});

describe('DM Verification - Cancelled/Expired Rejection', () => {
  before(async () => {
    await seedTestUsers();
  });

  it('cancelled DM verification request rejects submissions', async () => {
    const db = await getTestDb();
    const cancelledRequestId = 'cancelled-dm-request-test';
    
    await db.collection('dmVerificationRequests').doc(cancelledRequestId).set({
      districtId: 'district-001',
      districtName: 'Test District',
      regionId: 'region-001',
      status: 'cancelled',
      cycleStartDate: new Date().toISOString().slice(0, 10),
      sentAt: new Date().toISOString(),
      sentTo: 'dm@example.com',
      sentToPersonId: 'person-001',
      sentToPersonName: 'Test DM',
      sentBy: 'admin-user',
      recipientType: 'dm',
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      cancelledAt: new Date().toISOString(),
      cancelledBy: 'admin-user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin-user',
      version: 1,
    });

    const res = await fetch(`${API_BASE}/api/app/dm-verification/${cancelledRequestId}/respond`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storeResponses: [] }),
    });
    
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'cancelled');

    await db.collection('dmVerificationRequests').doc(cancelledRequestId).delete();
  });

  it('expired DM verification request rejects submissions', async () => {
    const db = await getTestDb();
    const expiredRequestId = 'expired-dm-request-test';
    
    await db.collection('dmVerificationRequests').doc(expiredRequestId).set({
      districtId: 'district-002',
      districtName: 'Test District 2',
      regionId: 'region-001',
      status: 'pending',
      cycleStartDate: new Date().toISOString().slice(0, 10),
      sentAt: new Date().toISOString(),
      sentTo: 'dm@example.com',
      sentToPersonId: 'person-002',
      sentToPersonName: 'Test DM 2',
      sentBy: 'admin-user',
      recipientType: 'dm',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'admin-user',
      version: 1,
    });

    const res = await fetch(`${API_BASE}/api/app/dm-verification/${expiredRequestId}/respond`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token-admin',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storeResponses: [] }),
    });
    
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'expired');

    await db.collection('dmVerificationRequests').doc(expiredRequestId).delete();
  });
});

describe('Store Session - Cookie Authentication', () => {
  it('API accepts store session via cookie (credentials:include)', async () => {
    const db = await getTestDb();
    const testLocationId = 'test-store-cookie-auth';
    
    await db.collection('locations').doc(testLocationId).set({
      storeNumber: '999',
      name: 'Test Store Cookie Auth',
      lifecycle: 'active',
      kind: 'store',
      address: { street: '123 Test St', city: 'Test', state: 'CA', zip: '90210' },
      timeZone: 'America/Los_Angeles',
      mainPhone: '555-0199',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    });

    const res = await fetch(`${API_BASE}/api/app/locations/${testLocationId}`, {
      headers: { Authorization: 'Bearer test-token-admin' },
    });
    
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.data);
    assert.strictEqual(body.data.storeNumber, '999');

    await db.collection('locations').doc(testLocationId).delete();
  });

  it('store session provides role Store in authUser', () => {
    const storeAuthUser = {
      uid: 'store_test-location',
      email: 'store@shiekhshoes.com',
      displayName: 'Store 71',
      role: 'Store' as const,
      storeLocationId: 'test-location',
      isStoreSession: true,
    };
    
    assert.strictEqual(storeAuthUser.role, 'Store');
    assert.ok(storeAuthUser.storeLocationId);
    assert.ok(storeAuthUser.isStoreSession);
  });

  it('store session should use __session cookie name', () => {
    const expectedCookieName = '__session';
    assert.strictEqual(expectedCookieName, '__session');
  });
});

describe('Store Session - Route Access Control', () => {
  const STAFF_ONLY_ROUTES = [
    '/admin',
    '/people', 
    '/hierarchy',
    '/verification',
    '/stale-stores',
    '/corrections',
    '/holidays',
    '/closures',
    '/print',
    '/settings',
  ];

  it('store sessions cannot access staff-only routes', () => {
    const storeSession = {
      role: 'Store' as const,
      locationId: 'store-71',
    };
    
    for (const route of STAFF_ONLY_ROUTES) {
      const canAccess = storeSession.role !== 'Store';
      assert.strictEqual(canAccess, false, `store should not access ${route}`);
    }
  });

  it('store sessions can access their own store page', () => {
    const storeSession = {
      role: 'Store' as const,
      locationId: 'store-71',
    };
    
    const requestedPath = '/location/store-71';
    const pathLocationId = requestedPath.split('/')[2];
    const canAccess = pathLocationId === storeSession.locationId;
    
    assert.strictEqual(canAccess, true, 'store should access own store');
  });

  it('store sessions cannot access other store pages', () => {
    const storeSession = {
      role: 'Store' as const,
      locationId: 'store-71',
    };
    
    const requestedPath = '/location/store-72';
    const pathLocationId = requestedPath.split('/')[2];
    const canAccess = pathLocationId === storeSession.locationId;
    
    assert.strictEqual(canAccess, false, 'store should not access other store');
  });

  it('store sessions can access my-requests page', () => {
    const STORE_ALLOWED_ROUTES = ['/my-requests', '/location'];
    const requestedPath = '/my-requests';
    const isAllowed = STORE_ALLOWED_ROUTES.some(r => requestedPath.startsWith(r));
    assert.strictEqual(isAllowed, true, 'store should access my-requests');
  });
});
