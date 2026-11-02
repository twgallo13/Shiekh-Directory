import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import { getWorkflowRules } from './services/workflowSettings';
import { createUnifiedMailService } from './services/unifiedMail';
import { getAppBaseUrl } from './routes/emailSettings';
import type { VerificationRequest, Location, DMVerificationRequest } from '../src/types';

export const escalateToDM = onSchedule(
  {
    schedule: '0 6 * * *',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const db = getFirestore();
    const workflowRules = await getWorkflowRules(db);
    
    if (!workflowRules.dmEscalationEnabled) {
      console.log('[DM Escalation] Disabled in workflow rules, skipping');
      return;
    }
    
    const now = new Date();
    const escalationThreshold = new Date(now.getTime() - workflowRules.dmEscalationDays * 24 * 60 * 60 * 1000);
    
    console.log(`[DM Escalation] Running at ${now.toISOString()}`);
    console.log(`[DM Escalation] Escalating requests older than ${escalationThreshold.toISOString()} (${workflowRules.dmEscalationDays} days)`);

    // Query for pending requests that haven't been responded to and are old enough
    // Filter client-side for dmEscalated to include docs where field is missing (treat as not escalated)
    const pendingRequestsSnapshot = await db.collection('verificationRequests')
      .where('status', '==', 'pending')
      .where('respondedAt', '==', null)
      .where('sentAt', '<', escalationThreshold.toISOString())
      .limit(200)
      .get();

    // Filter out already-escalated requests (missing dmEscalated field treated as false)
    const eligibleDocs = pendingRequestsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return data.dmEscalated !== true;
    }).slice(0, 100);

    console.log(`[DM Escalation] Found ${eligibleDocs.length} requests to escalate (from ${pendingRequestsSnapshot.size} pending)`);

    if (eligibleDocs.length === 0) {
      console.log('[DM Escalation] No requests to escalate');
      return;
    }

    const locationIds = new Set<string>();
    const requests: (VerificationRequest & { id: string })[] = [];
    
    for (const doc of eligibleDocs) {
      const request = { id: doc.id, ...doc.data() } as VerificationRequest & { id: string };
      requests.push(request);
      locationIds.add(request.locationId);
    }

    const locations = new Map<string, Location>();
    for (const locationId of locationIds) {
      const locationDoc = await db.collection('locations').doc(locationId).get();
      if (locationDoc.exists) {
        locations.set(locationId, { id: locationDoc.id, ...locationDoc.data() } as Location);
      }
    }

    const requestsByDistrict = new Map<string, { requests: typeof requests; locations: Location[] }>();
    
    for (const request of requests) {
      const location = locations.get(request.locationId);
      if (!location) continue;
      
      const districtId = location.districtId;
      if (!requestsByDistrict.has(districtId)) {
        requestsByDistrict.set(districtId, { requests: [], locations: [] });
      }
      requestsByDistrict.get(districtId)!.requests.push(request);
      requestsByDistrict.get(districtId)!.locations.push(location);
    }

    const mailService = createUnifiedMailService(db);
    let escalatedCount = 0;
    let dmRequestsCreated = 0;
    
    let appBaseUrl: string;
    try {
      appBaseUrl = await getAppBaseUrl(db);
    } catch (error) {
      console.error('[DM Escalation] Cannot send emails - appBaseUrl not configured:', error);
      return;
    }

    for (const [districtId, { requests: districtRequests, locations: districtLocations }] of requestsByDistrict) {
      const districtDoc = await db.collection('districts').doc(districtId).get();
      if (!districtDoc.exists) {
        console.log(`[DM Escalation] District ${districtId} not found, skipping ${districtRequests.length} requests`);
        continue;
      }
      
      const district = districtDoc.data();
      
      const dmAssignments = await db.collection('assignments')
        .where('districtId', '==', districtId)
        .where('roleId', '==', 'districtManagerId')
        .where('status', '==', 'active')
        .get();
      
      if (dmAssignments.empty) {
        console.log(`[DM Escalation] No active DM for district ${districtId}, skipping ${districtRequests.length} requests`);
        continue;
      }
      
      const dmAssignment = dmAssignments.docs[0].data();
      const dmPersonDoc = await db.collection('people').doc(dmAssignment.personId).get();
      
      if (!dmPersonDoc.exists) {
        console.log(`[DM Escalation] DM person not found for district ${districtId}, skipping`);
        continue;
      }
      
      const dmPerson = dmPersonDoc.data();
      const dmEmail = dmPerson?.workEmail || dmPerson?.personalEmail;
      
      if (!dmEmail) {
        console.log(`[DM Escalation] No email for DM in district ${districtId}, skipping`);
        continue;
      }

      const expiresAt = new Date(now.getTime() + workflowRules.dmExpiryDays * 24 * 60 * 60 * 1000);
      const dmRequestRef = db.collection('dmVerificationRequests').doc();
      
      const storeResponses = districtLocations.map(loc => ({
        locationId: loc.id,
        storeNumber: loc.storeNumber,
        storeName: loc.name,
        smConfirmed: false,
      }));

      const dmRequest: Omit<DMVerificationRequest, 'id'> = {
        districtId,
        districtName: district?.name || districtId,
        regionId: district?.regionId || '',
        regionName: '',
        status: 'pending',
        cycleStartDate: now.toISOString().split('T')[0],
        sentAt: now.toISOString(),
        sentTo: dmEmail,
        sentToPersonId: dmAssignment.personId,
        sentToPersonName: dmPerson?.fullName || 'District Manager',
        sentBy: 'system',
        recipientType: 'dm',
        expiresAt: expiresAt.toISOString(),
        storeResponses,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        updatedBy: 'system',
        version: 1,
      };

      await dmRequestRef.set(dmRequest);
      dmRequestsCreated++;

      const batch = db.batch();
      for (const request of districtRequests) {
        batch.update(db.collection('verificationRequests').doc(request.id), {
          dmEscalated: true,
          dmEscalatedAt: now.toISOString(),
          dmVerificationRequestId: dmRequestRef.id,
          updatedAt: now.toISOString(),
        });
        escalatedCount++;
      }
      await batch.commit();

      try {
        await mailService.sendDMVerificationRequest(
          {
            to: dmEmail,
            recipientName: dmPerson?.fullName || 'District Manager',
            recipientType: 'dm',
            districtName: district?.name || districtId,
            storeCount: districtLocations.length,
            verificationUrl: `${appBaseUrl}/dm-verify/${dmRequestRef.id}`,
            expiresAt: expiresAt.toISOString(),
          },
          'system',
          'system@directory.shiekh.com'
        );
      } catch (emailError) {
        console.error(`[DM Escalation] Failed to send email to ${dmEmail}:`, emailError);
      }
    }

    const auditRef = db.collection('auditLog').doc();
    await auditRef.set({
      id: auditRef.id,
      userId: 'system',
      userEmail: 'system@directory.shiekh.com',
      userRole: 'system',
      action: 'escalate_to_dm',
      entityType: 'verification',
      entityId: 'scheduled',
      entityName: `Scheduled DM escalation`,
      changes: [
        { field: 'escalated_count', newValue: escalatedCount },
        { field: 'dm_requests_created', newValue: dmRequestsCreated },
        { field: 'escalation_threshold_days', newValue: workflowRules.dmEscalationDays },
      ],
      timestamp: now.toISOString(),
    });

    console.log(`[DM Escalation] Escalated ${escalatedCount} requests, created ${dmRequestsCreated} DM verification requests`);
  }
);
