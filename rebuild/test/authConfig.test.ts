import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getAllowedDomains,
  getAdminEmails,
  isEmailDomainAllowed,
  isGoogleSignInDomainAllowed,
  isRegisteredUserStatus,
  isAdminEmail,
  getEmailDomain,
} from '../server/config/auth';

describe('Auth Config', () => {
  describe('getAllowedDomains', () => {
    it('returns default domain (shiekhshoes.org) when env not set', () => {
      const domains = getAllowedDomains();
      assert.ok(domains.includes('shiekhshoes.org'));
    });
  });

  describe('isEmailDomainAllowed', () => {
    it('allows default domain', () => {
      assert.strictEqual(isEmailDomainAllowed('user@shiekhshoes.org'), true);
    });

    it('rejects non-allowed domains', () => {
      assert.strictEqual(isEmailDomainAllowed('user@gmail.com'), false);
      assert.strictEqual(isEmailDomainAllowed('user@other.com'), false);
    });

    it('handles malformed emails', () => {
      assert.strictEqual(isEmailDomainAllowed('noemail'), false);
      assert.strictEqual(isEmailDomainAllowed(''), false);
    });

    it('is case-insensitive for domains', () => {
      assert.strictEqual(isEmailDomainAllowed('user@SHIEKHSHOES.ORG'), true);
      assert.strictEqual(isEmailDomainAllowed('user@ShiekhShoes.Org'), true);
    });
  });

  describe('isGoogleSignInDomainAllowed', () => {
    it('allows only the exact shiekhshoes.org domain, including mixed case', () => {
      assert.strictEqual(isGoogleSignInDomainAllowed('user@shiekhshoes.org'), true);
      assert.strictEqual(isGoogleSignInDomainAllowed('user@ShiekhShoes.org'), true);
      assert.strictEqual(isGoogleSignInDomainAllowed('user@SHIEKHSHOES.ORG'), true);
    });

    it('rejects shiekhshoes.com, gmail, and lookalikes', () => {
      assert.strictEqual(isGoogleSignInDomainAllowed('user@shiekhshoes.com'), false);
      assert.strictEqual(isGoogleSignInDomainAllowed('user@gmail.com'), false);
      assert.strictEqual(isGoogleSignInDomainAllowed('user@shiekhshoes.org.evil.com'), false);
      assert.strictEqual(isGoogleSignInDomainAllowed('user@xshiekhshoes.org'), false);
    });
  });

  describe('isRegisteredUserStatus', () => {
    it('allows missing, active, and pending', () => {
      assert.strictEqual(isRegisteredUserStatus(undefined), true);
      assert.strictEqual(isRegisteredUserStatus('active'), true);
      assert.strictEqual(isRegisteredUserStatus('pending'), true);
    });

    it('blocks every other value', () => {
      for (const status of ['disabled', 'suspended', 'inactive', 'Disabled', 'deactivated', '', null]) {
        assert.strictEqual(isRegisteredUserStatus(status), false, `status ${JSON.stringify(status)} must be blocked`);
      }
    });
  });

  describe('getAdminEmails', () => {
    it('returns array (may be empty if no env set)', () => {
      const emails = getAdminEmails();
      assert.ok(Array.isArray(emails));
    });
  });

  describe('isAdminEmail', () => {
    it('returns false for non-configured email', () => {
      assert.strictEqual(isAdminEmail('random@example.com'), false);
    });
  });

  describe('getEmailDomain', () => {
    it('extracts domain from email', () => {
      assert.strictEqual(getEmailDomain('user@example.com'), 'example.com');
      assert.strictEqual(getEmailDomain('test@DOMAIN.ORG'), 'domain.org');
    });

    it('returns null for invalid email', () => {
      assert.strictEqual(getEmailDomain('noemail'), null);
      assert.strictEqual(getEmailDomain(''), null);
    });
  });
});
