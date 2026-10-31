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
 *   App-level snapshot before any CSV import apply operation.
 *   Reads all directory collections and writes gzipped JSON to Firebase Storage.
 *   Falls back to Firestore 'snapshots' collection if Storage is unavailable.
 *   No special IAM permissions required - uses default credentials.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { gzipSync } from 'zlib';

const DIRECTORY_COLLECTIONS = [
  'locations',
  'people',
  'assignments',
  'regions',
  'districts',
  'hoursExceptions',
  'closures',
  'customFields',
  'verificationRequests',
];

const USERS_COLLECTION = 'users';
const USERS_SECRET_FIELDS = ['passwordHash', 'salt', 'refreshToken'];

export interface BackupResult {
  success: boolean;
  backupId: string;
  storagePath?: string;
  firestoreDocId?: string;
  error?: string;
  collectionCounts?: Record<string, number>;
}

export interface BackupRecord {
  type: 'pre-import' | 'manual';
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  createdAt: string;
  createdBy: string;
  createdByEmail?: string;
  completedAt?: string;
  storagePath?: string;
  firestoreDocId?: string;
  errorMessage?: string;
  note?: string;
  collectionCounts?: Record<string, number>;
}

interface SnapshotData {
  metadata: {
    createdAt: string;
    createdBy: string;
    createdByEmail: string;
    collections: string[];
  };
  data: Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
}

async function readCollectionData(
  db: Firestore,
  collectionName: string,
  excludeFields?: string[]
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  const snapshot = await db.collection(collectionName).get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    if (excludeFields) {
      for (const field of excludeFields) {
        delete data[field];
      }
    }
    return { id: doc.id, data };
  });
}

async function writeToStorage(
  data: Buffer,
  path: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(path);
    
    await file.save(data, {
      metadata: {
        contentType: 'application/gzip',
        contentEncoding: 'gzip',
      },
    });
    
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown storage error';
    console.error('Storage write failed:', message);
    return { success: false, error: message };
  }
}

