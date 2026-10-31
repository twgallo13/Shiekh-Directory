/**
 * Backup Service for Shiekh Directory
 * 
 * WEEKLY BACKUPS:
 *   Handled by Firestore's built-in scheduled exports (configured in Firebase Console):
 *   - Schedule: Weekly (configured via Cloud Console > Firestore > Backups)
 *   - Retention: 28 days
 *   - Bucket: gs://<project>-backups/firestore-scheduled/
 *   - No Cloud Function needed - this is a native Firestore feature
 * 
 * PRE-IMPORT BACKUPS:
 *   Triggered programmatically before any CSV import apply operation.
 *   Uses FirestoreAdminClient.exportDocuments() to create a real backup.
 * 
 * Required IAM Permissions:
 *   - roles/datastore.importExportAdmin on service account
 *   - Storage write access to backup bucket
 */

import { v1 } from '@google-cloud/firestore';
import type { Firestore } from 'firebase-admin/firestore';

const BACKUP_BUCKET = process.env.BACKUP_BUCKET || `${process.env.GOOGLE_CLOUD_PROJECT}-backups`;

export interface BackupResult {
  success: boolean;
  backupId: string;
  operationName?: string;
  outputUriPrefix?: string;
  error?: string;
}

export interface BackupRecord {
  type: 'pre-import' | 'manual';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: string;
  createdBy: string;
  createdByEmail?: string;
  completedAt?: string;
  outputUriPrefix?: string;
  operationName?: string;
  bucketName?: string;
  errorMessage?: string;
  note?: string;
}

export async function createPreImportBackup(
  db: Firestore,
  userId: string,
  userEmail: string
): Promise<BackupResult> {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupId = `pre-import-${timestamp}`;
  const outputUriPrefix = `gs://${BACKUP_BUCKET}/pre-import/${timestamp}`;

  const backupRecord: BackupRecord = {
    type: 'pre-import',
    status: 'in-progress',
    createdAt: now.toISOString(),
    createdBy: userId,
    createdByEmail: userEmail,
    bucketName: BACKUP_BUCKET,
    outputUriPrefix,
    note: 'Automatic backup before CSV import apply',
  };

  await db.collection('backups').doc(backupId).set(backupRecord);

  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable not set');
    }

    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    const databaseName = `projects/${projectId}/databases/${databaseId}`;

    const client = new v1.FirestoreAdminClient();

    const [operation] = await client.exportDocuments({
      name: databaseName,
      outputUriPrefix,
      collectionIds: [],
    });

    const operationName = operation.name || '';

    await db.collection('backups').doc(backupId).update({
      operationName,
      status: 'in-progress',
    });

    const [response] = await operation.promise();

    await db.collection('backups').doc(backupId).update({
      status: 'completed',
      completedAt: new Date().toISOString(),
      outputUriPrefix: response.outputUriPrefix || outputUriPrefix,
    });

    await db.collection('auditLog').add({
      timestamp: new Date().toISOString(),
      userId,
      userEmail,
      userRole: 'Admin',
      action: 'create',
      entityType: 'backup',
      entityId: backupId,
      entityName: 'Pre-Import Backup',
      changes: [
        { field: 'status', newValue: 'completed' },
        { field: 'outputUriPrefix', newValue: response.outputUriPrefix || outputUriPrefix },
      ],
    });

    console.log(`Pre-import backup completed: ${backupId}`);
    return {
      success: true,
      backupId,
      operationName,
      outputUriPrefix: response.outputUriPrefix || outputUriPrefix,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Pre-import backup failed: ${backupId}`, error);

    await db.collection('backups').doc(backupId).update({
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage,
    });

    return {
      success: false,
      backupId,
      error: errorMessage,
    };
  }
}

export async function restoreBackup(
  projectId: string,
  inputUriPrefix: string,
  collectionIds: string[] = []
): Promise<{ success: boolean; operationName?: string; error?: string }> {
  try {
    const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    const databaseName = `projects/${projectId}/databases/${databaseId}`;

    const client = new v1.FirestoreAdminClient();

    const [operation] = await client.importDocuments({
      name: databaseName,
      inputUriPrefix,
      collectionIds,
    });

    const [response] = await operation.promise();

    console.log('Restore completed:', response);
    return {
      success: true,
      operationName: operation.name || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Restore failed:', error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
