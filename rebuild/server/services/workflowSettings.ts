import type { Firestore } from 'firebase-admin/firestore';

export interface WorkflowRules {
  verificationCycleDays: number;
  requestExpiryDays: number;
  reminderLeadDays: number[];
  maxReminders: number;
  minReminderGapHours: number;
  dmEscalationDays: number;
  dmExpiryDays: number;
  invitationExpiryDays: number;
  storeOneClickLinkDays: number;
  signInLinkHours: number;
  storeSessionHours: number;
  correctionExpiryDays: number;
  hoursWrongDmTaskEnabled: boolean;
  hoursWrongDmTaskDueDays: number;
  storeHoursNeedApproval: boolean;
  reminderSendTime: string;
  dmEscalationEnabled: boolean;
}

export interface WorkflowRulesDocument extends WorkflowRules {
  updatedAt: string;
  updatedBy: string;
  updatedByEmail: string;
}

export const DEFAULT_WORKFLOW_RULES: WorkflowRules = {
  verificationCycleDays: 90,
  requestExpiryDays: 7,
  reminderLeadDays: [3, 1],
  maxReminders: 3,
  minReminderGapHours: 20,
  dmEscalationDays: 14,
  dmExpiryDays: 14,
  invitationExpiryDays: 7,
  storeOneClickLinkDays: 7,
  signInLinkHours: 24,
  storeSessionHours: 12,
  correctionExpiryDays: 30,
  hoursWrongDmTaskEnabled: true,
  hoursWrongDmTaskDueDays: 3,
  storeHoursNeedApproval: true,
  reminderSendTime: '09:00',
  dmEscalationEnabled: true,
};

// Item #6: maxReminders 0 = no limit with safety cap of 50
export const MAX_REMINDERS_SAFETY_CAP = 50;

export const WORKFLOW_RULES_RANGES: Record<keyof WorkflowRules, { min?: number; max?: number; type: 'number' | 'boolean' | 'array' | 'time' }> = {
  verificationCycleDays: { min: 30, max: 365, type: 'number' },
  requestExpiryDays: { min: 1, max: 30, type: 'number' },
  reminderLeadDays: { min: 1, max: 14, type: 'array' },
  maxReminders: { min: 0, max: MAX_REMINDERS_SAFETY_CAP, type: 'number' },  // 0 = no limit (up to safety cap)
  minReminderGapHours: { min: 1, max: 72, type: 'number' },
  dmEscalationDays: { min: 1, max: 60, type: 'number' },
  dmExpiryDays: { min: 1, max: 60, type: 'number' },
  invitationExpiryDays: { min: 1, max: 30, type: 'number' },
  storeOneClickLinkDays: { min: 1, max: 30, type: 'number' },
  signInLinkHours: { min: 1, max: 168, type: 'number' },
  storeSessionHours: { min: 1, max: 168, type: 'number' },
  correctionExpiryDays: { min: 1, max: 90, type: 'number' },
  hoursWrongDmTaskEnabled: { type: 'boolean' },
  hoursWrongDmTaskDueDays: { min: 1, max: 14, type: 'number' },
  storeHoursNeedApproval: { type: 'boolean' },
  reminderSendTime: { type: 'time' },
  dmEscalationEnabled: { type: 'boolean' },
};

export interface SettingsChangeAuditEntry {
  userId: string;
  userEmail: string;
  userRole: string;
  settingsType: 'workflowRules' | 'emailSettings';
  field: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: string;
}

let workflowRulesCache: WorkflowRules | null = null;
let workflowRulesCacheTime = 0;
const CACHE_TTL_MS = 60000;

export function validateWorkflowRule<K extends keyof WorkflowRules>(
  field: K,
  value: unknown
): { valid: boolean; error?: string } {
  const range = WORKFLOW_RULES_RANGES[field];
  
  if (range.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { valid: false, error: `${field} must be a boolean` };
    }
    return { valid: true };
  }
  
  if (range.type === 'time') {
    if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
      return { valid: false, error: `${field} must be in HH:MM format` };
    }
    const [hours, minutes] = value.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { valid: false, error: `${field} must be a valid time` };
    }
    return { valid: true };
  }
  
  if (range.type === 'array') {
    if (!Array.isArray(value)) {
      return { valid: false, error: `${field} must be an array` };
    }
    for (const item of value) {
      if (typeof item !== 'number') {
        return { valid: false, error: `${field} array must contain numbers` };
      }
      if (range.min !== undefined && item < range.min) {
        return { valid: false, error: `${field} values must be at least ${range.min}` };
      }
      if (range.max !== undefined && item > range.max) {
        return { valid: false, error: `${field} values must be at most ${range.max}` };
      }
    }
    return { valid: true };
  }
  
  if (typeof value !== 'number') {
    return { valid: false, error: `${field} must be a number` };
  }
  if (range.min !== undefined && value < range.min) {
    return { valid: false, error: `${field} must be at least ${range.min}` };
  }
  if (range.max !== undefined && value > range.max) {
    return { valid: false, error: `${field} must be at most ${range.max}` };
  }
  return { valid: true };
}

