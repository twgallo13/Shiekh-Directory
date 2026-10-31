#!/usr/bin/env npx ts-node
/**
 * Restore Drill Script
 * 
 * Purpose: Test backup restoration without affecting live data.
 * Restores a snapshot to isolated drill collections, validates data integrity,
 * and cleans up afterward.
 * 
 * Usage:
 *   npx ts-node scripts/restore-drill.ts --project <project-id> --snapshot <snapshot-id>
 *   npx ts-node scripts/restore-drill.ts --project <project-id> --snapshot <snapshot-id> --dry-run
 *   npx ts-node scripts/restore-drill.ts --project <project-id> --cleanup <drill-id>
 * 
 * The drill will:
 *   1. Read a snapshot from Firestore snapshots/ collection
 *   2. Restore documents to prefixed collections (drill_<id>_<collection>)
 *   3. Compare document counts and checksums against the snapshot
 *   4. Write a drill report to drillReports/ collection
 *   5. Clean up the drill collections
 * 
 * NEVER overwrites live data - all drill data uses the drill_ prefix.
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';

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
}

function parseArgs(): { 
  project: string; 
  snapshot: string; 
  dryRun: boolean;
  cleanup?: string;
} {
  const args = process.argv.slice(2);
  let project = '';
  let snapshot = '';
  let dryRun = false;
  let cleanup: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      project = args[++i];
    } else if (args[i] === '--snapshot' && args[i + 1]) {
      snapshot = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--cleanup' && args[i + 1]) {
      cleanup = args[++i];
    }
  }

  if (!project) {
    console.error('Error: --project is required');
    console.error('Usage: npx ts-node scripts/restore-drill.ts --project <project-id> --snapshot <snapshot-id>');
    process.exit(1);
  }

  if (!snapshot && !cleanup) {
    console.error('Error: --snapshot or --cleanup is required');
    console.error('Usage: npx ts-node scripts/restore-drill.ts --project <project-id> --snapshot <snapshot-id>');
    process.exit(1);
  }

  return { project, snapshot, dryRun, cleanup };
}

function generateDrillId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `drill_${date}_${time}`;
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
    throw new Error(`Snapshot ${snapshotId} not found in snapshots/ collection`);
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
  console.log(`Cleaning up drill collections for: ${drillId}`);
  
  const collections = await db.listCollections();
  let totalDeleted = 0;
  
  for (const collRef of collections) {
    if (collRef.id.startsWith(drillId)) {
      console.log(`  Deleting collection: ${collRef.id}`);
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

async function main() {
  const { project, snapshot, dryRun, cleanup } = parseArgs();

  console.log(`\n===========================================`);
  console.log(`  RESTORE DRILL - Backup Validation Test`);
  console.log(`===========================================`);
  console.log(`Project:  ${project}`);
  console.log(`Mode:     ${dryRun ? 'DRY RUN (no writes)' : 'LIVE DRILL'}`);
  console.log();

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    const serviceAccount = require(serviceAccountPath) as ServiceAccount;
    initializeApp({
      credential: cert(serviceAccount),
      projectId: project,
    });
  } else {
    initializeApp({ projectId: project });
  }

  const db = getFirestore();

  if (cleanup) {
    console.log(`Cleanup mode: removing drill collections for ${cleanup}`);
    const deleted = await cleanupDrill(db, cleanup);
    console.log(`\n✅ Cleanup complete. Deleted ${deleted} documents.`);
    process.exit(0);
  }

  const drillId = generateDrillId();
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  console.log(`Drill ID: ${drillId}`);
  console.log(`Snapshot: ${snapshot}`);
  console.log();

  let snapshotData: SnapshotData;
  try {
    console.log(`Reading snapshot ${snapshot}...`);
    snapshotData = await readSnapshot(db, snapshot);
  } catch (error) {
    console.error(`Failed to read snapshot: ${error}`);
    process.exit(1);
  }

  console.log(`\nSnapshot Metadata:`);
  console.log(`  Created:     ${snapshotData.metadata.createdAt}`);
  console.log(`  Created by:  ${snapshotData.metadata.createdByEmail}`);
  console.log(`  Collections: ${snapshotData.metadata.collections.join(', ')}`);

  let totalExpected = 0;
  console.log(`\nSnapshot document counts:`);
  for (const [collection, docs] of Object.entries(snapshotData.data)) {
    console.log(`  ${collection}: ${docs.length}`);
    totalExpected += docs.length;
  }
  console.log(`  Total: ${totalExpected}`);

  if (dryRun) {
    console.log(`\n[DRY RUN] Would restore ${totalExpected} documents to drill collections.`);
    console.log(`Drill collections would be named: ${drillId}_<collection>`);
    console.log(`No changes made.`);
    process.exit(0);
  }

  console.log(`\n--- PHASE 1: Restore to drill collections ---`);
  
  for (const [collection, docs] of Object.entries(snapshotData.data)) {
    const drillCollection = getDrillCollectionName(drillId, collection);
    console.log(`  Restoring ${collection} -> ${drillCollection}...`);
    
    const BATCH_SIZE = 500;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      
      for (const doc of chunk) {
        batch.set(db.collection(drillCollection).doc(doc.id), doc.data);
      }
      
      await batch.commit();
    }
    console.log(`    Restored ${docs.length} documents`);
  }

  console.log(`\n--- PHASE 2: Validation ---`);
  
  const validation: DrillReport['validation'] = [];
  let totalRestored = 0;
  let allCountsMatch = true;
  let allChecksumsMatch = true;

  for (const [collection, expectedDocs] of Object.entries(snapshotData.data)) {
    const drillCollection = getDrillCollectionName(drillId, collection);
    console.log(`  Validating ${drillCollection}...`);
    
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

    console.log(`    Count: ${restoredCount}/${expectedCount} ${countMatch ? '✓' : '✗'}`);
    console.log(`    Checksum: ${checksumActual} ${checksumMatch ? '✓' : '✗'}`);

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

  console.log(`\n--- PHASE 3: Cleanup ---`);
  const deleted = await cleanupDrill(db, drillId);
  console.log(`  Deleted ${deleted} drill documents`);

  const completedAt = new Date().toISOString();
  const status = allCountsMatch && allChecksumsMatch ? 'success' : 
                 errors.length < Object.keys(snapshotData.data).length ? 'partial' : 'failure';

  const report: DrillReport = {
    drillId,
    snapshotId: snapshot,
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
  };

  console.log(`\n--- PHASE 4: Write drill report ---`);
  await db.collection('drillReports').doc(drillId).set(report);
  console.log(`  Report saved to drillReports/${drillId}`);

  console.log(`\n===========================================`);
  console.log(`  DRILL RESULTS`);
  console.log(`===========================================`);
  console.log(`Status:           ${status.toUpperCase()}`);
  console.log(`Total Expected:   ${totalExpected}`);
  console.log(`Total Restored:   ${totalRestored}`);
  console.log(`Count Match:      ${allCountsMatch ? 'YES ✓' : 'NO ✗'}`);
  console.log(`Checksum Match:   ${allChecksumsMatch ? 'YES ✓' : 'NO ✗'}`);
  console.log(`Cleaned Up:       YES ✓`);
  
  if (errors.length > 0) {
    console.log(`\nErrors:`);
    errors.forEach(e => console.log(`  - ${e}`));
  }

  console.log(`\n${status === 'success' ? '✅' : '❌'} Restore drill ${status === 'success' ? 'passed' : 'failed'}.`);
  
  process.exit(status === 'success' ? 0 : 1);
}

main().catch((error) => {
  console.error('Restore drill failed:', error);
  process.exit(1);
});
