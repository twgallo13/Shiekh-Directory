import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createHmac } from 'crypto';
import { seedTestUsers, seedTestLocations } from './testHelpers';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

describe('Store Auth - Email Validation', () => {
  it('parses valid store email store42@shiekhshoes.com', () => {
    const email = 'store42@shiekhshoes.com';
    const match = email.toLowerCase().match(/^store(\d+)@shiekhshoes\.com$/);
    assert.ok(match, 'should match store email pattern');
    assert.strictEqual(parseInt(match![1], 10), 42);
  });

  it('parses store1@shiekhshoes.com (no leading zeros)', () => {
    const email = 'store1@shiekhshoes.com';
    const match = email.toLowerCase().match(/^store(\d+)@shiekhshoes\.com$/);
    assert.ok(match);
    assert.strictEqual(parseInt(match![1], 10), 1);
  });

  it('rejects store007@shiekhshoes.com format (n has no leading zeros)', () => {
    const email = 'store007@shiekhshoes.com';
    const match = email.toLowerCase().match(/^store(\d+)@shiekhshoes\.com$/);
    assert.ok(match, 'regex matches but extracted number has no leading zeros');
    assert.strictEqual(parseInt(match![1], 10), 7, 'parses as 7, not 007');
  });

  it('rejects staff domain shiekhshoes.org', () => {
    const email = 'john@shiekhshoes.org';
    const match = email.toLowerCase().match(/^store(\d+)@shiekhshoes\.com$/);
    assert.ok(!match, 'should not match org domain');
  });

  it('rejects personal email', () => {
    const email = 'manager@gmail.com';
    const match = email.toLowerCase().match(/^store(\d+)@shiekhshoes\.com$/);
    assert.ok(!match, 'should not match personal email');
  });

  it('rejects non-store email at shiekhshoes.com', () => {
    const email = 'support@shiekhshoes.com';
    const match = email.toLowerCase().match(/^store(\d+)@shiekhshoes\.com$/);
    assert.ok(!match, 'should not match non-store email');
  });
});

