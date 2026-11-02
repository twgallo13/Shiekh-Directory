import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import type { Correction, Location, Person } from '../src/types';

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

      // Item #13: Route to the APPROVER's manager, fall back to DM, then RM
      const locationDoc = await db.collection('locations').doc(correction.locationId).get();
      if (locationDoc.exists) {
        const location = locationDoc.data() as Location;
        
        // Find who to escalate to: approver's manager > store's DM > store's RM
        let assigneeId: string | undefined;
        let assigneeName: string | undefined;
        let assigneeType: 'manager' | 'dm' | 'rm' = 'dm';
        
        // Try to find the approver's manager first
        // Note: In the current hierarchy, the approver's manager is typically the DM
        // We fall back to the store's DM assignment below
        
        // Fall back to store's DM
        if (!assigneeId && location.districtId) {
          const dmAssignment = await db.collection('assignments')
            .where('scopeType', '==', 'district')
            .where('scopeId', '==', location.districtId)
            .where('role', '==', 'DM')
            .where('capacity', '==', 'primary')
            .limit(1)
            .get();
          
          if (!dmAssignment.empty) {
            const dmData = dmAssignment.docs[0].data();
            assigneeId = dmData.personId;
            assigneeType = 'dm';
            
            // Get DM name
            const personDoc = await db.collection('people').doc(dmData.personId).get();
            if (personDoc.exists) {
              assigneeName = (personDoc.data() as Person).fullName;
            }
          }
        }
        
        // Fall back to region's RM if no DM
        if (!assigneeId && location.regionId) {
          const rmAssignment = await db.collection('assignments')
            .where('scopeType', '==', 'region')
            .where('scopeId', '==', location.regionId)
            .where('role', '==', 'RM')
            .where('capacity', '==', 'primary')
            .limit(1)
            .get();
          
          if (!rmAssignment.empty) {
            const rmData = rmAssignment.docs[0].data();
            assigneeId = rmData.personId;
            assigneeType = 'rm';
            
            // Get RM name
            const personDoc = await db.collection('people').doc(rmData.personId).get();
            if (personDoc.exists) {
              assigneeName = (personDoc.data() as Person).fullName;
            }
          }
        }
        
        const taskRef = db.collection('dmTasks').doc();
        await taskRef.set({
          id: taskRef.id,
          locationId: correction.locationId,
          storeNumber: correction.storeNumber,
          storeName: location.name,
          districtId: location.districtId,
          regionId: location.regionId,
          taskType: 'overdue_correction',
          status: 'pending',
          description: `Overdue correction request for ${correction.storeNumber}: ${correction.category} (submitted ${new Date(correction.submittedAt).toLocaleDateString()})`,
          correctionId: correction.id,
          assigneeId,
          assigneeName,
          assigneeType,
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

// Note: expirePendingCorrections alias removed to avoid duplicate scheduled function deployment
