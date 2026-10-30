import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

let app: App | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function createFirestoreClient(): Firestore {
  if (db) return db;
  
  const existingApps = getApps();
  
  if (existingApps.length > 0) {
    app = existingApps[0];
  } else {
    const isEmulator = process.env.FIRESTORE_EMULATOR_HOST;
    
    if (isEmulator) {
      app = initializeApp({
        projectId: process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder',
      });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = initializeApp({
        credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      });
    } else {
      app = initializeApp({
        projectId: process.env.GCLOUD_PROJECT || 'shiekh-directory-rebuild-placeholder',
      });
    }
  }
  
  db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export function getAuthClient(): Auth {
  if (auth) return auth;
  
  if (!app) {
    createFirestoreClient();
  }
  
  auth = getAuth(app!);
  return auth;
}

export { type Firestore, type Auth };
