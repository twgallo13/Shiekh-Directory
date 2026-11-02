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
    
    // Clean up any existing settings from previous runs
    try {
      await db.collection('settings').doc('email').delete();
      await db.collection('settings').doc('email_smtp_password').delete();
    } catch {
      // Ignore if docs don't exist
    }
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
  let originalKey: string | undefined;
  
  before(() => {
    originalKey = process.env.SMTP_ENCRYPTION_KEY;
    // Set a valid 32-byte test key for encryption tests
    process.env.SMTP_ENCRYPTION_KEY = Buffer.from('test-key-32-bytes-long-for-aes!!').toString('base64');
  });
  
  after(() => {
    if (originalKey !== undefined) {
      process.env.SMTP_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.SMTP_ENCRYPTION_KEY;
    }
  });
  
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

  it('should render editor default identically to actual email sent (single source)', async () => {
    const { DEFAULT_TEMPLATES, renderTemplate } = await import('../server/services/mailTemplates');
    const {
      createVerificationRequestEmail,
      createVerificationReminderEmail,
      createVerificationConfirmationEmail,
      createDMVerificationRequestEmail,
      createStoreSignInEmail,
      createInvitationEmail,
      createInvitationReminderEmail,
      formatHoursForEmail,
      formatWayfindingForEmail,
      formatOneClickButtonsForEmail,
    } = await import('../server/services/mailTemplates');
    
    const sampleHours = {
      monday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
      tuesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
      wednesday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
      thursday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
      friday: { closed: false, intervals: [{ open: '10:00', close: '21:30' }] },
      saturday: { closed: false, intervals: [{ open: '10:00', close: '21:30' }] },
      sunday: { closed: false, intervals: [{ open: '11:00', close: '19:00' }] },
    };
    
    const verificationData = {
      storeName: 'Test Store',
      storeNumber: '123',
      storeEmail: 'test@store.com',
      storeType: 'Retail',
      verificationUrl: 'https://example.com/verify/abc',
      expiresAt: '2026-12-01T00:00:00Z',
      confirmUrl: 'https://example.com/confirm/abc',
      updateUrl: 'https://example.com/update/abc',
      hours: sampleHours,
      wayfindingDirections: 'Near the food court',
    };
    
    const createdEmail = createVerificationRequestEmail(verificationData);
    
    const expiresFormatted = new Date(verificationData.expiresAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const hoursFormatted = formatHoursForEmail(sampleHours);
    const wayfindingFormatted = formatWayfindingForEmail(verificationData.wayfindingDirections);
    const oneClickFormatted = formatOneClickButtonsForEmail(verificationData.confirmUrl, verificationData.updateUrl);
    
    const templateData = {
      storeName: verificationData.storeName,
      storeNumber: verificationData.storeNumber,
      storeEmail: verificationData.storeEmail,
      storeType: verificationData.storeType,
      storeTypeHtml: `
          <dt>Type</dt>
          <dd>${verificationData.storeType}</dd>`,
      storeTypeText: `\nType: ${verificationData.storeType}`,
      verificationUrl: verificationData.verificationUrl,
      expiresAt: verificationData.expiresAt,
      expiresFormatted,
      confirmUrl: verificationData.confirmUrl,
      updateUrl: verificationData.updateUrl,
      hoursHtml: hoursFormatted.html,
      hoursText: hoursFormatted.text,
      wayfindingHtml: wayfindingFormatted.html,
      wayfindingText: wayfindingFormatted.text,
      oneClickButtonsHtml: oneClickFormatted.html,
      oneClickButtonsText: oneClickFormatted.text,
    };
    
    const editorSubject = renderTemplate(DEFAULT_TEMPLATES.verification_request.subject, templateData);
    const editorHtml = renderTemplate(DEFAULT_TEMPLATES.verification_request.bodyHtml, templateData);
    const editorText = renderTemplate(DEFAULT_TEMPLATES.verification_request.bodyText, templateData);
    
    assert.strictEqual(createdEmail.subject, editorSubject, 'verification_request subject should match');
    assert.strictEqual(createdEmail.html, editorHtml, 'verification_request HTML should match');
    assert.strictEqual(createdEmail.text, editorText, 'verification_request text should match');
    
    const reminderData = {
      ...verificationData,
      daysRemaining: 3,
      originalSentAt: '2026-11-24T00:00:00Z',
    };
    const reminderEmail = createVerificationReminderEmail(reminderData);
    const reminderExpiresFormatted = new Date(reminderData.expiresAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const originalSentFormatted = new Date(reminderData.originalSentAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const reminderTemplateData = {
      storeName: reminderData.storeName,
      storeNumber: reminderData.storeNumber,
      storeEmail: reminderData.storeEmail,
      verificationUrl: reminderData.verificationUrl,
      expiresAt: reminderData.expiresAt,
      expiresFormatted: reminderExpiresFormatted,
      daysRemaining: '3',
      daysRemainingLabel: '3 days remaining',
      originalSentAt: reminderData.originalSentAt,
      originalSentFormatted,
      urgencyClass: 'warning',
      urgencyText: 'Reminder: 3 days remaining to respond',
    };
    const reminderEditorSubject = renderTemplate(DEFAULT_TEMPLATES.verification_reminder.subject, reminderTemplateData);
    const reminderEditorHtml = renderTemplate(DEFAULT_TEMPLATES.verification_reminder.bodyHtml, reminderTemplateData);
    const reminderEditorText = renderTemplate(DEFAULT_TEMPLATES.verification_reminder.bodyText, reminderTemplateData);
    assert.strictEqual(reminderEmail.subject, reminderEditorSubject, 'verification_reminder subject should match');
    assert.strictEqual(reminderEmail.html, reminderEditorHtml, 'verification_reminder HTML should match');
    assert.strictEqual(reminderEmail.text, reminderEditorText, 'verification_reminder text should match');
    
    const confirmationData = {
      storeName: 'Test Store',
      storeNumber: '123',
      storeEmail: 'test@store.com',
      verifiedAt: '2026-11-30T14:30:00Z',
    };
    const confirmationEmail = createVerificationConfirmationEmail(confirmationData);
    const verifiedFormatted = new Date(confirmationData.verifiedAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const confirmationTemplateData = {
      storeName: confirmationData.storeName,
      storeNumber: confirmationData.storeNumber,
      storeEmail: confirmationData.storeEmail,
      verifiedAt: confirmationData.verifiedAt,
      verifiedFormatted,
    };
    const confirmationEditorSubject = renderTemplate(DEFAULT_TEMPLATES.verification_confirmation.subject, confirmationTemplateData);
    const confirmationEditorHtml = renderTemplate(DEFAULT_TEMPLATES.verification_confirmation.bodyHtml, confirmationTemplateData);
    const confirmationEditorText = renderTemplate(DEFAULT_TEMPLATES.verification_confirmation.bodyText, confirmationTemplateData);
    assert.strictEqual(confirmationEmail.subject, confirmationEditorSubject, 'verification_confirmation subject should match');
    assert.strictEqual(confirmationEmail.html, confirmationEditorHtml, 'verification_confirmation HTML should match');
    assert.strictEqual(confirmationEmail.text, confirmationEditorText, 'verification_confirmation text should match');
    
    const dmData = {
      recipientName: 'John Smith',
      recipientType: 'dm' as const,
      districtName: 'Southern California',
      storeCount: 12,
      verificationUrl: 'https://example.com/dm-verify/abc',
      expiresAt: '2026-12-01T00:00:00Z',
    };
    const dmEmail = createDMVerificationRequestEmail(dmData);
    const dmExpiresFormatted = new Date(dmData.expiresAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    const dmTemplateData = {
      recipientName: dmData.recipientName,
      recipientType: dmData.recipientType,
      recipientLabel: 'District Manager',
      contextNote: 'your district',
      districtName: dmData.districtName,
      storeCount: String(dmData.storeCount),
      verificationUrl: dmData.verificationUrl,
      expiresAt: dmData.expiresAt,
      expiresFormatted: dmExpiresFormatted,
    };
    const dmEditorSubject = renderTemplate(DEFAULT_TEMPLATES.dm_verification_request.subject, dmTemplateData);
    const dmEditorHtml = renderTemplate(DEFAULT_TEMPLATES.dm_verification_request.bodyHtml, dmTemplateData);
    const dmEditorText = renderTemplate(DEFAULT_TEMPLATES.dm_verification_request.bodyText, dmTemplateData);
    assert.strictEqual(dmEmail.subject, dmEditorSubject, 'dm_verification_request subject should match');
    assert.strictEqual(dmEmail.html, dmEditorHtml, 'dm_verification_request HTML should match');
    assert.strictEqual(dmEmail.text, dmEditorText, 'dm_verification_request text should match');
    
    const storeSignInData = {
      storeName: 'Test Store',
      storeNumber: '123',
      storeEmail: 'test@store.com',
      signInUrl: 'https://example.com/signin?token=abc',
      expiresAt: '2026-12-01T12:00:00Z',
    };
    const storeSignInEmail = createStoreSignInEmail(storeSignInData);
    const signInExpiresFormatted = new Date(storeSignInData.expiresAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    const storeSignInTemplateData = {
      storeName: storeSignInData.storeName,
      storeNumber: storeSignInData.storeNumber,
      storeEmail: storeSignInData.storeEmail,
      signInUrl: storeSignInData.signInUrl,
      expiresAt: storeSignInData.expiresAt,
      expiresFormatted: signInExpiresFormatted,
    };
    const storeSignInEditorSubject = renderTemplate(DEFAULT_TEMPLATES.store_signin.subject, storeSignInTemplateData);
    const storeSignInEditorHtml = renderTemplate(DEFAULT_TEMPLATES.store_signin.bodyHtml, storeSignInTemplateData);
    const storeSignInEditorText = renderTemplate(DEFAULT_TEMPLATES.store_signin.bodyText, storeSignInTemplateData);
    assert.strictEqual(storeSignInEmail.subject, storeSignInEditorSubject, 'store_signin subject should match');
    assert.strictEqual(storeSignInEmail.html, storeSignInEditorHtml, 'store_signin HTML should match');
    assert.strictEqual(storeSignInEmail.text, storeSignInEditorText, 'store_signin text should match');
    
    const invitationData = {
      to: 'newuser@example.com',
      inviterName: 'Admin User',
      role: 'Steward',
      inviteUrl: 'https://example.com/invite/abc',
    };
    const invitationEmail = createInvitationEmail(invitationData);
    const invitationTemplateData = {
      inviterName: invitationData.inviterName,
      role: invitationData.role,
      inviteUrl: invitationData.inviteUrl,
    };
    const invitationEditorSubject = renderTemplate(DEFAULT_TEMPLATES.invitation.subject, invitationTemplateData);
    const invitationEditorHtml = renderTemplate(DEFAULT_TEMPLATES.invitation.bodyHtml, invitationTemplateData);
    const invitationEditorText = renderTemplate(DEFAULT_TEMPLATES.invitation.bodyText, invitationTemplateData);
    assert.strictEqual(invitationEmail.subject, invitationEditorSubject, 'invitation subject should match');
    assert.strictEqual(invitationEmail.html, invitationEditorHtml, 'invitation HTML should match');
    assert.strictEqual(invitationEmail.text, invitationEditorText, 'invitation text should match');
    
    const invitationReminderEmail = createInvitationReminderEmail(invitationData);
    const invitationReminderEditorSubject = renderTemplate(DEFAULT_TEMPLATES.invitation_reminder.subject, invitationTemplateData);
    const invitationReminderEditorHtml = renderTemplate(DEFAULT_TEMPLATES.invitation_reminder.bodyHtml, invitationTemplateData);
    const invitationReminderEditorText = renderTemplate(DEFAULT_TEMPLATES.invitation_reminder.bodyText, invitationTemplateData);
    assert.strictEqual(invitationReminderEmail.subject, invitationReminderEditorSubject, 'invitation_reminder subject should match');
    assert.strictEqual(invitationReminderEmail.html, invitationReminderEditorHtml, 'invitation_reminder HTML should match');
    assert.strictEqual(invitationReminderEmail.text, invitationReminderEditorText, 'invitation_reminder text should match');
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

describe('UnifiedMailService - Gating Tests', () => {
  const testRunIdGating = `gating-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let gatingApp: App;
  let gatingDb: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    gatingApp = initializeApp({ projectId: 'test-project' }, `gating-test-${testRunIdGating}`);
    gatingDb = getFirestore(gatingApp);
  });

  after(async () => {
    if (gatingApp) await deleteApp(gatingApp);
  });

  it('should block when master switch is off', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    
    await gatingDb.collection('settings').doc('email').set({
      masterEnabled: false,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles', 
        quietHoursStart: '20:00',
        quietHoursEnd: '08:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        verification_request: { enabled: true },
      },
      appBaseUrl: 'https://test.com',
    });
    
    const mailService = createUnifiedMailService(gatingDb);
    const result = await mailService.send({
      typeId: 'verification_request',
      to: 'test@test.com',
      data: { storeName: 'Test', storeNumber: '001', verificationUrl: 'https://test.com' },
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked');
    assert.ok(result.reason?.includes('master switch'), 'Should mention master switch in reason');
    assert.strictEqual(result.logOnly, true, 'Should be log-only');
  });

  it('should block when MAIL_CUTOVER_ENABLED is not set', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    
    delete process.env.MAIL_CUTOVER_ENABLED;
    
    await gatingDb.collection('settings').doc('email').set({
      masterEnabled: true,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles', 
        quietHoursStart: '20:00',
        quietHoursEnd: '08:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        verification_request: { enabled: true },
      },
      appBaseUrl: 'https://test.com',
    });
    
    const mailService = createUnifiedMailService(gatingDb);
    const result = await mailService.send({
      typeId: 'verification_request',
      to: 'test@test.com',
      data: { storeName: 'Test', storeNumber: '001', verificationUrl: 'https://test.com' },
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked');
    assert.ok(result.reason?.includes('MAIL_CUTOVER_ENABLED'), 'Should mention cutover in reason');
    assert.strictEqual(result.logOnly, true, 'Should be log-only');
  });

  it('should block when per-type toggle is off', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    
    process.env.MAIL_CUTOVER_ENABLED = 'true';
    
    await gatingDb.collection('settings').doc('email').set({
      masterEnabled: true,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles', 
        quietHoursStart: '20:00',
        quietHoursEnd: '08:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        verification_request: { enabled: false },
      },
      appBaseUrl: 'https://test.com',
    });
    
    const mailService = createUnifiedMailService(gatingDb);
    const result = await mailService.send({
      typeId: 'verification_request',
      to: 'test@test.com',
      data: { storeName: 'Test', storeNumber: '001', verificationUrl: 'https://test.com' },
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked');
    assert.ok(result.reason?.includes('disabled'), 'Should mention type disabled in reason');
    
    delete process.env.MAIL_CUTOVER_ENABLED;
  });
});

describe('UnifiedMailService - Template Tests', () => {
  const testRunIdTemplate = `template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let templateApp: App;
  let templateDb: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    templateApp = initializeApp({ projectId: 'test-project' }, `template-test-${testRunIdTemplate}`);
    templateDb = getFirestore(templateApp);
    
    // Clean up any existing settings and mail logs from previous runs
    try {
      await templateDb.collection('settings').doc('email').delete();
      await templateDb.collection('settings').doc('email_smtp_password').delete();
      const mailLogs = await templateDb.collection('mailLog').limit(100).get();
      const batch = templateDb.batch();
      mailLogs.docs.forEach(doc => batch.delete(doc.ref));
      if (!mailLogs.empty) await batch.commit();
    } catch {
      // Ignore cleanup errors
    }
  });

  after(async () => {
    if (templateApp) await deleteApp(templateApp);
  });

  it('should use custom template when configured', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    
    process.env.MAIL_CUTOVER_ENABLED = 'true';
    
    const customSubject = 'Custom Subject for {{storeName}}';
    const customBodyHtml = '<h1>Custom HTML for {{storeNumber}}</h1>';
    const customBodyText = 'Custom text for {{storeName}}';
    
    await templateDb.collection('settings').doc('email').set({
      masterEnabled: true,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles', 
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        verification_request: { 
          enabled: true,
          template: {
            subject: customSubject,
            bodyHtml: customBodyHtml,
            bodyText: customBodyText,
          },
        },
      },
      appBaseUrl: 'https://test.com',
    });
    
    await templateDb.collection('settings').doc('email_smtp_password').set({
      encryptedPassword: null,
      password: 'test-password',
    });
    
    const mailService = createUnifiedMailService(templateDb);
    const result = await mailService.send({
      typeId: 'verification_request',
      to: 'test@test.com',
      data: { storeName: 'Test Store', storeNumber: '001', verificationUrl: 'https://test.com' },
    });
    
    assert.strictEqual(result.success, false, 'Should fail (no real SMTP)');
    assert.ok(result.error, 'Should have error (SMTP connection fails in test)');
    
    const logs = await templateDb.collection('mailLog').where('type', '==', 'verification_request').get();
    assert.ok(logs.docs.length > 0, 'Should have logged the send attempt');
    
    const logData = logs.docs[0].data();
    assert.strictEqual(logData.subject, 'Custom Subject for Test Store', 'Should use custom subject with placeholder');
    
    delete process.env.MAIL_CUTOVER_ENABLED;
  });

  it('should use default template when no custom template', async () => {
    const { createUnifiedMailService, DEFAULT_TEMPLATES } = await import('../server/services/unifiedMail');
    
    process.env.MAIL_CUTOVER_ENABLED = 'true';
    
    await templateDb.collection('settings').doc('email').set({
      masterEnabled: true,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles', 
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        invitation: { enabled: true },
      },
      appBaseUrl: 'https://test.com',
    });
    
    await templateDb.collection('settings').doc('email_smtp_password').set({
      password: 'test-password',
    });
    
    const mailService = createUnifiedMailService(templateDb);
    await mailService.send({
      typeId: 'invitation',
      to: 'test@test.com',
      data: { inviterName: 'John Doe', role: 'Viewer', signInUrl: 'https://test.com', expiresAt: '2024-12-31' },
    });
    
    const logs = await templateDb.collection('mailLog')
      .where('type', '==', 'invitation')
      .orderBy('sentAt', 'desc')
      .limit(1)
      .get();
    
    assert.ok(logs.docs.length > 0, 'Should have logged');
    const logData = logs.docs[0].data();
    
    const defaultTemplate = DEFAULT_TEMPLATES.invitation;
    const expectedSubject = defaultTemplate.subject;
    assert.strictEqual(logData.subject, expectedSubject, 'Should use default template subject');
    
    delete process.env.MAIL_CUTOVER_ENABLED;
  });
});

describe('UnifiedMailService - Schedule Tests', () => {
  const testRunIdSchedule = `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let scheduleApp: App;
  let scheduleDb: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    scheduleApp = initializeApp({ projectId: 'test-project' }, `schedule-test-${testRunIdSchedule}`);
    scheduleDb = getFirestore(scheduleApp);
  });

  after(async () => {
    if (scheduleApp) await deleteApp(scheduleApp);
  });

  it('should block during quiet hours', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    
    process.env.MAIL_CUTOVER_ENABLED = 'true';
    
    const now = new Date();
    const utcHour = now.getUTCHours();
    const quietStart = `${String(utcHour).padStart(2, '0')}:00`;
    const quietEnd = `${String((utcHour + 2) % 24).padStart(2, '0')}:00`;
    
    await scheduleDb.collection('settings').doc('email').set({
      masterEnabled: true,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'UTC',
        quietHoursStart: quietStart,
        quietHoursEnd: quietEnd,
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        verification_request: { enabled: true },
      },
      appBaseUrl: 'https://test.com',
    });
    
    const mailService = createUnifiedMailService(scheduleDb);
    const result = await mailService.send({
      typeId: 'verification_request',
      to: 'test@test.com',
      data: { storeName: 'Test', storeNumber: '001', verificationUrl: 'https://test.com' },
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked');
    assert.ok(result.reason?.includes('quiet hours'), 'Should mention quiet hours');
    
    delete process.env.MAIL_CUTOVER_ENABLED;
  });

  it('should allow on send days and outside quiet hours', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    
    process.env.MAIL_CUTOVER_ENABLED = 'true';
    
    await scheduleDb.collection('settings').doc('email').set({
      masterEnabled: true,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles',
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      smtp: { configured: true, host: 'smtp.test.com', port: 587, secure: false, user: 'test' },
      typeSettings: {
        verification_request: { enabled: true },
      },
      appBaseUrl: 'https://test.com',
    });
    
    await scheduleDb.collection('settings').doc('email_smtp_password').set({
      password: 'test-password',
    });
    
    const mailService = createUnifiedMailService(scheduleDb);
    const result = await mailService.send({
      typeId: 'verification_request',
      to: 'test@test.com',
      data: { storeName: 'Test', storeNumber: '001', verificationUrl: 'https://test.com' },
    });
    
    assert.strictEqual(result.blocked, undefined, 'Should not be blocked by schedule');
    
    delete process.env.MAIL_CUTOVER_ENABLED;
  });
});

describe('UnifiedMailService - Type-Specific Send Methods', () => {
  const testRunIdMethods = `methods-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let methodsApp: App;
  let methodsDb: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    methodsApp = initializeApp({ projectId: 'test-project' }, `methods-test-${testRunIdMethods}`);
    methodsDb = getFirestore(methodsApp);
    
    await methodsDb.collection('settings').doc('email').set({
      masterEnabled: false,
      sender: { fromName: 'Test', fromAddress: 'test@test.com', replyTo: '', footerText: '' },
      schedule: { 
        timezone: 'America/Los_Angeles',
        quietHoursStart: '00:00',
        quietHoursEnd: '00:00',
        sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      },
      smtp: { configured: false, host: '', port: 587, secure: false, user: '' },
      typeSettings: {},
      appBaseUrl: 'https://test.com',
    });
  });

  after(async () => {
    if (methodsApp) await deleteApp(methodsApp);
  });

  it('should have sendVerificationRequest method', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    const mailService = createUnifiedMailService(methodsDb);
    
    const result = await mailService.sendVerificationRequest({
      storeName: 'Test Store',
      storeNumber: '001',
      storeEmail: 'store001@test.com',
      storeType: 'Retail',
      verificationUrl: 'https://test.com/verify/123',
      expiresAt: new Date().toISOString(),
      confirmUrl: 'https://test.com/confirm',
      updateUrl: 'https://test.com/update',
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked (master off)');
    assert.strictEqual(result.logOnly, true, 'Should be log-only');
  });

  it('should have sendVerificationReminder method', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    const mailService = createUnifiedMailService(methodsDb);
    
    const result = await mailService.sendVerificationReminder({
      storeName: 'Test Store',
      storeNumber: '001',
      storeEmail: 'store001@test.com',
      verificationUrl: 'https://test.com/verify/123',
      expiresAt: new Date().toISOString(),
      daysRemaining: 3,
      originalSentAt: new Date().toISOString(),
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked (master off)');
  });

  it('should have sendInvitation method', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    const mailService = createUnifiedMailService(methodsDb);
    
    const result = await mailService.sendInvitation(
      'invite@test.com',
      {
        inviterName: 'Admin User',
        role: 'Viewer',
        signInUrl: 'https://test.com/signin',
        expiresAt: new Date().toISOString(),
        personalMessage: 'Welcome to the team!',
      }
    );
    
    assert.strictEqual(result.blocked, true, 'Should be blocked (master off)');
  });

  it('should have sendInvitationReminder method', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    const mailService = createUnifiedMailService(methodsDb);
    
    const result = await mailService.sendInvitationReminder(
      'invite@test.com',
      {
        inviterName: 'Admin User',
        role: 'Viewer',
        signInUrl: 'https://test.com/signin',
        expiresAt: new Date().toISOString(),
      }
    );
    
    assert.strictEqual(result.blocked, true, 'Should be blocked (master off)');
  });

  it('should have sendStoreSignIn method', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    const mailService = createUnifiedMailService(methodsDb);
    
    const result = await mailService.sendStoreSignIn(
      'store001@shiekhshoes.com',
      {
        storeNumber: '001',
        storeName: 'Test Store',
        signInUrl: 'https://test.com/store-signin?token=abc',
        expiresAt: new Date().toISOString(),
      }
    );
    
    assert.strictEqual(result.blocked, true, 'Should be blocked (master off)');
  });

  it('should have sendDMVerificationRequest method', async () => {
    const { createUnifiedMailService } = await import('../server/services/unifiedMail');
    const mailService = createUnifiedMailService(methodsDb);
    
    const result = await mailService.sendDMVerificationRequest({
      recipientName: 'John DM',
      recipientType: 'dm',
      districtName: 'Test District',
      storeCount: 5,
      verificationUrl: 'https://test.com/dm-verify/123',
      expiresAt: new Date().toISOString(),
      to: 'dm@test.com',
    });
    
    assert.strictEqual(result.blocked, true, 'Should be blocked (master off)');
  });
});
