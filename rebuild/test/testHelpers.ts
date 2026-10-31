import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

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
    });
  }
}
