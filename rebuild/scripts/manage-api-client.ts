#!/usr/bin/env npx tsx
/**
 * CLI script for managing API clients
 * 
 * Usage:
 *   npx tsx scripts/manage-api-client.ts --project <project-id> create --name "My Client" [--scopes locations:read,personnel:read]
 *   npx tsx scripts/manage-api-client.ts --project <project-id> list
 *   npx tsx scripts/manage-api-client.ts --project <project-id> revoke --id <client-id>
 *   npx tsx scripts/manage-api-client.ts --project <project-id> rotate --id <client-id>
 */

import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { hashToken, generateApiToken, type LegacyApiScope, type ApiClientDocument } from '../server/middleware/legacyApiAuth';

const VALID_SCOPES: LegacyApiScope[] = [
  'locations:read',
  'personnel:read',
  'staffing:read',
  'district-leadership:read',
  'district-leadership:contacts:read',
];

function parseArgs(args: string[]): { project?: string; command?: string; name?: string; id?: string; scopes?: string } {
  const result: Record<string, string | undefined> = {};
  let i = 0;
  
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--project' && args[i + 1]) {
      result.project = args[++i];
    } else if (arg === '--name' && args[i + 1]) {
      result.name = args[++i];
    } else if (arg === '--id' && args[i + 1]) {
      result.id = args[++i];
    } else if (arg === '--scopes' && args[i + 1]) {
      result.scopes = args[++i];
    } else if (!arg.startsWith('--')) {
      result.command = arg;
    }
    i++;
  }
  
  return result;
}