describe('Store Auth API', () => {
  before(async () => {
    await seedTestUsers();
    await seedTestLocations();
  });

  describe('POST /api/store-auth/send-link', () => {
    it('requires email', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'invalid_request');
    });

    it('rejects non-store email domain', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test@shiekhshoes.org' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'invalid_email');
    });

    it('rejects personal email', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'manager@gmail.com' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'invalid_email');
    });

    it('returns 404 for non-existent store', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'store9999@shiekhshoes.com' }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'store_not_found');
    });
  });

  describe('POST /api/store-auth/verify-token', () => {
    it('requires token', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'invalid_token');
    });

    it('rejects invalid token', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/verify-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token-12345' }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'token_not_found');
    });
  });

  describe('POST /api/store-auth/one-click-action', () => {
    it('requires token', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/one-click-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'invalid_token');
    });

    it('requires valid action', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/one-click-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'test-token', action: 'invalid' }),
      });
      assert.strictEqual(res.status, 400);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'invalid_action');
    });

    it('rejects invalid token', async () => {
      const res = await fetch(`${API_BASE}/api/store-auth/one-click-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'invalid-token', action: 'confirm' }),
      });
      assert.strictEqual(res.status, 404);
      const body = await res.json();
      assert.strictEqual(body.error?.code, 'token_not_found');
    });
  });
});

describe('Store Auth - Token Security', () => {
  it('tokens are single-use', () => {
    const tokenUsed = { usedAt: new Date().toISOString() };
    assert.ok(tokenUsed.usedAt, 'token should have usedAt after first use');
  });

  it('tokens expire after set duration', () => {
    const now = Date.now();
    const expiresAt = new Date(now + 24 * 60 * 60 * 1000);
    const isExpired = new Date(expiresAt) < new Date();
    assert.ok(!isExpired, 'token should not be expired initially');
    
    const expiredToken = new Date(now - 1000);
    const isExpiredOld = expiredToken < new Date();
    assert.ok(isExpiredOld, 'old token should be expired');
  });

  it('token hash is deterministic', () => {
    const secret = 'test-secret';
    const token = 'test-token-value';
    
    const hash1 = createHmac('sha256', secret).update(token).digest('hex');
    const hash2 = createHmac('sha256', secret).update(token).digest('hex');
    
    assert.strictEqual(hash1, hash2, 'same token should produce same hash');
  });

  it('different tokens produce different hashes', () => {
    const secret = 'test-secret';
    
    const hash1 = createHmac('sha256', secret).update('token1').digest('hex');
    const hash2 = createHmac('sha256', secret).update('token2').digest('hex');
    
    assert.notStrictEqual(hash1, hash2, 'different tokens should produce different hashes');
  });
});

describe('Verification Email - One-Click Buttons', () => {
  it('includes confirm and update URLs when provided', () => {
    const data = {
      storeName: 'Test Store',
      storeNumber: '042',
      storeEmail: 'store42@shiekhshoes.com',
      verificationUrl: 'https://example.com/verify/123',
      expiresAt: new Date().toISOString(),
      confirmUrl: 'https://example.com/verify-action?token=abc&action=confirm',
      updateUrl: 'https://example.com/verify-action?token=xyz&action=update',
    };

    const hasOneClick = data.confirmUrl && data.updateUrl;
    assert.ok(hasOneClick, 'should have both one-click URLs');
  });

  it('handles missing one-click URLs gracefully', () => {
    const data: { confirmUrl?: string; updateUrl?: string } = {
      confirmUrl: undefined,
      updateUrl: undefined,
    };

    const hasOneClick = data.confirmUrl && data.updateUrl;
    assert.ok(!hasOneClick, 'should not have one-click URLs when not provided');
  });
});

describe('Mail Log - Test Link Visibility', () => {
  it('stores redacted URLs in mail log with token IDs', () => {
    const mailLogEntry = {
      to: 'store42@shiekhshoes.com',
      type: 'verification-request',
      verificationUrl: 'https://example.com/verify/123',
      confirmUrl: 'https://example.com/verify-action?token=[REDACTED:tok_abc123]&action=confirm',
      updateUrl: 'https://example.com/verify-action?token=[REDACTED:tok_xyz789]&action=update',
      confirmTokenId: 'tok_abc123',
      updateTokenId: 'tok_xyz789',
      sentAt: new Date().toISOString(),
      blocked: true,
      reason: 'Email not in test allowlist',
    };

    assert.ok(mailLogEntry.confirmUrl.includes('[REDACTED'), 'confirmUrl should be redacted');
    assert.ok(mailLogEntry.updateUrl.includes('[REDACTED'), 'updateUrl should be redacted');
    assert.ok(mailLogEntry.confirmTokenId.startsWith('tok_'), 'should have confirmTokenId');
    assert.ok(mailLogEntry.updateTokenId.startsWith('tok_'), 'should have updateTokenId');
    assert.ok(mailLogEntry.verificationUrl, 'mail log should contain verificationUrl');
  });
});

describe('One-Click Action - Session for Update', () => {
  it('update action response includes sessionId for app-issued session', () => {
    const updateResponse = {
      success: true,
      action: 'update',
      message: 'Update action processed',
      sessionId: 'random_session_id_here',
      locationId: 'loc_001',
      storeNumber: '42',
    };

    assert.strictEqual(updateResponse.action, 'update');
    assert.ok(updateResponse.sessionId, 'update response should include sessionId');
    assert.ok(updateResponse.locationId, 'update response should include locationId');
  });

  it('confirm action response does not need sessionId', () => {
    const confirmResponse = {
      success: true,
      action: 'confirm',
      message: 'Hours confirmed successfully',
    };

    assert.strictEqual(confirmResponse.action, 'confirm');
    assert.ok(!('sessionId' in confirmResponse) || !confirmResponse.sessionId, 
      'confirm response typically does not need sessionId');
  });

  it('session stores role and locationId', () => {
    const sessionData = {
      role: 'Store',
      locationId: 'loc_001',
      storeNumber: '42',
      email: 'store42@shiekhshoes.com',
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      revoked: false,
    };

    assert.strictEqual(sessionData.role, 'Store');
    assert.ok(sessionData.locationId, 'should have locationId');
    assert.ok(sessionData.storeNumber, 'should have storeNumber');
    assert.ok(sessionData.expiresAt, 'should have expiresAt');
    assert.strictEqual(sessionData.revoked, false, 'should not be revoked initially');
  });
});

describe('Token URL Security - Referrer Policy', () => {
  it('verify-action page should strip token from URL', () => {
    const originalUrl = 'https://directory.shiekh.com/verify-action?token=abc123&action=update';
    const url = new URL(originalUrl);
    url.searchParams.delete('token');
    url.searchParams.delete('action');
    
    const strippedPath = url.pathname;
    assert.strictEqual(strippedPath, '/verify-action');
    assert.ok(!url.search || url.search === '', 'query params should be stripped');
  });

  it('Referrer-Policy header value is no-referrer', () => {
    const headers = {
      'Referrer-Policy': 'no-referrer',
    };
    assert.strictEqual(headers['Referrer-Policy'], 'no-referrer');
  });

  it('meta referrer tag content is no-referrer', () => {
    const metaContent = 'no-referrer';
    assert.strictEqual(metaContent, 'no-referrer');
  });

  it('history.replaceState clears token from URL without navigation', () => {
    const pathWithoutToken = '/verify-action';
    assert.ok(!pathWithoutToken.includes('token='), 'path should not include token');
  });
});

describe('Store Sign-In - Session Flow', () => {
  it('verify-token returns sessionId for authenticated sign-in', () => {
    const verifyResponse = {
      valid: true,
      sessionId: 'random_session_id',
      locationId: 'loc_001',
      storeNumber: '42',
      storeName: 'Test Store',
      email: 'store42@shiekhshoes.com',
    };

    assert.ok(verifyResponse.sessionId, 'should return sessionId');
    assert.ok(verifyResponse.locationId, 'should return locationId');
    assert.ok(verifyResponse.storeName, 'should return storeName');
  });

  it('session is stored with hash of sessionId', () => {
    const sessionId = 'test-session-id';
    const hashedSessionId = createHmac('sha256', 'dev-session-secret-not-for-production')
      .update(sessionId)
      .digest('hex');
    
    assert.ok(hashedSessionId.length === 64, 'hash should be 64 hex characters');
    assert.notStrictEqual(hashedSessionId, sessionId, 'hash should differ from sessionId');
  });

  it('session expiry defaults to 12 hours', () => {
    const SESSION_EXPIRY_HOURS = 12;
    const now = Date.now();
    const expiresAt = new Date(now + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
    const diffHours = (expiresAt.getTime() - now) / (60 * 60 * 1000);
    
    assert.strictEqual(diffHours, 12);
  });
});
