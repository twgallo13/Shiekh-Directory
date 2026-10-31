import type { EmailMessage } from './mail';
import type { StandardHours, DayOfWeek } from '../../src/types';

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

function formatHoursForEmail(hours: StandardHours | undefined): { html: string; text: string } {
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

export interface ReminderEmailData extends VerificationEmailData {
  daysRemaining: number;
  originalSentAt: string;
}

const SHIEKH_RED = '#DC2626';

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background-color: ${SHIEKH_RED}; color: white; padding: 20px; text-align: center; }
  .header h1 { margin: 0; font-size: 24px; }
  .content { padding: 30px 20px; background-color: #ffffff; }
  .button { display: inline-block; background-color: ${SHIEKH_RED}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
  .footer { padding: 20px; text-align: center; font-size: 12px; color: #6B7280; background-color: #F3F4F6; }
  .store-info { background-color: #F9FAFB; border-radius: 8px; padding: 16px; margin: 16px 0; }
  .store-info dt { font-weight: 600; color: #374151; }
  .store-info dd { margin: 0 0 12px 0; color: #6B7280; }
  .warning { background-color: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px; margin: 16px 0; }
  .urgent { background-color: #FEE2E2; border-left: 4px solid #DC2626; }
`;

export function createVerificationRequestEmail(data: VerificationEmailData): EmailMessage {
  const expiresDate = new Date(data.expiresAt);
  const expiresFormatted = expiresDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const hasOneClick = data.confirmUrl && data.updateUrl;
  const hoursFormatted = formatHoursForEmail(data.hours);

  const wayfindingHtml = data.wayfindingDirections ? `
      <div style="background-color: #F0F9FF; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <h4 style="margin: 0 0 8px 0; color: #0369A1; font-size: 14px;">How to Find Us</h4>
        <p style="margin: 0; color: #374151; font-size: 14px;">${data.wayfindingDirections}</p>
      </div>
  ` : '';

  const wayfindingText = data.wayfindingDirections ? `
HOW TO FIND US:
${data.wayfindingDirections}
` : '';

  const oneClickButtonsHtml = hasOneClick ? `
      <div style="text-align: center; margin: 30px 0;">
        <p style="font-weight: 600; margin-bottom: 16px;">Is everything above correct?</p>
        <a href="${data.confirmUrl}" class="button" style="background-color: #059669; margin-right: 12px;">Yes, Correct</a>
        <a href="${data.updateUrl}" class="button" style="background-color: #2563EB;">No, Update</a>
      </div>
      <p style="text-align: center; font-size: 13px; color: #6B7280; margin-bottom: 20px;">
        Click <strong>Yes, Correct</strong> to confirm everything in one click.<br>
        Click <strong>No, Update</strong> to sign in and make changes.
      </p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
      <p style="text-align: center; font-size: 13px; color: #6B7280;">Or review all details:</p>
  ` : '';

  const oneClickButtonsText = hasOneClick ? `
Is everything above correct?

YES, CORRECT: ${data.confirmUrl}
(Click to confirm everything in one click)

NO, UPDATE: ${data.updateUrl}
(Click to sign in and make changes)

---

Or review all details:
` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hours Verification Request</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
      <h2>Hours Verification Request</h2>
      <p>Hello,</p>
      <p>Please verify the following information for your store is correct.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>${data.storeNumber} - ${data.storeName}</dd>${data.storeType ? `
          <dt>Type</dt>
          <dd>${data.storeType}</dd>` : ''}
        </dl>
      </div>

      <h3 style="margin-top: 24px; margin-bottom: 8px; color: #374151;">Current Hours</h3>
      ${hoursFormatted.html}

      ${wayfindingHtml}

      <p style="margin-top: 24px;">Please confirm this information is correct, or submit any needed corrections.</p>

      ${oneClickButtonsHtml}

      <div style="text-align: center;">
        <a href="${data.verificationUrl}" class="button">Verify Hours Now</a>
      </div>

      <div class="warning">
        <strong>Please respond by:</strong> ${expiresFormatted}
      </div>

      <p>If you have questions, please contact your District Manager or the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>
    </div>
    <div class="footer">
      <p>This email was sent to ${data.storeEmail}</p>
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
      <p style="font-size: 10px; color: #9CA3AF;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
SHIEKH Store Directory - Hours Verification Request

Hello,

Please verify the following information for your store is correct.

Store: ${data.storeNumber} - ${data.storeName}${data.storeType ? `
Type: ${data.storeType}` : ''}

CURRENT HOURS:
${hoursFormatted.text}
${wayfindingText}
Please confirm this information is correct, or submit any needed corrections.

${oneClickButtonsText}
Verify Hours Now: ${data.verificationUrl}

Please respond by: ${expiresFormatted}

If you have questions, please contact your District Manager or the operations team.

Thank you,
Shiekh Operations Team

---
This email was sent to ${data.storeEmail}
This is an automated message. Please do not reply directly to this email.
`;

  return {
    to: data.storeEmail,
    subject: `[Action Required] Verify Hours - Store ${data.storeNumber}`,
    html,
    text,
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

  const urgencyClass = data.daysRemaining <= 1 ? 'warning urgent' : 'warning';
  const urgencyText = data.daysRemaining <= 1 
    ? 'URGENT: This request expires tomorrow!' 
    : `Reminder: ${data.daysRemaining} days remaining to respond`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hours Verification Reminder</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
      <h2>Reminder: Hours Verification Needed</h2>
      
      <div class="${urgencyClass}">
        <strong>${urgencyText}</strong>
      </div>

      <p>Hello,</p>
      <p>This is a reminder to verify the operating hours for your store. We haven't received a response to our earlier request.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>${data.storeNumber} - ${data.storeName}</dd>
          <dt>Original Request Sent</dt>
          <dd>${new Date(data.originalSentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</dd>
        </dl>
      </div>

      <p>Please take a few minutes to review your store's hours and confirm they are accurate.</p>

      <div style="text-align: center;">
        <a href="${data.verificationUrl}" class="button">Verify Hours Now</a>
      </div>

      <div class="warning">
        <strong>Deadline:</strong> ${expiresFormatted}
      </div>

      <p>If you have questions or need assistance, please contact your District Manager.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>
    </div>
    <div class="footer">
      <p>This email was sent to ${data.storeEmail}</p>
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
      <p style="font-size: 10px; color: #9CA3AF;">This is an automated reminder. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
SHIEKH Store Directory - Reminder: Hours Verification Needed

${urgencyText}

Hello,

This is a reminder to verify the operating hours for your store. We haven't received a response to our earlier request.

Store: ${data.storeNumber} - ${data.storeName}
Original Request Sent: ${new Date(data.originalSentAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}

Please take a few minutes to review your store's hours and confirm they are accurate.

Verify Hours Now: ${data.verificationUrl}

Deadline: ${expiresFormatted}

If you have questions or need assistance, please contact your District Manager.

Thank you,
Shiekh Operations Team

---
This email was sent to ${data.storeEmail}
This is an automated reminder. Please do not reply directly to this email.
`;

  return {
    to: data.storeEmail,
    subject: `[Reminder] Verify Hours - Store ${data.storeNumber} - ${data.daysRemaining} day${data.daysRemaining === 1 ? '' : 's'} remaining`,
    html,
    text,
  };
}

export function createVerificationConfirmationEmail(data: {
  storeName: string;
  storeNumber: string;
  storeEmail: string;
  verifiedAt: string;
}): EmailMessage {
  const verifiedDate = new Date(data.verifiedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hours Verified</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
      <h2 style="color: #059669;">✓ Hours Verified</h2>
      <p>Hello,</p>
      <p>Thank you for verifying your store's operating hours.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>${data.storeNumber} - ${data.storeName}</dd>
          <dt>Verified On</dt>
          <dd>${verifiedDate}</dd>
        </dl>
      </div>

      <p>Your store's hours are now confirmed in the directory. If any changes are needed in the future, please contact your District Manager or the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
SHIEKH Store Directory - Hours Verified

Hello,

Thank you for verifying your store's operating hours.

Store: ${data.storeNumber} - ${data.storeName}
Verified On: ${verifiedDate}

Your store's hours are now confirmed in the directory. If any changes are needed in the future, please contact your District Manager or the operations team.

Thank you,
Shiekh Operations Team
`;

  return {
    to: data.storeEmail,
    subject: `Hours Verified - Store ${data.storeNumber}`,
    html,
    text,
  };
}

// === DM Verification Email ===

export interface DMVerificationEmailData {
  recipientName: string;
  recipientType: 'dm' | 'rm' | 'steward';
  districtName: string;
  storeCount: number;
  verificationUrl: string;
  expiresAt: string;
}

const RECIPIENT_TYPE_LABELS: Record<'dm' | 'rm' | 'steward', string> = {
  dm: 'District Manager',
  rm: 'Regional Manager',
  steward: 'Steward',
};

export function createDMVerificationRequestEmail(data: DMVerificationEmailData): Omit<import('./mail').EmailMessage, 'to'> {
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

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>District Verification Request</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>SHIEKH Store Directory</h1>
    </div>
    <div class="content">
      <h2>District Verification Request</h2>
      <p>Hello ${data.recipientName},</p>
      <p>As ${recipientLabel}, we need you to verify the store roster for ${contextNote}.</p>
      
      <div class="store-info">
        <dl>
          <dt>District</dt>
          <dd>${data.districtName}</dd>
          <dt>Number of Stores</dt>
          <dd>${data.storeCount}</dd>
        </dl>
      </div>

      <p>Please review each store's SM, ASM, and Key Holder assignments and confirm they are correct. If any assignments need to be updated, you can submit corrections directly.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${data.verificationUrl}" class="button">Review District Roster</a>
      </div>

      <div class="warning">
        <strong>Please respond by:</strong> ${expiresFormatted}
      </div>

      <p>If you have questions, please contact the operations team.</p>

      <p>Thank you,<br>Shiekh Operations Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} Shiekh Shoes. All rights reserved.</p>
      <p style="font-size: 10px; color: #9CA3AF;">This is an automated message. Please do not reply directly to this email.</p>
    </div>
  </div>
</body>
</html>`;

  const text = `
SHIEKH Store Directory - District Verification Request

Hello ${data.recipientName},

As ${recipientLabel}, we need you to verify the store roster for ${contextNote}.

District: ${data.districtName}
Number of Stores: ${data.storeCount}

Please review each store's SM, ASM, and Key Holder assignments and confirm they are correct. If any assignments need to be updated, you can submit corrections directly.

Review District Roster: ${data.verificationUrl}

Please respond by: ${expiresFormatted}

If you have questions, please contact the operations team.

Thank you,
Shiekh Operations Team

---
This is an automated message. Please do not reply directly to this email.
`;

  return {
    subject: `[Action Required] District Verification - ${data.districtName}`,
    html,
    text,
  };
}
