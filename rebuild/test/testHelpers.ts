import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
}
if (!process.env.STORE_AUTH_TOKEN_SECRET) {
  process.env.STORE_AUTH_TOKEN_SECRET = 'test-token-secret-for-testing-only-not-production-use-minimum-32-chars';
}
if (!process.env.STORE_SESSION_SECRET) {
  process.env.STORE_SESSION_SECRET = 'test-session-secret-for-testing-only-not-production-use-min-32-chars';
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

export async function seedTestHierarchy(uniqueId?: string): Promise<SeedHierarchyResult> {
  const db = getTestDb();
  const now = new Date().toISOString();
  const suffix = uniqueId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const regionRef = db.collection('regions').doc(`test-region-1-${suffix}`);
  await regionRef.set({
    code: `WEST_${suffix.slice(-4).toUpperCase()}`,
    name: 'West Region',
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const region2Ref = db.collection('regions').doc(`test-region-2-${suffix}`);
  await region2Ref.set({
    code: `EAST_${suffix.slice(-4).toUpperCase()}`,
    name: 'East Region',
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const districtRef = db.collection('districts').doc(`test-district-1-${suffix}`);
  await districtRef.set({
    code: `LA_${suffix.slice(-4).toUpperCase()}`,
    name: 'LA Central District',
    regionId: regionRef.id,
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });

  const district2Ref = db.collection('districts').doc(`test-district-2-${suffix}`);
  await district2Ref.set({
    code: `NYC_${suffix.slice(-4).toUpperCase()}`,
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

export async function seedTestLeader(districtId: string, uniqueId?: string): Promise<{ userId: string; personId: string }> {
  const db = getTestDb();
  const now = new Date().toISOString();
  const suffix = uniqueId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const personRef = db.collection('people').doc(`test-leader-person-${suffix}`);
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

  const assignmentRef = db.collection('assignments').doc(`test-assignment-${suffix}`);
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

export interface SeedLocationOptions {
  storeNumber: string;
  name: string;
  kind: 'store' | 'warehouse' | 'office' | 'facility';
  lifecycle: 'active' | 'planned' | 'retired';
  districtId?: string;
  regionId?: string;
}

export async function seedTestLocation(options: SeedLocationOptions): Promise<string> {
  const db = getTestDb();
  const now = new Date().toISOString();
  
  const locationRef = db.collection('locations').doc();
  await locationRef.set({
    kind: options.kind,
    storeNumber: options.storeNumber,
    name: options.name,
    lifecycle: options.lifecycle,
    address: {
      street: '123 Test St',
      city: 'Test City',
      state: 'CA',
      zip: '90001',
      country: 'US',
    },
    timeZone: 'America/Los_Angeles',
    mainPhone: '+12135550001',
    phonePublic: true,
    sharedInboxEmail: `${options.storeNumber.toLowerCase()}@shiekh.test`,
    regionId: options.regionId || 'test-region-1',
    districtId: options.districtId || 'test-district-1',
    createdAt: now,
    updatedAt: now,
    updatedBy: 'test',
    version: 1,
  });
  
  return locationRef.id;
}

export async function cleanupTestLocation(locationId: string): Promise<void> {
  const db = getTestDb();
  await db.collection('locations').doc(locationId).delete();
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

export async function seedTestLocations(): Promise<string[]> {
  const db = getTestDb();
  const now = new Date().toISOString();
  const locationIds: string[] = [];

  const testStores = [
    { storeNumber: '001', name: 'Test Store One' },
    { storeNumber: '042', name: 'Test Store Forty-Two' },
  ];

  for (const store of testStores) {
    const locationRef = db.collection('locations').doc();
    await locationRef.set({
      kind: 'store',
      storeNumber: store.storeNumber,
      name: store.name,
      lifecycle: 'active',
      address: {
        street: '123 Test St',
        city: 'Test City',
        state: 'CA',
        zip: '90001',
        country: 'US',
      },
      timeZone: 'America/Los_Angeles',
      mainPhone: '+12135550001',
      phonePublic: true,
      sharedInboxEmail: `store${parseInt(store.storeNumber, 10)}@shiekhshoes.com`,
      regionId: 'test-region-1',
      districtId: 'test-district-1',
      createdAt: now,
      updatedAt: now,
      updatedBy: 'test',
      version: 1,
    });
    locationIds.push(locationRef.id);
  }

  return locationIds;
}
