import type { EmailMessage } from './mail';

export interface VerificationEmailData {
  storeName: string;
  storeNumber: string;
  storeEmail: string;
  verificationUrl: string;
  expiresAt: string;
  sentByName?: string;
  confirmUrl?: string;
  updateUrl?: string;
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

  const oneClickButtonsHtml = hasOneClick ? `
      <div style="text-align: center; margin: 30px 0;">
        <p style="font-weight: 600; margin-bottom: 16px;">Are your store hours correct?</p>
        <a href="${data.confirmUrl}" class="button" style="background-color: #059669; margin-right: 12px;">Yes, Correct</a>
        <a href="${data.updateUrl}" class="button" style="background-color: #2563EB;">No, Update</a>
      </div>
      <p style="text-align: center; font-size: 13px; color: #6B7280; margin-bottom: 20px;">
        Click <strong>Yes, Correct</strong> to confirm your hours in one click.<br>
        Click <strong>No, Update</strong> to sign in and make changes.
      </p>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 20px 0;">
      <p style="text-align: center; font-size: 13px; color: #6B7280;">Or review all details:</p>
  ` : '';

  const oneClickButtonsText = hasOneClick ? `
Are your store hours correct?

YES, CORRECT: ${data.confirmUrl}
(Click to confirm your hours in one click)

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
      <p>We need you to verify the operating hours for your store in our directory.</p>
      
      <div class="store-info">
        <dl>
          <dt>Store</dt>
          <dd>${data.storeNumber} - ${data.storeName}</dd>
        </dl>
      </div>

      <p>Please review your store's current hours and confirm they are correct, or submit any needed corrections.</p>

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

We need you to verify the operating hours for your store in our directory.

Store: ${data.storeNumber} - ${data.storeName}

Please review your store's current hours and confirm they are correct, or submit any needed corrections.

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
