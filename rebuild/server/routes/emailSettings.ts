import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { createTransport } from 'nodemailer';
import type { AuthUser } from '../../src/types';
import { encryptPassword, decryptPassword, canEncryptSmtpPassword, isEncryptionKeyConfigured, DEFAULT_TEMPLATES } from '../services/unifiedMail';

interface AuditLogEntry {
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  locationId?: string;
  changes?: { field: string; oldValue?: unknown; newValue?: unknown }[];
}

async function logAudit(
  db: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
  });
}

export const EMAIL_TYPES = [
  {
    id: 'verification_request',
    name: 'Hours Verification Request',
    description: 'Asks stores to confirm their operating hours are correct',
    placeholders: ['storeName', 'storeNumber', 'storeEmail', 'storeType', 'storeTypeHtml', 'storeTypeText', 'verificationUrl', 'expiresAt', 'expiresFormatted', 'hoursHtml', 'hoursText', 'wayfindingHtml', 'wayfindingText', 'confirmUrl', 'updateUrl', 'oneClickButtonsHtml', 'oneClickButtonsText'],
    category: 'verification',
    audience: 'stores',
    audienceLabel: 'Store Contacts',
    purpose: 'Request hours confirmation',
  },
  {
    id: 'verification_reminder',
    name: 'Hours Verification Reminder',
    description: 'Follow-up for stores that haven\'t responded yet',
    placeholders: ['storeName', 'storeNumber', 'storeEmail', 'verificationUrl', 'expiresAt', 'expiresFormatted', 'daysRemaining', 'daysRemainingLabel', 'originalSentAt', 'originalSentFormatted', 'urgencyClass', 'urgencyText'],
    category: 'verification',
    audience: 'stores',
    audienceLabel: 'Store Contacts',
    purpose: 'Remind about pending request',
  },
  {
    id: 'verification_confirmation',
    name: 'Hours Verified',
    description: 'Thank-you confirmation after hours are verified',
    placeholders: ['storeName', 'storeNumber', 'storeEmail', 'verifiedAt', 'verifiedFormatted'],
    category: 'verification',
    audience: 'stores',
    audienceLabel: 'Store Contacts',
    purpose: 'Confirm hours received',
  },
  {
    id: 'store_signin',
    name: 'Store Sign-In Link',
    description: 'Passwordless link for store contacts to sign in',
    placeholders: ['storeNumber', 'storeName', 'storeEmail', 'signInUrl', 'expiresAt', 'expiresFormatted'],
    category: 'authentication',
    audience: 'stores',
    audienceLabel: 'Store Contacts',
    purpose: 'Enable secure sign-in',
  },
  {
    id: 'dm_verification_request',
    name: 'District Roster Review',
    description: 'Asks District/Regional Managers to review their store roster',
    placeholders: ['recipientName', 'recipientType', 'recipientLabel', 'contextNote', 'districtName', 'storeCount', 'verificationUrl', 'expiresAt', 'expiresFormatted'],
    category: 'verification',
    audience: 'leaders',
    audienceLabel: 'District & Regional Leaders',
    purpose: 'Request roster review',
  },
  {
    id: 'invitation',
    name: 'Team Invitation',
    description: 'Invites new team members to join the directory',
    placeholders: ['inviterName', 'role', 'inviteUrl', 'signInUrl', 'expiresAt', 'personalMessage'],
    category: 'admin',
    audience: 'admins',
    audienceLabel: 'Team Members',
    purpose: 'Invite new user',
  },
  {
    id: 'invitation_reminder',
    name: 'Invitation Reminder',
    description: 'Nudge for pending team invitations',
    placeholders: ['inviterName', 'role', 'inviteUrl', 'signInUrl', 'expiresAt'],
    category: 'admin',
    audience: 'admins',
    audienceLabel: 'Team Members',
    purpose: 'Remind about invitation',
  },
] as const;

export type EmailTypeId = typeof EMAIL_TYPES[number]['id'];

export interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface EmailTypeSettings {
  enabled: boolean;
  template?: EmailTemplate;
  templateHistory?: {
    version: number;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    changedAt: string;
    changedBy: string;
    changedByEmail: string;
  }[];
}

