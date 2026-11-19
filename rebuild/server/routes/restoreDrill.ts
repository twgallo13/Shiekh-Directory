import { Router, type Request, type Response } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import type { AuthUser, AuditLogEntry } from '../../src/types';

const DRILL_PREFIX = 'drill_';

interface SnapshotData {
  metadata: {
    createdAt: string;
    createdBy: string;
    createdByEmail: string;
    collections: string[];
  };
  data: Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
}

interface DrillReport {
  drillId: string;
  snapshotId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure' | 'partial';
  snapshotMetadata: {
    createdAt: string;
    createdBy: string;
    collections: string[];
  };
  validation: {
    collection: string;
    expectedCount: number;
    restoredCount: number;
    countMatch: boolean;
    checksumExpected: string;
    checksumActual: string;
    checksumMatch: boolean;
  }[];
  overallCountMatch: boolean;
  overallChecksumMatch: boolean;
  totalExpected: number;
  totalRestored: number;
  cleanedUp: boolean;
  errors: string[];
  initiatedBy: string;
  initiatedByEmail: string;
}

function generateDrillId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `${DRILL_PREFIX}${date}_${time}`;
}

function getDrillCollectionName(drillId: string, collection: string): string {
  return `${drillId}_${collection}`;
}

function computeChecksum(docs: Array<{ id: string; data: Record<string, unknown> }>): string {
  const sorted = [...docs].sort((a, b) => a.id.localeCompare(b.id));
  const content = sorted.map(d => `${d.id}:${JSON.stringify(d.data)}`).join('\n');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function readSnapshot(db: Firestore, snapshotId: string): Promise<SnapshotData> {
  const snapshotDoc = await db.collection('snapshots').doc(snapshotId).get();
  if (!snapshotDoc.exists) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

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
  const decompressed = gunzipSync(compressed);
  return JSON.parse(decompressed.toString('utf-8'));
}

async function cleanupDrill(db: Firestore, drillId: string): Promise<number> {
  const collections = await db.listCollections();
  let totalDeleted = 0;
  
  for (const collRef of collections) {
    if (collRef.id.startsWith(drillId)) {
      const docs = await collRef.listDocuments();
      
      const BATCH_SIZE = 500;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + BATCH_SIZE);
        chunk.forEach(doc => batch.delete(doc));
        await batch.commit();
        totalDeleted += chunk.length;
      }
    }
  }
  
  return totalDeleted;
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

