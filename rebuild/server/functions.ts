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
// Item #13: Single export for corrections scheduled job (no duplicate names)
export { flagOverdueCorrections } from './scheduledCorrections';
export { escalateToDM } from './scheduledDMEscalation';

export const api = onRequest(
  {
    region: 'us-central1',
    memory: '256MiB',
    timeoutSeconds: 60,
    // D2 (approved by Theo 2026-11-04, budget <= $75/mo): keep one instance warm.
    // Est. ~$2.74/mo idle (0.167 vCPU + 0.25 GiB at Cloud Run idle min-instance rates, us-central1).
    minInstances: 1,
  },
  app
);
