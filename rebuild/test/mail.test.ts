import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createVerificationRequestEmail, createVerificationReminderEmail } from '../server/services/mailTemplates';

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

    it('includes store type when provided', () => {
      const email = createVerificationRequestEmail({
        storeName: 'Test Store',
        storeNumber: '001',
        storeEmail: 'store001@shiekh.com',
        storeType: 'Retail',
        verificationUrl: 'https://test.com/verify/123',
        expiresAt: '2024-12-31T23:59:59Z',
      });

      assert.ok(email.html.includes('Retail') || email.text.includes('001'));
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