export async function getWorkflowRules(db: Firestore): Promise<WorkflowRules> {
  const now = Date.now();
  if (workflowRulesCache && now - workflowRulesCacheTime < CACHE_TTL_MS) {
    return workflowRulesCache;
  }
  
  const doc = await db.collection('settings').doc('workflowRules').get();
  if (!doc.exists) {
    workflowRulesCache = { ...DEFAULT_WORKFLOW_RULES };
    workflowRulesCacheTime = now;
    return workflowRulesCache;
  }
  
  const data = doc.data() as Partial<WorkflowRulesDocument>;
  workflowRulesCache = {
    verificationCycleDays: data.verificationCycleDays ?? DEFAULT_WORKFLOW_RULES.verificationCycleDays,
    requestExpiryDays: data.requestExpiryDays ?? DEFAULT_WORKFLOW_RULES.requestExpiryDays,
    reminderLeadDays: data.reminderLeadDays ?? DEFAULT_WORKFLOW_RULES.reminderLeadDays,
    maxReminders: data.maxReminders ?? DEFAULT_WORKFLOW_RULES.maxReminders,
    minReminderGapHours: data.minReminderGapHours ?? DEFAULT_WORKFLOW_RULES.minReminderGapHours,
    dmEscalationDays: data.dmEscalationDays ?? DEFAULT_WORKFLOW_RULES.dmEscalationDays,
    dmExpiryDays: data.dmExpiryDays ?? DEFAULT_WORKFLOW_RULES.dmExpiryDays,
    invitationExpiryDays: data.invitationExpiryDays ?? DEFAULT_WORKFLOW_RULES.invitationExpiryDays,
    storeOneClickLinkDays: data.storeOneClickLinkDays ?? DEFAULT_WORKFLOW_RULES.storeOneClickLinkDays,
    signInLinkHours: data.signInLinkHours ?? DEFAULT_WORKFLOW_RULES.signInLinkHours,
    storeSessionHours: data.storeSessionHours ?? DEFAULT_WORKFLOW_RULES.storeSessionHours,
    correctionExpiryDays: data.correctionExpiryDays ?? DEFAULT_WORKFLOW_RULES.correctionExpiryDays,
    hoursWrongDmTaskEnabled: data.hoursWrongDmTaskEnabled ?? DEFAULT_WORKFLOW_RULES.hoursWrongDmTaskEnabled,
    hoursWrongDmTaskDueDays: data.hoursWrongDmTaskDueDays ?? DEFAULT_WORKFLOW_RULES.hoursWrongDmTaskDueDays,
    storeHoursNeedApproval: data.storeHoursNeedApproval ?? DEFAULT_WORKFLOW_RULES.storeHoursNeedApproval,
    reminderSendTime: data.reminderSendTime ?? DEFAULT_WORKFLOW_RULES.reminderSendTime,
    dmEscalationEnabled: data.dmEscalationEnabled ?? DEFAULT_WORKFLOW_RULES.dmEscalationEnabled,
  };
  workflowRulesCacheTime = now;
  return workflowRulesCache;
}

export async function updateWorkflowRule<K extends keyof WorkflowRules>(
  db: Firestore,
  field: K,
  newValue: WorkflowRules[K],
  userId: string,
  userEmail: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  const validation = validateWorkflowRule(field, newValue);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }
  
  const currentRules = await getWorkflowRules(db);
  const oldValue = currentRules[field];
  
  if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
    return { success: true };
  }
  
  const now = new Date().toISOString();
  const docRef = db.collection('settings').doc('workflowRules');
  
  await docRef.set({
    [field]: newValue,
    updatedAt: now,
    updatedBy: userId,
    updatedByEmail: userEmail,
  }, { merge: true });
  
  await logSettingsChange(db, {
    userId,
    userEmail,
    userRole,
    settingsType: 'workflowRules',
    field,
    oldValue,
    newValue,
    timestamp: now,
  });
  
  workflowRulesCache = null;
  workflowRulesCacheTime = 0;
  
  return { success: true };
}

export async function resetWorkflowRule<K extends keyof WorkflowRules>(
  db: Firestore,
  field: K,
  userId: string,
  userEmail: string,
  userRole: string
): Promise<{ success: boolean; error?: string }> {
  const defaultValue = DEFAULT_WORKFLOW_RULES[field];
  return updateWorkflowRule(db, field, defaultValue, userId, userEmail, userRole);
}

export async function logSettingsChange(
  db: Firestore,
  entry: SettingsChangeAuditEntry
): Promise<void> {
  await db.collection('auditLog').add({
    ...entry,
    action: 'update',
    entityType: 'settings',
    entityId: `${entry.settingsType}/${entry.field}`,
    entityName: `${entry.settingsType}.${entry.field}`,
    changes: [{
      field: entry.field,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
    }],
  });
}

export async function getSettingsChangeHistory(
  db: Firestore,
  settingsType: 'workflowRules' | 'emailSettings',
  limit = 50
): Promise<SettingsChangeAuditEntry[]> {
  const snapshot = await db.collection('auditLog')
    .where('entityType', '==', 'settings')
    .where('settingsType', '==', settingsType)
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();
  
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      userId: data.userId,
      userEmail: data.userEmail,
      userRole: data.userRole,
      settingsType: data.settingsType,
      field: data.field,
      oldValue: data.oldValue,
      newValue: data.newValue,
      timestamp: data.timestamp,
    };
  });
}

export function clearWorkflowRulesCache(): void {
  workflowRulesCache = null;
  workflowRulesCacheTime = 0;
}

export function getWorkflowRulesRanges(): typeof WORKFLOW_RULES_RANGES {
  return WORKFLOW_RULES_RANGES;
}

export function getDefaultWorkflowRules(): WorkflowRules {
  return { ...DEFAULT_WORKFLOW_RULES };
}
