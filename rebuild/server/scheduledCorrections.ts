import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import type { Correction, Location } from '../src/types';

// Item #13: Corrections stop auto-closing - flag overdue instead
// Renamed from expirePendingCorrections to flagOverdueCorrections
export const flagOverdueCorrections = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const db = getFirestore();
    const now = new Date();
    
    console.log(`[Correction Overdue] Running at ${now.toISOString()}`);

    // Find pending corrections past their expiresAt that haven't been flagged yet
    const overdueCorrections = await db.collection('corrections')
      .where('status', '==', 'pending')
      .where('expiresAt', '<', now.toISOString())
      .where('overdueFlag', '==', null)
      .limit(500)
      .get();

    // Also check for corrections without the overdueFlag field (for backward compat)
    const overdueCorrectionsNoFlag = await db.collection('corrections')
      .where('status', '==', 'pending')
      .where('expiresAt', '<', now.toISOString())
      .limit(500)
      .get();

    // Combine and dedupe
    const allOverdue = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of overdueCorrections.docs) {
      allOverdue.set(doc.id, doc);
    }
    for (const doc of overdueCorrectionsNoFlag.docs) {
      const data = doc.data() as Correction & { overdueFlag?: boolean };
      if (!data.overdueFlag) {
        allOverdue.set(doc.id, doc);
      }
    }

    console.log(`[Correction Overdue] Found ${allOverdue.size} overdue corrections to flag`);

    if (allOverdue.size === 0) {
      console.log('[Correction Overdue] No corrections to flag');
      return;
    }

    const flaggedIds: string[] = [];
    const tasksCreated: string[] = [];

    for (const [docId, doc] of allOverdue) {
      const correction = doc.data() as Correction;
      
      // Item #13: Don't change status, just flag as overdue
      await doc.ref.update({
        overdueFlag: true,
        overdueFlaggedAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: 'system',
      });
      flaggedIds.push(docId);

      // Create a DM task for the approver's manager
      const locationDoc = await db.collection('locations').doc(correction.locationId).get();
      if (locationDoc.exists) {
        const location = locationDoc.data() as Location;
        const taskRef = db.collection('dmTasks').doc();
        await taskRef.set({
          id: taskRef.id,
          locationId: correction.locationId,
          storeNumber: correction.storeNumber,
          storeName: location.name,
          districtId: location.districtId,
          taskType: 'store_issue',
          status: 'pending',
          description: `Overdue correction request for ${correction.storeNumber}: ${correction.category} (submitted ${new Date(correction.submittedAt).toLocaleDateString()})`,
          reportedBy: 'system',
          dueAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
          createdAt: now.toISOString(),
          createdBy: 'system',
          updatedAt: now.toISOString(),
        });
        tasksCreated.push(taskRef.id);
      }
    }

    const auditRef = db.collection('auditLog').doc();
    await auditRef.set({
      id: auditRef.id,
      userId: 'system',
      userEmail: 'system@directory.shiekh.com',
      userRole: 'system',
      action: 'update',
      entityType: 'correction',
      entityId: 'scheduled',
      entityName: `Flagged overdue corrections (${flaggedIds.length})`,
      changes: [
        { field: 'flagged_count', newValue: flaggedIds.length },
        { field: 'tasks_created', newValue: tasksCreated.length },
      ],
      timestamp: now.toISOString(),
    });

    console.log(`[Correction Overdue] Flagged ${flaggedIds.length} corrections, created ${tasksCreated.length} DM tasks`);
  }
);

// Keep the old export for backward compatibility
export const expirePendingCorrections = flagOverdueCorrections;