export interface EmailSettings {
  masterEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
  updatedByEmail: string;
  
  typeSettings: Record<EmailTypeId, EmailTypeSettings>;
  
  sender: {
    fromName: string;
    fromAddress: string;
    replyTo: string;
    footerText: string;
  };
  
  smtp: {
    host: string;
    port: number;
    user: string;
    secure: boolean;
    configured: boolean;
  };
  
  schedule: {
    quietHoursStart: string;
    quietHoursEnd: string;
    timezone: string;
    sendDays: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[];
  };
  
  appBaseUrl: string;
}

const DEFAULT_SETTINGS: EmailSettings = {
  masterEnabled: false,
  updatedAt: new Date().toISOString(),
  updatedBy: 'system',
  updatedByEmail: 'system',
  
  typeSettings: {
    verification_request: { enabled: true },
    verification_reminder: { enabled: true },
    verification_confirmation: { enabled: true },
    dm_verification_request: { enabled: true },
    invitation: { enabled: true },
    invitation_reminder: { enabled: true },
    store_signin: { enabled: true },
  },
  
  sender: {
    fromName: 'Shiekh Store Directory',
    fromAddress: 'noreply@shiekh.com',
    replyTo: '',
    footerText: '© Shiekh Shoes. All rights reserved.',
  },
  
  smtp: {
    host: '',
    port: 587,
    user: '',
    secure: false,
    configured: false,
  },
  
  schedule: {
    quietHoursStart: '20:00',
    quietHoursEnd: '08:00',
    timezone: 'America/Los_Angeles',
    sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  },
  
  appBaseUrl: 'https://shiekh-directory-v2.web.app',
};

