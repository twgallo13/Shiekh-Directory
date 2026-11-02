import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore } from 'firebase-admin/firestore';
import type { Correction } from '../src/types';

export const expirePendingCorrections = onSchedule(
  {
    schedule: '0 2 * * *',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
    memory: '256MiB',
  },
  async () => {
    const db = getFirestore();
    const now = new Date();
    
    console.log(`[Correction Expiry] Running at ${now.toISOString()}`);

    const pendingCorrections = await db.collection('corrections')
      .where('status', '==', 'pending')
      .where('expiresAt', '<', now.toISOString())
      .limit(500)
      .get();

    console.log(`[Correction Expiry] Found ${pendingCorrections.size} expired corrections`);

    if (pendingCorrections.size === 0) {
      console.log('[Correction Expiry] No corrections to expire');
      return;
    }

    const batch = db.batch();
    const expiredIds: string[] = [];

    for (const doc of pendingCorrections.docs) {
      const correction = doc.data() as Correction;
      batch.update(doc.ref, {
        status: 'expired',
        expiredAt: now.toISOString(),
        expiredBy: 'system',
        expiredReason: `Auto-expired (past expiresAt)`,
        previousStatus: correction.status,
        updatedAt: now.toISOString(),
        updatedBy: 'system',
        version: (correction.version || 1) + 1,
      });
      expiredIds.push(doc.id);
    }

    await batch.commit();

    const auditRef = db.collection('auditLog').doc();
    await auditRef.set({
      id: auditRef.id,
      userId: 'system',
      userEmail: 'system@directory.shiekh.com',
      userRole: 'system',
      action: 'expire_corrections',
      entityType: 'correction',
      entityId: 'scheduled',
      entityName: `Scheduled correction expiry (${expiredIds.length} corrections)`,
      changes: [
        { field: 'expired_count', newValue: expiredIds.length },
      ],
      timestamp: now.toISOString(),
    });

    console.log(`[Correction Expiry] Successfully expired ${expiredIds.length} corrections`);
  }
);
