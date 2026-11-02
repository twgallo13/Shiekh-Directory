import { createTransport } from 'nodemailer';
import type { Firestore } from 'firebase-admin/firestore';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import {
  getEmailSettings,
  isEmailTypeEnabled,
  type EmailTypeId,
  type EmailSettings,
} from '../routes/emailSettings';
import {
  DEFAULT_TEMPLATES,
  renderTemplate,
  formatHoursForEmail,
  formatWayfindingForEmail,
  formatOneClickButtonsForEmail,
  type VerificationEmailData,
  type ReminderEmailData,
  type DMVerificationEmailData,
} from './mailTemplates';

const ENCRYPTION_KEY_ENV = 'SMTP_ENCRYPTION_KEY';
const ALGORITHM = 'aes-256-gcm';
const REQUIRED_KEY_LENGTH = 32;

let encryptionKeyCache: Buffer | null = null;

export function isEncryptionKeyConfigured(): boolean {
  const keyBase64 = process.env[ENCRYPTION_KEY_ENV];
  if (!keyBase64) return false;
  try {
    const keyBuffer = Buffer.from(keyBase64, 'base64');
    return keyBuffer.length === REQUIRED_KEY_LENGTH;
  } catch {
    return false;
  }
}

function getEncryptionKey(): Buffer {
  if (encryptionKeyCache) return encryptionKeyCache;
  
  const keyBase64 = process.env[ENCRYPTION_KEY_ENV];
  if (!keyBase64) {
    throw new Error(`${ENCRYPTION_KEY_ENV} environment variable is required for SMTP password encryption. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  
  const keyBuffer = Buffer.from(keyBase64, 'base64');
  if (keyBuffer.length !== REQUIRED_KEY_LENGTH) {
    throw new Error(`${ENCRYPTION_KEY_ENV} must be a 32-byte key encoded as base64 (44 characters). Got ${keyBuffer.length} bytes.`);
  }
  
  encryptionKeyCache = keyBuffer;
  return keyBuffer;
}

export function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function canEncryptSmtpPassword(): { ok: boolean; error?: string } {
  try {
    getEncryptionKey();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function decryptPassword(encryptedData: string): string {
  const key = getEncryptionKey();
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format');
  }
  const [ivHex, authTagHex, encrypted] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked?: boolean;
  reason?: string;
  logOnly?: boolean;
}

export interface SendEmailOptions {
  typeId: EmailTypeId;
  to: string;
  data: Record<string, string>;
  isTest?: boolean;
  sentBy?: string;
  sentByEmail?: string;
}


function isWithinQuietHours(settings: EmailSettings): boolean {
  const tz = settings.schedule.timezone || 'America/Los_Angeles';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
  const currentMinutes = hour * 60 + minute;

  const [startH, startM] = settings.schedule.quietHoursStart.split(':').map(Number);
  const [endH, endM] = settings.schedule.quietHoursEnd.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function isSendDay(settings: EmailSettings): boolean {
  const tz = settings.schedule.timezone || 'America/Los_Angeles';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  });
  const dayName = formatter.format(now).toLowerCase() as 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  return settings.schedule.sendDays.includes(dayName);
}


export class UnifiedMailService {
  private db: Firestore;
  private settingsCache: EmailSettings | null = null;
  private settingsCacheTime = 0;
  private readonly CACHE_TTL = 60000;

  constructor(db: Firestore) {
    this.db = db;
  }

  private async getSettings(): Promise<EmailSettings> {
    const now = Date.now();
    if (this.settingsCache && now - this.settingsCacheTime < this.CACHE_TTL) {
      return this.settingsCache;
    }
    this.settingsCache = await getEmailSettings(this.db);
    this.settingsCacheTime = now;
    return this.settingsCache;
  }

  private async getSmtpPassword(): Promise<string | null> {
    const doc = await this.db.collection('settings').doc('email_smtp_password').get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (!data?.encryptedPassword) {
      if (data?.password) {
        return data.password;
      }
      return null;
    }
    try {
      return decryptPassword(data.encryptedPassword);
    } catch {
      return null;
    }
  }

  async send(options: SendEmailOptions): Promise<MailResult> {
    const { typeId, to, data, isTest, sentBy, sentByEmail } = options;
    const settings = await this.getSettings();
    const envCutoverEnabled = process.env.MAIL_CUTOVER_ENABLED === 'true';

    const logEntry: Record<string, unknown> = {
      to,
      type: isTest ? `test-${typeId}` : typeId,
      sentAt: new Date().toISOString(),
      sentBy: sentBy || 'system',
      sentByEmail: sentByEmail || 'system',
      isTest: isTest || false,
    };

    if (!settings.masterEnabled) {
      logEntry.success = false;
      logEntry.blocked = true;
      logEntry.reason = 'Email sending is disabled (master switch off)';
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, blocked: true, reason: logEntry.reason as string, logOnly: true };
    }

    if (!envCutoverEnabled) {
      logEntry.success = false;
      logEntry.blocked = true;
      logEntry.reason = 'Email sending is disabled (MAIL_CUTOVER_ENABLED not set)';
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, blocked: true, reason: logEntry.reason as string, logOnly: true };
    }

    const typeEnabled = await isEmailTypeEnabled(this.db, typeId);
    if (!typeEnabled) {
      logEntry.success = false;
      logEntry.blocked = true;
      logEntry.reason = `Email type "${typeId}" is disabled`;
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, blocked: true, reason: logEntry.reason as string };
    }

    if (!isTest && isWithinQuietHours(settings)) {
      logEntry.success = false;
      logEntry.blocked = true;
      logEntry.reason = 'Within quiet hours';
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, blocked: true, reason: logEntry.reason as string };
    }

    if (!isTest && !isSendDay(settings)) {
      logEntry.success = false;
      logEntry.blocked = true;
      logEntry.reason = 'Not a send day';
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, blocked: true, reason: logEntry.reason as string };
    }

    const typeSettings = settings.typeSettings[typeId];
    const customTemplate = typeSettings?.template;
    const defaultTemplate = DEFAULT_TEMPLATES[typeId];

    const template = customTemplate || defaultTemplate;
    const subject = renderTemplate(template.subject, data);
    const bodyHtml = renderTemplate(template.bodyHtml, data);
    const bodyText = renderTemplate(template.bodyText, data);

    logEntry.subject = subject;

    if (!settings.smtp.configured) {
      logEntry.success = false;
      logEntry.error = 'SMTP not configured';
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, error: 'SMTP not configured' };
    }

    const password = await this.getSmtpPassword();
    if (!password) {
      logEntry.success = false;
      logEntry.error = 'SMTP password not set';
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, error: 'SMTP password not set' };
    }

    try {
      const transporter = createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: settings.smtp.secure,
        auth: { user: settings.smtp.user, pass: password },
        connectionTimeout: 10000,
      });

      const from = `${settings.sender.fromName} <${settings.sender.fromAddress}>`;
      const info = await transporter.sendMail({
        from,
        to,
        subject: isTest ? `[TEST] ${subject}` : subject,
        html: bodyHtml,
        text: bodyText,
        replyTo: settings.sender.replyTo || undefined,
      });

      logEntry.success = true;
      logEntry.messageId = info.messageId;
      await this.db.collection('mailLog').add(logEntry);

      return { success: true, messageId: info.messageId };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      logEntry.success = false;
      logEntry.error = errorMsg;
      await this.db.collection('mailLog').add(logEntry);
      return { success: false, error: errorMsg };
    }
  }

  async processRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const settings = await this.getSettings();
    const envCutoverEnabled = process.env.MAIL_CUTOVER_ENABLED === 'true';

    if (!settings.masterEnabled || !envCutoverEnabled) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const retryDocs = await this.db.collection('mailLog')
      .where('retryRequested', '==', true)
      .where('retryProcessed', '==', null)
      .limit(50)
      .get();

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const doc of retryDocs.docs) {
      const data = doc.data();
      processed++;

      try {
        const result = await this.send({
          typeId: data.type.replace('test-', '') as EmailTypeId,
          to: data.to,
          data: {},
          isTest: data.isTest,
          sentBy: data.sentBy,
          sentByEmail: data.sentByEmail,
        });

        await doc.ref.update({
          retryProcessed: true,
          retryProcessedAt: new Date().toISOString(),
          retrySuccess: result.success,
          retryError: result.error || null,
        });

        if (result.success) succeeded++;
        else failed++;
      } catch (err) {
        await doc.ref.update({
          retryProcessed: true,
          retryProcessedAt: new Date().toISOString(),
          retrySuccess: false,
          retryError: err instanceof Error ? err.message : 'Unknown error',
        });
        failed++;
      }
    }

    return { processed, succeeded, failed };
  }

  async sendVerificationRequest(
    data: VerificationEmailData,
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const expiresDate = new Date(data.expiresAt);
    const expiresFormatted = expiresDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const hoursFormatted = formatHoursForEmail(data.hours);
    const wayfindingFormatted = formatWayfindingForEmail(data.wayfindingDirections);
    const oneClickFormatted = formatOneClickButtonsForEmail(data.confirmUrl, data.updateUrl);

    const templateData: Record<string, string> = {
      storeName: data.storeName,
      storeNumber: data.storeNumber,
      storeEmail: data.storeEmail,
      storeType: data.storeType || '',
      storeTypeHtml: data.storeType ? `
          <dt>Type</dt>
          <dd>${data.storeType}</dd>` : '',
      storeTypeText: data.storeType ? `\nType: ${data.storeType}` : '',
      verificationUrl: data.verificationUrl,
      expiresAt: data.expiresAt,
      expiresFormatted,
      confirmUrl: data.confirmUrl || '',
      updateUrl: data.updateUrl || '',
      hoursHtml: hoursFormatted.html,
      hoursText: hoursFormatted.text,
      wayfindingHtml: wayfindingFormatted.html,
      wayfindingText: wayfindingFormatted.text,
      oneClickButtonsHtml: oneClickFormatted.html,
      oneClickButtonsText: oneClickFormatted.text,
    };

    return this.send({
      typeId: 'verification_request',
      to: data.storeEmail,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

  async sendVerificationReminder(
    data: ReminderEmailData,
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const expiresDate = new Date(data.expiresAt);
    const expiresFormatted = expiresDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const originalSentFormatted = new Date(data.originalSentAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const urgencyClass = data.daysRemaining <= 1 ? 'warning urgent' : 'warning';
    const urgencyText = data.daysRemaining <= 1 
      ? 'URGENT: This request expires tomorrow!' 
      : `Reminder: ${data.daysRemaining} days remaining to respond`;
    const daysRemainingLabel = data.daysRemaining === 1 
      ? '1 day remaining' 
      : `${data.daysRemaining} days remaining`;

    const templateData: Record<string, string> = {
      storeName: data.storeName,
      storeNumber: data.storeNumber,
      storeEmail: data.storeEmail,
      verificationUrl: data.verificationUrl,
      expiresAt: data.expiresAt,
      expiresFormatted,
      daysRemaining: String(data.daysRemaining),
      daysRemainingLabel,
      originalSentAt: data.originalSentAt,
      originalSentFormatted,
      urgencyClass,
      urgencyText,
    };

    return this.send({
      typeId: 'verification_reminder',
      to: data.storeEmail,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

  async sendVerificationConfirmation(
    data: { storeName: string; storeNumber: string; storeEmail: string; verifiedAt: string },
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const verifiedFormatted = new Date(data.verifiedAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const templateData: Record<string, string> = {
      storeName: data.storeName,
      storeNumber: data.storeNumber,
      storeEmail: data.storeEmail,
      verifiedAt: data.verifiedAt,
      verifiedFormatted,
    };

    return this.send({
      typeId: 'verification_confirmation',
      to: data.storeEmail,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

  async sendDMVerificationRequest(
    data: DMVerificationEmailData & { to: string },
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const expiresDate = new Date(data.expiresAt);
    const expiresFormatted = expiresDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const recipientTypeLabels: Record<'dm' | 'rm' | 'steward', string> = {
      dm: 'District Manager',
      rm: 'Regional Manager',
      steward: 'Steward',
    };
    const recipientLabel = recipientTypeLabels[data.recipientType];
    const contextNote = data.recipientType === 'dm' 
      ? 'your district' 
      : data.recipientType === 'rm'
        ? 'a district in your region (the District Manager position is currently vacant)'
        : 'a district (both District Manager and Regional Manager positions are currently vacant)';

    const templateData: Record<string, string> = {
      recipientName: data.recipientName,
      recipientType: data.recipientType,
      recipientLabel,
      contextNote,
      districtName: data.districtName,
      storeCount: String(data.storeCount),
      verificationUrl: data.verificationUrl,
      expiresAt: data.expiresAt,
      expiresFormatted,
    };

    return this.send({
      typeId: 'dm_verification_request',
      to: data.to,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

  async sendInvitation(
    to: string,
    data: { inviterName: string; role: string; signInUrl: string; expiresAt: string; personalMessage?: string },
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const templateData: Record<string, string> = {
      inviterName: data.inviterName,
      role: data.role,
      inviteUrl: data.signInUrl,
      signInUrl: data.signInUrl,
      expiresAt: data.expiresAt,
      personalMessage: data.personalMessage || '',
    };

    return this.send({
      typeId: 'invitation',
      to,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

  async sendInvitationReminder(
    to: string,
    data: { inviterName: string; role: string; signInUrl: string; expiresAt: string },
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const templateData: Record<string, string> = {
      inviterName: data.inviterName,
      role: data.role,
      inviteUrl: data.signInUrl,
      signInUrl: data.signInUrl,
      expiresAt: data.expiresAt,
    };

    return this.send({
      typeId: 'invitation_reminder',
      to,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

  async sendStoreSignIn(
    to: string,
    data: { storeNumber: string; storeName: string; signInUrl: string; expiresAt: string },
    sentBy?: string,
    sentByEmail?: string
  ): Promise<MailResult> {
    const expiresFormatted = new Date(data.expiresAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const templateData: Record<string, string> = {
      storeNumber: data.storeNumber,
      storeName: data.storeName,
      signInUrl: data.signInUrl,
      expiresAt: data.expiresAt,
      expiresFormatted,
      storeEmail: to,
    };

    return this.send({
      typeId: 'store_signin',
      to,
      data: templateData,
      sentBy,
      sentByEmail,
    });
  }

}

export function createUnifiedMailService(db: Firestore): UnifiedMailService {
  return new UnifiedMailService(db);
}

export { DEFAULT_TEMPLATES };
