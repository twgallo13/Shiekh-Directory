import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const testRunId = `workflow-settings-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('Workflow Settings Service', () => {
  let app: App;
  let db: Firestore;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
    app = initializeApp({ projectId: 'test-project' }, `test-app-workflow-settings-${testRunId}`);
    db = getFirestore(app);
    
    try {
      await db.collection('settings').doc('workflowRules').delete();
    } catch {
      // Ignore if doc doesn't exist
    }
  });

  after(async () => {
    if (app) await deleteApp(app);
  });

  describe('DEFAULT_WORKFLOW_RULES', () => {
    it('should have all required fields with correct defaults', async () => {
      const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
      
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.verificationCycleDays, 90, 'verificationCycleDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.requestExpiryDays, 7, 'requestExpiryDays');
      assert.deepStrictEqual(DEFAULT_WORKFLOW_RULES.reminderLeadDays, [3, 1], 'reminderLeadDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.maxReminders, 3, 'maxReminders');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.minReminderGapHours, 20, 'minReminderGapHours');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.dmEscalationDays, 14, 'dmEscalationDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.dmExpiryDays, 14, 'dmExpiryDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.invitationExpiryDays, 7, 'invitationExpiryDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.storeOneClickLinkDays, 7, 'storeOneClickLinkDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.signInLinkHours, 24, 'signInLinkHours');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.storeSessionHours, 12, 'storeSessionHours');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.correctionExpiryDays, 30, 'correctionExpiryDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.hoursWrongDmTaskEnabled, true, 'hoursWrongDmTaskEnabled');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.hoursWrongDmTaskDueDays, 3, 'hoursWrongDmTaskDueDays');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.storeHoursNeedApproval, true, 'storeHoursNeedApproval');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.reminderSendTime, '09:00', 'reminderSendTime');
      assert.strictEqual(DEFAULT_WORKFLOW_RULES.dmEscalationEnabled, true, 'dmEscalationEnabled');
    });
  });

  describe('validateWorkflowRule', () => {
    it('should validate number ranges correctly', async () => {
      const { validateWorkflowRule } = await import('../server/services/workflowSettings');
      
      assert.strictEqual(validateWorkflowRule('verificationCycleDays', 90).valid, true);
      assert.strictEqual(validateWorkflowRule('verificationCycleDays', 30).valid, true);
      assert.strictEqual(validateWorkflowRule('verificationCycleDays', 365).valid, true);
      assert.strictEqual(validateWorkflowRule('verificationCycleDays', 29).valid, false);
      assert.strictEqual(validateWorkflowRule('verificationCycleDays', 366).valid, false);
      assert.strictEqual(validateWorkflowRule('verificationCycleDays', 'invalid' as unknown as number).valid, false);
    });

    it('should validate boolean fields correctly', async () => {
      const { validateWorkflowRule } = await import('../server/services/workflowSettings');
      
      assert.strictEqual(validateWorkflowRule('hoursWrongDmTaskEnabled', true).valid, true);
      assert.strictEqual(validateWorkflowRule('hoursWrongDmTaskEnabled', false).valid, true);
      assert.strictEqual(validateWorkflowRule('hoursWrongDmTaskEnabled', 'true' as unknown as boolean).valid, false);
      assert.strictEqual(validateWorkflowRule('hoursWrongDmTaskEnabled', 1 as unknown as boolean).valid, false);
    });

    it('should validate array fields correctly', async () => {
      const { validateWorkflowRule } = await import('../server/services/workflowSettings');
      
      assert.strictEqual(validateWorkflowRule('reminderLeadDays', [3, 1]).valid, true);
      assert.strictEqual(validateWorkflowRule('reminderLeadDays', [7, 5, 3, 1]).valid, true);
      assert.strictEqual(validateWorkflowRule('reminderLeadDays', [14]).valid, true);
      assert.strictEqual(validateWorkflowRule('reminderLeadDays', [0]).valid, false);
      assert.strictEqual(validateWorkflowRule('reminderLeadDays', [15]).valid, false);
      assert.strictEqual(validateWorkflowRule('reminderLeadDays', 'invalid' as unknown as number[]).valid, false);
    });

    it('should validate time fields correctly', async () => {
      const { validateWorkflowRule } = await import('../server/services/workflowSettings');
      
      assert.strictEqual(validateWorkflowRule('reminderSendTime', '09:00').valid, true);
      assert.strictEqual(validateWorkflowRule('reminderSendTime', '00:00').valid, true);
      assert.strictEqual(validateWorkflowRule('reminderSendTime', '23:59').valid, true);
      assert.strictEqual(validateWorkflowRule('reminderSendTime', '24:00').valid, false);
      assert.strictEqual(validateWorkflowRule('reminderSendTime', '9:00').valid, false);
      assert.strictEqual(validateWorkflowRule('reminderSendTime', 'invalid').valid, false);
    });
  });

  describe('getWorkflowRules', () => {
    it('should return defaults when no document exists', async () => {
      const { getWorkflowRules, DEFAULT_WORKFLOW_RULES, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      await db.collection('settings').doc('workflowRules').delete().catch(() => {});
      
      const rules = await getWorkflowRules(db);
      assert.deepStrictEqual(rules, DEFAULT_WORKFLOW_RULES);
    });

    it('should merge partial document with defaults', async () => {
      const { getWorkflowRules, DEFAULT_WORKFLOW_RULES, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      await db.collection('settings').doc('workflowRules').set({
        verificationCycleDays: 120,
        updatedAt: new Date().toISOString(),
      });
      
      const rules = await getWorkflowRules(db);
      assert.strictEqual(rules.verificationCycleDays, 120);
      assert.strictEqual(rules.requestExpiryDays, DEFAULT_WORKFLOW_RULES.requestExpiryDays);
      assert.deepStrictEqual(rules.reminderLeadDays, DEFAULT_WORKFLOW_RULES.reminderLeadDays);
    });

    it('should use cache on subsequent calls', async () => {
      const { getWorkflowRules, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      await db.collection('settings').doc('workflowRules').set({
        verificationCycleDays: 100,
        updatedAt: new Date().toISOString(),
      });
      
      const rules1 = await getWorkflowRules(db);
      assert.strictEqual(rules1.verificationCycleDays, 100);
      
      await db.collection('settings').doc('workflowRules').update({
        verificationCycleDays: 150,
      });
      
      const rules2 = await getWorkflowRules(db);
      assert.strictEqual(rules2.verificationCycleDays, 100, 'Should use cached value');
      
      clearWorkflowRulesCache();
      const rules3 = await getWorkflowRules(db);
      assert.strictEqual(rules3.verificationCycleDays, 150, 'Should fetch fresh after cache clear');
    });
  });

  describe('updateWorkflowRule', () => {
    it('should update a rule and log to audit', async () => {
      const { updateWorkflowRule, getWorkflowRules, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      
      const result = await updateWorkflowRule(
        db,
        'verificationCycleDays',
        180,
        'test-user-id',
        'test@example.com',
        'Admin'
      );
      
      assert.strictEqual(result.success, true);
      
      clearWorkflowRulesCache();
      const rules = await getWorkflowRules(db);
      assert.strictEqual(rules.verificationCycleDays, 180);
      
      const auditDocs = await db.collection('auditLog')
        .where('entityType', '==', 'settings')
        .where('field', '==', 'verificationCycleDays')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
      
      assert.strictEqual(auditDocs.size, 1);
      const auditEntry = auditDocs.docs[0].data();
      assert.strictEqual(auditEntry.userId, 'test-user-id');
      assert.strictEqual(auditEntry.userEmail, 'test@example.com');
      assert.strictEqual(auditEntry.settingsType, 'workflowRules');
      assert.strictEqual(auditEntry.newValue, 180);
    });

    it('should reject invalid values', async () => {
      const { updateWorkflowRule } = await import('../server/services/workflowSettings');
      
      const result = await updateWorkflowRule(
        db,
        'verificationCycleDays',
        400,
        'test-user-id',
        'test@example.com',
        'Admin'
      );
      
      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('at most 365'));
    });

    it('should skip update if value unchanged', async () => {
      const { updateWorkflowRule, getWorkflowRules, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      const rules = await getWorkflowRules(db);
      const currentValue = rules.maxReminders;
      
      const beforeAudit = await db.collection('auditLog')
        .where('field', '==', 'maxReminders')
        .get();
      const beforeCount = beforeAudit.size;
      
      const result = await updateWorkflowRule(
        db,
        'maxReminders',
        currentValue,
        'test-user-id',
        'test@example.com',
        'Admin'
      );
      
      assert.strictEqual(result.success, true);
      
      const afterAudit = await db.collection('auditLog')
        .where('field', '==', 'maxReminders')
        .get();
      assert.strictEqual(afterAudit.size, beforeCount, 'Should not create audit entry for unchanged value');
    });
  });

  describe('resetWorkflowRule', () => {
    it('should reset a rule to its default value', async () => {
      const { updateWorkflowRule, resetWorkflowRule, getWorkflowRules, DEFAULT_WORKFLOW_RULES, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      await updateWorkflowRule(db, 'dmExpiryDays', 21, 'test-user', 'test@example.com', 'Admin');
      
      clearWorkflowRulesCache();
      let rules = await getWorkflowRules(db);
      assert.strictEqual(rules.dmExpiryDays, 21);
      
      const result = await resetWorkflowRule(db, 'dmExpiryDays', 'test-user', 'test@example.com', 'Admin');
      assert.strictEqual(result.success, true);
      
      clearWorkflowRulesCache();
      rules = await getWorkflowRules(db);
      assert.strictEqual(rules.dmExpiryDays, DEFAULT_WORKFLOW_RULES.dmExpiryDays);
    });
  });

  describe('getSettingsChangeHistory', () => {
    it('should return change history in descending order', async () => {
      const { updateWorkflowRule, getSettingsChangeHistory, clearWorkflowRulesCache } = await import('../server/services/workflowSettings');
      
      clearWorkflowRulesCache();
      
      await updateWorkflowRule(db, 'maxReminders', 2, 'user1', 'user1@example.com', 'Admin');
      await new Promise(r => setTimeout(r, 10));
      await updateWorkflowRule(db, 'maxReminders', 4, 'user2', 'user2@example.com', 'Admin');
      
      const history = await getSettingsChangeHistory(db, 'workflowRules', 10);
      
      assert.ok(history.length >= 2);
      
      const maxRemindersChanges = history.filter(h => h.field === 'maxReminders');
      assert.ok(maxRemindersChanges.length >= 2);
      assert.strictEqual(maxRemindersChanges[0].newValue, 4);
      assert.strictEqual(maxRemindersChanges[1].newValue, 2);
    });
  });
});

describe('Workflow Settings - Default Value Compatibility', () => {
  it('should match STALE_THRESHOLD_DAYS default', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.verificationCycleDays, 90, 'Should match STALE_THRESHOLD_DAYS = 90');
  });

  it('should match DEFAULT_DM_OFFSET_DAYS default', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.dmEscalationDays, 14, 'Should match DEFAULT_DM_OFFSET_DAYS = 14');
  });

  it('should match TOKEN_EXPIRY_HOURS default', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.signInLinkHours, 24, 'Should match TOKEN_EXPIRY_HOURS = 24');
  });

  it('should match SESSION_EXPIRY_HOURS default', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.storeSessionHours, 12, 'Should match SESSION_EXPIRY_HOURS = 12');
  });

  it('should match verification request expiry (7 days)', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.requestExpiryDays, 7, 'Should match 7 * 24 * 60 * 60 * 1000 calculation');
  });

  it('should match reminder thresholds [3, 1]', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.deepStrictEqual(DEFAULT_WORKFLOW_RULES.reminderLeadDays, [3, 1], 'Should match reminderThresholds = [3, 1]');
  });

  it('should match INVITATION_EXPIRY_DAYS default', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.invitationExpiryDays, 7, 'Should match INVITATION_EXPIRY_DAYS = 7');
  });

  it('should match store one-click link expiry (7 days)', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.storeOneClickLinkDays, 7, 'Should match 7 * 24 * 60 * 60 * 1000 at storeAuth.ts:507');
  });

  it('should match minimum reminder gap (20 hours)', async () => {
    const { DEFAULT_WORKFLOW_RULES } = await import('../server/services/workflowSettings');
    assert.strictEqual(DEFAULT_WORKFLOW_RULES.minReminderGapHours, 20, 'Should match hoursSinceLastReminder < 20 check');
  });
});
