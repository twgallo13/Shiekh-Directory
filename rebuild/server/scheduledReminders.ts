import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { createMailService } from './services/mail';
import { createVerificationReminderEmail } from './services/mailTemplates';
import type { VerificationRequest, Location } from '../src/types';

const APP_URL = process.env.APP_URL || 'https://directory.shiekh.com';

export const sendVerificationReminders = onSchedule(
  {
    schedule: '0 9 * * 1-5',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const db = getFirestore();
    const mailService = createMailService(db);

    const now = new Date();
    const reminderThresholds = [3, 1];

    for (const daysBeforeExpiry of reminderThresholds) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
      const targetDateStart = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
      const targetDateEnd = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();

      const pendingRequests = await db.collection('verificationRequests')
        .where('status', '==', 'pending')
        .where('respondedAt', '==', null)
        .where('expiresAt', '>=', targetDateStart)
        .where('expiresAt', '<=', targetDateEnd)
        .get();

      console.log(`[Reminders] Found ${pendingRequests.size} requests expiring in ${daysBeforeExpiry} day(s)`);

      for (const doc of pendingRequests.docs) {
        const request = { id: doc.id, ...doc.data() } as VerificationRequest;

        const locationDoc = await db.collection('locations').doc(request.locationId).get();
        if (!locationDoc.exists) {
          console.log(`[Reminders] Location ${request.locationId} not found for request ${request.id}`);
          continue;
        }

        const location = locationDoc.data() as Location;
        if (location.kind === 'facility') {
          console.log(`[Reminders] Skipping facility ${request.locationId}`);
          continue;
        }
        if (!location.sharedInboxEmail) {
          console.log(`[Reminders] No email for location ${request.locationId}`);
          continue;
        }

        const lastReminder = request.lastReminderAt ? new Date(request.lastReminderAt) : null;
        if (lastReminder) {
          const hoursSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastReminder < 20) {
            console.log(`[Reminders] Skipping ${request.id} - reminder sent ${hoursSinceLastReminder.toFixed(1)}h ago`);
            continue;
          }
        }

        const verificationUrl = `${APP_URL}/verify/${request.id}`;
        const emailData = {
          storeName: location.name,
          storeNumber: location.storeNumber,
          storeEmail: location.sharedInboxEmail,
          verificationUrl,
          expiresAt: request.expiresAt,
          daysRemaining: daysBeforeExpiry,
          originalSentAt: request.sentAt,
        };

        const email = createVerificationReminderEmail(emailData);
        const result = await mailService.send(email);

        if (result.success && !result.blocked) {
          await doc.ref.update({
            lastReminderAt: now.toISOString(),
            reminderCount: (request.reminderCount || 0) + 1,
          });
          console.log(`[Reminders] Sent reminder for ${request.storeNumber} (${daysBeforeExpiry} days remaining)`);
        } else if (result.blocked) {
          console.log(`[Reminders] Email blocked for ${request.storeNumber}: ${result.reason}`);
        } else {
          console.error(`[Reminders] Failed to send reminder for ${request.storeNumber}: ${result.error}`);
        }
      }
    }

    console.log('[Reminders] Reminder job completed');
  }
);

export const expireOldVerificationRequests = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const db = getFirestore();
    const now = new Date();

    const expiredRequests = await db.collection('verificationRequests')
      .where('status', '==', 'pending')
      .where('expiresAt', '<', now.toISOString())
      .get();

    console.log(`[Expiry] Found ${expiredRequests.size} expired requests`);

    const batch = db.batch();
    for (const doc of expiredRequests.docs) {
      batch.update(doc.ref, {
        status: 'expired',
        updatedAt: now.toISOString(),
      });
    }

    if (expiredRequests.size > 0) {
      await batch.commit();
      console.log(`[Expiry] Marked ${expiredRequests.size} requests as expired`);
    }
  }
);