export function createEmailSettingsRouter(db: Firestore): Router {
  const router = Router();
  
  const settingsRef = () => db.collection('settings').doc('email');
  const smtpPasswordRef = () => db.collection('settings').doc('email_smtp_password');
  
  async function getSettings(): Promise<EmailSettings> {
    const doc = await settingsRef().get();
    if (!doc.exists) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...doc.data() } as EmailSettings;
  }
  
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const envCutoverEnabled = process.env.MAIL_CUTOVER_ENABLED === 'true';
      
      // Get 7-day stats for overview
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [recentMailSnap, pendingVerificationsSnap, pendingInvitationsSnap] = await Promise.all([
        db.collection('mailLog')
          .where('sentAt', '>=', sevenDaysAgo)
          .get(),
        db.collection('verificationRequests')
          .where('status', '==', 'pending')
          .get(),
        db.collection('invitations')
          .where('status', '==', 'pending')
          .get(),
      ]);
      
      const recentMail = recentMailSnap.docs.map(d => d.data());
      const stats = {
        last7Days: {
          sent: recentMail.filter(m => m.success === true && !m.blocked).length,
          logged: recentMail.filter(m => m.blocked === true && m.reason?.includes('disabled')).length,
          failed: recentMail.filter(m => m.success === false && !m.blocked && m.error).length,
          suppressed: recentMail.filter(m => m.blocked === true && !m.reason?.includes('disabled')).length,
        },
        pendingRecipients: {
          verifications: pendingVerificationsSnap.size,
          invitations: pendingInvitationsSnap.size,
        },
      };
      
      res.json({
        data: {
          ...settings,
          envCutoverEnabled,
          effectiveEnabled: settings.masterEnabled && envCutoverEnabled,
          encryptionKeyConfigured: isEncryptionKeyConfigured(),
          emailTypes: EMAIL_TYPES,
          defaultTemplates: DEFAULT_TEMPLATES,
          stats,
        },
      });
    } catch (error) {
      console.error('Get email settings error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get email settings', requestId: res.locals.requestId },
      });
    }
  });
  
  router.patch('/master', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'enabled must be a boolean', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const oldValue = settings.masterEnabled;
      
      await settingsRef().set({
        ...settings,
        masterEnabled: enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: 'master',
        entityName: 'Email Master Switch',
        changes: [{ field: 'masterEnabled', oldValue, newValue: enabled }],
      });
      
      res.json({ success: true, masterEnabled: enabled });
    } catch (error) {
      console.error('Update email master switch error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update settings', requestId: res.locals.requestId },
      });
    }
  });
  
  router.patch('/type/:typeId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { typeId } = req.params;
      const emailType = EMAIL_TYPES.find(t => t.id === typeId);
      if (!emailType) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Email type not found', requestId: res.locals.requestId },
        });
      }
      
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'enabled must be a boolean', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const oldValue = settings.typeSettings[typeId as EmailTypeId]?.enabled ?? true;
      
      const updatedTypeSettings = {
        ...settings.typeSettings,
        [typeId]: {
          ...settings.typeSettings[typeId as EmailTypeId],
          enabled,
        },
      };
      
      await settingsRef().set({
        ...settings,
        typeSettings: updatedTypeSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: `type-${typeId}`,
        entityName: `Email Type: ${emailType.name}`,
        changes: [{ field: 'enabled', oldValue, newValue: enabled }],
      });
      
      res.json({ success: true, typeId, enabled });
    } catch (error) {
      console.error('Update email type settings error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update settings', requestId: res.locals.requestId },
      });
    }
  });
  
  router.put('/type/:typeId/template', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }
      
      const { typeId } = req.params;
      const emailType = EMAIL_TYPES.find(t => t.id === typeId);
      if (!emailType) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Email type not found', requestId: res.locals.requestId },
        });
      }
      
      const { subject, bodyHtml, bodyText } = req.body;
      if (!subject || typeof subject !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'subject is required', requestId: res.locals.requestId },
        });
      }
      if (!bodyHtml || typeof bodyHtml !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'bodyHtml is required', requestId: res.locals.requestId },
        });
      }
      if (!bodyText || typeof bodyText !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'bodyText is required', requestId: res.locals.requestId },
        });
      }
      
      const placeholderRegex = /\{\{(\w+)\}\}/g;
      const usedPlaceholders = new Set<string>();
      let match;
      while ((match = placeholderRegex.exec(subject + bodyHtml + bodyText)) !== null) {
        usedPlaceholders.add(match[1]);
      }
      
      const invalidPlaceholders = [...usedPlaceholders].filter(
        p => !(emailType.placeholders as readonly string[]).includes(p)
      );
      if (invalidPlaceholders.length > 0) {
        return res.status(400).json({
          error: {
            code: 'invalid_placeholders',
            message: `Invalid placeholders: ${invalidPlaceholders.join(', ')}. Valid: ${emailType.placeholders.join(', ')}`,
            requestId: res.locals.requestId,
          },
        });
      }
      
      const settings = await getSettings();
      const currentTypeSettings = settings.typeSettings[typeId as EmailTypeId] || { enabled: true };
      const currentTemplate = currentTypeSettings.template;
      const currentHistory = currentTypeSettings.templateHistory || [];
      
      const newVersion = currentHistory.length + 1;
      const newHistoryEntry = {
        version: newVersion,
        subject,
        bodyHtml,
        bodyText,
        changedAt: new Date().toISOString(),
        changedBy: authUser.uid,
        changedByEmail: authUser.email,
      };
      
      const updatedTypeSettings = {
        ...settings.typeSettings,
        [typeId]: {
          ...currentTypeSettings,
          template: { subject, bodyHtml, bodyText },
          templateHistory: [...currentHistory, newHistoryEntry].slice(-20),
        },
      };
      
      await settingsRef().set({
        ...settings,
        typeSettings: updatedTypeSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: `template-${typeId}`,
        entityName: `Email Template: ${emailType.name}`,
        changes: [
          { field: 'subject', oldValue: currentTemplate?.subject, newValue: subject },
          { field: 'version', oldValue: currentHistory.length, newValue: newVersion },
        ],
      });
      
      res.json({ success: true, typeId, version: newVersion });
    } catch (error) {
      console.error('Update email template error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update template', requestId: res.locals.requestId },
      });
    }
  });
  
  router.post('/type/:typeId/template/reset', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }
      
      const { typeId } = req.params;
      const emailType = EMAIL_TYPES.find(t => t.id === typeId);
      if (!emailType) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Email type not found', requestId: res.locals.requestId },
        });
      }
      
      await settingsRef().update({
        [`typeSettings.${typeId}.template`]: FieldValue.delete(),
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: `template-${typeId}`,
        entityName: `Email Template: ${emailType.name}`,
        changes: [{ field: 'template', oldValue: 'custom', newValue: 'default' }],
      });
      
      res.json({ success: true, typeId, reset: true });
    } catch (error) {
      console.error('Reset email template error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to reset template', requestId: res.locals.requestId },
      });
    }
  });
  
  router.post('/type/:typeId/template/restore/:version', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }
      
      const { typeId, version } = req.params;
      const versionNum = parseInt(version, 10);
      
      const emailType = EMAIL_TYPES.find(t => t.id === typeId);
      if (!emailType) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Email type not found', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const currentTypeSettings = settings.typeSettings[typeId as EmailTypeId];
      const history = currentTypeSettings?.templateHistory || [];
      
      const historyEntry = history.find(h => h.version === versionNum);
      if (!historyEntry) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Version not found', requestId: res.locals.requestId },
        });
      }
      
      const newVersion = history.length + 1;
      const newHistoryEntry = {
        version: newVersion,
        subject: historyEntry.subject,
        bodyHtml: historyEntry.bodyHtml,
        bodyText: historyEntry.bodyText,
        changedAt: new Date().toISOString(),
        changedBy: authUser.uid,
        changedByEmail: authUser.email,
      };
      
      const updatedTypeSettings = {
        ...settings.typeSettings,
        [typeId]: {
          ...currentTypeSettings,
          template: {
            subject: historyEntry.subject,
            bodyHtml: historyEntry.bodyHtml,
            bodyText: historyEntry.bodyText,
          },
          templateHistory: [...history, newHistoryEntry].slice(-20),
        },
      };
      
      await settingsRef().set({
        ...settings,
        typeSettings: updatedTypeSettings,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: `template-${typeId}`,
        entityName: `Email Template: ${emailType.name}`,
        changes: [{ field: 'restored_from_version', oldValue: null, newValue: versionNum }],
      });
      
      res.json({ success: true, typeId, restoredFrom: versionNum, newVersion });
    } catch (error) {
      console.error('Restore email template error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to restore template', requestId: res.locals.requestId },
      });
    }
  });
  
  router.put('/sender', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { fromName, fromAddress, replyTo, footerText } = req.body;
      
      if (!fromName || typeof fromName !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'fromName is required', requestId: res.locals.requestId },
        });
      }
      if (!fromAddress || typeof fromAddress !== 'string' || !fromAddress.includes('@')) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Valid fromAddress is required', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const oldSender = settings.sender;
      const newSender = {
        fromName: fromName.trim(),
        fromAddress: fromAddress.trim().toLowerCase(),
        replyTo: (replyTo || '').trim().toLowerCase(),
        footerText: (footerText || '').trim(),
      };
      
      await settingsRef().set({
        ...settings,
        sender: newSender,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      const changes = [];
      if (oldSender.fromName !== newSender.fromName) {
        changes.push({ field: 'fromName', oldValue: oldSender.fromName, newValue: newSender.fromName });
      }
      if (oldSender.fromAddress !== newSender.fromAddress) {
        changes.push({ field: 'fromAddress', oldValue: oldSender.fromAddress, newValue: newSender.fromAddress });
      }
      if (oldSender.replyTo !== newSender.replyTo) {
        changes.push({ field: 'replyTo', oldValue: oldSender.replyTo, newValue: newSender.replyTo });
      }
      if (oldSender.footerText !== newSender.footerText) {
        changes.push({ field: 'footerText', oldValue: oldSender.footerText, newValue: newSender.footerText });
      }
      
      if (changes.length > 0) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'email-settings',
          entityId: 'sender',
          entityName: 'Email Sender Settings',
          changes,
        });
      }
      
      res.json({ success: true, sender: newSender });
    } catch (error) {
      console.error('Update sender settings error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update sender settings', requestId: res.locals.requestId },
      });
    }
  });
  
  router.put('/smtp', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { host, port, user, password, secure } = req.body;
      
      if (!host || typeof host !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'host is required', requestId: res.locals.requestId },
        });
      }
      if (!port || typeof port !== 'number' || port < 1 || port > 65535) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Valid port (1-65535) is required', requestId: res.locals.requestId },
        });
      }
      if (!user || typeof user !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'user is required', requestId: res.locals.requestId },
        });
      }
      if (!password || typeof password !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'password is required', requestId: res.locals.requestId },
        });
      }
      
      const encryptCheck = canEncryptSmtpPassword();
      if (!encryptCheck.ok) {
        return res.status(503).json({
          error: { 
            code: 'encryption_not_configured', 
            message: 'SMTP password encryption is not configured. The SMTP_ENCRYPTION_KEY environment variable must be set.',
            details: encryptCheck.error,
            requestId: res.locals.requestId,
          },
        });
      }
      
      const settings = await getSettings();
      const newSmtp = {
        host: host.trim(),
        port,
        user: user.trim(),
        secure: secure === true || port === 465,
        configured: true,
      };
      
      const encryptedPassword = encryptPassword(password);
      await smtpPasswordRef().set({
        encryptedPassword,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
      });
      
      await settingsRef().set({
        ...settings,
        smtp: newSmtp,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: 'smtp',
        entityName: 'SMTP Configuration',
        changes: [
          { field: 'host', oldValue: settings.smtp.host, newValue: newSmtp.host },
          { field: 'port', oldValue: settings.smtp.port, newValue: newSmtp.port },
          { field: 'user', oldValue: settings.smtp.user, newValue: newSmtp.user },
          { field: 'password', oldValue: '[REDACTED]', newValue: '[REDACTED]' },
        ],
      });
      
      res.json({ success: true, smtp: newSmtp });
    } catch (error) {
      console.error('Update SMTP settings error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update SMTP settings', requestId: res.locals.requestId },
      });
    }
  });
  
  router.post('/smtp/test', async (_req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      if (!settings.smtp.configured) {
        return res.status(400).json({
          error: { code: 'not_configured', message: 'SMTP not configured', requestId: res.locals.requestId },
        });
      }
      
      const passwordDoc = await smtpPasswordRef().get();
      if (!passwordDoc.exists) {
        return res.status(400).json({
          error: { code: 'not_configured', message: 'SMTP password not set', requestId: res.locals.requestId },
        });
      }
      
      const pwdData = passwordDoc.data() as { encryptedPassword?: string; password?: string };
      let password: string;
      try {
        if (pwdData.encryptedPassword) {
          password = decryptPassword(pwdData.encryptedPassword);
        } else if (pwdData.password) {
          password = pwdData.password;
        } else {
          return res.status(400).json({
            error: { code: 'not_configured', message: 'SMTP password not set', requestId: res.locals.requestId },
          });
        }
      } catch {
        return res.status(400).json({
          error: { code: 'decryption_failed', message: 'Failed to decrypt SMTP password', requestId: res.locals.requestId },
        });
      }
      
      const transporter = createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        auth: {
          user: settings.smtp.user,
          pass: password,
        },
        connectionTimeout: 10000,
      });
      
      try {
        await transporter.verify();
        
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'test',
          entityType: 'email-settings',
          entityId: 'smtp',
          entityName: 'SMTP Connection Test',
          changes: [{ field: 'result', newValue: 'success' }],
        });
        
        res.json({ success: true, message: 'SMTP connection successful' });
      } catch (smtpError) {
        const errorMessage = smtpError instanceof Error ? smtpError.message : 'Connection failed';
        
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'test',
          entityType: 'email-settings',
          entityId: 'smtp',
          entityName: 'SMTP Connection Test',
          changes: [{ field: 'result', newValue: `failed: ${errorMessage}` }],
        });
        
        res.status(400).json({
          error: { code: 'connection_failed', message: errorMessage, requestId: res.locals.requestId },
        });
      }
    } catch (error) {
      console.error('SMTP test error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to test SMTP', requestId: res.locals.requestId },
      });
    }
  });
  
  router.put('/schedule', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { quietHoursStart, quietHoursEnd, sendDays } = req.body;
      
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (!timeRegex.test(quietHoursStart) || !timeRegex.test(quietHoursEnd)) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Quiet hours must be in HH:MM format', requestId: res.locals.requestId },
        });
      }
      
      const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      if (!Array.isArray(sendDays) || !sendDays.every(d => validDays.includes(d))) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'sendDays must be an array of valid day names', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const oldSchedule = settings.schedule;
      const newSchedule = {
        quietHoursStart,
        quietHoursEnd,
        timezone: 'America/Los_Angeles',
        sendDays,
      };
      
      await settingsRef().set({
        ...settings,
        schedule: newSchedule,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      const changes = [];
      if (oldSchedule.quietHoursStart !== newSchedule.quietHoursStart) {
        changes.push({ field: 'quietHoursStart', oldValue: oldSchedule.quietHoursStart, newValue: newSchedule.quietHoursStart });
      }
      if (oldSchedule.quietHoursEnd !== newSchedule.quietHoursEnd) {
        changes.push({ field: 'quietHoursEnd', oldValue: oldSchedule.quietHoursEnd, newValue: newSchedule.quietHoursEnd });
      }
      if (JSON.stringify(oldSchedule.sendDays) !== JSON.stringify(newSchedule.sendDays)) {
        changes.push({ field: 'sendDays', oldValue: oldSchedule.sendDays.join(','), newValue: newSchedule.sendDays.join(',') });
      }
      
      if (changes.length > 0) {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'update',
          entityType: 'email-settings',
          entityId: 'schedule',
          entityName: 'Email Schedule Settings',
          changes,
        });
      }
      
      res.json({ success: true, schedule: newSchedule });
    } catch (error) {
      console.error('Update schedule settings error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update schedule settings', requestId: res.locals.requestId },
      });
    }
  });
  
  router.put('/app-url', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { appBaseUrl } = req.body;
      
      if (!appBaseUrl || typeof appBaseUrl !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'appBaseUrl is required', requestId: res.locals.requestId },
        });
      }
      
      try {
        new URL(appBaseUrl);
      } catch {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'appBaseUrl must be a valid URL', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const oldUrl = settings.appBaseUrl;
      const newUrl = appBaseUrl.replace(/\/$/, '');
      
      await settingsRef().set({
        ...settings,
        appBaseUrl: newUrl,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      }, { merge: true });
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'email-settings',
        entityId: 'app-url',
        entityName: 'App Base URL',
        changes: [{ field: 'appBaseUrl', oldValue: oldUrl, newValue: newUrl }],
      });
      
      res.json({ success: true, appBaseUrl: newUrl });
    } catch (error) {
      console.error('Update app URL error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to update app URL', requestId: res.locals.requestId },
      });
    }
  });
  
  router.post('/test-send/:typeId', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { typeId } = req.params;
      const emailType = EMAIL_TYPES.find(t => t.id === typeId);
      if (!emailType) {
        return res.status(404).json({
          error: { code: 'not_found', message: 'Email type not found', requestId: res.locals.requestId },
        });
      }
      
      const settings = await getSettings();
      const envCutoverEnabled = process.env.MAIL_CUTOVER_ENABLED === 'true';
      
      const sampleData: Record<string, string> = {};
      for (const placeholder of emailType.placeholders) {
        sampleData[placeholder] = `[Sample ${placeholder}]`;
      }
      sampleData.storeName = 'Sample Store';
      sampleData.storeNumber = '001';
      sampleData.storeEmail = authUser.email;
      sampleData.verificationUrl = `${settings.appBaseUrl}/verify/sample`;
      sampleData.signInUrl = `${settings.appBaseUrl}/signin/sample`;
      sampleData.confirmUrl = `${settings.appBaseUrl}/confirm/sample`;
      sampleData.updateUrl = `${settings.appBaseUrl}/update/sample`;
      sampleData.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      sampleData.inviterName = authUser.displayName || authUser.email;
      sampleData.recipientName = authUser.displayName || 'Test User';
      sampleData.districtName = 'Sample District';
      sampleData.role = 'Admin';
      sampleData.daysRemaining = '3';
      sampleData.storeCount = '5';
      
      const typeSettings = settings.typeSettings[typeId as EmailTypeId];
      const defaultTemplate = DEFAULT_TEMPLATES[typeId as EmailTypeId];
      const template = typeSettings?.template || defaultTemplate;
      
      let subject = template?.subject || `[TEST] ${emailType.name}`;
      let bodyHtml = template?.bodyHtml || `<p>This is a test email for: <strong>${emailType.name}</strong></p>`;
      let bodyText = template?.bodyText || `This is a test email for: ${emailType.name}`;
      
      for (const [key, value] of Object.entries(sampleData)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        subject = subject.replace(regex, value);
        bodyHtml = bodyHtml.replace(regex, value);
        bodyText = bodyText.replace(regex, value);
      }
      
      const logEntry: Record<string, unknown> = {
        to: authUser.email,
        type: `test-${typeId}`,
        subject: `[TEST] ${subject}`,
        sentAt: new Date().toISOString(),
        sentBy: authUser.uid,
        sentByEmail: authUser.email,
        isTest: true,
      };
      
      if (!settings.masterEnabled || !envCutoverEnabled) {
        const reason = !settings.masterEnabled 
          ? 'Email sending is disabled (master switch off)'
          : 'Email sending is disabled (MAIL_CUTOVER_ENABLED not set)';
        
        logEntry.success = false;
        logEntry.blocked = true;
        logEntry.reason = reason;
        await db.collection('mailLog').add(logEntry);
        
        return res.json({ 
          success: true, 
          sentTo: authUser.email,
          logOnly: true,
          message: `Test email logged but NOT sent: ${reason}. Enable email sending to actually deliver test emails.`,
        });
      }
      
      if (!settings.smtp.configured) {
        return res.status(400).json({
          error: { code: 'not_configured', message: 'SMTP not configured', requestId: res.locals.requestId },
        });
      }
      
      const passwordDoc = await smtpPasswordRef().get();
      if (!passwordDoc.exists) {
        return res.status(400).json({
          error: { code: 'not_configured', message: 'SMTP password not set', requestId: res.locals.requestId },
        });
      }
      
      const pwdData = passwordDoc.data() as { encryptedPassword?: string; password?: string };
      let password: string;
      try {
        if (pwdData.encryptedPassword) {
          password = decryptPassword(pwdData.encryptedPassword);
        } else if (pwdData.password) {
          password = pwdData.password;
        } else {
          return res.status(400).json({
            error: { code: 'not_configured', message: 'SMTP password not set', requestId: res.locals.requestId },
          });
        }
      } catch {
        return res.status(400).json({
          error: { code: 'decryption_failed', message: 'Failed to decrypt SMTP password', requestId: res.locals.requestId },
        });
      }
      
      const transporter = createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        auth: {
          user: settings.smtp.user,
          pass: password,
        },
      });
      
      await transporter.sendMail({
        from: `${settings.sender.fromName} <${settings.sender.fromAddress}>`,
        to: authUser.email,
        subject: `[TEST] ${subject}`,
        html: bodyHtml,
        text: bodyText,
        replyTo: settings.sender.replyTo || undefined,
      });
      
      logEntry.success = true;
      await db.collection('mailLog').add(logEntry);
      
      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'test',
        entityType: 'email-settings',
        entityId: `test-${typeId}`,
        entityName: `Test Email: ${emailType.name}`,
        changes: [{ field: 'sentTo', newValue: authUser.email }],
      });
      
      res.json({ success: true, sentTo: authUser.email });
    } catch (error) {
      console.error('Send test email error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to send test email', requestId: res.locals.requestId },
      });
    }
  });
  
  router.get('/outbox', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin access required', requestId: res.locals.requestId },
        });
      }
      
      const { type, status, limit: limitStr, offset: offsetStr } = req.query;
      const limit = Math.min(parseInt(limitStr as string, 10) || 50, 200);
      const offset = parseInt(offsetStr as string, 10) || 0;
      
      let query: FirebaseFirestore.Query = db.collection('mailLog')
        .orderBy('sentAt', 'desc');
      
      if (type && typeof type === 'string') {
        query = query.where('type', '==', type);
      }
      if (status && typeof status === 'string') {
        if (status === 'sent') {
          query = query.where('success', '==', true).where('blocked', '==', false);
        } else if (status === 'logged') {
          query = query.where('blocked', '==', false).where('success', '==', true);
        } else if (status === 'failed') {
          query = query.where('success', '==', false);
        } else if (status === 'suppressed') {
          query = query.where('blocked', '==', true);
        }
      }
      
      const snapshot = await query.limit(limit + 1).offset(offset).get();
      const hasMore = snapshot.docs.length > limit;
      const docs = snapshot.docs.slice(0, limit);
      
      const entries = docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
      
      res.json({
        data: entries,
        hasMore,
        offset,
        limit,
      });
    } catch (error) {
      console.error('Get outbox error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to get outbox', requestId: res.locals.requestId },
      });
    }
  });
  
  router.delete('/type/:typeId/template/history/:version', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser || (authUser.role !== 'Admin' && authUser.role !== 'Steward')) {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Admin or Steward access required', requestId: res.locals.requestId },
        });
      }

      const { typeId, version } = req.params;
      const versionNum = parseInt(version, 10);
      
      if (!typeId || !EMAIL_TYPES.find(t => t.id === typeId)) {
        return res.status(400).json({
          error: { code: 'invalid_type', message: 'Invalid email type', requestId: res.locals.requestId },
        });
      }

      if (isNaN(versionNum) || versionNum < 1) {
        return res.status(400).json({
          error: { code: 'invalid_version', message: 'Invalid version number', requestId: res.locals.requestId },
        });
      }

      const validTypeId = typeId as EmailTypeId;
      const settings = await getSettings();
      const typeSettings = settings.typeSettings[validTypeId];
      const history = typeSettings?.templateHistory || [];

      const versionIndex = history.findIndex((h: { version: number }) => h.version === versionNum);
      if (versionIndex === -1) {
        return res.status(404).json({
          error: { code: 'not_found', message: `Version ${versionNum} not found in history`, requestId: res.locals.requestId },
        });
      }

      const newHistory = history.filter((h: { version: number }) => h.version !== versionNum);

      await settingsRef().update({
        [`typeSettings.${typeId}.templateHistory`]: newHistory,
        updatedAt: new Date().toISOString(),
        updatedBy: authUser.uid,
        updatedByEmail: authUser.email,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'email-template-history',
        entityId: `${typeId}-v${versionNum}`,
        entityName: `Delete ${typeId} template version ${versionNum}`,
        changes: [{ field: 'deletedVersion', oldValue: versionNum, newValue: null }],
      });

      res.json({ success: true, typeId, deletedVersion: versionNum, remainingVersions: newHistory.length });
    } catch (error) {
      console.error('Delete template history version error:', error);
      res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to delete template version', requestId: res.locals.requestId },
      });
    }
  });
  
  return router;
}

