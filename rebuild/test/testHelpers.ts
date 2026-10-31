import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder';

let _app: App | undefined;
let _db: Firestore | undefined;
let _settingsApplied = false;

export function getTestDb(): Firestore {
  if (!_app) {
    if (getApps().length === 0) {
      _app = initializeApp({ projectId: PROJECT_ID });
    } else {
      _app = getApps()[0];
    }
  }
  
  if (!_db) {
    _db = getFirestore(_app);
    if (!_settingsApplied) {
      _db.settings({ ignoreUndefinedProperties: true });
      _settingsApplied = true;
    }
  }
  
  return _db;
}

export async function seedTestUsers(): Promise<void> {
  const db = getTestDb();
  const users = [
    { id: 'admin', email: 'admin@test.com', displayName: 'Test Admin', role: 'Admin', status: 'active', version: 1 },
    { id: 'viewer', email: 'viewer@test.com', displayName: 'Test Viewer', role: 'Viewer', status: 'active', version: 1 },
    { id: 'steward', email: 'steward@test.com', displayName: 'Test Steward', role: 'Steward', status: 'active', version: 1 },
    { id: 'leader', email: 'leader@test.com', displayName: 'Test Leader', role: 'Leader', status: 'active', version: 1 },
  ];

  for (const user of users) {
    await db.collection('users').doc(user.id).set({
      ...user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
}

export interface SeedHierarchyResult {
  regionId: string;
  region2Id: string;
  districtId: string;
  district2Id: string;
}

export async function seedTestHierarchy(): Promise<SeedHierarchyResult> {
  const db = getTestDb();
  const now = new Date().toISOString();

  const regionRef = db.collection('regions').doc('test-region-1');
  await regionRef.set({
    code: 'WEST',
    name: 'West Region',
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const region2Ref = db.collection('regions').doc('test-region-2');
  await region2Ref.set({
    code: 'EAST',
    name: 'East Region',
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const districtRef = db.collection('districts').doc('test-district-1');
  await districtRef.set({
    code: 'LA-CENTRAL',
    name: 'LA Central District',
    regionId: regionRef.id,
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const district2Ref = db.collection('districts').doc('test-district-2');
  await district2Ref.set({
    code: 'NYC-CENTRAL',
    name: 'NYC Central District',
    regionId: region2Ref.id,
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  return {
    regionId: regionRef.id,
    region2Id: region2Ref.id,
    districtId: districtRef.id,
    district2Id: district2Ref.id,
  };
}

export async function seedTestLeader(districtId: string): Promise<{ userId: string; personId: string }> {
  const db = getTestDb();
  const now = new Date().toISOString();

  const personRef = db.collection('people').doc('test-leader-person');
  await personRef.set({
    fullName: 'Test Leader Person',
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const userRef = db.collection('users').doc('leader');
  await userRef.update({
    personId: personRef.id,
  });

  const assignmentRef = db.collection('assignments').doc();
  await assignmentRef.set({
    personId: personRef.id,
    role: 'DM',
    scopeType: 'district',
    scopeId: districtId,
    slot: 'primary',
    startDate: now.slice(0, 10),
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  return { userId: 'leader', personId: personRef.id };
}

export async function seedTestLocationsForDistrict(districtId: string, regionId: string, count: number, prefix: string): Promise<string[]> {
  const db = getTestDb();
  const now = new Date().toISOString();
  const locationIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const storeNumber = `${prefix}${String(i + 1).padStart(3, '0')}`;
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      storeNumber,
      name: `Test Store ${storeNumber}`,
      lifecycle: 'active',
      address: {
        street: `${100 + i} Test St`,
        city: 'Test City',
        state: 'CA',
        zip: '90001',
        country: 'US',
      },
      timeZone: 'America/Los_Angeles',
      mainPhone: `+1213555${String(i).padStart(4, '0')}`,
      phonePublic: true,
      sharedInboxEmail: `${storeNumber.toLowerCase()}@shiekh.test`,
      regionId,
      districtId,
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    locationIds.push(locationRef.id);
  }

  return locationIds;
}
