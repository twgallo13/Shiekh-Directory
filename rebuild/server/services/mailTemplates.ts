import type { StandardHours, DayOfWeek } from '../../src/types';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface VerificationEmailData {
  storeName: string;
  storeNumber: string;
  storeEmail: string;
  storeType?: string;
  verificationUrl: string;
  expiresAt: string;
  sentByName?: string;
  confirmUrl?: string;
  updateUrl?: string;
  hours?: StandardHours;
  wayfindingDirections?: string;
  verificationRequestId?: string; // #7: For bounce tracking
  locationId?: string; // #7: For bounce tracking
}

export interface ReminderEmailData extends VerificationEmailData {
  daysRemaining: number;
  originalSentAt: string;
}

export interface DMVerificationEmailData {
  recipientName: string;
  recipientType: 'dm' | 'rm' | 'steward';
  districtName: string;
  storeCount: number;
  verificationUrl: string;
  expiresAt: string;
}

const DAYS_ORDERED: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function formatTime(time24: string): string {
  const [hours, minutes] = time24.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

export function formatHoursForEmail(hours: StandardHours | undefined): { html: string; text: string } {
  if (!hours) {
    return { html: '<p><em>Hours not configured</em></p>', text: 'Hours not configured' };
  }

  const htmlRows = DAYS_ORDERED.map(day => {
    const dayHours = hours[day];
    let hoursText = 'Closed';
    if (!dayHours.closed && dayHours.intervals.length > 0) {
      hoursText = dayHours.intervals
        .map(i => `${formatTime(i.open)} - ${formatTime(i.close)}`)
        .join(', ');
    }
    return `<tr><td style="padding: 6px 12px; border-bottom: 1px solid #E5E7EB; font-weight: 500;">${DAY_LABELS[day]}</td><td style="padding: 6px 12px; border-bottom: 1px solid #E5E7EB;">${hoursText}</td></tr>`;
  }).join('\n');

  const html = `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="background-color: #F3F4F6;">
          <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #D1D5DB;">Day</th>
          <th style="padding: 8px 12px; text-align: left; border-bottom: 2px solid #D1D5DB;">Hours</th>
        </tr>
      </thead>
      <tbody>
        ${htmlRows}
      </tbody>
    </table>
  `;

  const textLines = DAYS_ORDERED.map(day => {
    const dayHours = hours[day];
    let hoursText = 'Closed';
    if (!dayHours.closed && dayHours.intervals.length > 0) {
      hoursText = dayHours.intervals
        .map(i => `${formatTime(i.open)} - ${formatTime(i.close)}`)
        .join(', ');
    }
    return `  ${DAY_LABELS[day].padEnd(12)} ${hoursText}`;
  }).join('\n');

  return { html, text: textLines };
}

export function formatWayfindingForEmail(directions: string | undefined): { html: string; text: string } {
  if (!directions) {
    return { html: '', text: '' };
  }
  return {
    html: `
      <div style="background-color: #F0F9FF; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h4 style="margin: 0 0 8px 0; color: #0369A1; font-size: 14px;">How to Find Us</h4>
        <p style="margin: 0; color: #374151; font-size: 14px;">${directions}</p>
      </div>
    `,
    text: `
HOW TO FIND US:
${directions}
`,
  };
}

export function formatOneClickButtonsForEmail(confirmUrl: string | undefined, updateUrl: string | undefined): { html: string; text: string } {
  if (!confirmUrl || !updateUrl) {
    return { html: '', text: '' };
  }
  return {
    html: `
      <div style="text-align: center; margin: 30px 0;">
        <p style="font-weight: 600; margin-bottom: 16px;">Is everything above correct?</p>
        <a href="${confirmUrl}" class="button" style="display: inline-block; background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-right: 12px;">Yes, Correct</a>
        <a href="${updateUrl}" class="button" style="display: inline-block; background-color: #2563EB; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">No, Update</a>
      </div>
      <p style="text-align: center; font-size: 13px; color: #6B7280; margin-bottom: 20px;">
        Click <strong>Yes, Correct</strong> to confirm everything in one click.<br>
        Click <strong>No, Update</strong> to sign in and make changes.
      </p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
      <p style="text-align: center; font-size: 13px; color: #6B7280;">Or review all details:</p>
    `,
    text: `
Is everything above correct?

YES, CORRECT: ${confirmUrl}
(Click to confirm everything in one click)

NO, UPDATE: ${updateUrl}
(Click to sign in and make changes)

---

Or review all details:
`,
  };
}

const SHIEKH_RED = '#DC2626';

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background-color: ${SHIEKH_RED}; color: white; padding: 20px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .content { padding: 30px 20px; background-color: #ffffff; }
  .button { display: inline-block; background-color: ${SHIEKH_RED}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .footer { padding: 20px; text-align: center; font-size: 12px; color: #4B5563; background-color: #F3F4F6; }
  .store-info { background-color: #F9FAFB; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .store-info dt { font-weight: 600; color: #374151; }
  .store-info dd { margin: 0 0 12px 0; color: #6B7280; }
  .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px; margin: 16px 0; }
  .urgent { background-color: #FEE2E2; border-left: 4px solid #DC2626; }
`;

function wrapInEmailHtml(title: string, content: string, footerEmail?: string): string {
  const footerLine = footerEmail ? `<p>This email was sent to ${footerEmail}</p>` : '';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
${content}
    </div>
    <div class="footer">
      ${footerLine}
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
      <p style="font-size: 10px; color: #4B5563;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

export function renderTemplate(template: string, data: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(regex, value || '');
  }
  return result;
}

export const DEFAULT_TEMPLATES = {
  verification_request: {
    subject: '[Action Required] Verify Hours - Store {{storeNumber}}',
    bodyHtml: wrapInEmailHtml('Hours Verification Request', `
      <h2>Hours Verification Request</h2>
      <p>Hello,</p>
      <p>Please verify the following information for your store is correct.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>{{storeNumber}} - {{storeName}}</dd>{{storeTypeHtml}}
        </dl>
      </div>

      <h3 style="margin-top: 24px; margin-bottom: 8px; color: #374151;">Current Hours</h3>
      {{hoursHtml}}

      {{wayfindingHtml}}

      <p style="margin-top: 24px;">Please confirm this information is correct, or submit any needed corrections.</p>

      {{oneClickButtonsHtml}}

      <div style="text-align: center;">
        <a href="{{verificationUrl}}" class="button">Verify Hours Now</a>
      </div>

      <div class="warning">
        <strong>Please respond by:</strong> {{expiresFormatted}}
      </div>

      <p>If you have questions, please contact your District Manager or the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`, '{{storeEmail}}'),
    bodyText: `SHIEKH Store Directory - Hours Verification Request

Hello,

Please verify the following information for your store is correct.

Store: {{storeNumber}} - {{storeName}}{{storeTypeText}}

CURRENT HOURS:
{{hoursText}}
{{wayfindingText}}
Please confirm this information is correct, or submit any needed corrections.

{{oneClickButtonsText}}
Verify Hours Now: {{verificationUrl}}

Please respond by: {{expiresFormatted}}

If you have questions, please contact your District Manager or the operations team.

Thank you,
Shiekh Operations Team

---
This email was sent to {{storeEmail}}
This is an automated message. Please do not reply directly to this email.`,
  },

  verification_reminder: {
    subject: '[Reminder] Verify Hours - Store {{storeNumber}} - {{daysRemainingLabel}}',
    bodyHtml: wrapInEmailHtml('Hours Verification Reminder', `
      <h2>Reminder: Hours Verification Needed</h2>
      
      <div class="{{urgencyClass}}">
        <strong>{{urgencyText}}</strong>
      </div>

      <p>Hello,</p>
      <p>This is a reminder to verify the operating hours for your store. We haven't received a response to our earlier request.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>{{storeNumber}} - {{storeName}}</dd>
          <dt>Original Request Sent</dt>
          <dd>{{originalSentFormatted}}</dd>
        </dl>
      </div>

      <p>Please take a few minutes to review your store's hours and confirm they are accurate.</p>

      <div style="text-align: center;">
        <a href="{{verificationUrl}}" class="button">Verify Hours Now</a>
      </div>

      <div class="warning">
        <strong>Deadline:</strong> {{expiresFormatted}}
      </div>

      <p>If you have questions or need assistance, please contact your District Manager.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`, '{{storeEmail}}'),
    bodyText: `SHIEKH Store Directory - Reminder: Hours Verification Needed

{{urgencyText}}

Hello,

This is a reminder to verify the operating hours for your store. We haven't received a response to our earlier request.

Store: {{storeNumber}} - {{storeName}}
Original Request Sent: {{originalSentFormatted}}

Please take a few minutes to review your store's hours and confirm they are accurate.

Verify Hours Now: {{verificationUrl}}

Deadline: {{expiresFormatted}}

If you have questions or need assistance, please contact your District Manager.

Thank you,
Shiekh Operations Team

---
This email was sent to {{storeEmail}}
This is an automated reminder. Please do not reply directly to this email.`,
  },

  verification_confirmation: {
    subject: 'Hours Verified - Store {{storeNumber}}',
    bodyHtml: wrapInEmailHtml('Hours Verified', `
      <h2 style="color: #059669;">✓ Hours Verified</h2>
      <p>Hello,</p>
      <p>Thank you for verifying your store's operating hours.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>{{storeNumber}} - {{storeName}}</dd>
          <dt>Verified On</dt>
          <dd>{{verifiedFormatted}}</dd>
        </dl>
      </div>

      <p>Your store's hours are now confirmed in the directory. If any changes are needed in the future, please contact your District Manager or the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`),
    bodyText: `SHIEKH Store Directory - Hours Verified

Hello,

Thank you for verifying your store's operating hours.

Store: {{storeNumber}} - {{storeName}}
Verified On: {{verifiedFormatted}}

Your store's hours are now confirmed in the directory. If any changes are needed in the future, please contact your District Manager or the operations team.

Thank you,
Shiekh Operations Team`,
  },

  changes_submitted: {
    subject: 'Changes Submitted - Store {{storeNumber}}',
    bodyHtml: wrapInEmailHtml('Changes Submitted', `
      <h2 style="color: #2563EB;">📝 Changes Submitted</h2>
      <p>Hello,</p>
      <p>Thank you for submitting corrections for your store. Your changes are now under review.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>{{storeNumber}} - {{storeName}}</dd>
          <dt>Submitted On</dt>
          <dd>{{submittedFormatted}}</dd>
          <dt>Status</dt>
          <dd>In Review</dd>
        </dl>
      </div>

      <p>A member of the operations team will review your submission. You will be notified once the changes have been approved or if additional information is needed.</p>

      <p>If you have questions, please contact your District Manager or the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`),
    bodyText: `SHIEKH Store Directory - Changes Submitted

Hello,

Thank you for submitting corrections for your store. Your changes are now under review.

Store: {{storeNumber}} - {{storeName}}
Submitted On: {{submittedFormatted}}
Status: In Review

A member of the operations team will review your submission. You will be notified once the changes have been approved or if additional information is needed.

If you have questions, please contact your District Manager or the operations team.

Thank you,
Shiekh Operations Team`,
  },

  store_signin: {
    subject: 'Sign in to Shiekh Directory - Store {{storeNumber}}',
    bodyHtml: wrapInEmailHtml('Store Sign-In Link', `
      <h2>Store Sign-In Link</h2>
      <p>Hello,</p>
      <p>You requested a sign-in link for the Shiekh Store Directory.</p>

      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>{{storeNumber}} - {{storeName}}</dd>
        </dl>
      </div>

      <div style="text-align: center;">
        <a href="{{signInUrl}}" class="button">Sign In Now</a>
      </div>

      <div class="warning">
        <strong>This link expires:</strong> {{expiresFormatted}}
      </div>

      <p>If you didn't request this link, you can safely ignore this email.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`),
    bodyText: `SHIEKH Store Directory - Store Sign-In Link

Hello,

You requested a sign-in link for the Shiekh Store Directory.

Store: {{storeNumber}} - {{storeName}}

Sign In Now: {{signInUrl}}

This link expires: {{expiresFormatted}}

If you didn't request this link, you can safely ignore this email.

Thank you,
Shiekh Operations Team`,
  },

  dm_verification_request: {
    subject: '[Action Required] District Verification - {{districtName}}',
    bodyHtml: wrapInEmailHtml('District Verification Request', `
      <h2>District Verification Request</h2>
      <p>Hello {{recipientName}},</p>
      <p>As {{recipientLabel}}, we need you to verify the store roster for {{contextNote}}.</p>
      
      <div class="store-info">
        <dl>
          <dt>District</dt>
          <dd>{{districtName}}</dd>
          <dt>Number of Stores</dt>
          <dd>{{storeCount}}</dd>
        </dl>
      </div>

      <p>Please review each store's SM, ASM, and Key Holder assignments and confirm they are correct. If any assignments need to be updated, you can submit corrections directly.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="{{verificationUrl}}" class="button">Review District Roster</a>
      </div>

      <div class="warning">
        <strong>Please respond by:</strong> {{expiresFormatted}}
      </div>

      <p>If you have questions, please contact the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`),
    bodyText: `SHIEKH Store Directory - District Verification Request

Hello {{recipientName}},

As {{recipientLabel}}, we need you to verify the store roster for {{contextNote}}.

District: {{districtName}}
Number of Stores: {{storeCount}}

Please review each store's SM, ASM, and Key Holder assignments and confirm they are correct. If any assignments need to be updated, you can submit corrections directly.

Review District Roster: {{verificationUrl}}

Please respond by: {{expiresFormatted}}

If you have questions, please contact the operations team.

Thank you,
Shiekh Operations Team

---
This is an automated message. Please do not reply directly to this email.`,
  },

  invitation: {
    subject: "You're invited to Shiekh Directory",
    bodyHtml: wrapInEmailHtml("You're Invited!", `
      <h2>You're Invited!</h2>
      <p>Hello,</p>
      <p>{{inviterName}} has invited you to join the Shiekh Store Directory as <strong>{{role}}</strong>.</p>

      <div style="text-align: center;">
        <a href="{{inviteUrl}}" class="button">Accept Invitation</a>
      </div>

      <p>If you have questions, please contact your manager or the person who sent this invitation.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`),
    bodyText: `You're Invited!

Hello,

{{inviterName}} has invited you to join the Shiekh Store Directory as {{role}}.

Accept Invitation: {{inviteUrl}}

If you have questions, please contact your manager or the person who sent this invitation.

Thank you,
Shiekh Operations Team`,
  },

  invitation_reminder: {
    subject: "Reminder: You're invited to Shiekh Directory",
    bodyHtml: wrapInEmailHtml('Reminder: Invitation Pending', `
      <h2>Reminder: Invitation Pending</h2>

      <div class="warning">
        <strong>You have a pending invitation</strong>
      </div>

      <p>Hello,</p>
      <p>This is a reminder that {{inviterName}} invited you to join the Shiekh Store Directory as <strong>{{role}}</strong>.</p>

      <div style="text-align: center;">
        <a href="{{inviteUrl}}" class="button">Accept Invitation</a>
      </div>

      <p>If you have questions, please contact your manager or the person who sent this invitation.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>`),
    bodyText: `Reminder: Invitation Pending

You have a pending invitation

Hello,

This is a reminder that {{inviterName}} invited you to join the Shiekh Store Directory as {{role}}.

Accept Invitation: {{inviteUrl}}

If you have questions, please contact your manager or the person who sent this invitation.

Thank you,
Shiekh Operations Team`,
  },
} as const;

const RECIPIENT_TYPE_LABELS: Record<'dm' | 'rm' | 'steward', string> = {
  dm: 'District Manager',
  rm: 'Regional Manager',
  steward: 'Steward',
};

export function createVerificationRequestEmail(data: VerificationEmailData): EmailMessage {
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
    storeTypeHtml: data.storeType ? `
          <dt>Type</dt>
          <dd>${data.storeType}</dd>` : '',
    storeTypeText: data.storeType ? `\nType: ${data.storeType}` : '',
    verificationUrl: data.verificationUrl,
    expiresFormatted,
    hoursHtml: hoursFormatted.html,
    hoursText: hoursFormatted.text,
    wayfindingHtml: wayfindingFormatted.html,
    wayfindingText: wayfindingFormatted.text,
    oneClickButtonsHtml: oneClickFormatted.html,
    oneClickButtonsText: oneClickFormatted.text,
  };

  const template = DEFAULT_TEMPLATES.verification_request;
  return {
    to: data.storeEmail,
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}

export function createVerificationReminderEmail(data: ReminderEmailData): EmailMessage {
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
    originalSentAt: data.originalSentAt,
    originalSentFormatted,
    daysRemaining: String(data.daysRemaining),
    daysRemainingLabel,
    urgencyClass,
    urgencyText,
  };

  const template = DEFAULT_TEMPLATES.verification_reminder;
  return {
    to: data.storeEmail,
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}

export function createVerificationConfirmationEmail(data: {
  storeName: string;
  storeNumber: string;
  storeEmail: string;
  verifiedAt: string;
}): EmailMessage {
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
    verifiedFormatted,
  };

  const template = DEFAULT_TEMPLATES.verification_confirmation;
  return {
    to: data.storeEmail,
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}

export function createDMVerificationRequestEmail(data: DMVerificationEmailData): Omit<EmailMessage, 'to'> {
  const expiresDate = new Date(data.expiresAt);
  const expiresFormatted = expiresDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const recipientLabel = RECIPIENT_TYPE_LABELS[data.recipientType];
  const contextNote = data.recipientType === 'dm' 
    ? 'your district' 
    : data.recipientType === 'rm'
      ? 'a district in your region (the District Manager position is currently vacant)'
      : 'a district (both District Manager and Regional Manager positions are currently vacant)';

  const templateData: Record<string, string> = {
    recipientName: data.recipientName,
    recipientLabel,
    contextNote,
    districtName: data.districtName,
    storeCount: String(data.storeCount),
    verificationUrl: data.verificationUrl,
    expiresFormatted,
  };

  const template = DEFAULT_TEMPLATES.dm_verification_request;
  return {
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}

export function createStoreSignInEmail(data: {
  storeName: string;
  storeNumber: string;
  storeEmail: string;
  signInUrl: string;
  expiresAt: string;
}): EmailMessage {
  const expiresFormatted = new Date(data.expiresAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const templateData: Record<string, string> = {
    storeName: data.storeName,
    storeNumber: data.storeNumber,
    storeEmail: data.storeEmail,
    signInUrl: data.signInUrl,
    expiresFormatted,
  };

  const template = DEFAULT_TEMPLATES.store_signin;
  return {
    to: data.storeEmail,
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}

export function createInvitationEmail(data: {
  to: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}): EmailMessage {
  const templateData: Record<string, string> = {
    inviterName: data.inviterName,
    role: data.role,
    inviteUrl: data.inviteUrl,
  };

  const template = DEFAULT_TEMPLATES.invitation;
  return {
    to: data.to,
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}

export function createInvitationReminderEmail(data: {
  to: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}): EmailMessage {
  const templateData: Record<string, string> = {
    inviterName: data.inviterName,
    role: data.role,
    inviteUrl: data.inviteUrl,
  };

  const template = DEFAULT_TEMPLATES.invitation_reminder;
  return {
    to: data.to,
    subject: renderTemplate(template.subject, templateData),
    html: renderTemplate(template.bodyHtml, templateData),
    text: renderTemplate(template.bodyText, templateData),
  };
}
