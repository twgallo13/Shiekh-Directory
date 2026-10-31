import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isEmailAllowed, getMailConfig, type MailConfig } from '../server/services/mail';
import { createVerificationRequestEmail, createVerificationReminderEmail } from '../server/services/mailTemplates';

describe('Mail Service', () => {
  describe('isEmailAllowed', () => {
    it('allows any email when cutover is enabled', () => {
      const config: MailConfig = {
        mode: 'disabled',
        testAllowlist: [],
        cutoverEnabled: true,
      };

      const result = isEmailAllowed('store001@shiekh.com', config);
      assert.strictEqual(result.allowed, true);
    });

    it('blocks emails when no allowlist and cutover disabled', () => {
      const config: MailConfig = {
        mode: 'disabled',
        testAllowlist: [],
        cutoverEnabled: false,
      };

      const result = isEmailAllowed('store001@shiekh.com', config);
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason?.includes('No test allowlist'));
    });

    it('allows specific email in allowlist', () => {
      const config: MailConfig = {
        mode: 'disabled',
        testAllowlist: ['test@example.com', 'admin@shiekh.com'],
        cutoverEnabled: false,
      };

      const result = isEmailAllowed('test@example.com', config);
      assert.strictEqual(result.allowed, true);
    });

    it('allows domain wildcard in allowlist', () => {
      const config: MailConfig = {
        mode: 'disabled',
        testAllowlist: ['*@testdomain.com'],
        cutoverEnabled: false,
      };

      assert.strictEqual(isEmailAllowed('anyone@testdomain.com', config).allowed, true);
      assert.strictEqual(isEmailAllowed('another@testdomain.com', config).allowed, true);
      assert.strictEqual(isEmailAllowed('user@otherdomain.com', config).allowed, false);
    });

    it('is case-insensitive', () => {
      const config: MailConfig = {
        mode: 'disabled',
        testAllowlist: ['Test@Example.COM'],
        cutoverEnabled: false,
      };

      assert.strictEqual(isEmailAllowed('test@example.com', config).allowed, true);
      assert.strictEqual(isEmailAllowed('TEST@EXAMPLE.COM', config).allowed, true);
    });

    it('blocks emails not in allowlist', () => {
      const config: MailConfig = {
        mode: 'disabled',
        testAllowlist: ['allowed@example.com'],
        cutoverEnabled: false,
      };

      const result = isEmailAllowed('notallowed@example.com', config);
      assert.strictEqual(result.allowed, false);
      assert.ok(result.reason?.includes('not in test allowlist'));
    });
  });

  describe('getMailConfig', () => {
    it('returns default config when env vars not set', () => {
      const originalEnv = { ...process.env };
      delete process.env.MAIL_MODE;
      delete process.env.TEST_EMAIL_ALLOWLIST;
      delete process.env.MAIL_CUTOVER_ENABLED;

      const config = getMailConfig();
      assert.strictEqual(config.mode, 'disabled');
      assert.deepStrictEqual(config.testAllowlist, []);
      assert.strictEqual(config.cutoverEnabled, false);

      Object.assign(process.env, originalEnv);
    });

    it('parses allowlist from comma-separated string', () => {
      const originalEnv = { ...process.env };
      process.env.TEST_EMAIL_ALLOWLIST = 'a@test.com, b@test.com, *@shiekh.com';

      const config = getMailConfig();
      assert.deepStrictEqual(config.testAllowlist, ['a@test.com', 'b@test.com', '*@shiekh.com']);

      Object.assign(process.env, originalEnv);
    });
  });
});

describe('Mail Templates', () => {
  describe('createVerificationRequestEmail', () => {
    it('creates email with correct structure', () => {
      const email = createVerificationRequestEmail({
        storeName: 'Mall of America',
        storeNumber: '042',
        storeEmail: 'store042@shiekh.com',
        verificationUrl: 'https://directory.shiekh.com/verify/abc123',
        expiresAt: '2024-12-31T23:59:59Z',
      });

      assert.strictEqual(email.to, 'store042@shiekh.com');
      assert.ok(email.subject.includes('042'));
      assert.ok(email.subject.includes('Verify Hours'));
      assert.ok(email.html.includes('Mall of America'));
      assert.ok(email.html.includes('042'));
      assert.ok(email.html.includes('https://directory.shiekh.com/verify/abc123'));
      assert.ok(email.text.includes('Mall of America'));
    });
  });

  describe('createVerificationReminderEmail', () => {
    it('creates reminder with urgency for 1 day remaining', () => {
      const email = createVerificationReminderEmail({
        storeName: 'Downtown Store',
        storeNumber: '007',
        storeEmail: 'store007@shiekh.com',
        verificationUrl: 'https://directory.shiekh.com/verify/xyz789',
        expiresAt: '2024-12-31T23:59:59Z',
        daysRemaining: 1,
        originalSentAt: '2024-12-24T10:00:00Z',
      });

      assert.strictEqual(email.to, 'store007@shiekh.com');
      assert.ok(email.subject.includes('Reminder'));
      assert.ok(email.subject.includes('1 day remaining'));
      assert.ok(email.html.includes('URGENT'));
      assert.ok(email.html.includes('expires tomorrow'));
    });

    it('creates reminder without urgency for 3+ days remaining', () => {
      const email = createVerificationReminderEmail({
        storeName: 'Downtown Store',
        storeNumber: '007',
        storeEmail: 'store007@shiekh.com',
        verificationUrl: 'https://directory.shiekh.com/verify/xyz789',
        expiresAt: '2024-12-31T23:59:59Z',
        daysRemaining: 3,
        originalSentAt: '2024-12-24T10:00:00Z',
      });

      assert.ok(email.subject.includes('3 days remaining'));
      assert.ok(!email.html.includes('URGENT'));
    });
  });
});