export function createRestoreDrillRouter(db: Firestore): Router {
  const router = Router();

  router.get('/reports', async (_req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin can view drill reports', requestId: res.locals.requestId },
        });
      }

      const snapshot = await db.collection('drillReports')
        .orderBy('startedAt', 'desc')
        .limit(20)
        .get();

      const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      return res.json({ data: reports });
    } catch (error) {
      console.error('List drill reports error:', error);
      return res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to list drill reports', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/run', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin') {
        await logAudit(db, {
          userId: authUser.uid,
          userEmail: authUser.email,
          userRole: authUser.role,
          action: 'deny',
          entityType: 'restore-drill',
          entityId: 'attempted',
          entityName: 'Restore drill access denied',
          changes: [],
        });
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin can run restore drills', requestId: res.locals.requestId },
        });
      }

      const { snapshotId, dryRun = false } = req.body;

      if (!snapshotId || typeof snapshotId !== 'string') {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'snapshotId is required', requestId: res.locals.requestId },
        });
      }

      const drillId = generateDrillId();
      const startedAt = new Date().toISOString();
      const errors: string[] = [];

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'create',
        entityType: 'restore-drill',
        entityId: drillId,
        entityName: `Restore drill started for snapshot ${snapshotId}`,
        changes: [
          { field: 'snapshotId', newValue: snapshotId },
          { field: 'dryRun', newValue: dryRun },
        ],
      });

      let snapshotData: SnapshotData;
      try {
        snapshotData = await readSnapshot(db, snapshotId);
      } catch (error) {
        return res.status(404).json({
          error: { code: 'snapshot_not_found', message: `Snapshot not found: ${snapshotId}`, requestId: res.locals.requestId },
        });
      }

      let totalExpected = 0;
      const collectionCounts: Record<string, number> = {};
      for (const [collection, docs] of Object.entries(snapshotData.data)) {
        collectionCounts[collection] = docs.length;
        totalExpected += docs.length;
      }

      if (dryRun) {
        return res.json({
          data: {
            drillId,
            dryRun: true,
            snapshotId,
            snapshotMetadata: snapshotData.metadata,
            totalDocuments: totalExpected,
            collectionCounts,
            message: `Would restore ${totalExpected} documents to drill collections with prefix ${drillId}_`,
          },
        });
      }

      for (const [collection, docs] of Object.entries(snapshotData.data)) {
        const drillCollection = getDrillCollectionName(drillId, collection);
        
        const BATCH_SIZE = 500;
        for (let i = 0; i < docs.length; i += BATCH_SIZE) {
          const batch = db.batch();
          const chunk = docs.slice(i, i + BATCH_SIZE);
          
          for (const doc of chunk) {
            batch.set(db.collection(drillCollection).doc(doc.id), doc.data);
          }
          
          await batch.commit();
        }
      }

      const validation: DrillReport['validation'] = [];
      let totalRestored = 0;
      let allCountsMatch = true;
      let allChecksumsMatch = true;

      for (const [collection, expectedDocs] of Object.entries(snapshotData.data)) {
        const drillCollection = getDrillCollectionName(drillId, collection);
        
        const restoredSnapshot = await db.collection(drillCollection).get();
        const restoredDocs = restoredSnapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data() as Record<string, unknown>,
        }));

        const expectedCount = expectedDocs.length;
        const restoredCount = restoredDocs.length;
        const countMatch = expectedCount === restoredCount;
        
        const checksumExpected = computeChecksum(expectedDocs);
        const checksumActual = computeChecksum(restoredDocs);
        const checksumMatch = checksumExpected === checksumActual;

        if (!countMatch) {
          allCountsMatch = false;
          errors.push(`${collection}: count mismatch (expected ${expectedCount}, got ${restoredCount})`);
        }
        if (!checksumMatch) {
          allChecksumsMatch = false;
          errors.push(`${collection}: checksum mismatch`);
        }

        totalRestored += restoredCount;
        validation.push({
          collection,
          expectedCount,
          restoredCount,
          countMatch,
          checksumExpected,
          checksumActual,
          checksumMatch,
        });
      }

      const deletedCount = await cleanupDrill(db, drillId);
      const completedAt = new Date().toISOString();
      const status = allCountsMatch && allChecksumsMatch ? 'success' : 
                     errors.length < Object.keys(snapshotData.data).length ? 'partial' : 'failure';

      const report: DrillReport = {
        drillId,
        snapshotId,
        startedAt,
        completedAt,
        status,
        snapshotMetadata: {
          createdAt: snapshotData.metadata.createdAt,
          createdBy: snapshotData.metadata.createdByEmail,
          collections: snapshotData.metadata.collections,
        },
        validation,
        overallCountMatch: allCountsMatch,
        overallChecksumMatch: allChecksumsMatch,
        totalExpected,
        totalRestored,
        cleanedUp: true,
        errors,
        initiatedBy: authUser.uid,
        initiatedByEmail: authUser.email,
      };

      await db.collection('drillReports').doc(drillId).set(report);

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'update',
        entityType: 'restore-drill',
        entityId: drillId,
        entityName: `Restore drill ${status} for snapshot ${snapshotId}`,
        changes: [
          { field: 'status', newValue: status },
          { field: 'totalRestored', newValue: totalRestored },
          { field: 'totalExpected', newValue: totalExpected },
          { field: 'cleanedUp', newValue: deletedCount },
        ],
      });

      return res.json({
        data: {
          ...report,
          message: status === 'success' 
            ? 'Restore drill passed - all documents verified'
            : `Restore drill ${status} - see errors for details`,
        },
      });
    } catch (error) {
      console.error('Restore drill error:', error);
      return res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to run restore drill', requestId: res.locals.requestId },
      });
    }
  });

  router.post('/cleanup', async (req: Request, res: Response) => {
    try {
      const authUser = res.locals.authUser as AuthUser | undefined;
      if (!authUser) {
        return res.status(401).json({
          error: { code: 'unauthorized', message: 'Authentication required', requestId: res.locals.requestId },
        });
      }

      if (authUser.role !== 'Admin') {
        return res.status(403).json({
          error: { code: 'forbidden', message: 'Only Admin can cleanup drill data', requestId: res.locals.requestId },
        });
      }

      const { drillId } = req.body;

      if (!drillId || typeof drillId !== 'string' || !drillId.startsWith(DRILL_PREFIX)) {
        return res.status(400).json({
          error: { code: 'invalid_request', message: 'Valid drillId with drill_ prefix is required', requestId: res.locals.requestId },
        });
      }

      await logAudit(db, {
        userId: authUser.uid,
        userEmail: authUser.email,
        userRole: authUser.role,
        action: 'delete',
        entityType: 'restore-drill',
        entityId: drillId,
        entityName: `Restore drill cleanup requested`,
        changes: [],
      });

      const deletedCount = await cleanupDrill(db, drillId);

      return res.json({
        data: {
          drillId,
          deletedDocuments: deletedCount,
          message: `Cleaned up ${deletedCount} documents from drill collections`,
        },
      });
    } catch (error) {
      console.error('Drill cleanup error:', error);
      return res.status(500).json({
        error: { code: 'internal_error', message: 'Failed to cleanup drill', requestId: res.locals.requestId },
      });
    }
  });

  return router;
}
