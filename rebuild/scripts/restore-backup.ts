#!/usr/bin/env npx tsx
/**
 * Firestore Backup Restore Script
 * 
 * This script restores a Firestore backup from Google Cloud Storage.
 * 
 * IMPORTANT: This script requires explicit project targeting for safety.
 * It will NOT proceed without a --project flag.
 * 
 * Usage:
 *   npx tsx scripts/restore-backup.ts --project=your-project-id --backup=gs://bucket/path
 * 
 * Options:
 *   --project   REQUIRED. Target GCP project ID (e.g., shiekh-directory-prod)
 *   --backup    REQUIRED. GCS path to backup (e.g., gs://shiekh-backups/firestore-exports/scheduled-2026-01-01)
 *   --database  Firestore database ID (default: "(default)")
 *   --dry-run   Show what would be restored without executing
 *   --confirm   Skip interactive confirmation prompt
 * 
 * Prerequisites:
 *   1. gcloud CLI installed and authenticated
 *   2. Service account with Firestore Admin permissions
 *   3. Access to the backup bucket
 * 
 * Example:
 *   npx tsx scripts/restore-backup.ts \
 *     --project=shiekh-directory-prod \
 *     --backup=gs://shiekh-directory-prod-backups/firestore-exports/scheduled-weekly-2026-01-05T03-00-00-000Z
 */

import { Firestore } from '@google-cloud/firestore';
import * as readline from 'readline';

interface RestoreOptions {
  project: string;
  backup: string;
  database: string;
  dryRun: boolean;
  confirm: boolean;
}

function parseArgs(): RestoreOptions {
  const args = process.argv.slice(2);
  const options: Partial<RestoreOptions> = {
    database: '(default)',
    dryRun: false,
    confirm: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--project=')) {
      options.project = arg.split('=')[1];
    } else if (arg.startsWith('--backup=')) {
      options.backup = arg.split('=')[1];
    } else if (arg.startsWith('--database=')) {
      options.database = arg.split('=')[1];
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--confirm') {
      options.confirm = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (!options.project) {
    console.error('ERROR: --project is required for safety');
    console.error('This ensures you are restoring to the correct project.');
    console.error('');
    printUsage();
    process.exit(1);
  }

  if (!options.backup) {
    console.error('ERROR: --backup is required');
    console.error('');
    printUsage();
    process.exit(1);
  }

  if (!options.backup.startsWith('gs://')) {
    console.error('ERROR: --backup must be a GCS path starting with gs://');
    process.exit(1);
  }

  return options as RestoreOptions;
}

function printUsage(): void {
  console.log(`
Firestore Backup Restore Script

Usage:
  npx tsx scripts/restore-backup.ts --project=PROJECT_ID --backup=GCS_PATH [options]

Required:
  --project=ID    Target GCP project ID (REQUIRED for safety)
  --backup=PATH   GCS path to backup (gs://bucket/path)

Options:
  --database=ID   Firestore database ID (default: "(default)")
  --dry-run       Show what would be restored without executing
  --confirm       Skip interactive confirmation prompt
  --help, -h      Show this help message

Examples:
  # Dry run to see what would happen
  npx tsx scripts/restore-backup.ts \\
    --project=shiekh-directory-prod \\
    --backup=gs://shiekh-backups/exports/weekly-2026-01-05 \\
    --dry-run

  # Restore with confirmation
  npx tsx scripts/restore-backup.ts \\
    --project=shiekh-directory-prod \\
    --backup=gs://shiekh-backups/exports/weekly-2026-01-05

  # Restore without prompts (for automation)
  npx tsx scripts/restore-backup.ts \\
    --project=shiekh-directory-prod \\
    --backup=gs://shiekh-backups/exports/weekly-2026-01-05 \\
    --confirm
`);
}

async function promptConfirmation(project: string, backup: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('');
    console.log('='.repeat(60));
    console.log('⚠️  FIRESTORE RESTORE WARNING');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Project:  ${project}`);
    console.log(`Backup:   ${backup}`);
    console.log('');
    console.log('This operation will import data from the backup into Firestore.');
    console.log('Existing documents with the same IDs will be OVERWRITTEN.');
    console.log('');
    
    rl.question('Type the project name to confirm: ', (answer) => {
      rl.close();
      resolve(answer.trim() === project);
    });
  });
}

async function executeRestore(options: RestoreOptions): Promise<void> {
  console.log('');
  console.log('Starting Firestore restore...');
  console.log(`  Project:  ${options.project}`);
  console.log(`  Database: ${options.database}`);
  console.log(`  Backup:   ${options.backup}`);
  console.log('');

  if (options.dryRun) {
    console.log('DRY RUN: No changes will be made');
    console.log('');
    console.log('Would execute:');
    console.log(`  gcloud firestore import ${options.backup} \\`);
    console.log(`    --project=${options.project} \\`);
    console.log(`    --database=${options.database}`);
    return;
  }

  const client = new (Firestore as any).v1.FirestoreAdminClient();
  const databasePath = client.databasePath(options.project, options.database);

  console.log('Initiating import operation...');

  try {
    const [operation] = await client.importDocuments({
      name: databasePath,
      inputUriPrefix: options.backup,
    });

    console.log(`Import operation started: ${operation.name}`);
    console.log('');
    console.log('The import is running in the background.');
    console.log('Monitor progress in the Google Cloud Console:');
    console.log(`  https://console.cloud.google.com/firestore/databases/${options.database}/import-export?project=${options.project}`);
    console.log('');
    console.log('Or check operation status:');
    console.log(`  gcloud firestore operations describe ${operation.name.split('/').pop()} \\`);
    console.log(`    --project=${options.project} \\`);
    console.log(`    --database=${options.database}`);
  } catch (error) {
    console.error('Restore failed:', error);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('');
  console.log('Firestore Restore Tool');
  console.log('='.repeat(40));

  if (options.dryRun) {
    await executeRestore(options);
    return;
  }

  if (!options.confirm) {
    const confirmed = await promptConfirmation(options.project, options.backup);
    if (!confirmed) {
      console.log('');
      console.log('Restore cancelled.');
      process.exit(0);
    }
  }

  await executeRestore(options);
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
