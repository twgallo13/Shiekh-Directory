import { createTransport, type Transporter } from 'nodemailer';
import type { Firestore } from 'firebase-admin/firestore';

export interface MailConfig {
  mode: 'firebase' | 'smtp' | 'disabled';
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  testAllowlist: string[];
  cutoverEnabled: boolean;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  blocked?: boolean;
  reason?: string;
}

export function getMailConfig(): MailConfig {
  const mode = (process.env.MAIL_MODE || 'disabled') as MailConfig['mode'];
  const testAllowlistEnv = process.env.TEST_EMAIL_ALLOWLIST || '';
  const testAllowlist = testAllowlistEnv
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(e => e.length > 0);

  const cutoverEnabled = process.env.MAIL_CUTOVER_ENABLED === 'true';

  return {
    mode,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT || '587', 10),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM || 'noreply@shiekh.com',
    testAllowlist,
    cutoverEnabled,
  };
}

export function isEmailAllowed(email: string, config: MailConfig): { allowed: boolean; reason?: string } {
  const normalized = email.toLowerCase().trim();

  if (config.cutoverEnabled) {
    return { allowed: true };
  }

  if (config.testAllowlist.length === 0) {
    return { allowed: false, reason: 'No test allowlist configured and cutover not enabled' };
  }

  const isAllowed = config.testAllowlist.some(pattern => {
    const normalizedPattern = pattern.toLowerCase().trim();
    if (normalizedPattern.startsWith('*@')) {
      const domain = normalizedPattern.slice(2);
      return normalized.endsWith(`@${domain}`);
    }
    return normalized === normalizedPattern;
  });

  if (!isAllowed) {
    return { 
      allowed: false, 
      reason: `Email ${email} not in test allowlist. Only allowlisted emails receive mail before cut-over.` 
    };
  }

  return { allowed: true };
}

export class MailService {
  private config: MailConfig;
  private transporter: Transporter | null = null;
  private db: Firestore | null = null;

  constructor(db?: Firestore) {
    this.config = getMailConfig();
    this.db = db || null;

    if (this.config.mode === 'smtp') {
      this.transporter = createTransport({
        host: this.config.smtpHost,
        port: this.config.smtpPort,
        secure: this.config.smtpPort === 465,
        auth: {
          user: this.config.smtpUser,
          pass: this.config.smtpPass,
        },
      });
    }
  }

  async send(message: EmailMessage, retries = 3): Promise<MailResult> {
    const allowCheck = isEmailAllowed(message.to, this.config);
    if (!allowCheck.allowed) {
      console.log(`[Mail] Blocked: ${message.to} - ${allowCheck.reason}`);
      return {
        success: false,
        blocked: true,
        reason: allowCheck.reason,
      };
    }

    if (this.config.mode === 'disabled') {
      console.log(`[Mail] Disabled mode - would send to ${message.to}: ${message.subject}`);
      return {
        success: true,
        messageId: `disabled-${Date.now()}`,
        reason: 'Mail disabled - logged only',
      };
    }

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this.sendOnce(message);
        if (result.success) {
          return result;
        }
        lastError = new Error(result.error || 'Unknown error');
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[Mail] Attempt ${attempt}/${retries} failed:`, lastError.message);
        
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All retry attempts failed',
    };
  }

  private async sendOnce(message: EmailMessage): Promise<MailResult> {
    if (this.config.mode === 'smtp' && this.transporter) {
      const info = await this.transporter.sendMail({
        from: this.config.smtpFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        replyTo: message.replyTo,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    }

    if (this.config.mode === 'firebase' && this.db) {
      const mailDoc = await this.db.collection('mail').add({
        to: message.to,
        message: {
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
        replyTo: message.replyTo,
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        messageId: mailDoc.id,
      };
    }

    return {
      success: false,
      error: `Mail mode ${this.config.mode} not properly configured`,
    };
  }

  getConfig(): MailConfig {
    return { ...this.config };
  }
}

export function createMailService(db?: Firestore): MailService {
  return new MailService(db);
}
