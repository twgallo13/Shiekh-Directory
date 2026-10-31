import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import type { AuthUser } from '../../src/types';

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

  return router;
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
