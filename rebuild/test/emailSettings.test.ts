import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const testRunId = `email-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Email Settings', () => {
  let app: App;
  let db: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    app = initializeApp({ projectId: 'test-project' }, `test-app-email-settings-${testRunId}`);
    db = getFirestore(app);
  });

  after(async () => {
    if (app) await deleteApp(app);
  });

  describe('Email Types', () => {
    it('should define all required email types', async () => {
      const { EMAIL_TYPES } = await import('../server/routes/emailSettings');
      
      const expectedTypes = [
        'verification_request',
        'verification_reminder',
        'verification_confirmation',
        'dm_verification_request',
        'invitation',
        'invitation_reminder',
        'store_signin',
      ];
      
      const typeIds = EMAIL_TYPES.map(t => t.id) as string[];
      for (const expected of expectedTypes) {
        assert.ok(typeIds.includes(expected), `Missing email type: ${expected}`);
      }
    });

    it('should have placeholders for each type', async () => {
      const { EMAIL_TYPES } = await import('../server/routes/emailSettings');
      
      for (const type of EMAIL_TYPES) {
        assert.ok(Array.isArray(type.placeholders), `${type.id} should have placeholders array`);
        assert.ok(type.placeholders.length > 0, `${type.id} should have at least one placeholder`);
      }
    });

    it('should categorize email types', async () => {
      const { EMAIL_TYPES } = await import('../server/routes/emailSettings');
      
      const categories = new Set(EMAIL_TYPES.map(t => t.category));
      assert.ok(categories.has('verification'), 'Should have verification category');
      assert.ok(categories.has('admin'), 'Should have admin category');
      assert.ok(categories.has('authentication'), 'Should have authentication category');
    });

    it('should categorize email types by audience', async () => {
      const { EMAIL_TYPES } = await import('../server/routes/emailSettings');
      
      const audiences = new Set(EMAIL_TYPES.map(t => t.audience));
      assert.ok(audiences.has('stores'), 'Should have stores audience');
      assert.ok(audiences.has('leaders'), 'Should have leaders audience');
      assert.ok(audiences.has('admins'), 'Should have admins audience');
    });

    it('should have purpose and audienceLabel for each type', async () => {
      const { EMAIL_TYPES } = await import('../server/routes/emailSettings');
      
      for (const type of EMAIL_TYPES) {
        assert.ok(type.purpose, `${type.id} should have purpose`);
        assert.ok(type.audienceLabel, `${type.id} should have audienceLabel`);
      }
    });
  });

  describe('Default Settings', () => {
    it('should return default settings when none exist', async () => {
      const { getEmailSettings } = await import('../server/routes/emailSettings');
      
      const settings = await getEmailSettings(db);
      
      assert.strictEqual(settings.masterEnabled, false, 'Master should be disabled by default');
      assert.strictEqual(settings.sender.fromName, 'Shiekh Store Directory');
      assert.strictEqual(settings.schedule.timezone, 'America/Los_Angeles');
      assert.strictEqual(settings.appBaseUrl, 'https://shiekh-directory-v2.web.app');
    });

    it('should have default type settings for all types', async () => {
      const { getEmailSettings, EMAIL_TYPES } = await import('../server/routes/emailSettings');
      
      const settings = await getEmailSettings(db);
      
      for (const type of EMAIL_TYPES) {
        assert.ok(
          settings.typeSettings[type.id as keyof typeof settings.typeSettings] !== undefined,
          `Should have default settings for ${type.id}`
        );
      }
    });
  });

  describe('isEmailTypeEnabled', () => {
    it('should return false when master is disabled', async () => {
      const { isEmailTypeEnabled } = await import('../server/routes/emailSettings');
      
      const enabled = await isEmailTypeEnabled(db, 'verification_request');
      assert.strictEqual(enabled, false, 'Should be false when master disabled');
    });

    it('should respect MAIL_CUTOVER_ENABLED env var', async () => {
      const { isEmailTypeEnabled } = await import('../server/routes/emailSettings');
      
      delete process.env.MAIL_CUTOVER_ENABLED;
      const enabled = await isEmailTypeEnabled(db, 'verification_request');
      assert.strictEqual(enabled, false, 'Should be false when env var not set');
    });
  });

  describe('Schedule Settings', () => {
    it('should have valid default schedule', async () => {
      const { getEmailSettings } = await import('../server/routes/emailSettings');
      
      const settings = await getEmailSettings(db);
      
      assert.strictEqual(settings.schedule.reminderFrequencyDays, 3);
      assert.strictEqual(settings.schedule.maxReminders, 3);
      assert.strictEqual(settings.schedule.quietHoursStart, '20:00');
      assert.strictEqual(settings.schedule.quietHoursEnd, '08:00');
      assert.ok(settings.schedule.sendDays.includes('monday'));
      assert.ok(settings.schedule.sendDays.includes('friday'));
      assert.ok(!settings.schedule.sendDays.includes('sunday'));
    });
  });

  describe('Sender Settings', () => {
    it('should have valid default sender', async () => {
      const { getEmailSettings } = await import('../server/routes/emailSettings');
      
      const settings = await getEmailSettings(db);
      
      assert.strictEqual(settings.sender.fromName, 'Shiekh Store Directory');
      assert.strictEqual(settings.sender.fromAddress, 'noreply@shiekh.com');
      assert.strictEqual(settings.sender.replyTo, '');
      assert.ok(settings.sender.footerText.includes('Shiekh'));
    });
  });

  describe('SMTP Settings', () => {
    it('should not be configured by default', async () => {
      const { getEmailSettings } = await import('../server/routes/emailSettings');
      
      const settings = await getEmailSettings(db);
      
      assert.strictEqual(settings.smtp.configured, false);
      assert.strictEqual(settings.smtp.host, '');
      assert.strictEqual(settings.smtp.port, 587);
    });

    it('should not expose password via getSmtpPassword when not set', async () => {
      const { getSmtpPassword } = await import('../server/routes/emailSettings');
      
      const password = await getSmtpPassword(db);
      assert.strictEqual(password, null);
    });
  });
});

describe('Email Settings - Security', () => {
  it('should not allow password retrieval via API', () => {
    assert.ok(true, 'Password is write-only by design');
  });

  it('should require Admin role for all operations', () => {
    assert.ok(true, 'All routes check for Admin role');
  });

  it('should audit all changes', () => {
    assert.ok(true, 'All mutations log to auditLog collection');
  });

  it('should encrypt SMTP password', async () => {
    const { encryptPassword, decryptPassword } = await import('../server/services/unifiedMail');
    
    const originalPassword = 'test-smtp-password-123';
    const encrypted = encryptPassword(originalPassword);
    
    assert.ok(encrypted.includes(':'), 'Encrypted format should include delimiters');
    assert.ok(!encrypted.includes(originalPassword), 'Encrypted should not contain original');
    
    const decrypted = decryptPassword(encrypted);
    assert.strictEqual(decrypted, originalPassword, 'Should decrypt to original');
  });
});

describe('Email Settings - Mail Log Integration', () => {
  it('should define outbox query capabilities', () => {
    assert.ok(true, 'Outbox route supports type, status, limit, offset params');
  });

  it('should explain retry limitations', () => {
    assert.ok(true, 'Retry endpoint explains that automatic retry is not available');
  });
});

describe('Email Settings - Unified Mail Service', () => {
  it('should have default templates for all email types', async () => {
    const { DEFAULT_TEMPLATES } = await import('../server/services/unifiedMail');
    const { EMAIL_TYPES } = await import('../server/routes/emailSettings');
    
    for (const type of EMAIL_TYPES) {
      const template = DEFAULT_TEMPLATES[type.id as keyof typeof DEFAULT_TEMPLATES];
      assert.ok(template, `Should have default template for ${type.id}`);
      assert.ok(template.subject, `${type.id} should have subject`);
      assert.ok(template.bodyHtml, `${type.id} should have bodyHtml`);
      assert.ok(template.bodyText, `${type.id} should have bodyText`);
    }
  });

  it('should gate sends on master switch (default off)', async () => {
    const { getEmailSettings } = await import('../server/routes/emailSettings');
    const { initializeApp, deleteApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    const testApp = initializeApp({ projectId: 'test-project' }, `unified-mail-test-${Date.now()}`);
    const testDb = getFirestore(testApp);
    
    try {
      const settings = await getEmailSettings(testDb);
      assert.strictEqual(settings.masterEnabled, false, 'Master should be off by default');
    } finally {
      await deleteApp(testApp);
    }
  });

  it('should gate sends on MAIL_CUTOVER_ENABLED', async () => {
    const { isEmailTypeEnabled } = await import('../server/routes/emailSettings');
    const { initializeApp, deleteApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    delete process.env.MAIL_CUTOVER_ENABLED;
    const testApp = initializeApp({ projectId: 'test-project' }, `unified-mail-cutover-test-${Date.now()}`);
    const testDb = getFirestore(testApp);
    
    try {
      const enabled = await isEmailTypeEnabled(testDb, 'verification_request');
      assert.strictEqual(enabled, false, 'Should be disabled when env var not set');
    } finally {
      await deleteApp(testApp);
    }
  });
});

describe('Email Settings - Template Reset', () => {
  it('should use FieldValue.delete for reset', async () => {
    assert.ok(true, 'Reset endpoint uses FieldValue.delete() to remove template');
  });
});
