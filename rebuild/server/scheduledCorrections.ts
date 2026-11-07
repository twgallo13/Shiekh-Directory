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

      // Item #13: Route to APPROVER's manager if there's an assigned approver,
      // otherwise fall back to DM, then RM.
      //
      // NOTE: The Correction type does NOT have an 'assignedTo' or 'approverId' field.
      // It only has 'reviewedBy' which is set AFTER review is complete.
      // For pending/overdue corrections, no approver is assigned yet.
      // Therefore, we use the DM→RM fallback path.
      //
      // If a future version adds an 'assignedApproverId' field to Correction,
      // this code should look up that person's manager first.
      const locationDoc = await db.collection('locations').doc(correction.locationId).get();
      if (locationDoc.exists) {
        const location = locationDoc.data() as Location;
        
        let assigneeId: string | undefined;
        let assigneeName: string | undefined;
        let assigneeType: 'manager' | 'dm' | 'rm' = 'dm';
        
        // #13: If reviewedBy is set (rare for overdue corrections - would mean partial review),
        // try to find that reviewer's manager. The manager would be the RM if reviewer is DM,
        // or Steward/Admin if reviewer is RM.
        if (correction.reviewedBy) {
          // Look up the reviewer's role by checking their assignments
          const reviewerDmAssignment = await db.collection('assignments')
            .where('personId', '==', correction.reviewedBy)
            .where('role', '==', 'DM')
            .where('capacity', '==', 'primary')
            .limit(1)
            .get();
          
          if (!reviewerDmAssignment.empty) {
            // Reviewer is a DM, escalate to their region's RM
            const districtId = reviewerDmAssignment.docs[0].data().scopeId;
            const districtDoc = await db.collection('districts').doc(districtId).get();
            if (districtDoc.exists) {
              const regionId = (districtDoc.data() as { regionId?: string }).regionId;
              if (regionId) {
                const rmAssignment = await db.collection('assignments')
                  .where('scopeType', '==', 'region')
                  .where('scopeId', '==', regionId)
                  .where('role', '==', 'RM')
                  .where('capacity', '==', 'primary')
                  .limit(1)
                  .get();
                if (!rmAssignment.empty) {
                  const rmData = rmAssignment.docs[0].data();
                  assigneeId = rmData.personId;
                  assigneeType = 'manager';
                  const personDoc = await db.collection('people').doc(rmData.personId).get();
                  if (personDoc.exists) {
                    assigneeName = (personDoc.data() as Person).fullName;
                  }
                }
              }
            }
          }
        }
        
        // Primary path: Route to the store's DM (if no reviewer's manager found)
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
            
            const personDoc = await db.collection('people').doc(dmData.personId).get();
            if (personDoc.exists) {
              assigneeName = (personDoc.data() as Person).fullName;
            }
          }
        }
        
        // Fallback: Route to region's RM if no DM
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
