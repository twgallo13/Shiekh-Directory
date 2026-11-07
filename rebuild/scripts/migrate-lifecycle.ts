#!/usr/bin/env npx tsx
/**
 * Migration script to normalize location lifecycle values
 * 
 * This script:
 * - Sets locations with missing/null lifecycle to 'active'
 * - Converts any 'draft' lifecycle to 'planned'
 * 
 * Idempotent: Safe to run multiple times
 * 
 * Usage:
 *   npx tsx scripts/migrate-lifecycle.ts --project <project-id> --dry-run
 *   npx tsx scripts/migrate-lifecycle.ts --project <project-id>
 * 
 * Environment:
 *   FIRESTORE_EMULATOR_HOST  Use local emulator
 *   GOOGLE_APPLICATION_CREDENTIALS  Path to service account key file
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

interface MigrationStats {
  totalScanned: number;
  missingLifecycle: number;
  draftToPlanned: number;
  alreadyCorrect: number;
  errors: number;
}

function parseArgs(args: string[]): { project?: string; dryRun: boolean } {
  const result: { project?: string; dryRun: boolean } = { dryRun: false };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--project' && args[i + 1]) {
      result.project = args[++i];
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    }
  }
  
  return result;
}

function printUsage() {
  console.log(`
Location Lifecycle Migration Script

Normalizes location lifecycle values:
  - Sets missing/null lifecycle to 'active'
  - Converts 'draft' lifecycle to 'planned'

Usage:
  npx tsx scripts/migrate-lifecycle.ts --project <project-id> [--dry-run]

Options:
  --project <id>   Firebase project ID (REQUIRED)
  --dry-run        Preview changes without applying them

Environment:
  FIRESTORE_EMULATOR_HOST  Use local emulator (e.g., localhost:8080)
  GOOGLE_APPLICATION_CREDENTIALS  Path to service account key file

Examples:
  # Preview changes on emulator
  FIRESTORE_EMULATOR_HOST=localhost:8080 npx tsx scripts/migrate-lifecycle.ts --project demo-project --dry-run
  
  # Apply changes to production
  npx tsx scripts/migrate-lifecycle.ts --project my-project
`);
}

async function migrateLocations(db: Firestore, dryRun: boolean): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalScanned: 0,
    missingLifecycle: 0,
    draftToPlanned: 0,
    alreadyCorrect: 0,
    errors: 0,
  };

  console.log('\n📍 Scanning locations collection...\n');

  const snapshot = await db.collection('locations').get();
  stats.totalScanned = snapshot.size;

  console.log(`Found ${stats.totalScanned} locations\n`);

  const updates: { id: string; storeNumber: string; from: string; to: string }[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const storeNumber = data.storeNumber || doc.id;
    const lifecycle = data.lifecycle;

    if (lifecycle === undefined || lifecycle === null || lifecycle === '') {
      updates.push({
        id: doc.id,
        storeNumber,
        from: lifecycle === undefined ? 'undefined' : lifecycle === null ? 'null' : 'empty',
        to: 'active',
      });
      stats.missingLifecycle++;
    } else if (lifecycle === 'draft') {
      updates.push({
        id: doc.id,
        storeNumber,
        from: 'draft',
        to: 'planned',
      });
      stats.draftToPlanned++;
    } else {
      stats.alreadyCorrect++;
    }
  }

  if (updates.length === 0) {
    console.log('✅ All locations already have correct lifecycle values.\n');
    return stats;
  }

  console.log(`Found ${updates.length} locations needing updates:\n`);

  for (const update of updates) {
    console.log(`  Store ${update.storeNumber}: ${update.from} → ${update.to}`);
  }

  if (dryRun) {
    console.log('\n🔍 DRY RUN - No changes applied.\n');
    return stats;
  }

  console.log('\n📝 Applying updates...\n');

  const batch = db.batch();
  const now = new Date().toISOString();

  for (const update of updates) {
    try {
      const ref = db.collection('locations').doc(update.id);
      batch.update(ref, {
        lifecycle: update.to,
        updatedAt: now,
        updatedBy: 'migration/lifecycle-normalization',
      });
    } catch (error) {
      console.error(`  ❌ Error preparing update for ${update.storeNumber}:`, error);
      stats.errors++;
    }
  }

  try {
    await batch.commit();
    console.log(`✅ Successfully updated ${updates.length} locations.\n`);
  } catch (error) {
    console.error('❌ Error committing batch:', error);
    stats.errors = updates.length;
  }

  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.project) {
    console.error('Error: --project is required\n');
    printUsage();
    process.exit(1);
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  console.log('\n========================================');
  console.log('  Location Lifecycle Migration Script');
  console.log('========================================\n');

  if (args.dryRun) {
    console.log('🔍 Mode: DRY RUN (no changes will be made)\n');
  } else {
    console.log('⚠️  Mode: LIVE (changes will be applied)\n');
  }

  if (emulatorHost) {
    console.log(`📦 Using Firestore emulator at ${emulatorHost}`);
    initializeApp({ projectId: args.project });
  } else {
    console.log(`🔥 Connecting to production Firestore for project: ${args.project}`);
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
      const serviceAccount = require(credPath) as ServiceAccount;
      initializeApp({ credential: cert(serviceAccount), projectId: args.project });
    } else {
      initializeApp({ projectId: args.project });
    }
  }

  const db = getFirestore();

  try {
    const stats = await migrateLocations(db, args.dryRun);

    console.log('========================================');
    console.log('  Migration Summary');
    console.log('========================================');
    console.log(`  Total scanned:       ${stats.totalScanned}`);
    console.log(`  Missing lifecycle:   ${stats.missingLifecycle} → set to 'active'`);
    console.log(`  Draft to planned:    ${stats.draftToPlanned}`);
    console.log(`  Already correct:     ${stats.alreadyCorrect}`);
    console.log(`  Errors:              ${stats.errors}`);
    console.log('========================================\n');

    if (args.dryRun && (stats.missingLifecycle > 0 || stats.draftToPlanned > 0)) {
      console.log('To apply these changes, run without --dry-run:\n');
      console.log(`  npx tsx scripts/migrate-lifecycle.ts --project ${args.project}\n`);
    }

    process.exit(stats.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
