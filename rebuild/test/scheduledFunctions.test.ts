/**
 * Tests for scheduled functions (fixes 1-6, 10)
 * - DM escalation job (fix 1)
 * - expirePendingCorrections export (fix 2)
 * - Correction expiry uses expiresAt (fix 3)
 * - Reminder job reads email settings (fix 4)
 * - maxReminders = 0 means no reminders (fix 5)
 * - dmEscalationDays is the only DM timing setting (fix 6)
 * - No double audit in workflow rules (fix 10)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Scheduled Functions Exports', () => {
  it('functions.ts exports all scheduled jobs', () => {
    const functionsFile = readFileSync(
      join(__dirname, '../server/functions.ts'),
      'utf-8'
    );
    
    assert.ok(
      functionsFile.includes('export { sendVerificationReminders'),
      'sendVerificationReminders should be exported'
    );
    assert.ok(
      functionsFile.includes('expireOldVerificationRequests'),
      'expireOldVerificationRequests should be exported'
    );
    assert.ok(
      functionsFile.includes('expirePendingCorrections'),
      'expirePendingCorrections should be exported (fix 2, kept for compat after rename to flagOverdueCorrections)'
    );
    assert.ok(
      functionsFile.includes('export { escalateToDM }'),
      'escalateToDM should be exported (fix 1)'
    );
    assert.ok(
      functionsFile.includes('export const api'),
      'api should be exported'
    );
  });
});

describe('Workflow Rules Settings', () => {
  it('dmEscalationDays exists and dmOffsetDays does not (fix 6)', async () => {
    const { DEFAULT_WORKFLOW_RULES, WORKFLOW_RULES_RANGES } = await import('../server/services/workflowSettings');
    
    assert.ok('dmEscalationDays' in DEFAULT_WORKFLOW_RULES, 'dmEscalationDays should exist');
    assert.ok('dmEscalationEnabled' in DEFAULT_WORKFLOW_RULES, 'dmEscalationEnabled should exist');
    assert.ok(!('dmOffsetDays' in DEFAULT_WORKFLOW_RULES), 'dmOffsetDays should not exist (removed in fix 6)');
    assert.ok('dmEscalationDays' in WORKFLOW_RULES_RANGES, 'dmEscalationDays should have a range');
    assert.ok(!('dmOffsetDays' in WORKFLOW_RULES_RANGES), 'dmOffsetDays should not have a range');
  });

  it('maxReminders min is 0 (fix 5)', async () => {
    const { WORKFLOW_RULES_RANGES } = await import('../server/services/workflowSettings');
    
    assert.strictEqual(WORKFLOW_RULES_RANGES.maxReminders.min, 0, 'maxReminders min should be 0');
  });
});

describe('Correction Expiry', () => {
  it('corrections route calculates expiresAt at creation (fix 3)', () => {
    const correctionsRoute = readFileSync(
      join(__dirname, '../server/routes/corrections.ts'),
      'utf-8'
    );
    
    assert.ok(
      correctionsRoute.includes('expiresAt'),
      'corrections route should reference expiresAt'
    );
    assert.ok(
      correctionsRoute.includes('correctionExpiryDays'),
      'corrections route should use correctionExpiryDays from workflow rules'
    );
  });

  it('scheduledCorrections queries by expiresAt (fix 3)', () => {
    const scheduledCorrections = readFileSync(
      join(__dirname, '../server/scheduledCorrections.ts'),
      'utf-8'
    );
    
    assert.ok(
      scheduledCorrections.includes(".where('expiresAt', '<'"),
      'scheduledCorrections should query by expiresAt < now'
    );
    assert.ok(
      !scheduledCorrections.includes('submittedAt') || !scheduledCorrections.includes('correctionExpiryDays'),
      'scheduledCorrections should not calculate expiry from submittedAt at query time'
    );
  });
});

describe('Reminder Job', () => {
  it('scheduledReminders reads email settings (fix 4)', () => {
    const scheduledReminders = readFileSync(
      join(__dirname, '../server/scheduledReminders.ts'),
      'utf-8'
    );
    
    assert.ok(
      scheduledReminders.includes('getEmailSettings'),
      'scheduledReminders should import getEmailSettings'
    );
    assert.ok(
      scheduledReminders.includes('sendDays'),
      'scheduledReminders should check sendDays from email settings'
    );
    assert.ok(
      scheduledReminders.includes('quietHours'),
      'scheduledReminders should check quiet hours'
    );
    assert.ok(
      scheduledReminders.includes('appBaseUrl'),
      'scheduledReminders should use appBaseUrl from settings (fix 17)'
    );
  });

  it('scheduledReminders handles maxReminders = 0 as no limit (item 6)', () => {
    const scheduledReminders = readFileSync(
      join(__dirname, '../server/scheduledReminders.ts'),
      'utf-8'
    );
    
    // Item #6: maxReminders = 0 now means "no limit" (with safety cap)
    // The check is maxReminders > 0 && currentCount >= maxReminders
    assert.ok(
      scheduledReminders.includes('maxReminders > 0'),
      'scheduledReminders should check maxReminders > 0 to skip when limit is set'
    );
    assert.ok(
      scheduledReminders.includes('SAFETY_CAP'),
      'scheduledReminders should have SAFETY_CAP to prevent runaway reminders'
    );
  });
});

describe('DM Escalation Job', () => {
  it('scheduledDMEscalation uses dmEscalationDays and dmEscalationEnabled (fix 1)', () => {
    const dmEscalation = readFileSync(
      join(__dirname, '../server/scheduledDMEscalation.ts'),
      'utf-8'
    );
    
    assert.ok(
      dmEscalation.includes('dmEscalationEnabled'),
      'DM escalation job should check dmEscalationEnabled'
    );
    assert.ok(
      dmEscalation.includes('dmEscalationDays'),
      'DM escalation job should use dmEscalationDays'
    );
    assert.ok(
      !dmEscalation.includes('dmOffsetDays'),
      'DM escalation job should not use dmOffsetDays'
    );
  });
});

describe('Workflow Rules Route', () => {
  it('workflowRules route does not double-audit (fix 10)', () => {
    const workflowRulesSource = readFileSync(
      join(__dirname, '../server/routes/workflowRules.ts'),
      'utf-8'
    );
    
    const logAuditCalls = (workflowRulesSource.match(/await logAudit\(/g) || []).length;
    const auditInterfaceCount = (workflowRulesSource.match(/interface AuditLogEntry/g) || []).length;
    
    assert.strictEqual(
      logAuditCalls,
      0,
      `workflowRules route should not call logAudit (found ${logAuditCalls} calls, service handles auditing)`
    );
    assert.strictEqual(
      auditInterfaceCount,
      0,
      'workflowRules route should not define AuditLogEntry interface (removed in fix 10)'
    );
  });
});
