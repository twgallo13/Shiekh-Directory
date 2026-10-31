/**
 * Cloud Functions entry point - wraps Express app as a single function
 * 
 * Deploy with: firebase deploy --only functions --project shiekh-directory-v2
 */

import { onRequest } from 'firebase-functions/v2/https';
import app from './index';

export { weeklyBackup, processBackupQueue } from './scheduledBackup';
export { sendVerificationReminders, expireOldVerificationRequests } from './scheduledReminders';

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  app
);
