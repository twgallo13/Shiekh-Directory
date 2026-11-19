import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getAllowedDomains,
  getAdminEmails,
  isEmailDomainAllowed,
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
