import 'dotenv/config';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';

export interface EmailPayload {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  emailType?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64 or utf8
    encoding?: string;
    contentType?: string;
  }>;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  response?: string;
  accepted?: any[];
  rejected?: any[];
  error?: string;
  code?: string;
  raw?: any;
}

export async function executeSendMail(payload: EmailPayload): Promise<SendEmailResult> {
  const {
    to,
    subject,
    text,
    html,
    fromName,
    fromEmail,
    replyTo,
    attachments,
  } = payload;

  if (!to || !subject || (!text && !html)) {
    throw new Error('Missing required email fields: "to", "subject", and message content ("text" or "html") are required.');
  }

  const recipientList = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (recipientList.length === 0) {
    throw new Error('No valid recipient email address specified.');
  }

  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;
  const smtpUser = process.env.SMTP_USER || 'directory-notifications@shiekhshoes.com';
  const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS;
  const smtpFromName = fromName || process.env.SMTP_FROM_NAME || 'Shiekh Directory Services';
  const smtpFromEmail = fromEmail || process.env.SMTP_FROM_EMAIL || smtpUser;
  const smtpReplyTo = replyTo || process.env.SMTP_REPLY_TO || 'directory-steward@shiekhshoes.com';

  if (!smtpPass) {
    throw new Error(
      `SMTP authentication failed: Server environment variable SMTP_PASSWORD (or SMTP_PASS) is not configured for user "${smtpUser}". Real SMTP dispatch requires valid credentials in server environment.`
    );
  }

  const transporter: Transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: true,
    },
  });

  const mailOptions: SendMailOptions = {
    from: `"${smtpFromName}" <${smtpFromEmail}>`,
    to: recipientList.join(', '),
    replyTo: smtpReplyTo,
    subject,
    text: text || undefined,
    html: html || undefined,
    attachments: attachments?.map(att => ({
      filename: att.filename,
      content: att.content,
      encoding: att.encoding || 'base64',
      contentType: att.contentType,
    })),
  };

  const info = await transporter.sendMail(mailOptions);

  return {
    success: true,
    messageId: info.messageId,
    response: info.response,
    accepted: info.accepted,
    rejected: info.rejected,
  };
}
