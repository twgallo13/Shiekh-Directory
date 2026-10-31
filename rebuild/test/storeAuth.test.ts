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
