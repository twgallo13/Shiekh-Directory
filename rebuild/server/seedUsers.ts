/**
 * Seed sample users for testing slice 2 roles and permissions
 * 
 * Creates the following test accounts:
 * - viewer@shiekh.test (Viewer) - Read-only
 * - store007@shiekh.test (Store) - Store 007's shared account
 * - dm.jones@shiekh.test (Leader) - DM of LA-CENTRAL district
 * - steward@shiekh.test (Steward) - Can approve corrections
 * - admin@shiekh.test (Admin) - Full access
 * 
 * All accounts use password: test123
 */

import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import type { User } from '../src/types';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

const projectId = process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder';

let app;
if (getApps().length === 0) {
  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = initializeApp({
        credential: cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS) as ServiceAccount),
        projectId,
      });
    } else {
      app = initializeApp({ projectId });
    }
  } catch {
    app = initializeApp({ projectId });
  }
} else {
  app = getApps()[0];
}

const db = getFirestore(app);
const auth = getAuth(app);

db.settings({ ignoreUndefinedProperties: true });

const EMULATOR_AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const EMULATOR_FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;

interface SeedUser {
  email: string;
  password: string;
  displayName: string;
  role: User['role'];
  storeLocationId?: string;
}

const SEED_USERS: SeedUser[] = [
  {
    email: 'viewer@shiekh.test',
    password: 'test123',
    displayName: 'Test Viewer',
    role: 'Viewer',
  },
  {
    email: 'store007@shiekh.test',
    password: 'test123',
    displayName: 'Store 007 Account',
    role: 'Store',
    storeLocationId: 'store-007',
  },
  {
    email: 'dm.jones@shiekh.test',
    password: 'test123',
    displayName: 'David Jones (DM)',
    role: 'Leader',
  },
  {
    email: 'steward@shiekh.test',
    password: 'test123',
    displayName: 'Directory Steward',
    role: 'Steward',
  },
  {
    email: 'admin@shiekh.test',
    password: 'test123',
    displayName: 'System Admin',
    role: 'Admin',
  },
];

async function createAuthUser(email: string, password: string, displayName: string): Promise<string> {
  try {
    const existingUser = await auth.getUserByEmail(email).catch(() => null);
    if (existingUser) {
      console.log(`  User already exists: ${email}`);
      return existingUser.uid;
    }
  } catch {
  }

  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
    });
    return userRecord.uid;
  } catch (error: unknown) {
    const authError = error as { code?: string };
    if (authError.code === 'auth/email-already-exists') {
      const existingUser = await auth.getUserByEmail(email);
      console.log(`  User already exists: ${email}`);
      return existingUser.uid;
    }
    throw error;
  }
}

async function seedUsers() {
  console.log('Seeding test users...\n');
  console.log(`Auth Emulator: ${EMULATOR_AUTH_HOST}`);
  console.log(`Firestore Emulator: ${EMULATOR_FIRESTORE_HOST}\n`);

  const store007Snap = await db.collection('locations')
    .where('storeNumber', '==', '007')
    .limit(1)
    .get();
  const store007Id = store007Snap.empty ? null : store007Snap.docs[0].id;
  if (store007Id) {
    console.log(`Found store 007 with ID: ${store007Id}\n`);
  }

  for (const seedUser of SEED_USERS) {
    console.log(`Creating ${seedUser.role}: ${seedUser.email}`);
    
    try {
      const uid = await createAuthUser(seedUser.email, seedUser.password, seedUser.displayName);
      
      let storeLocationId = seedUser.storeLocationId;
      if (seedUser.email === 'store007@shiekh.test' && store007Id) {
        storeLocationId = store007Id;
      }
      
      const userDoc: User = {
        id: uid,
        email: seedUser.email,
        displayName: seedUser.displayName,
        role: seedUser.role,
        status: 'active',
        storeLocationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: 'seed-script',
        version: 1,
      };
      
      await db.collection('users').doc(uid).set(userDoc);
      console.log(`  ✓ Created user profile in Firestore`);
      
      if (seedUser.role === 'Leader' && seedUser.email === 'dm.jones@shiekh.test') {
        const existingPerson = await db.collection('people')
          .where('fullName', '==', 'David Jones')
          .limit(1)
          .get();
        
        if (!existingPerson.empty) {
          const personId = existingPerson.docs[0].id;
          await db.collection('people').doc(personId).update({ userId: uid });
          await db.collection('users').doc(uid).update({ personId });
          console.log(`  ✓ Linked to existing person record`);
        }
      }
      
    } catch (error) {
      console.error(`  ✗ Error creating ${seedUser.email}:`, error);
    }
  }

  console.log('\n✓ User seeding complete!\n');
  console.log('Test accounts (all passwords: test123):');
  console.log('----------------------------------------');
  for (const user of SEED_USERS) {
    console.log(`  ${user.role.padEnd(8)} | ${user.email}`);
  }
  console.log('');
}

seedUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });
