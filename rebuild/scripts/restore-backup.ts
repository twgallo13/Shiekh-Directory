#!/usr/bin/env npx ts-node
/**
 * Restore script for pre-import backups
 * 
 * Usage:
 *   npx ts-node scripts/restore-backup.ts --project <project-id> --backup <backup-id-or-path>
 * 
 * Examples:
 *   # Restore from backup ID (auto-detects Storage or Firestore)
 *   npx ts-node scripts/restore-backup.ts --project shiekh-directory --backup pre-import-2024-01-15T10-30-00-000Z
 * 
 *   # Restore from explicit Storage path
 *   npx ts-node scripts/restore-backup.ts --project shiekh-directory --backup gs://bucket/backups/pre-import/2024-01-15T10-30-00-000Z.json.gz
 * 
 * Safety:
 *   - Requires explicit --project flag
 *   - Prompts for confirmation before write
 *   - Does NOT delete existing documents (merge only)
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { gunzipSync } from 'zlib';
import * as readline from 'readline';

interface SnapshotData {
  metadata: {
    createdAt: string;
    createdBy: string;
    createdByEmail: string;
    collections: string[];
  };
  data: Record<string, Array<{ id: string; data: Record<string, unknown> }>>;
}

function parseArgs(): { project: string; backup: string; dryRun: boolean; force: boolean } {
  const args = process.argv.slice(2);
  let project = '';
  let backup = '';
  let dryRun = false;
  let force = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) {
      project = args[++i];
    } else if (args[i] === '--backup' && args[i + 1]) {
      backup = args[++i];
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--force') {
      force = true;
    }
  }

  if (!project) {
    console.error('Error: --project is required');
    console.error('Usage: npx ts-node scripts/restore-backup.ts --project <project-id> --backup <backup-id>');
    process.exit(1);
  }

  if (!backup) {
    console.error('Error: --backup is required');
    console.error('Usage: npx ts-node scripts/restore-backup.ts --project <project-id> --backup <backup-id>');
    process.exit(1);
  }

  return { project, backup, dryRun, force };
}

async function prompt(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// readFromStorage is used inline in the main function when loading from gs:// paths

async function readFromFirestore(db: FirebaseFirestore.Firestore, docId: string): Promise<SnapshotData> {
  const snapshotDoc = await db.collection('snapshots').doc(docId).get();
  if (!snapshotDoc.exists) {
    throw new Error(`Snapshot document ${docId} not found`);
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

async function main() {
  const { project, backup, dryRun, force } = parseArgs();

  console.log(`\nRestore Backup Script`);
  console.log(`=====================`);
  console.log(`Project: ${project}`);
  console.log(`Backup:  ${backup}`);
  console.log(`Mode:    ${dryRun ? 'DRY RUN (no writes)' : 'LIVE'}`);
  console.log();

  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (serviceAccountPath) {
    const serviceAccount = require(serviceAccountPath) as ServiceAccount;
    initializeApp({
      credential: cert(serviceAccount),
      projectId: project,
      storageBucket: `${project}.appspot.com`,
    });
  } else {
    initializeApp({
      projectId: project,
      storageBucket: `${project}.appspot.com`,
    });
  }

  const db = getFirestore();

  let snapshotData: SnapshotData;

  if (backup.startsWith('gs://')) {
    const path = backup.replace(/^gs:\/\/[^/]+\//, '');
    console.log(`Reading from Storage: ${path}`);
    const bucket = getStorage().bucket();
    const file = bucket.file(path);
    const [contents] = await file.download();
    const decompressed = gunzipSync(contents);
    snapshotData = JSON.parse(decompressed.toString('utf-8'));
  } else {
    const backupDoc = await db.collection('backups').doc(backup).get();

    if (backupDoc.exists) {
      const backupData = backupDoc.data()!;
      
      if (backupData.storagePath) {
        console.log(`Reading from Storage: ${backupData.storagePath}`);
        const bucket = getStorage().bucket();
        const file = bucket.file(backupData.storagePath);
        const [contents] = await file.download();
        const decompressed = gunzipSync(contents);
        snapshotData = JSON.parse(decompressed.toString('utf-8'));
      } else if (backupData.firestoreDocId) {
        console.log(`Reading from Firestore snapshot: ${backupData.firestoreDocId}`);
        snapshotData = await readFromFirestore(db, backupData.firestoreDocId);
      } else {
        console.log(`Reading from Firestore snapshot: ${backup}`);
        snapshotData = await readFromFirestore(db, backup);
      }
    } else {
      console.log(`Backup record not found, trying as snapshot ID: ${backup}`);
      snapshotData = await readFromFirestore(db, backup);
    }
  }

  console.log(`\nBackup Metadata:`);
  console.log(`  Created:    ${snapshotData.metadata.createdAt}`);
  console.log(`  Created by: ${snapshotData.metadata.createdByEmail}`);
  console.log(`  Collections: ${snapshotData.metadata.collections.join(', ')}`);

  let totalDocs = 0;
  console.log(`\nDocument counts:`);
  for (const [collection, docs] of Object.entries(snapshotData.data)) {
    console.log(`  ${collection}: ${docs.length}`);
    totalDocs += docs.length;
  }
  console.log(`  Total: ${totalDocs}`);

  if (dryRun) {
    console.log(`\n[DRY RUN] Would restore ${totalDocs} documents. No changes made.`);
    process.exit(0);
  }

  if (!force) {
    console.log(`\n⚠️  WARNING: This will MERGE ${totalDocs} documents into project "${project}".`);
    console.log(`   Existing documents with matching IDs will be overwritten.`);
    const confirmed = await prompt('Are you sure you want to continue? (y/N): ');
    
    if (!confirmed) {
      console.log('Restore cancelled.');
      process.exit(0);
    }
  }

  console.log(`\nRestoring...`);

  for (const [collection, docs] of Object.entries(snapshotData.data)) {
    console.log(`  Restoring ${collection}...`);
    
    const BATCH_SIZE = 500;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + BATCH_SIZE);
      
      for (const doc of chunk) {
        batch.set(db.collection(collection).doc(doc.id), doc.data, { merge: true });
      }
      
      await batch.commit();
      console.log(`    ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length}`);
    }
  }

  await db.collection('auditLog').add({
    timestamp: new Date().toISOString(),
    userId: 'system',
    userEmail: 'restore-script',
    userRole: 'System',
    action: 'restore',
    entityType: 'backup',
    entityId: backup,
    entityName: `Restore from ${backup}`,
    changes: [
      { field: 'documentsRestored', newValue: totalDocs },
      { field: 'collections', newValue: Object.keys(snapshotData.data).join(', ') },
    ],
  });

  console.log(`\n✅ Restore complete. ${totalDocs} documents restored.`);
}

main().catch((error) => {
  console.error('Restore failed:', error);
  process.exit(1);
});
