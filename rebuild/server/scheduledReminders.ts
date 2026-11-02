import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { createUnifiedMailService, getEmailSettings } from './services/unifiedMail';
import { getWorkflowRules } from './services/workflowSettings';
import { getAppBaseUrl } from './routes/emailSettings';
import type { VerificationRequest, Location } from '../src/types';

export const sendVerificationReminders = onSchedule(
  {
    schedule: '0 * * * *',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const db = getFirestore();
    const workflowRules = await getWorkflowRules(db);
    const emailSettings = await getEmailSettings(db);
    
    let appBaseUrl: string;
    try {
      appBaseUrl = await getAppBaseUrl(db);
    } catch (error) {
      console.error('[Reminders] Cannot send emails - appBaseUrl not configured:', error);
      return;
    }
    
    const now = new Date();
    const ptFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: emailSettings.schedule.timezone || 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const currentTimePT = ptFormatter.format(now);
    const currentHourPT = parseInt(currentTimePT.split(':')[0], 10);
    const sendHour = parseInt(workflowRules.reminderSendTime.split(':')[0], 10);
    
    if (currentHourPT !== sendHour) {
      console.log(`[Reminders] Not send time. Current: ${currentTimePT}, configured: ${workflowRules.reminderSendTime}`);
      return;
    }
    
    // Check quiet hours
    const quietStart = parseInt(emailSettings.schedule.quietHoursStart.split(':')[0], 10);
    const quietEnd = parseInt(emailSettings.schedule.quietHoursEnd.split(':')[0], 10);
    const isInQuietHours = quietStart > quietEnd 
      ? (currentHourPT >= quietStart || currentHourPT < quietEnd)
      : (currentHourPT >= quietStart && currentHourPT < quietEnd);
    
    if (isInQuietHours) {
      console.log(`[Reminders] In quiet hours (${emailSettings.schedule.quietHoursStart}-${emailSettings.schedule.quietHoursEnd}), skipping`);
      return;
    }
    
    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: emailSettings.schedule.timezone || 'America/Los_Angeles',
      weekday: 'long',
    });
    const currentDayPT = dayFormatter.format(now).toLowerCase();
    const sendDays: string[] = emailSettings.schedule.sendDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    if (!sendDays.includes(currentDayPT)) {
      console.log(`[Reminders] Not a send day. Current: ${currentDayPT}, allowed: ${sendDays.join(', ')}`);
      return;
    }
    
    const mailService = createUnifiedMailService(db);
    const reminderThresholds = workflowRules.reminderLeadDays;

    for (const daysBeforeExpiry of reminderThresholds) {
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysBeforeExpiry);
      const targetDateStart = new Date(targetDate.setHours(0, 0, 0, 0)).toISOString();
      const targetDateEnd = new Date(targetDate.setHours(23, 59, 59, 999)).toISOString();

      // Send reminders for awaiting_response requests (or pending for backward compat)
      const reminderStatuses = ['pending', 'awaiting_response'];
      const pendingRequests = await db.collection('verificationRequests')
        .where('status', 'in', reminderStatuses)
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
        
        // Item #7: Skip bounced emails - don't send reminders
        if (request.emailBounced) {
          console.log(`[Reminders] Skipping ${request.id} - email bounced`);
          continue;
        }

        const lastReminder = request.lastReminderAt ? new Date(request.lastReminderAt) : null;
        if (lastReminder) {
          const hoursSinceLastReminder = (now.getTime() - lastReminder.getTime()) / (1000 * 60 * 60);
          if (hoursSinceLastReminder < workflowRules.minReminderGapHours) {
            console.log(`[Reminders] Skipping ${request.id} - reminder sent ${hoursSinceLastReminder.toFixed(1)}h ago (min gap: ${workflowRules.minReminderGapHours}h)`);
            continue;
          }
        }
        
        // Item #6: maxReminders = 0 means no limit, with safety cap of 50
        const SAFETY_CAP = 50;
        const currentCount = request.reminderCount || 0;
        
        if (workflowRules.maxReminders > 0 && currentCount >= workflowRules.maxReminders) {
          console.log(`[Reminders] Skipping ${request.id} - max reminders reached (${workflowRules.maxReminders})`);
          continue;
        }
        
        // Safety cap to prevent runaway reminders
        if (currentCount >= SAFETY_CAP) {
          console.log(`[Reminders] Skipping ${request.id} - safety cap reached (${SAFETY_CAP})`);
          continue;
        }

        const verificationUrl = `${appBaseUrl}/verify/${request.id}`;
        const emailData = {
          storeName: location.name,
          storeNumber: location.storeNumber,
          storeEmail: location.sharedInboxEmail,
          verificationUrl,
          expiresAt: request.expiresAt,
          daysRemaining: daysBeforeExpiry,
          originalSentAt: request.sentAt,
          verificationRequestId: request.id, // #7: For bounce tracking
          locationId: request.locationId, // #7: For bounce tracking
        };

        const result = await mailService.sendVerificationReminder(emailData, 'system', 'reminders@system');

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

    // Expire any non-terminal requests past their expiry date
    const expirableStatuses = ['pending', 'awaiting_response', 'in_review'];
    const expiredRequests = await db.collection('verificationRequests')
      .where('status', 'in', expirableStatuses)
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
