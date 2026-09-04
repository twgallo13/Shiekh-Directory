import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  User as FirebaseUser,
  Auth
} from 'firebase/auth';
import { 
  getFirestore, 
  Firestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  writeBatch,
  serverTimestamp,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import defaultConfig from '../../firebase-applet-config.json';

export interface FirebaseConfigData {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  oAuthClientId?: string;
}

const STORAGE_CONFIG_KEY = 'shiekh_master_firebase_config';

export function getStoredFirebaseConfig(): FirebaseConfigData {
  // Check for injected runtime environment variables first (Cloud Run production injection)
  const metaEnv = (import.meta as any)?.env || {};
  const envConfig: Partial<FirebaseConfigData> = {};
  if (metaEnv.VITE_FIREBASE_PROJECT_ID) envConfig.projectId = metaEnv.VITE_FIREBASE_PROJECT_ID;
  if (metaEnv.VITE_FIREBASE_APP_ID) envConfig.appId = metaEnv.VITE_FIREBASE_APP_ID;
  if (metaEnv.VITE_FIREBASE_API_KEY) envConfig.apiKey = metaEnv.VITE_FIREBASE_API_KEY;
  if (metaEnv.VITE_FIREBASE_AUTH_DOMAIN) envConfig.authDomain = metaEnv.VITE_FIREBASE_AUTH_DOMAIN;
  if (metaEnv.VITE_FIREBASE_DATABASE_ID) envConfig.firestoreDatabaseId = metaEnv.VITE_FIREBASE_DATABASE_ID;
  if (metaEnv.VITE_FIREBASE_STORAGE_BUCKET) envConfig.storageBucket = metaEnv.VITE_FIREBASE_STORAGE_BUCKET;
  if (metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID) envConfig.messagingSenderId = metaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID;
  if (metaEnv.VITE_FIREBASE_OAUTH_CLIENT_ID) envConfig.oAuthClientId = metaEnv.VITE_FIREBASE_OAUTH_CLIENT_ID;

  try {
    const saved = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.projectId && parsed.apiKey) {
        return {
          ...defaultConfig,
          ...parsed,
          ...envConfig
        };
      }
    }
  } catch (e) {
    console.warn('Could not read saved Firebase config from localStorage:', e);
  }
  return {
    ...defaultConfig,
    ...envConfig
  };
}

export function saveFirebaseConfig(config: FirebaseConfigData): void {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Could not save Firebase config to localStorage:', e);
  }
}

// Global Singletons
let firebaseAppInstance: FirebaseApp | null = null;
let firebaseAuthInstance: Auth | null = null;
let firestoreDbInstance: Firestore | null = null;

export function initFirebase(customConfig?: FirebaseConfigData): { app: FirebaseApp; auth: Auth; db: Firestore } {
  const config = customConfig || getStoredFirebaseConfig();

  try {
    if (!getApps().length) {
      firebaseAppInstance = initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      });
    } else {
      firebaseAppInstance = getApp();
    }

    firebaseAuthInstance = getAuth(firebaseAppInstance);

    // Initialize Firestore with custom database ID if specified
    if (config.firestoreDatabaseId && config.firestoreDatabaseId.trim().length > 0 && config.firestoreDatabaseId !== '(default)') {
      try {
        firestoreDbInstance = getFirestore(firebaseAppInstance, config.firestoreDatabaseId);
      } catch (err) {
        console.warn(`Could not initialize Firestore with custom database ID '${config.firestoreDatabaseId}', falling back to default:`, err);
        firestoreDbInstance = getFirestore(firebaseAppInstance);
      }
    } else {
      firestoreDbInstance = getFirestore(firebaseAppInstance);
    }

    return {
      app: firebaseAppInstance,
      auth: firebaseAuthInstance,
      db: firestoreDbInstance,
    };
  } catch (error) {
    console.error('Failed to initialize Firebase instances:', error);
    // Return dummy/fallback safe instances if needed
    throw error;
  }
}

// Lazy getters
export function getFirebaseApp(): FirebaseApp {
  if (!firebaseAppInstance) {
    initFirebase();
  }
  return firebaseAppInstance!;
}

export function getFirebaseAuth(): Auth {
  if (!firebaseAuthInstance) {
    initFirebase();
  }
  return firebaseAuthInstance!;
}

export function getFirebaseDb(): Firestore {
  if (!firestoreDbInstance) {
    initFirebase();
  }
  return firestoreDbInstance!;
}

// Google Auth Provider
export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({
  prompt: 'select_account',
});

// Auth Helpers
export async function signInWithGoogleLive(): Promise<FirebaseUser> {
  const auth = getFirebaseAuth();
  const result = await signInWithPopup(auth, googleAuthProvider);
  return result.user;
}

export async function signOutLive(): Promise<void> {
  const auth = getFirebaseAuth();
  await fbSignOut(auth);
}

export { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  writeBatch, 
  serverTimestamp,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
};