function printUsage() {
  console.log(`
API Client Management CLI

Usage:
  npx tsx scripts/manage-api-client.ts --project <project-id> <command> [options]

Commands:
  create    Create a new API client
  list      List all API clients
  revoke    Revoke an API client
  rotate    Rotate an API client's token

Options:
  --project <id>   Firebase project ID (REQUIRED)
  --name <name>    Client name (for create)
  --id <id>        Client ID (for revoke/rotate)
  --scopes <list>  Comma-separated scopes (for create, default: locations:read)

Valid scopes: ${VALID_SCOPES.join(', ')}

Examples:
  npx tsx scripts/manage-api-client.ts --project my-project create --name "External App"
  npx tsx scripts/manage-api-client.ts --project my-project create --name "Full Access" --scopes locations:read,personnel:read
  npx tsx scripts/manage-api-client.ts --project my-project list
  npx tsx scripts/manage-api-client.ts --project my-project revoke --id api-xxx
  npx tsx scripts/manage-api-client.ts --project my-project rotate --id api-xxx

Environment:
  API_TOKEN_PEPPER  Secret pepper for token hashing (required for production)
  GOOGLE_APPLICATION_CREDENTIALS  Path to service account key file
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  
  if (!args.project) {
    console.error('Error: --project is required\n');
    printUsage();
    process.exit(1);
  }
  
  if (!args.command) {
    console.error('Error: Command is required\n');
    printUsage();
    process.exit(1);
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  
  if (emulatorHost) {
    console.log(`Using Firestore emulator at ${emulatorHost}`);
    initializeApp({ projectId: args.project });
  } else {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (credPath) {
      const serviceAccount = require(credPath) as ServiceAccount;
      initializeApp({ credential: cert(serviceAccount), projectId: args.project });
    } else {
      initializeApp({ projectId: args.project });
    }
  }
  
  const db = getFirestore();
  
  switch (args.command) {
    case 'create':
      await createClient(db, args.name, args.scopes);
      break;
    case 'list':
      await listClients(db);
      break;
    case 'revoke':
      await revokeClient(db, args.id);
      break;
    case 'rotate':
      await rotateClient(db, args.id);
      break;
    default:
      console.error(`Unknown command: ${args.command}\n`);
      printUsage();
      process.exit(1);
  }
}

async function createClient(db: FirebaseFirestore.Firestore, name?: string, scopesArg?: string) {
  if (!name) {
    console.error('Error: --name is required for create');
    process.exit(1);
  }
  
  const scopes: LegacyApiScope[] = scopesArg
    ? scopesArg.split(',').map(s => s.trim()) as LegacyApiScope[]
    : ['locations:read'];
  
  for (const scope of scopes) {
    if (!VALID_SCOPES.includes(scope)) {
      console.error(`Error: Invalid scope "${scope}". Valid scopes: ${VALID_SCOPES.join(', ')}`);
      process.exit(1);
    }
  }
  
  const token = generateApiToken();
  const tokenHash = hashToken(token);
  const clientId = `api-${randomUUID()}`;
  const now = new Date().toISOString();
  
  const clientDoc: Omit<ApiClientDocument, 'id'> = {
    name: name.trim(),
    tokenHash,
    scopes,
    active: true,
    version: 1,
    createdAt: now,
  };
  
  await db.collection('apiClients').doc(clientId).set(clientDoc);
  
  console.log('\n✅ API Client created successfully!\n');
  console.log('Client ID:', clientId);
  console.log('Name:', name);
  console.log('Scopes:', scopes.join(', '));
  console.log('Created:', now);
  console.log('\n🔑 API Token (shown only once - save it now!):\n');
  console.log(`   ${token}\n`);
  console.log('Use this token in the Authorization header:');
  console.log(`   Authorization: Bearer ${token}\n`);
}

async function listClients(db: FirebaseFirestore.Firestore) {
  const snapshot = await db.collection('apiClients').orderBy('createdAt', 'desc').get();
  
  if (snapshot.empty) {
    console.log('\nNo API clients found.\n');
    return;
  }
  
  console.log('\nAPI Clients:\n');
  console.log('ID'.padEnd(40) + 'Name'.padEnd(25) + 'Active'.padEnd(10) + 'Scopes'.padEnd(50) + 'Last Used');
  console.log('-'.repeat(140));
  
  for (const doc of snapshot.docs) {
    const data = doc.data() as Omit<ApiClientDocument, 'id'>;
    console.log(
      doc.id.padEnd(40) +
      data.name.slice(0, 23).padEnd(25) +
      (data.active ? 'Yes' : 'No').padEnd(10) +
      data.scopes.join(', ').slice(0, 48).padEnd(50) +
      (data.lastUsedAt || 'Never')
    );
  }
  console.log('');
}

async function revokeClient(db: FirebaseFirestore.Firestore, id?: string) {
  if (!id) {
    console.error('Error: --id is required for revoke');
    process.exit(1);
  }
  
  const docRef = db.collection('apiClients').doc(id);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    console.error(`Error: API client not found: ${id}`);
    process.exit(1);
  }
  
  const data = doc.data() as Omit<ApiClientDocument, 'id'>;
  if (!data.active) {
    console.log('API client is already revoked.');
    return;
  }
  
  await docRef.update({
    active: false,
    version: data.version + 1,
  });
  
  console.log(`\n✅ API Client "${data.name}" has been revoked.\n`);
}

async function rotateClient(db: FirebaseFirestore.Firestore, id?: string) {
  if (!id) {
    console.error('Error: --id is required for rotate');
    process.exit(1);
  }
  
  const docRef = db.collection('apiClients').doc(id);
  const doc = await docRef.get();
  
  if (!doc.exists) {
    console.error(`Error: API client not found: ${id}`);
    process.exit(1);
  }
  
  const data = doc.data() as Omit<ApiClientDocument, 'id'>;
  if (!data.active) {
    console.error('Error: Cannot rotate token for revoked client');
    process.exit(1);
  }
  
  const token = generateApiToken();
  const tokenHash = hashToken(token);
  
  await docRef.update({
    tokenHash,
    version: data.version + 1,
  });
  
  console.log(`\n✅ API Token for "${data.name}" has been rotated!\n`);
  console.log('🔑 New API Token (shown only once - save it now!):\n');
  console.log(`   ${token}\n`);
  console.log('The old token is now invalid.\n');
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