export async function getEmailSettings(db: Firestore): Promise<EmailSettings> {
  const doc = await db.collection('settings').doc('email').get();
  if (!doc.exists) {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...doc.data() } as EmailSettings;
}

export async function isEmailTypeEnabled(db: Firestore, typeId: EmailTypeId): Promise<boolean> {
  const settings = await getEmailSettings(db);
  const envCutoverEnabled = process.env.MAIL_CUTOVER_ENABLED === 'true';
  
  if (!settings.masterEnabled || !envCutoverEnabled) {
    return false;
  }
  
  const typeSettings = settings.typeSettings[typeId];
  return typeSettings?.enabled !== false;
}

export async function getSmtpPassword(db: Firestore): Promise<string | null> {
  const doc = await db.collection('settings').doc('email_smtp_password').get();
  if (!doc.exists) {
    return null;
  }
  return (doc.data() as { password: string }).password;
}

export async function getAppBaseUrl(db: Firestore): Promise<string> {
  const settings = await getEmailSettings(db);
  if (!settings.appBaseUrl) {
    console.error('[Config Error] appBaseUrl is not configured in email settings - emails may contain invalid links');
    throw new Error('appBaseUrl is not configured. Set it in Admin > Email Settings before sending emails.');
  }
  return settings.appBaseUrl;
}
