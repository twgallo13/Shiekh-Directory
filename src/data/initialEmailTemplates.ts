import { EmailTemplate } from '../types';

/**
 * String interpolation engine for transactional emails.
 * Replaces {{variable}} and {variable} placeholders with context values.
 */
export function renderEmailTemplate(
  templateString: string,
  variables: Record<string, string | number | undefined | null>
): string {
  if (!templateString) return '';
  let result = templateString;
  for (const [key, value] of Object.entries(variables)) {
    const valStr = value !== undefined && value !== null ? String(value) : '';
    // Replace {{key}}, {{ key }}, {key}, { key }
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}|\\{\\s*${key}\\s*\\}`, 'g');
    result = result.replace(regex, valStr);
  }
  return result;
}

export const INITIAL_EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'request_submitted',
    name: 'New Update Request (Steward Notification)',
    description: 'Dispatched to Directory Data Stewards when a new location or personnel update proposal is submitted.',
    category: 'requests',
    subjectTemplate: '[Shiekh Directory] New Update Request #{{requestId}}: {{changeType}} for {{targetName}}',
    variables: [
      'requestId',
      'targetName',
      'changeType',
      'hoursSourceBlock',
      'submitterName',
      'submitterEmail',
      'notes',
      'submittedAt',
      'requestUrl',
      'appUrl'
    ],
    htmlTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #171717; max-width: 600px; line-height: 1.5;">
  <h2 style="color: #dc2626; margin-bottom: 8px;">Shiekh Directory SoR — New Update Request</h2>
  <p>A new store directory update request is waiting for Data Steward review:</p>
  <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Request ID:</strong> #{{requestId}}</p>
    <p style="margin: 4px 0;"><strong>Target:</strong> {{targetName}}</p>
    <p style="margin: 4px 0;"><strong>Change Type:</strong> {{changeType}}</p>
    {{hoursSourceBlock}}
    <p style="margin: 4px 0;"><strong>Submitted By:</strong> {{submitterName}} ({{submitterEmail}})</p>
    <p style="margin: 4px 0;"><strong>Submitted At:</strong> {{submittedAt}}</p>
    <p style="margin: 4px 0;"><strong>Notes:</strong> <em>"{{notes}}"</em></p>
  </div>
  <p style="margin: 20px 0;">
    <a href="{{requestUrl}}" style="background: #dc2626; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      Open Request in Directory Queue
    </a>
  </p>
  <p style="font-size: 12px; color: #737373;">Shiekh Shoes Store Directory System of Record • {{appUrl}}</p>
</div>`,
    updatedAt: '2026-09-04T16:00:00.000Z'
  },
  {
    id: 'request_approved',
    name: 'Request Approved (Requester Notification)',
    description: 'Dispatched to the submitter when their directory change request is reviewed, approved, and committed.',
    category: 'requests',
    subjectTemplate: '[Shiekh Directory] Update Request Approved: #{{requestId}} ({{targetName}})',
    variables: [
      'requestId',
      'targetName',
      'changeType',
      'submitterName',
      'approvedBy',
      'decisionNotes',
      'decisionAt',
      'locationUrl',
      'appUrl'
    ],
    htmlTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #171717; max-width: 600px; line-height: 1.5;">
  <h2 style="color: #16a34a; margin-bottom: 8px;">Shiekh Directory SoR — Request Approved</h2>
  <p>Hello <strong>{{submitterName}}</strong>,</p>
  <p>Your update request has been reviewed, approved, and applied to the authoritative System of Record.</p>
  <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Request ID:</strong> #{{requestId}}</p>
    <p style="margin: 4px 0;"><strong>Target:</strong> {{targetName}}</p>
    <p style="margin: 4px 0;"><strong>Change Type:</strong> {{changeType}}</p>
    <p style="margin: 4px 0;"><strong>Approved By:</strong> {{approvedBy}}</p>
    <p style="margin: 4px 0;"><strong>Approval Time:</strong> {{decisionAt}}</p>
    <p style="margin: 4px 0;"><strong>Decision Notes:</strong> <em>"{{decisionNotes}}"</em></p>
  </div>
  <p style="margin: 20px 0;">
    <a href="{{locationUrl}}" style="background: #16a34a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      View Updated Store Record
    </a>
  </p>
  <p style="font-size: 12px; color: #737373;">Shiekh Shoes Store Directory System of Record • {{appUrl}}</p>
</div>`,
    updatedAt: '2026-09-04T16:00:00.000Z'
  },
  {
    id: 'request_rejected',
    name: 'Request Rejected (Requester Feedback)',
    description: 'Dispatched to the submitter when an update proposal is declined or requires additional clarification.',
    category: 'requests',
    subjectTemplate: '[Shiekh Directory] Update Request Rejected: #{{requestId}} ({{targetName}})',
    variables: [
      'requestId',
      'targetName',
      'changeType',
      'submitterName',
      'reviewedBy',
      'rejectionNotes',
      'decisionAt',
      'queueUrl',
      'appUrl'
    ],
    htmlTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #171717; max-width: 600px; line-height: 1.5;">
  <h2 style="color: #dc2626; margin-bottom: 8px;">Shiekh Directory SoR — Request Not Approved</h2>
  <p>Hello <strong>{{submitterName}}</strong>,</p>
  <p>Your update request could not be applied to the master directory at this time.</p>
  <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Request ID:</strong> #{{requestId}}</p>
    <p style="margin: 4px 0;"><strong>Target:</strong> {{targetName}}</p>
    <p style="margin: 4px 0;"><strong>Change Type:</strong> {{changeType}}</p>
    <p style="margin: 4px 0;"><strong>Reviewed By:</strong> {{reviewedBy}}</p>
    <p style="margin: 4px 0;"><strong>Decision Time:</strong> {{decisionAt}}</p>
    <p style="margin: 4px 0;"><strong>Decision Reason:</strong> <em>"{{rejectionNotes}}"</em></p>
  </div>
  <p style="margin: 20px 0;">
    <a href="{{queueUrl}}" style="background: #525252; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      View Request History in Queue
    </a>
  </p>
  <p style="font-size: 12px; color: #737373;">Shiekh Shoes Store Directory System of Record • {{appUrl}}</p>
</div>`,
    updatedAt: '2026-09-04T16:00:00.000Z'
  },
  {
    id: 'user_invitation',
    name: 'User Onboarding Invitation',
    description: 'Dispatched to newly provisioned users with secure invitation token link to create their credentials.',
    category: 'auth',
    subjectTemplate: '[Action Required] Shiekh Shoes Master Directory — Account Invitation ({{role}})',
    variables: [
      'displayName',
      'email',
      'role',
      'accessScope',
      'invitedBy',
      'inviteUrl',
      'token',
      'appUrl'
    ],
    htmlTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #171717; max-width: 600px; line-height: 1.5;">
  <h2 style="color: #dc2626; margin-bottom: 8px;">Welcome to Shiekh Directory SoR</h2>
  <p>You have been invited by <strong>{{invitedBy}}</strong> to access the Shiekh Location &amp; Company Directory system of record.</p>
  <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Assigned Role:</strong> {{role}}</p>
    <p style="margin: 4px 0;"><strong>Access Scope:</strong> {{accessScope}}</p>
    <p style="margin: 4px 0;"><strong>Account Email:</strong> {{email}}</p>
  </div>
  <p style="margin: 20px 0;">
    <a href="{{inviteUrl}}" style="background: #dc2626; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      Accept Invitation &amp; Create Password
    </a>
  </p>
  <p style="font-size: 12px; color: #737373;">Invitation Token: <code style="font-family: monospace;">{{token}}</code> • {{appUrl}}</p>
</div>`,
    updatedAt: '2026-09-04T16:00:00.000Z'
  },
  {
    id: 'test_email',
    name: 'SMTP Diagnostic Ping (Test Email)',
    description: 'Sent when an administrator executes a connection test from the SMTP and Integrations settings panel.',
    category: 'system',
    subjectTemplate: '[Shiekh Directory] Test Email from Production Mailer Engine',
    variables: [
      'host',
      'port',
      'encryption',
      'sender',
      'triggeredBy',
      'timestamp',
      'appUrl'
    ],
    htmlTemplate: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #171717; max-width: 600px; line-height: 1.5;">
  <h2 style="color: #dc2626; margin-bottom: 8px;">Shiekh Directory SoR — SMTP Diagnostic Ping</h2>
  <p>This is an automated diagnostic test message from the Shiekh Location &amp; Company Directory SoR mail relay.</p>
  <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #16a34a; font-weight: bold;">Connection Successful</span></p>
    <p style="margin: 4px 0;"><strong>Host:</strong> {{host}}:{{port}}</p>
    <p style="margin: 4px 0;"><strong>Encryption:</strong> {{encryption}}</p>
    <p style="margin: 4px 0;"><strong>Sender:</strong> {{sender}}</p>
    <p style="margin: 4px 0;"><strong>Triggered By:</strong> {{triggeredBy}}</p>
    <p style="margin: 4px 0;"><strong>Timestamp:</strong> {{timestamp}}</p>
  </div>
  <p style="margin: 20px 0;">
    <a href="{{appUrl}}" style="background: #dc2626; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
      Open Shiekh Directory
    </a>
  </p>
  <p style="font-size: 12px; color: #737373;">Shiekh Shoes System of Record • {{appUrl}}</p>
</div>`,
    updatedAt: '2026-09-04T16:00:00.000Z'
  }
];
