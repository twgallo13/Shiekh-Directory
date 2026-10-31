import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { gzipSync } from 'zlib';
import type { AuthUser, AuditLogEntry } from '../../src/types';

interface BackupRecord {
  id: string;
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

export function createBackupRouter(db: Firestore): Router {
  const router = Router();

  router.use((_req: Request, res: Response, next) => {
    const authUser = res.locals.authUser as AuthUser | undefined;
    if (!authUser || authUser.role !== 'Admin') {
      return res.status(403).json({
        error: { code: 'access_denied', message: 'Admin access required', requestId: res.locals.requestId },
      });
    }
    next();
  });

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('backups')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const backups = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as BackupRecord));

      res.json({ backups });
    } catch (error) {
      console.error('List backups error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to list backups' } });
    }
  });

  router.post('/trigger', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { note } = req.body;
      const now = new Date().toISOString();
      const backupId = `manual-${now.replace(/[:.]/g, '-')}`;

      const backupRecord: Omit<BackupRecord, 'id'> = {
        type: 'manual',
        status: 'pending',
        createdAt: now,
        createdBy: authUser.uid,
        createdByEmail: authUser.email,
        note: note || 'Manual backup triggered from Admin UI',
      };

      await db.collection('backups').doc(backupId).set(backupRecord);

      await db.collection('auditLog').add({
        timestamp: now,
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'backup',
        entityId: backupId,
        entityName: 'Manual Backup',
        changes: [{ field: 'type', newValue: 'manual' }],
      });

      res.json({ backupId, status: 'pending', message: 'Backup queued for processing' });
    } catch (error) {
      console.error('Trigger backup error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to trigger backup' } });
    }
  });

  router.get('/snapshots', async (_req: Request, res: Response) => {
    try {
      const snapshot = await db.collection('snapshots')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();

      const snapshots = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          createdAt: data.createdAt,
          createdBy: data.createdBy,
          createdByEmail: data.createdByEmail,
          chunkCount: data.chunkCount,
          collections: data.metadata?.collections || [],
          status: data.status || 'completed',
        };
      });

      res.json({ snapshots });
    } catch (error) {
      console.error('List snapshots error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to list snapshots' } });
    }
  });

  router.post('/snapshots', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser;
      const { collections: requestedCollections, note } = req.body;
      const now = new Date();
      const snapshotId = `snapshot-${now.toISOString().replace(/[:.]/g, '-')}`;

      const collectionsToBackup = requestedCollections?.length > 0 
        ? requestedCollections 
        : [
            'locations',
            'regions',
            'districts',
            'people',
            'assignments',
            'users',
            'hoursTemplates',
            'customFields',
            'apiClients',
            'settings',
          ];

      await db.collection('snapshots').doc(snapshotId).set({
        status: 'in-progress',
        createdAt: now.toISOString(),
        createdBy: authUser.uid,
        createdByEmail: authUser.email,
        note,
      });

      const snapshotData: {
        metadata: {
          createdAt: string;
          createdBy: string;
          createdByEmail: string;
          collections: string[];
        };
        data: Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
      } = {
        metadata: {
          createdAt: now.toISOString(),
          createdBy: authUser.uid,
          createdByEmail: authUser.email,
          collections: collectionsToBackup,
        },
        data: {},
      };

      for (const collectionName of collectionsToBackup) {
        const collSnap = await db.collection(collectionName).get();
        snapshotData.data[collectionName] = collSnap.docs.map(doc => ({
          id: doc.id,
          data: doc.data() as Record<string, unknown>,
        }));
      }

      const jsonStr = JSON.stringify(snapshotData);
      const compressed = gzipSync(Buffer.from(jsonStr, 'utf-8'));
      const base64Data = compressed.toString('base64');

      const CHUNK_SIZE = 900000;
      const chunks: string[] = [];
      for (let i = 0; i < base64Data.length; i += CHUNK_SIZE) {
        chunks.push(base64Data.slice(i, i + CHUNK_SIZE));
      }

      const snapshotRef = db.collection('snapshots').doc(snapshotId);
      for (let i = 0; i < chunks.length; i++) {
        await snapshotRef.collection('chunks').doc(`chunk_${i.toString().padStart(4, '0')}`).set({
          data: chunks[i],
        });
      }

      let totalDocs = 0;
      for (const docs of Object.values(snapshotData.data)) {
        totalDocs += docs.length;
      }

      await snapshotRef.update({
        status: 'completed',
        completedAt: new Date().toISOString(),
        chunkCount: chunks.length,
        metadata: snapshotData.metadata,
        documentCount: totalDocs,
      });

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'location',
        entityId: snapshotId,
        entityName: `Snapshot created with ${totalDocs} documents`,
        changes: [
          { field: 'collections', newValue: collectionsToBackup.join(', ') },
          { field: 'documentCount', newValue: totalDocs },
        ],
      });

      res.json({
        snapshotId,
        status: 'completed',
        collections: collectionsToBackup,
        documentCount: totalDocs,
        chunkCount: chunks.length,
      });
    } catch (error) {
      console.error('Create snapshot error:', error);
      res.status(500).json({ error: { code: 'internal_error', message: 'Failed to create snapshot' } });
    }
  });

  return router;
}

async function logAudit(
  db: Firestore,
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<void> {
  const auditRef = db.collection('auditLog').doc();
  await auditRef.set({
    ...entry,
    id: auditRef.id,
    timestamp: new Date().toISOString(),
  });
}

export async function createBackupRecord(
  db: Firestore,
  type: BackupRecord['type'],
  createdBy: string,
  createdByEmail: string,
  note?: string
): Promise<string> {
  const now = new Date().toISOString();
  const backupId = `${type}-${now.replace(/[:.]/g, '-')}`;

  const backupRecord: Omit<BackupRecord, 'id'> = {
    type,
    status: 'pending',
    createdAt: now,
    createdBy,
    createdByEmail,
    note,
  };

  await db.collection('backups').doc(backupId).set(backupRecord);
  return backupId;
}