async function writeToFirestore(
  db: Firestore,
  snapshotData: SnapshotData,
  backupId: string
): Promise<{ success: boolean; docId?: string; error?: string }> {
  try {
    const jsonStr = JSON.stringify(snapshotData);
    const compressed = gzipSync(Buffer.from(jsonStr, 'utf-8'));
    const base64Data = compressed.toString('base64');
    
    const MAX_CHUNK_SIZE = 900000;
    const chunks: string[] = [];
    
    for (let i = 0; i < base64Data.length; i += MAX_CHUNK_SIZE) {
      chunks.push(base64Data.slice(i, i + MAX_CHUNK_SIZE));
    }
    
    const snapshotRef = db.collection('snapshots').doc(backupId);
    
    await snapshotRef.set({
      metadata: snapshotData.metadata,
      chunkCount: chunks.length,
      totalSize: base64Data.length,
      createdAt: new Date().toISOString(),
    });
    
    const batch = db.batch();
    for (let i = 0; i < chunks.length; i++) {
      const chunkRef = snapshotRef.collection('chunks').doc(`chunk_${i.toString().padStart(4, '0')}`);
      batch.set(chunkRef, { data: chunks[i], index: i });
    }
    await batch.commit();
    
    return { success: true, docId: snapshotRef.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Firestore error';
    console.error('Firestore snapshot write failed:', message);
    return { success: false, error: message };
  }
}

export async function createPreImportBackup(
  db: Firestore,
  userId: string,
  userEmail: string
): Promise<BackupResult> {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupId = `pre-import-${timestamp}`;
  
  const backupRecord: BackupRecord = {
    type: 'pre-import',
    status: 'in-progress',
    createdAt: now.toISOString(),
    createdBy: userId,
    createdByEmail: userEmail,
    note: 'Automatic backup before CSV import apply',
  };
  
  await db.collection('backups').doc(backupId).set(backupRecord);
  
  try {
    console.log(`[Backup] Starting pre-import backup ${backupId}`);
    
    const snapshotData: SnapshotData = {
      metadata: {
        createdAt: now.toISOString(),
        createdBy: userId,
        createdByEmail: userEmail,
        collections: [...DIRECTORY_COLLECTIONS, USERS_COLLECTION],
      },
      data: {},
    };
    
    const collectionCounts: Record<string, number> = {};
    
    for (const collectionName of DIRECTORY_COLLECTIONS) {
      const docs = await readCollectionData(db, collectionName);
      snapshotData.data[collectionName] = docs;
      collectionCounts[collectionName] = docs.length;
      console.log(`[Backup] Read ${docs.length} docs from ${collectionName}`);
    }
    
    const userDocs = await readCollectionData(db, USERS_COLLECTION, USERS_SECRET_FIELDS);
    snapshotData.data[USERS_COLLECTION] = userDocs;
    collectionCounts[USERS_COLLECTION] = userDocs.length;
    console.log(`[Backup] Read ${userDocs.length} docs from ${USERS_COLLECTION} (secrets excluded)`);
    
    const jsonStr = JSON.stringify(snapshotData);
    const compressed = gzipSync(Buffer.from(jsonStr, 'utf-8'));
    
    const storagePath = `backups/pre-import/${timestamp}.json.gz`;
    const storageResult = await writeToStorage(compressed, storagePath);
    
    if (storageResult.success) {
      await db.collection('backups').doc(backupId).update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        storagePath,
        collectionCounts,
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
          { field: 'storagePath', newValue: storagePath },
        ],
      });
      
      console.log(`[Backup] Completed: ${backupId} -> ${storagePath}`);
      return {
        success: true,
        backupId,
        storagePath,
        collectionCounts,
      };
    }
    
    console.log(`[Backup] Storage unavailable, falling back to Firestore snapshots`);
    const firestoreResult = await writeToFirestore(db, snapshotData, backupId);
    
    if (firestoreResult.success) {
      await db.collection('backups').doc(backupId).update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        firestoreDocId: firestoreResult.docId,
        collectionCounts,
        note: 'Stored in Firestore snapshots (Storage unavailable)',
      });
      
      await db.collection('auditLog').add({
        timestamp: new Date().toISOString(),
        userId,
        userEmail,
        userRole: 'Admin',
        action: 'create',
        entityType: 'backup',
        entityId: backupId,
        entityName: 'Pre-Import Backup (Firestore)',
        changes: [
          { field: 'status', newValue: 'completed' },
          { field: 'firestoreDocId', newValue: firestoreResult.docId },
        ],
      });
      
      console.log(`[Backup] Completed (Firestore fallback): ${backupId}`);
      return {
        success: true,
        backupId,
        firestoreDocId: firestoreResult.docId,
        collectionCounts,
      };
    }
    
    throw new Error(`Both Storage and Firestore failed: Storage: ${storageResult.error}, Firestore: ${firestoreResult.error}`);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Backup] Failed: ${backupId}`, error);
    
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

export async function readBackupFromStorage(
  storagePath: string
): Promise<SnapshotData | null> {
  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    
    const [contents] = await file.download();
    const { gunzipSync } = await import('zlib');
    const decompressed = gunzipSync(contents);
    
    return JSON.parse(decompressed.toString('utf-8')) as SnapshotData;
  } catch (error) {
    console.error('Failed to read backup from storage:', error);
    return null;
  }
}

export async function readBackupFromFirestore(
  db: Firestore,
  docId: string
): Promise<SnapshotData | null> {
  try {
    const snapshotDoc = await db.collection('snapshots').doc(docId).get();
    if (!snapshotDoc.exists) return null;
    
    const { chunkCount } = snapshotDoc.data() as { chunkCount: number };
    const chunks: string[] = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const chunkDoc = await snapshotDoc.ref
        .collection('chunks')
        .doc(`chunk_${i.toString().padStart(4, '0')}`)
        .get();
      
      if (!chunkDoc.exists) throw new Error(`Missing chunk ${i}`);
      chunks.push((chunkDoc.data() as { data: string }).data);
    }
    
    const base64Data = chunks.join('');
    const compressed = Buffer.from(base64Data, 'base64');
    const { gunzipSync } = await import('zlib');
    const decompressed = gunzipSync(compressed);
    
    return JSON.parse(decompressed.toString('utf-8')) as SnapshotData;
  } catch (error) {
    console.error('Failed to read backup from Firestore:', error);
    return null;
  }
}
