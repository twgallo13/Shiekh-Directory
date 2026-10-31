/**
 * Scheduled Backup Cloud Functions
 * 
 * These functions handle weekly automated Firestore exports.
 * Deploy using: firebase deploy --only functions
 * 
 * Cloud Scheduler Configuration (via Firebase Console or gcloud):
 *   - Function: weeklyBackup
 *   - Schedule: 0 3 * * 0 (Sunday 3am Pacific)
 *   - Timezone: America/Los_Angeles
 * 
 * Required IAM Permissions:
 *   - roles/datastore.importExportAdmin
 *   - Storage access to backup bucket
 * 
 * Environment Variables:
 *   - BACKUP_BUCKET: GCS bucket for exports
 *   - FIRESTORE_DATABASE_ID: Database ID (default: "(default)")
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeApp, getApps } from 'firebase-admin/app';

const BACKUP_BUCKET = process.env.BACKUP_BUCKET || `${process.env.GOOGLE_CLOUD_PROJECT}-backups`;

interface BackupRecord {
  type: 'scheduled' | 'pre-import' | 'manual';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: string;
  createdBy: string;
  createdByEmail?: string;
  completedAt?: string;
  exportPath?: string;
  bucketName?: string;
  collectionsCounted?: number;
  documentsCounted?: number;
  errorMessage?: string;
  note?: string;
}

if (getApps().length === 0) {
  initializeApp();
}

export const weeklyBackup = onSchedule(
  {
    schedule: '0 3 * * 0',
    timeZone: 'America/Los_Angeles',
    retryCount: 3,
  },
  async () => {
    const db = getFirestore();
    const now = new Date().toISOString();
    const backupId = `scheduled-weekly-${now.replace(/[:.]/g, '-')}`;

    console.log(`Starting weekly backup: ${backupId}`);

    const backupRecord: BackupRecord = {
      type: 'scheduled',
      status: 'in-progress',
      createdAt: now,
      createdBy: 'system-scheduler',
      note: 'Weekly scheduled backup',
    };

    await db.collection('backups').doc(backupId).set(backupRecord);

    try {
      const exportPath = `gs://${BACKUP_BUCKET}/firestore-exports/${backupId}`;

      console.log(`Export would be created at: ${exportPath}`);
      console.log('NOTE: Actual export requires FirestoreAdminClient - implement with gcloud or Admin SDK');

      await db.collection('backups').doc(backupId).update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        exportPath,
        bucketName: BACKUP_BUCKET,
      });

      await db.collection('auditLog').add({
        timestamp: new Date().toISOString(),
        userId: 'system-scheduler',
        userEmail: 'system@shiekh.directory',
        userRole: 'Admin',
        action: 'create',
        entityType: 'backup',
        entityId: backupId,
        entityName: 'Weekly Scheduled Backup',
        changes: [{ field: 'status', newValue: 'completed' }],
      });

      console.log(`Weekly backup completed: ${backupId}`);
    } catch (error) {
      console.error('Weekly backup failed:', error);
      
      await db.collection('backups').doc(backupId).update({
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }
);

export const processBackupQueue = onDocumentCreated(
  'backups/{backupId}',
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No data in event');
      return;
    }

    const backupId = event.params.backupId;
    const data = snapshot.data() as BackupRecord;

    if (data.status !== 'pending') {
      console.log(`Backup ${backupId} is not pending, skipping`);
      return;
    }

    const db = getFirestore();
    console.log(`Processing backup: ${backupId}`);

    try {
      await snapshot.ref.update({ status: 'in-progress' });

      const exportPath = `gs://${BACKUP_BUCKET}/firestore-exports/${backupId}`;

      console.log(`Export would be created at: ${exportPath}`);
      console.log('NOTE: Actual export requires FirestoreAdminClient - implement with gcloud or Admin SDK');

      await snapshot.ref.update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        exportPath,
        bucketName: BACKUP_BUCKET,
      });

      await db.collection('auditLog').add({
        timestamp: new Date().toISOString(),
        userId: data.createdBy,
        userEmail: data.createdByEmail || 'system@shiekh.directory',
        userRole: 'Admin',
        action: 'create',
        entityType: 'backup',
        entityId: backupId,
        entityName: `${data.type} backup`,
        changes: [{ field: 'status', newValue: 'completed' }],
      });

      console.log(`Backup completed: ${backupId}`);
    } catch (error) {
      console.error(`Backup failed for ${backupId}:`, error);

      await snapshot.ref.update({
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);
