/**
 * Cloud Functions entry point - wraps Express app as a single function
 * 
 * Deploy with: firebase deploy --only functions --project shiekh-directory-v2
 * 
 * Note: Weekly backups are handled by Firestore's built-in scheduled exports
 * (configured in Firebase Console), not by Cloud Functions.
 */

import { onRequest } from 'firebase-functions/v2/https';
import app from './index';

export { sendVerificationReminders, expireOldVerificationRequests } from './scheduledReminders';

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  app
);
