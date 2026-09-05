import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { 
  LocationRecord, 
  PersonRecord, 
  UpdateRequest, 
  AuditEntry, 
  UserAccount, 
  ApiClient, 
  SmtpConfig, 
  EmailLogEntry, 
  UserRole,
  RequestChangeType,
  StagedLocationImport,
  ImportValidationResult,
  LocationType,
  WeeklySchedule,
  HoursTemplate,
  HolidayHoursOverride,
  SpecialHoursOverride,
  OperationalStatus,
  AppEnvironment,
  ApiScope,
  DatabaseBackupSnapshot,
  ThemePreference,
  ContactPrivacyLevel,
  GbpConfig,
  GbpLocationListing,
  GbpSyncLogEntry,
  CloudSyncStatus,
  FirebaseConfigState,
  EmailTemplate
} from '../types';
import { 
  INITIAL_LOCATIONS, 
  INITIAL_PEOPLE, 
  INITIAL_USERS, 
  INITIAL_API_CLIENTS, 
  INITIAL_SMTP_CONFIG, 
  INITIAL_AUDIT_LOGS,
  INITIAL_GBP_CONFIG,
  INITIAL_GBP_LISTINGS,
  INITIAL_GBP_LOGS,
  INITIAL_HOURS_TEMPLATES
} from '../data/initialData';
import {
  INITIAL_EMAIL_TEMPLATES,
  renderEmailTemplate
} from '../data/initialEmailTemplates';
import {
  translateLocationToGbpSchema,
  validateLocationForGbp,
  generateGbpDiffSummary,
  translateOperationalStatusToGbp
} from '../lib/gbpSyncEngine';
import {
  getSemanticLocationDocId,
  getSemanticUserDocId,
  getSemanticPersonDocId,
  getSemanticRequestDocId,
  enrichLocationWithLabels,
  enrichPersonWithLabels,
  logGcpCloudMetric
} from '../lib/semanticIds';
import {
  getFirebaseAuth,
  getFirebaseDb,
  onAuthStateChanged,
  signInWithGoogleLive,
  signOutLive,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  writeBatch,
  FirebaseConfigData,
  getStoredFirebaseConfig,
  saveFirebaseConfig,
  initFirebase
} from '../lib/firebase';

interface DirectoryContextType {
  locations: LocationRecord[];
  people: PersonRecord[];
  requests: UpdateRequest[];
  auditLogs: AuditEntry[];
  users: UserAccount[];
  apiClients: ApiClient[];
  smtpConfig: SmtpConfig;
  emailLogs: EmailLogEntry[];
  currentUser: UserAccount;
  isAuthenticated: boolean;
  setCurrentUser: (user: UserAccount) => void;

  // Live Cloud Backend & Firebase Auth (DISPATCH-007)
  firebaseConfig: FirebaseConfigState;
  cloudSyncStatus: CloudSyncStatus;
  lastCloudSyncAt: string | null;
  isCloudConnected: boolean;
  activeCloudUser: FirebaseConfigState['activeCloudUser'];
  updateFirebaseConfig: (updates: Partial<FirebaseConfigData>) => void;
  testCloudConnection: () => Promise<{ success: boolean; message: string; latencyMs: number }>;
  pushAllToCloud: () => Promise<{ success: boolean; count: number; error?: string }>;
  pullAllFromCloud: () => Promise<{ success: boolean; count: number; error?: string }>;

  // Google Business Profile (GBP) API Integration (Blueprint Sec 14 & 15, DISPATCH-006)
  gbpConfig: GbpConfig;
  gbpListings: GbpLocationListing[];
  gbpSyncLogs: GbpSyncLogEntry[];
  updateGbpConfig: (updates: Partial<GbpConfig>) => void;
  testGbpHandshake: () => Promise<{ success: boolean; message: string; latencyMs: number }>;
  fetchGbpListingsFromApi: () => Promise<GbpLocationListing[]>;
  mapLocationToGbp: (locationId: string, gbpLocationId: string, placeId?: string) => void;
  unmapLocationFromGbp: (locationId: string) => void;
  autoMatchGbpListings: () => { matchedCount: number; alreadyMappedCount: number };
  syncSingleLocationToGbp: (locationId: string) => Promise<{ success: boolean; error?: string; log: GbpSyncLogEntry }>;
  bulkSyncLocationsToGbp: (locationIds?: string[]) => Promise<{ total: number; successCount: number; errorCount: number }>;
  clearGbpLogs: () => void;
  exportGbpLogsCsv: () => void;

  // Appearance & Theme Engine (Blueprint Sec 8A)
  themePreference: ThemePreference;
  setThemePreference: (theme: ThemePreference) => void;
  effectiveTheme: 'light' | 'dark';

  // Environment
  environment: AppEnvironment;
  setEnvironment: (env: AppEnvironment) => void;
  
  // Authentication & Session
  loginWithGoogle: (email?: string) => Promise<{ success: boolean; message?: string }>;
  loginWithEmailPassword: (email: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  acceptInvitation: (email: string, password: string, token: string) => Promise<{ success: boolean; message?: string; user?: UserAccount }>;
  logout: () => void;
  switchUserAccount: (userId: string) => void;
  switchRole: (role: UserRole) => void;
  
  // Location Operations
  addLocation: (location: LocationRecord) => void;
  updateLocation: (id: string, updates: Partial<LocationRecord>, reason?: string) => void;
  deleteLocation: (id: string) => void;
  verifyLocation: (id: string, verifierName: string) => void;
  verifyManagerPhone: (locationId: string) => void;
  toggleLocationPhonePrivacy: (locationId: string, visibility: ContactPrivacyLevel) => void;

  // Global Hours Template Engine & Bulk Engine (DISPATCH-012)
  hoursTemplates: HoursTemplate[];
  addHoursTemplate: (template: Omit<HoursTemplate, 'id' | 'createdAt' | 'updatedAt'>) => HoursTemplate;
  updateHoursTemplate: (id: string, updates: Partial<HoursTemplate>) => void;
  deleteHoursTemplate: (id: string) => void;
  bulkUpdateLocationsHours: (options: {
    locationIds: string[];
    schedule?: WeeklySchedule;
    holidayException?: HolidayHoursOverride;
    specialHoursException?: SpecialHoursOverride;
    operationalStatus?: OperationalStatus;
    noticeDescription?: string;
  }) => Promise<{ success: boolean; updatedCount: number; error?: string }>;
  
  // People Operations
  addPerson: (person: PersonRecord) => void;
  updatePerson: (id: string, updates: Partial<PersonRecord>) => void;
  deletePerson: (id: string) => void;
  verifyPersonContact: (personId: string) => void;
  togglePersonContactPrivacy: (personId: string, field: 'phone' | 'email', visibility: ContactPrivacyLevel) => void;
  
  // Request / Corrections Workflow
  submitUpdateRequest: (request: Omit<UpdateRequest, 'id' | 'submittedAt' | 'status'>) => Promise<UpdateRequest>;
  approveUpdateRequest: (requestId: string, reviewerNotes?: string) => Promise<void>;
  rejectUpdateRequest: (requestId: string, rejectionNotes: string) => Promise<void>;
  
  // User Onboarding & Access Control (Lifecycle)
  addUserAccount: (user: Omit<UserAccount, 'id' | 'createdAt'>) => Promise<UserAccount>;
  inviteUserAccount: (email: string, role: UserRole, accessScope: UserAccount['accessScope'], personId?: string, assignedDistrict?: string, assignedStoreId?: string) => Promise<UserAccount>;
  activateUserAccount: (id: string) => Promise<void>;
  resendUserInvite: (id: string) => Promise<void>;
  updateUserAccount: (id: string, updates: Partial<UserAccount>) => Promise<void>;
  deactivateUserAccount: (id: string) => Promise<void>;
  offboardUserAccount: (
    userId: string,
    options: {
      reassignments?: { storeId: string; newManagerName: string; newManagerPhone: string; newPersonId?: string }[];
      setRemainingStoresVacant?: boolean;
      deactivateLinkedPerson?: boolean;
      reason?: string;
    }
  ) => { success: boolean; affectedStores: number };
  
  // API Clients & Integrations (Blueprint Sec 14)
  addApiClient: (client: Omit<ApiClient, 'id' | 'createdAt' | 'apiKey'>) => { client: ApiClient; plainTextKey: string };
  rotateApiKey: (id: string) => { newKey: string };
  revokeApiClient: (id: string) => void;
  triggerApiSync: (clientId: string) => void;
  
  // Communications, SMTP & Dynamic Email Templates (DISPATCH-015)
  emailTemplates: EmailTemplate[];
  addEmailTemplate: (template: Omit<EmailTemplate, 'updatedAt'>) => Promise<EmailTemplate>;
  updateEmailTemplate: (id: string, updates: Partial<EmailTemplate>) => Promise<void>;
  deleteEmailTemplate: (id: string) => Promise<void>;
  resetEmailTemplatesToDefault: () => Promise<void>;
  getEmailTemplate: (id: string) => EmailTemplate;
  updateSmtpConfig: (config: Partial<SmtpConfig>) => void;
  sendTestEmail: (toEmail: string) => Promise<{ success: boolean; error?: string; log: EmailLogEntry }>;
  sendDirectoryPdfEmail: (recipients: string[], subject: string, message: string, paperSize: string) => Promise<{ success: boolean; error?: string; log: EmailLogEntry }>;
  
  // CSV Import & Migration Validation Gate
  validateAndStageCsv: (csvContent: string) => ImportValidationResult;
  commitStagedImport: (stagedRows: StagedLocationImport[], mode: 'merge' | 'append' | 'replace') => { importedCount: number; updatedCount: number };
  
  // Audit, Backup & Disaster Recovery (Blueprint Sec 22)
  rollbackAuditEntry: (auditId: string) => { success: boolean; message: string };
  exportDatabaseBackup: () => string;
  importDatabaseBackup: (jsonContent: string) => boolean;
  createManualBackup: (backupName?: string) => DatabaseBackupSnapshot;
  backupSnapshots: DatabaseBackupSnapshot[];
  lastAutomatedBackupTime: string;
  resetToDefaultBaseline: () => void;
}

const DirectoryContext = createContext<DirectoryContextType | null>(null);

const STORAGE_KEY = 'shiekh_directory_sor_db_v2';

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  items.forEach(item => {
    if (item && item.id) {
      map.set(item.id, item);
    }
  });
  return Array.from(map.values());
}

function deduplicateLocations(items: LocationRecord[]): LocationRecord[] {
  const map = new Map<string, LocationRecord>();
  items.forEach(item => {
    if (item && item.id) {
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        const existingUpdated = new Date(existing.lastUpdated || 0).getTime();
        const itemUpdated = new Date(item.lastUpdated || 0).getTime();
        if (itemUpdated >= existingUpdated) {
          map.set(item.id, item);
        }
      }
    }
  });
  return Array.from(map.values());
}

function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeForFirestore(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

export const DirectoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locations, setLocations] = useState<LocationRecord[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_locations`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateLocations(parsed);
        }
      } catch (e) {
        console.warn('Error parsing cached locations:', e);
      }
    }
    return deduplicateLocations(INITIAL_LOCATIONS);
  });

  const [people, setPeople] = useState<PersonRecord[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_people`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateById(parsed);
        }
      } catch (e) {
        console.warn('Error parsing cached people:', e);
      }
    }
    return deduplicateById(INITIAL_PEOPLE);
  });

  const [requests, setRequests] = useState<UpdateRequest[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_requests`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateById(parsed);
        }
      } catch (e) {
        console.warn('Error parsing cached requests:', e);
      }
    }
    return [
      {
        id: 'req-001',
        targetType: 'Location',
        targetId: 'loc-shk-115',
        targetName: 'Eastmont Town Center (#115)',
        targetStoreNumber: '115',
        changeType: 'Store Manager Change' as RequestChangeType,
        currentSnapshot: { storeManagerName: 'Amir Green (Temp.)', storeManagerPhone: '(510) 435-7162' },
        requestedChanges: { storeManagerName: 'Edgar Larios', storeManagerPhone: '(510) 555-8841' },
        notes: 'Promoted Edgar Larios to permanent Store Manager effective next Monday.',
        submittedBy: { name: 'Rudy Calderon', email: 'r.calderon@shiekhshoes.com', role: 'Editor' },
        submittedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        status: 'Submitted',
      }
    ];
  });

  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_audit`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateById(parsed);
        }
      } catch (e) {
        console.warn('Error parsing cached audit logs:', e);
      }
    }
    return deduplicateById(INITIAL_AUDIT_LOGS);
  });

  const [users, setUsers] = useState<UserAccount[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_users`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return deduplicateById(parsed);
        }
      } catch (e) {
        console.warn('Error parsing cached users:', e);
      }
    }
    return deduplicateById(INITIAL_USERS);
  });

  const [currentUser, setCurrentUser] = useState<UserAccount>(() => INITIAL_USERS[0]);

  // Appearance & Theme Engine (Blueprint Sec 8A)
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('shiekh_theme_preference');
    return (saved as ThemePreference) || 'system';
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');

  const setThemePreference = (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    localStorage.setItem('shiekh_theme_preference', pref);
  };

  useEffect(() => {
    const applyTheme = () => {
      let isDark = false;
      if (themePreference === 'dark') {
        isDark = true;
      } else if (themePreference === 'light') {
        isDark = false;
      } else {
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      }

      setEffectiveTheme(isDark ? 'dark' : 'light');
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (themePreference === 'system' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyTheme();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [themePreference]);

  const [environment, setEnvironmentState] = useState<AppEnvironment>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_env`);
    return (saved as AppEnvironment) || 'PRODUCTION';
  });

  const setEnvironment = (env: AppEnvironment) => {
    setEnvironmentState(env);
    localStorage.setItem(`${STORAGE_KEY}_env`, env);
    logAudit('Setting', 'sys-env', 'Environment Configuration', 'Switched Database Environment', environment, env);
  };

  const [apiClients, setApiClients] = useState<ApiClient[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_api`);
    return saved ? JSON.parse(saved) : INITIAL_API_CLIENTS;
  });

  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_smtp`);
    return saved ? JSON.parse(saved) : INITIAL_SMTP_CONFIG;
  });

  const [emailLogs, setEmailLogs] = useState<EmailLogEntry[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_emails`);
    return saved ? JSON.parse(saved) : [
      {
        id: 'eml-001',
        emailType: 'Directory Update Request',
        recipients: ['m.vargas@shiekhshoes.com'],
        subject: '[Shiekh Directory] New Update Request for Store #115',
        sentBy: 'System Notification Service',
        sentAt: '2026-09-03T18:00:00Z',
        status: 'Sent',
        details: 'Store Manager change submitted by Rudy Calderon.',
      }
    ];
  });

  const [backupSnapshots, setBackupSnapshots] = useState<DatabaseBackupSnapshot[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_backup_snapshots`);
    return saved ? JSON.parse(saved) : [
      {
        id: 'snap-auto-daily-01',
        name: 'Automated Nightly Snapshot (02:00 UTC)',
        timestamp: '2026-09-03T02:00:00.000Z',
        type: 'automated',
        sizeBytes: 142850,
        recordCounts: {
          locations: 31,
          people: 42,
          requests: 1,
          auditLogs: 12,
          users: 6,
        },
        createdBy: 'Automated Backup Daemon (GCP Cron)',
        status: 'Completed'
      },
      {
        id: 'snap-pre-migration-00',
        name: 'Pre-Migration Baseline Snapshot',
        timestamp: '2026-09-01T08:30:00.000Z',
        type: 'manual',
        sizeBytes: 139200,
        recordCounts: {
          locations: 30,
          people: 40,
          requests: 0,
          auditLogs: 8,
          users: 4,
        },
        createdBy: 'Theo (System Administrator)',
        status: 'Completed'
      }
    ];
  });

  // Google Business Profile (GBP) Integration State (Blueprint Sec 14 & 15)
  const [gbpConfig, setGbpConfig] = useState<GbpConfig>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_gbp_config`);
    return saved ? JSON.parse(saved) : INITIAL_GBP_CONFIG;
  });

  const [gbpListings, setGbpListings] = useState<GbpLocationListing[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_gbp_listings`);
    return saved ? JSON.parse(saved) : INITIAL_GBP_LISTINGS;
  });

  const [gbpSyncLogs, setGbpSyncLogs] = useState<GbpSyncLogEntry[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_gbp_logs`);
    return saved ? JSON.parse(saved) : INITIAL_GBP_LOGS;
  });

  // Hours Templates State (DISPATCH-012)
  const [hoursTemplates, setHoursTemplates] = useState<HoursTemplate[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_hours_templates`);
    return saved ? JSON.parse(saved) : INITIAL_HOURS_TEMPLATES;
  });

  // Dynamic Transactional Email Templates State (DISPATCH-015)
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}_email_templates`);
      return saved ? JSON.parse(saved) : INITIAL_EMAIL_TEMPLATES;
    } catch {
      return INITIAL_EMAIL_TEMPLATES;
    }
  });

  // Live Cloud Backend & Firebase Auth State (Blueprint Sec 14 & 16, DISPATCH-007)
  const [firebaseConfig, setFirebaseConfigState] = useState<FirebaseConfigState>(() => {
    const stored = getStoredFirebaseConfig();
    return {
      projectId: stored.projectId || 'gen-lang-client-0801664258',
      appId: stored.appId || '1:1063064400866:web:d8c20c8ad06d5ea180ffbb',
      apiKey: stored.apiKey || 'AIzaSyDIAWNVCvXUCDW8hH4iPHUvE8eBbBB2wXo',
      authDomain: stored.authDomain || 'gen-lang-client-0801664258.firebaseapp.com',
      firestoreDatabaseId: stored.firestoreDatabaseId || 'ai-studio-shiekhlocationco-00e1a479-af25-4ab6-9565-5c8b804c56a4',
      storageBucket: stored.storageBucket || 'gen-lang-client-0801664258.firebasestorage.app',
      messagingSenderId: stored.messagingSenderId || '1063064400866',
      oAuthClientId: stored.oAuthClientId || '1063064400866-irt03tg996kld6qnpuj8ate4cjmgbs35.apps.googleusercontent.com',
      isLiveConnected: true,
      firestoreSyncStatus: 'synced',
      lastCloudSyncAt: new Date().toISOString(),
      activeCloudUser: null
    };
  });

  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('synced');
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(() => new Date().toISOString());
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(true);
  const [activeCloudUser, setActiveCloudUser] = useState<FirebaseConfigState['activeCloudUser']>(null);

  // Firestore Snapshot Listeners & Automatic First-Time Data Seed
  useEffect(() => {
    let unsubscribeAuth: (() => void) | undefined;
    let unsubLocations: (() => void) | undefined;
    let unsubRequests: (() => void) | undefined;
    let unsubHoursTemplates: (() => void) | undefined;
    let unsubUsers: (() => void) | undefined;
    let unsubEmailTemplates: (() => void) | undefined;

    try {
      const auth = getFirebaseAuth();
      const db = getFirebaseDb();

      // Listen to Auth state changes
      unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          setActiveCloudUser({
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName,
            photoURL: fbUser.photoURL
          });
          setIsAuthenticated(true);

          if (fbUser.email) {
            const normalizedEmail = fbUser.email.toLowerCase();
            const existing = users.find(u => 
              (u.firebaseUid && u.firebaseUid === fbUser.uid) ||
              u.email.toLowerCase() === normalizedEmail
            );
            if (existing) {
              const updatedAccount = {
                ...existing,
                firebaseUid: fbUser.uid,
                lastLogin: new Date().toISOString()
              };
              setCurrentUser(updatedAccount);
              // Update lastLogin and firebaseUid in Firestore
              setDoc(doc(db, 'users', existing.id), sanitizeForFirestore({
                firebaseUid: fbUser.uid,
                lastLogin: updatedAccount.lastLogin
              }), { merge: true }).catch(() => {});
            } else {
              const isSysAdmin = normalizedEmail.includes('theo') || normalizedEmail.endsWith('@shiekhshoes.org');
              const isSteward = normalizedEmail.includes('vargas') || normalizedEmail.includes('steward');
              const newRole: UserRole = isSysAdmin ? 'System Administrator' : isSteward ? 'Directory Data Steward' : 'Viewer';
              const newUser: UserAccount = {
                id: `usr-fb-${fbUser.uid.substring(0, 8)}`,
                email: normalizedEmail,
                displayName: fbUser.displayName || normalizedEmail.split('@')[0],
                authMethod: 'google',
                role: newRole,
                accessScope: 'Company-wide',
                firebaseUid: fbUser.uid,
                status: 'Active',
                lastLogin: new Date().toISOString(),
                createdAt: new Date().toISOString()
              };
              setCurrentUser(newUser);
              // Save to Firestore users collection — onSnapshot will sync users state
              setDoc(doc(db, 'users', newUser.id), sanitizeForFirestore(newUser)).catch(() => {});
            }
          }
        } else {
          setActiveCloudUser(null);
        }
      });

      // Real-time Firestore locations listener
      const locationsCol = collection(db, 'locations');
      unsubLocations = onSnapshot(locationsCol, (snapshot) => {
        if (!snapshot.empty) {
          const docs: LocationRecord[] = [];
          snapshot.forEach(d => {
            const data = d.data() as LocationRecord;
            docs.push(enrichLocationWithLabels(data));
          });
          const uniqueLocations = deduplicateLocations(docs);
          if (uniqueLocations.length > 0) {
            setLocations(uniqueLocations);
            setCloudSyncStatus('synced');
            setLastCloudSyncAt(new Date().toISOString());
          }
        } else {
          // Auto-seed initial locations into Firestore with clean semantic IDs & data labels
          const batch = writeBatch(db);
          INITIAL_LOCATIONS.forEach(loc => {
            const labeled = enrichLocationWithLabels(loc);
            const docId = getSemanticLocationDocId(labeled);
            const ref = doc(db, 'locations', docId);
            batch.set(ref, sanitizeForFirestore(labeled));
          });
          INITIAL_PEOPLE.forEach(per => {
            const labeled = enrichPersonWithLabels(per);
            const docId = getSemanticPersonDocId(labeled);
            const ref = doc(db, 'people', docId);
            batch.set(ref, sanitizeForFirestore(labeled));
          });
          INITIAL_USERS.forEach(usr => {
            const docId = getSemanticUserDocId(usr);
            const ref = doc(db, 'users', docId);
            batch.set(ref, sanitizeForFirestore(usr));
          });
          INITIAL_AUDIT_LOGS.forEach(aud => {
            const ref = doc(db, 'audit_logs', aud.id);
            batch.set(ref, sanitizeForFirestore(aud));
          });
          batch.commit().then(() => {
            setCloudSyncStatus('synced');
            setLastCloudSyncAt(new Date().toISOString());
            logGcpCloudMetric('firestore_initial_seed', 120, { 
              locations: INITIAL_LOCATIONS.length, 
              people: INITIAL_PEOPLE.length 
            });
          }).catch(err => {
            console.warn('Firestore initial seeding error:', err);
          });
        }
      }, (error) => {
        console.warn('Firestore locations snapshot listener error:', error);
        setCloudSyncStatus('offline');
      });

      // Real-time Firestore requests listener
      const requestsCol = collection(db, 'requests');
      unsubRequests = onSnapshot(requestsCol, (snapshot) => {
        if (!snapshot.empty) {
          const docs: UpdateRequest[] = [];
          snapshot.forEach(d => docs.push(d.data() as UpdateRequest));
          setRequests(deduplicateById(docs));
        }
      }, (err) => console.warn('Requests snapshot listener error:', err));

      // Real-time Firestore hours_templates listener (DISPATCH-012)
      const templatesCol = collection(db, 'hours_templates');
      unsubHoursTemplates = onSnapshot(templatesCol, (snapshot) => {
        if (!snapshot.empty) {
          const docs: HoursTemplate[] = [];
          snapshot.forEach(d => docs.push(d.data() as HoursTemplate));
          const uniqueTmpls = deduplicateById(docs);
          setHoursTemplates(uniqueTmpls);
          localStorage.setItem(`${STORAGE_KEY}_hours_templates`, JSON.stringify(uniqueTmpls));
        } else {
          // Seed initial templates if collection is empty
          const batch = writeBatch(db);
          INITIAL_HOURS_TEMPLATES.forEach(tmpl => {
            const ref = doc(db, 'hours_templates', tmpl.id);
            batch.set(ref, sanitizeForFirestore(tmpl));
          });
          batch.commit().catch(e => console.warn('Seeding hours templates error:', e));
        }
      }, (err) => console.warn('Hours templates snapshot listener error:', err));

      // Real-time Firestore users listener (DISPATCH-014)
      const usersCol = collection(db, 'users');
      unsubUsers = onSnapshot(usersCol, (snapshot) => {
        if (!snapshot.empty) {
          const docs: UserAccount[] = [];
          snapshot.forEach(d => docs.push(d.data() as UserAccount));
          const uniqueUsers = deduplicateById(docs);
          setUsers(uniqueUsers);
          localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(uniqueUsers));
        } else {
          // Auto-seed initial users if collection is empty
          const batch = writeBatch(db);
          INITIAL_USERS.forEach(usr => {
            const docId = getSemanticUserDocId(usr);
            const ref = doc(db, 'users', docId);
            batch.set(ref, sanitizeForFirestore(usr));
          });
          batch.commit().catch(e => console.warn('Seeding users collection error:', e));
        }
      }, (err) => console.warn('Users snapshot listener error:', err));

      // Real-time Firestore email_templates listener (DISPATCH-015)
      const emailTemplatesCol = collection(db, 'email_templates');
      unsubEmailTemplates = onSnapshot(emailTemplatesCol, (snapshot) => {
        if (!snapshot.empty) {
          const docs: EmailTemplate[] = [];
          snapshot.forEach(d => docs.push(d.data() as EmailTemplate));
          const uniqueTmpls = deduplicateById(docs);
          setEmailTemplates(uniqueTmpls);
          localStorage.setItem(`${STORAGE_KEY}_email_templates`, JSON.stringify(uniqueTmpls));
        } else {
          // Auto-seed initial email templates if collection is empty
          const batch = writeBatch(db);
          INITIAL_EMAIL_TEMPLATES.forEach(tmpl => {
            const ref = doc(db, 'email_templates', tmpl.id);
            batch.set(ref, sanitizeForFirestore(tmpl));
          });
          batch.commit().catch(e => console.warn('Seeding email templates collection error:', e));
        }
      }, (err) => console.warn('Email templates snapshot listener error:', err));

      setIsCloudConnected(true);
    } catch (e) {
      console.warn('Firebase initialization or listener error:', e);
      setIsCloudConnected(false);
      setCloudSyncStatus('offline');
    }

    return () => {
      unsubscribeAuth?.();
      unsubLocations?.();
      unsubRequests?.();
      unsubHoursTemplates?.();
      unsubUsers?.();
      unsubEmailTemplates?.();
    };
  }, []);

  const updateFirebaseConfig = (updates: Partial<FirebaseConfigData>) => {
    const current = getStoredFirebaseConfig();
    const merged = { ...current, ...updates };
    saveFirebaseConfig(merged);
    setFirebaseConfigState(prev => ({
      ...prev,
      ...updates
    }));
    try {
      initFirebase(merged);
      setIsCloudConnected(true);
      setCloudSyncStatus('synced');
    } catch (e) {
      console.error('Failed to re-initialize Firebase with updated config:', e);
    }
  };

  const testCloudConnection = async (): Promise<{ success: boolean; message: string; latencyMs: number }> => {
    const startTime = performance.now();
    try {
      const db = getFirebaseDb();
      const testRef = doc(db, 'system', 'heartbeat');
      await setDoc(testRef, {
        lastPing: new Date().toISOString(),
        pingBy: currentUser.displayName,
        client: 'Shiekh Directory SoR Console',
        serviceRole: currentUser.role
      }, { merge: true });
      const latencyMs = Math.round(performance.now() - startTime);
      setCloudSyncStatus('synced');
      setLastCloudSyncAt(new Date().toISOString());
      setIsCloudConnected(true);
      logGcpCloudMetric('firestore_heartbeat_ping', latencyMs, { client: currentUser.displayName });
      return {
        success: true,
        message: `Cloud Firestore connection verified! Roundtrip latency: ${latencyMs}ms.`,
        latencyMs
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      logGcpCloudMetric('firestore_heartbeat_ping_failed', latencyMs, { error: err.message });
      return {
        success: false,
        message: `Firestore ping failed: ${err.message || String(err)}`,
        latencyMs
      };
    }
  };

  const pushAllToCloud = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    setCloudSyncStatus('syncing');
    const startTime = performance.now();
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      let count = 0;

      locations.forEach(loc => {
        const labeled = enrichLocationWithLabels(loc);
        const docId = getSemanticLocationDocId(labeled);
        batch.set(doc(db, 'locations', docId), sanitizeForFirestore(labeled));
        count++;
      });
      people.forEach(per => {
        const labeled = enrichPersonWithLabels(per);
        const docId = getSemanticPersonDocId(labeled);
        batch.set(doc(db, 'people', docId), sanitizeForFirestore(labeled));
        count++;
      });
      requests.forEach(req => {
        const docId = getSemanticRequestDocId(req);
        batch.set(doc(db, 'requests', docId), sanitizeForFirestore(req));
        count++;
      });
      users.forEach(u => {
        const docId = getSemanticUserDocId(u);
        batch.set(doc(db, 'users', docId), sanitizeForFirestore(u));
        count++;
      });
      auditLogs.forEach(aud => {
        batch.set(doc(db, 'audit_logs', aud.id), sanitizeForFirestore(aud));
        count++;
      });

      await batch.commit();
      const latencyMs = Math.round(performance.now() - startTime);
      setCloudSyncStatus('synced');
      setLastCloudSyncAt(new Date().toISOString());
      logAudit('Setting', 'cloud-sync', 'Cloud Database', 'Pushed Local Records to Firestore', `${count} records with semantic IDs`, 'Synced');
      logGcpCloudMetric('firestore_batch_push', latencyMs, { records: count });
      return { success: true, count };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setCloudSyncStatus('error');
      logGcpCloudMetric('firestore_batch_push_error', latencyMs, { error: err.message });
      return { success: false, count: 0, error: err.message || String(err) };
    }
  };

  const pullAllFromCloud = async (): Promise<{ success: boolean; count: number; error?: string }> => {
    setCloudSyncStatus('syncing');
    const startTime = performance.now();
    try {
      const db = getFirebaseDb();
      const locSnapshot = await getDocs(collection(db, 'locations'));
      let count = 0;
      if (!locSnapshot.empty) {
        const cloudLocations: LocationRecord[] = [];
        locSnapshot.forEach(d => {
          const data = d.data() as LocationRecord;
          cloudLocations.push(enrichLocationWithLabels(data));
        });
        const uniqueLocs = deduplicateLocations(cloudLocations);
        setLocations(uniqueLocs);
        count += uniqueLocs.length;
      }

      const reqSnapshot = await getDocs(collection(db, 'requests'));
      if (!reqSnapshot.empty) {
        const cloudRequests: UpdateRequest[] = [];
        reqSnapshot.forEach(d => cloudRequests.push(d.data() as UpdateRequest));
        const uniqueReqs = deduplicateById(cloudRequests);
        setRequests(uniqueReqs);
        count += uniqueReqs.length;
      }

      const latencyMs = Math.round(performance.now() - startTime);
      setCloudSyncStatus('synced');
      setLastCloudSyncAt(new Date().toISOString());
      logGcpCloudMetric('firestore_batch_pull', latencyMs, { records: count });
      return { success: true, count };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      setCloudSyncStatus('error');
      logGcpCloudMetric('firestore_batch_pull_error', latencyMs, { error: err.message });
      return { success: false, count: 0, error: err.message || String(err) };
    }
  };

  const lastAutomatedBackupTime = '2026-09-03T02:00:00.000Z';

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_locations`, JSON.stringify(locations));
  }, [locations]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_people`, JSON.stringify(people));
  }, [people]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_requests`, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_audit`, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_users`, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_api`, JSON.stringify(apiClients));
  }, [apiClients]);

  useEffect(() => {
    // Strip sensitive passwords from client-side storage
    const { password, ...safeConfig } = (smtpConfig as any) || {};
    localStorage.setItem(`${STORAGE_KEY}_smtp`, JSON.stringify(safeConfig));
  }, [smtpConfig]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_emails`, JSON.stringify(emailLogs));
  }, [emailLogs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_gbp_config`, JSON.stringify(gbpConfig));
  }, [gbpConfig]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_gbp_listings`, JSON.stringify(gbpListings));
  }, [gbpListings]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_gbp_logs`, JSON.stringify(gbpSyncLogs));
  }, [gbpSyncLogs]);

  // Log Audit
  const logAudit = (
    entityType: AuditEntry['entityType'],
    entityId: string,
    entityName: string,
    fieldChanged: string,
    previousValue: any,
    newValue: any,
    relatedRequestId?: string,
    isRollback?: boolean
  ) => {
    const entry: AuditEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      entityType,
      entityId,
      entityName,
      fieldChanged,
      previousValue: typeof previousValue === 'object' ? JSON.stringify(previousValue) : String(previousValue ?? ''),
      newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : String(newValue ?? ''),
      changedBy: currentUser.displayName,
      timestamp: new Date().toISOString(),
      relatedRequestId,
      isRollback,
    };
    setAuditLogs(prev => [entry, ...prev]);
  };

  // Switch Role
  const switchRole = (role: UserRole) => {
    const matching = users.find(u => u.role === role);
    if (matching) {
      setCurrentUser(matching);
    } else {
      setCurrentUser(prev => ({
        ...prev,
        role,
        displayName: `${prev.displayName.split(' (')[0]} (${role})`
      }));
    }
  };

  // Location CRUD
  const addLocation = (loc: LocationRecord) => {
    const newLoc: LocationRecord = {
      ...loc,
      id: loc.id || `loc-shk-${Date.now().toString(36)}`,
      lastUpdated: new Date().toISOString(),
      lastUpdatedBy: currentUser.displayName,
      lastVerifiedDate: new Date().toISOString().split('T')[0],
      verifiedBy: currentUser.displayName,
    };
    setLocations(prev => [newLoc, ...prev]);
    logAudit('Location', newLoc.id, `Store #${newLoc.storeNumber} (${newLoc.name})`, 'Created Record', '', JSON.stringify(newLoc));
  };

  const updateLocation = (id: string, updates: Partial<LocationRecord>, reason?: string) => {
    setLocations(prev => prev.map(loc => {
      if (loc.id !== id) return loc;
      const updated: LocationRecord = {
        ...loc,
        ...updates,
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: currentUser.displayName,
      };

      // Check fields for audit log
      Object.keys(updates).forEach(key => {
        const k = key as keyof LocationRecord;
        if (loc[k] !== updates[k]) {
          logAudit(
            'Location',
            loc.id,
            `Store #${loc.storeNumber} (${loc.name})`,
            reason ? `${k} (${reason})` : k,
            loc[k],
            updates[k]
          );
        }
      });

      return updated;
    }));
  };

  const deleteLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (!loc) return;
    // Soft delete / archive
    updateLocation(id, { recordStatus: 'Archived', operationalStatus: 'Permanently Closed' }, 'Archived / Decommissioned');
  };

  const verifyLocation = (id: string, verifierName: string) => {
    const today = new Date().toISOString().split('T')[0];
    updateLocation(id, {
      lastVerifiedDate: today,
      verifiedBy: verifierName,
    }, 'Annual Data Verification');
  };

  const verifyManagerPhone = (locationId: string) => {
    const loc = locations.find(l => l.id === locationId);
    if (!loc) return;
    updateLocation(locationId, {
      storeManagerPhoneVisibility: 'Directory Public',
      isStoreManagerPhoneVerified: true,
      lastVerifiedDate: new Date().toISOString().split('T')[0],
      verifiedBy: currentUser.displayName,
    }, 'Store Manager Phone Verified & Published to Directory');
  };

  const toggleLocationPhonePrivacy = (locationId: string, visibility: ContactPrivacyLevel) => {
    updateLocation(locationId, {
      storeManagerPhoneVisibility: visibility,
      isStoreManagerPhoneVerified: visibility !== 'Pending Review',
    }, `Store Manager Phone Visibility set to ${visibility}`);
  };

  // Hours Template CRUD & Bulk Operations (DISPATCH-012)
  const addHoursTemplate = (tmpl: Omit<HoursTemplate, 'id' | 'createdAt' | 'updatedAt'>): HoursTemplate => {
    const newTemplate: HoursTemplate = {
      ...tmpl,
      id: `tmpl-${tmpl.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.displayName,
    };

    setHoursTemplates(prev => {
      const updated = [newTemplate, ...prev];
      localStorage.setItem(`${STORAGE_KEY}_hours_templates`, JSON.stringify(updated));
      return updated;
    });

    try {
      const db = getFirebaseDb();
      const ref = doc(db, 'hours_templates', newTemplate.id);
      setDoc(ref, sanitizeForFirestore(newTemplate)).catch(err => console.warn('Firestore setDoc hours_template error:', err));
    } catch (e) {
      console.warn('Firebase error adding hours template:', e);
    }

    logAudit('Setting', newTemplate.id, newTemplate.name, 'Created Hours Template', '', newTemplate.description);
    return newTemplate;
  };

  const updateHoursTemplate = (id: string, updates: Partial<HoursTemplate>) => {
    setHoursTemplates(prev => {
      const updated = prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...updates, updatedAt: new Date().toISOString() };
        try {
          const db = getFirebaseDb();
          const ref = doc(db, 'hours_templates', id);
          updateDoc(ref, sanitizeForFirestore({ ...updates, updatedAt: merged.updatedAt })).catch(err => console.warn('Firestore updateDoc hours_template error:', err));
        } catch (e) {
          console.warn('Firebase error updating hours template:', e);
        }
        return merged;
      });
      localStorage.setItem(`${STORAGE_KEY}_hours_templates`, JSON.stringify(updated));
      return updated;
    });
    logAudit('Setting', id, 'Hours Template', 'Updated Hours Template Schedule', '', JSON.stringify(updates));
  };

  const deleteHoursTemplate = (id: string) => {
    const tmpl = hoursTemplates.find(t => t.id === id);
    setHoursTemplates(prev => {
      const updated = prev.filter(t => t.id !== id);
      localStorage.setItem(`${STORAGE_KEY}_hours_templates`, JSON.stringify(updated));
      return updated;
    });

    try {
      const db = getFirebaseDb();
      const ref = doc(db, 'hours_templates', id);
      deleteDoc(ref).catch(err => console.warn('Firestore deleteDoc hours_template error:', err));
    } catch (e) {
      console.warn('Firebase error deleting hours template:', e);
    }

    if (tmpl) {
      logAudit('Setting', id, tmpl.name, 'Deleted Hours Template', tmpl.name, 'Deleted');
    }
  };

  const bulkUpdateLocationsHours = async (options: {
    locationIds: string[];
    schedule?: WeeklySchedule;
    holidayException?: HolidayHoursOverride;
    specialHoursException?: SpecialHoursOverride;
    operationalStatus?: OperationalStatus;
    noticeDescription?: string;
  }): Promise<{ success: boolean; updatedCount: number; error?: string }> => {
    const { locationIds, schedule, holidayException, specialHoursException, operationalStatus, noticeDescription } = options;
    if (!locationIds || locationIds.length === 0) {
      return { success: false, updatedCount: 0, error: 'No locations selected' };
    }

    const nowIso = new Date().toISOString();
    const updatedLocationList: LocationRecord[] = [];

    // Prepare updates
    setLocations(prevLocations => {
      const updated = prevLocations.map(loc => {
        if (!locationIds.includes(loc.id)) return loc;

        const locUpdates: Partial<LocationRecord> = {
          lastUpdated: nowIso,
          lastUpdatedBy: currentUser.displayName,
          gbpSyncStatus: 'Pending Push',
        };

        if (schedule) {
          locUpdates.standardHours = JSON.parse(JSON.stringify(schedule));
        }

        if (holidayException) {
          const existingHolidays = loc.holidayHours ? [...loc.holidayHours] : [];
          // Replace matching date exception or add
          const filtered = existingHolidays.filter(h => h.date !== holidayException.date);
          locUpdates.holidayHours = [...filtered, holidayException];
        }

        if (specialHoursException) {
          const existingSpecials = loc.specialHours ? [...loc.specialHours] : [];
          const filtered = existingSpecials.filter(s => !(s.startDate === specialHoursException.startDate && s.endDate === specialHoursException.endDate));
          locUpdates.specialHours = [...filtered, specialHoursException];
        }

        if (operationalStatus) {
          locUpdates.operationalStatus = operationalStatus;
          if (operationalStatus !== 'Open — Normal Operations' || noticeDescription) {
            locUpdates.activeNotice = {
              status: operationalStatus,
              shortDescription: noticeDescription || `Bulk operational status updated to ${operationalStatus}`,
              effectiveDate: nowIso.split('T')[0],
              lastUpdatedDate: nowIso.split('T')[0],
              updatedBy: currentUser.displayName,
            };
          } else {
            locUpdates.activeNotice = undefined;
          }
        }

        const merged: LocationRecord = {
          ...loc,
          ...locUpdates,
        };

        updatedLocationList.push(merged);

        logAudit(
          'Location',
          loc.id,
          `Store #${loc.storeNumber} (${loc.name})`,
          'Bulk Schedule / Exception Update (DISPATCH-012)',
          `Standard Hours: ${loc.standardHours?.monday?.open}-${loc.standardHours?.monday?.close}`,
          `Updated with ${schedule ? 'New Schedule' : ''} ${holidayException ? `Holiday: ${holidayException.holidayName}` : ''} | Sync: Pending Push`
        );

        return merged;
      });

      localStorage.setItem(`${STORAGE_KEY}_locations`, JSON.stringify(updated));
      return updated;
    });

    // Execute Firestore writeBatch across all affected locations
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      
      updatedLocationList.forEach(loc => {
        const docId = getSemanticLocationDocId(loc);
        const ref = doc(db, 'locations', docId);
        batch.set(ref, sanitizeForFirestore(loc), { merge: true });
      });

      await batch.commit();
      setCloudSyncStatus('synced');
      setLastCloudSyncAt(new Date().toISOString());
    } catch (e: any) {
      console.warn('Firestore writeBatch bulk update error:', e);
    }

    return { success: true, updatedCount: locationIds.length };
  };

  // People CRUD
  const addPerson = (person: PersonRecord) => {
    const newPerson: PersonRecord = {
      ...person,
      id: person.id || `per-${person.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`,
      phoneVisibility: person.phoneVisibility || 'Directory Public',
      emailVisibility: person.emailVisibility || 'Directory Public',
      isPhoneVerified: person.isPhoneVerified ?? true,
    };
    setPeople(prev => [newPerson, ...prev]);
    logAudit('Person', newPerson.id, newPerson.name, 'Created Person Record', '', newPerson.jobTitle);
  };

  const updatePerson = (id: string, updates: Partial<PersonRecord>) => {
    setPeople(prev => prev.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, ...updates };
      Object.keys(updates).forEach(key => {
        const k = key as keyof PersonRecord;
        if (p[k] !== updates[k]) {
          logAudit('Person', p.id, p.name, k, p[k], updates[k]);
        }
      });
      return updated;
    }));
  };

  const deletePerson = (id: string) => {
    updatePerson(id, { activeStatus: false });
  };

  const verifyPersonContact = (personId: string) => {
    updatePerson(personId, {
      phoneVisibility: 'Directory Public',
      isPhoneVerified: true,
    });
    logAudit('Person', personId, 'Personnel Directory', 'Verified Contact Info', 'Pending Review', 'Directory Public');
  };

  const togglePersonContactPrivacy = (personId: string, field: 'phone' | 'email', visibility: ContactPrivacyLevel) => {
    if (field === 'phone') {
      updatePerson(personId, {
        phoneVisibility: visibility,
        isPhoneVerified: visibility !== 'Pending Review',
      });
      logAudit('Person', personId, 'Personnel Directory', 'Phone Privacy Changed', '', visibility);
    } else {
      updatePerson(personId, {
        emailVisibility: visibility,
      });
      logAudit('Person', personId, 'Personnel Directory', 'Email Privacy Changed', '', visibility);
    }
  };

  // Dynamic URL Helper & Backend SMTP Dispatcher (DISPATCH-013 Requirements 3 & 4)
  const getAppUrl = (): string => {
    if (typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null' && !window.location.origin.includes('localhost:3000')) {
      return window.location.origin;
    }
    return (import.meta as any).env?.VITE_APP_URL || 'https://ais-dev-b6gie4rzjr5ec7tbgq3pc2-516719740429.us-east1.run.app';
  };

  const dispatchEmailApi = async (options: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    emailType: EmailLogEntry['emailType'];
    details?: string;
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    attachments?: Array<{ filename: string; content: string; contentType?: string }>;
  }): Promise<{ success: boolean; error?: string; log: EmailLogEntry }> => {
    const recipients = Array.isArray(options.to) ? options.to.filter(Boolean) : [options.to].filter(Boolean);

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipients,
          subject: options.subject,
          text: options.text,
          html: options.html,
          emailType: options.emailType,
          fromName: options.fromName || smtpConfig.fromName,
          fromEmail: options.fromEmail || smtpConfig.fromEmail,
          replyTo: options.replyTo || smtpConfig.replyTo || smtpConfig.replyToEmail,
          attachments: options.attachments,
        }),
      });

      const data = await res.json().catch(() => ({
        success: false,
        error: `HTTP ${res.status}: ${res.statusText || 'Server Error'}`,
      }));

      const isSuccess = res.ok && data.success;
      const errorMsg = !isSuccess
        ? (data.error || data.rawError || data.details || `HTTP ${res.status}: SMTP transport failure.`)
        : undefined;

      const logEntry: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: options.emailType,
        recipients,
        subject: options.subject,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: isSuccess ? 'Sent' : 'Failed',
        details: isSuccess
          ? (options.details || data.message || `Dispatched via SMTP: ${data.messageId || 'OK'}`)
          : `SMTP Error [${data.code || res.status}]: ${errorMsg}`,
      };

      setEmailLogs(prev => [logEntry, ...prev]);
      return { success: isSuccess, error: errorMsg, log: logEntry };
    } catch (err: any) {
      const errorMsg = `Network error calling /api/send-email: ${err.message || String(err)}`;
      const logEntry: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: options.emailType,
        recipients,
        subject: options.subject,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: 'Failed',
        details: errorMsg,
      };

      setEmailLogs(prev => [logEntry, ...prev]);
      return { success: false, error: errorMsg, log: logEntry };
    }
  };

  // Dynamic Email Template Lookup Helper (DISPATCH-015 / DISPATCH-016)
  const getEmailTemplate = (id: string): EmailTemplate => {
    const found = emailTemplates.find(t => t.id === id);
    if (found) return found;
    const defaultFound = INITIAL_EMAIL_TEMPLATES.find(t => t.id === id);
    if (defaultFound) return defaultFound;
    return {
      id,
      name: id,
      subjectTemplate: '[Shiekh Directory] Notification',
      htmlTemplate: '<p>{{notes}}</p>',
      description: 'Custom Template',
      variables: ['appUrl'],
      availableVariables: ['appUrl'],
      updatedAt: new Date().toISOString()
    };
  };

  // Bulletproof Dynamic Email Template Lookup with Firestore getDoc & Fallbacks (DISPATCH-016)
  const fetchEmailTemplateWithFallback = async (id: string, hardcodedSubject: string, hardcodedHtml: string): Promise<{ subjectTemplate: string; htmlTemplate: string }> => {
    try {
      const db = getFirebaseDb();
      const docRef = doc(db, 'email_templates', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as EmailTemplate;
        if (data.subjectTemplate && data.htmlTemplate) {
          return { subjectTemplate: data.subjectTemplate, htmlTemplate: data.htmlTemplate };
        }
      }
    } catch (err: any) {
      console.warn(`[Firestore Fallback] getDoc failed for email_templates/${id} (permission denied or network):`, err?.message || err);
    }

    const stateFound = emailTemplates.find(t => t.id === id);
    if (stateFound?.subjectTemplate && stateFound?.htmlTemplate) {
      return { subjectTemplate: stateFound.subjectTemplate, htmlTemplate: stateFound.htmlTemplate };
    }

    const defaultFound = INITIAL_EMAIL_TEMPLATES.find(t => t.id === id);
    if (defaultFound?.subjectTemplate && defaultFound?.htmlTemplate) {
      return { subjectTemplate: defaultFound.subjectTemplate, htmlTemplate: defaultFound.htmlTemplate };
    }

    return { subjectTemplate: hardcodedSubject, htmlTemplate: hardcodedHtml };
  };

  // Update Requests
  const submitUpdateRequest = async (reqData: Omit<UpdateRequest, 'id' | 'submittedAt' | 'status'>): Promise<UpdateRequest> => {
    const newReq: UpdateRequest = {
      ...reqData,
      id: `req-${Date.now().toString(36)}`,
      submittedAt: new Date().toISOString(),
      status: 'Submitted',
    };

    // Save to Firestore requests collection
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'requests', newReq.id), sanitizeForFirestore(newReq));
    } catch (err) {
      console.warn('Firestore submitUpdateRequest error:', err);
    }

    setRequests(prev => [newReq, ...prev.filter(r => r.id !== newReq.id)]);

    // Send email notification to Directory Steward with dynamic APP_URL
    if (smtpConfig.notifyOnNewRequest && smtpConfig.directoryStewardEmail) {
      const appUrl = getAppUrl();
      const requestUrl = `${appUrl}/?view=requests&requestId=${newReq.id}`;
      const hoursSourceBlock = newReq.hoursSource 
        ? `<p style="margin: 4px 0;"><strong>Source / Template:</strong> <span style="background: #fef3c7; color: #92400e; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${newReq.hoursSource}</span></p>`
        : '';
      const vars: Record<string, string> = {
        requestId: newReq.id,
        targetName: newReq.targetName,
        changeType: newReq.changeType,
        hoursSource: newReq.hoursSource || '',
        hoursSourceBlock,
        submitterName: newReq.submittedBy.name,
        submitterEmail: newReq.submittedBy.email,
        notes: newReq.notes || '',
        submittedAt: new Date().toLocaleString(),
        requestUrl,
        appUrl
      };

      const hardcodedSubject = `[Directory Request] #{{requestId}}: {{changeType}} - {{targetName}}`;
      const hardcodedHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #dc2626; margin: 0; font-size: 22px;">SHIEKH DIRECTORY</h1>
          <p style="color: #737373; margin: 4px 0 0 0; font-size: 13px;">New Governance Update Request</p>
        </div>
        <p>A new directory change proposal has been submitted and is awaiting Steward review.</p>
        <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #e2e8f0;">
          <p style="margin: 4px 0;"><strong>Target:</strong> {{targetName}}</p>
          <p style="margin: 4px 0;"><strong>Change Type:</strong> {{changeType}}</p>
          <p style="margin: 4px 0;"><strong>Submitted By:</strong> {{submitterName}} ({{submitterEmail}})</p>
          <p style="margin: 4px 0;"><strong>Timestamp:</strong> {{submittedAt}}</p>
          <p style="margin: 4px 0;"><strong>Notes:</strong> {{notes}}</p>
          {{hoursSourceBlock}}
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{{requestUrl}}" style="background-color: #dc2626; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Review in Governance Queue</a>
        </div>
      </div>`;

      const tmpl = await fetchEmailTemplateWithFallback('request_submitted', hardcodedSubject, hardcodedHtml);
      let subject = renderEmailTemplate(tmpl.subjectTemplate, vars);
      let htmlBody = renderEmailTemplate(tmpl.htmlTemplate, vars);
      if (!htmlBody || !htmlBody.includes(newReq.id)) {
        htmlBody = renderEmailTemplate(hardcodedHtml, vars);
      }
      const sourceText = newReq.hoursSource ? `\nHours Source / Template: ${newReq.hoursSource}` : '';
      const textBody = `A new directory update request has been submitted by ${newReq.submittedBy.name} (${newReq.submittedBy.email}).\n\nTarget: ${newReq.targetName}\nChange Type: ${newReq.changeType}${sourceText}\nSubmitted: ${vars.submittedAt}\nNotes: ${newReq.notes}\n\nReview and take action in the Shiekh Directory Queue:\n${requestUrl}`;

      const emailRes = await dispatchEmailApi({
        to: smtpConfig.directoryStewardEmail,
        subject,
        text: textBody,
        html: htmlBody,
        emailType: 'Directory Update Request',
        details: `Dispatched new request alert to Data Steward (${smtpConfig.directoryStewardEmail}). ID: ${newReq.id}`,
      });
      if (!emailRes.success) {
        console.warn('Failed to send steward email notification:', emailRes.error);
      }
    }

    return newReq;
  };

  const approveUpdateRequest = async (requestId: string, reviewerNotes?: string): Promise<void> => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    // Check conflict: has location changed since snapshot?
    const targetLoc = locations.find(l => l.id === req.targetId);
    if (targetLoc && req.targetType === 'Location') {
      // Apply changes directly to location
      const locUpdates: Partial<LocationRecord> = {};
      
      if (req.requestedChanges.storeManagerName !== undefined) {
        locUpdates.storeManagerName = req.requestedChanges.storeManagerName;
        locUpdates.storeManagerPhone = req.requestedChanges.storeManagerPhone;
      }
      if (req.requestedChanges.phone !== undefined) {
        locUpdates.phone = req.requestedChanges.phone;
      }
      if (req.requestedChanges.address !== undefined) {
        locUpdates.address = req.requestedChanges.address;
      }
      if (req.requestedChanges.operationalStatus !== undefined) {
        locUpdates.operationalStatus = req.requestedChanges.operationalStatus;
      }
      if (req.requestedChanges.districtManagerName !== undefined) {
        locUpdates.districtManagerName = req.requestedChanges.districtManagerName;
      }
      if (req.requestedChanges.activeNotice !== undefined) {
        locUpdates.activeNotice = req.requestedChanges.activeNotice;
      }
      if (req.requestedChanges.standardHours !== undefined) {
        locUpdates.standardHours = req.requestedChanges.standardHours;
      }
      if (req.requestedChanges.holidayHours !== undefined) {
        locUpdates.holidayHours = req.requestedChanges.holidayHours;
      }
      if (req.requestedChanges.specialHours !== undefined) {
        locUpdates.specialHours = req.requestedChanges.specialHours;
      }

      updateLocation(targetLoc.id, locUpdates, `Approved Request #${req.id}: ${req.changeType}`);
    }

    const decisionAt = new Date().toISOString();
    const finalNotes = reviewerNotes || 'Approved and applied to master directory record.';

    // Persist request decision to Firestore
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'requests', requestId), sanitizeForFirestore({
        status: 'Approved',
        decisionNotes: finalNotes,
        decisionBy: currentUser.displayName,
        decisionAt: decisionAt,
      }), { merge: true });
    } catch (err) {
      console.warn('Firestore approveUpdateRequest error:', err);
    }

    setRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r;
      return {
        ...r,
        status: 'Approved',
        decisionNotes: finalNotes,
        decisionBy: currentUser.displayName,
        decisionAt: decisionAt,
      };
    }));

    // Notify requester with dynamic APP_URL link via Express SMTP backend
    if (smtpConfig.notifyRequesterOnDecision && req.submittedBy.email) {
      const appUrl = getAppUrl();
      const locationUrl = `${appUrl}/?view=directory&locationId=${req.targetId}`;
      const vars: Record<string, string> = {
        requestId: req.id,
        targetName: req.targetName,
        changeType: req.changeType,
        submitterName: req.submittedBy.name,
        approvedBy: currentUser.displayName,
        decisionNotes: finalNotes,
        decisionAt,
        locationUrl,
        appUrl
      };

      const hardcodedSubject = `[Approved] Directory Update: {{targetName}} (#{{requestId}})`;
      const hardcodedHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #16a34a; margin: 0; font-size: 22px;">PROPOSAL APPROVED</h1>
          <p style="color: #737373; margin: 4px 0 0 0; font-size: 13px;">Shiekh Location & Company Directory</p>
        </div>
        <p>Hello {{submitterName}},</p>
        <p>Your directory update request <strong>#{{requestId}}</strong> for <strong>{{targetName}}</strong> ({{changeType}}) has been <span style="color: #16a34a; font-weight: bold;">APPROVED</span> and committed to the master directory.</p>
        <div style="background-color: #f0fdf4; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #bbf7d0;">
          <p style="margin: 4px 0;"><strong>Approved By:</strong> {{approvedBy}}</p>
          <p style="margin: 4px 0;"><strong>Decision Notes:</strong> {{decisionNotes}}</p>
          <p style="margin: 4px 0;"><strong>Approved At:</strong> {{decisionAt}}</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{{locationUrl}}" style="background-color: #16a34a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Master Record</a>
        </div>
      </div>`;

      const tmpl = await fetchEmailTemplateWithFallback('request_approved', hardcodedSubject, hardcodedHtml);
      let subject = renderEmailTemplate(tmpl.subjectTemplate, vars);
      let htmlBody = renderEmailTemplate(tmpl.htmlTemplate, vars);
      if (!htmlBody || !htmlBody.includes(req.id)) {
        htmlBody = renderEmailTemplate(hardcodedHtml, vars);
      }
      const textBody = `Your update request #${req.id} for ${req.targetName} (${req.changeType}) has been APPROVED and applied to the master directory by ${currentUser.displayName}.\n\nDecision Notes: ${finalNotes}\n\nView the updated location in the authoritative directory:\n${locationUrl}`;

      const emailRes = await dispatchEmailApi({
        to: req.submittedBy.email,
        subject,
        text: textBody,
        html: htmlBody,
        emailType: 'Request Status Update',
        details: finalNotes || 'Your update request has been approved and committed to the master directory.',
      });
      if (!emailRes.success) {
        console.warn('Failed to send approval email notification:', emailRes.error);
      }
    }
  };

  const rejectUpdateRequest = async (requestId: string, rejectionNotes: string): Promise<void> => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const decisionAt = new Date().toISOString();

    // Persist request decision to Firestore
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'requests', requestId), sanitizeForFirestore({
        status: 'Rejected',
        decisionNotes: rejectionNotes,
        decisionBy: currentUser.displayName,
        decisionAt: decisionAt,
      }), { merge: true });
    } catch (err) {
      console.warn('Firestore rejectUpdateRequest error:', err);
    }

    setRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r;
      return {
        ...r,
        status: 'Rejected',
        decisionNotes: rejectionNotes,
        decisionBy: currentUser.displayName,
        decisionAt: decisionAt,
      };
    }));

    // Notify requester with dynamic APP_URL link via Express SMTP backend
    if (smtpConfig.notifyRequesterOnDecision && req.submittedBy.email) {
      const appUrl = getAppUrl();
      const queueUrl = `${appUrl}/?view=requests`;
      const vars: Record<string, string> = {
        requestId: req.id,
        targetName: req.targetName,
        changeType: req.changeType,
        submitterName: req.submittedBy.name,
        reviewedBy: currentUser.displayName,
        rejectionNotes,
        decisionAt,
        queueUrl,
        appUrl
      };

      const hardcodedSubject = `[Declined] Directory Update: {{targetName}} (#{{requestId}})`;
      const hardcodedHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #dc2626; margin: 0; font-size: 22px;">PROPOSAL DECLINED</h1>
          <p style="color: #737373; margin: 4px 0 0 0; font-size: 13px;">Shiekh Location & Company Directory</p>
        </div>
        <p>Hello {{submitterName}},</p>
        <p>Your directory update request <strong>#{{requestId}}</strong> for <strong>{{targetName}}</strong> ({{changeType}}) was not approved by Data Governance.</p>
        <div style="background-color: #fef2f2; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #fecaca;">
          <p style="margin: 4px 0;"><strong>Reviewed By:</strong> {{reviewedBy}}</p>
          <p style="margin: 4px 0;"><strong>Governance Notes / Reason:</strong> {{rejectionNotes}}</p>
          <p style="margin: 4px 0;"><strong>Decision Timestamp:</strong> {{decisionAt}}</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="{{queueUrl}}" style="background-color: #737373; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">View Directory Queue</a>
        </div>
      </div>`;

      const tmpl = await fetchEmailTemplateWithFallback('request_rejected', hardcodedSubject, hardcodedHtml);
      let subject = renderEmailTemplate(tmpl.subjectTemplate, vars);
      let htmlBody = renderEmailTemplate(tmpl.htmlTemplate, vars);
      if (!htmlBody || !htmlBody.includes(req.id)) {
        htmlBody = renderEmailTemplate(hardcodedHtml, vars);
      }
      const textBody = `Your update request #${req.id} for ${req.targetName} (${req.changeType}) was not approved by ${currentUser.displayName}.\n\nReason / Feedback: ${rejectionNotes}\n\nView request details in the directory queue:\n${queueUrl}`;

      const emailRes = await dispatchEmailApi({
        to: req.submittedBy.email,
        subject,
        text: textBody,
        html: htmlBody,
        emailType: 'Request Status Update',
        details: `Rejection Decision: ${rejectionNotes}`,
      });
      if (!emailRes.success) {
        console.warn('Failed to send rejection email notification:', emailRes.error);
      }
    }
  };

  // Authentication & Session
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(true);

  const loginWithGoogle = async (email?: string) => {
    if (email) {
      const targetEmail = email.toLowerCase();
      const existing = users.find(u => u.email.toLowerCase() === targetEmail);
      
      if (existing) {
        if (existing.status === 'Deactivated') {
          return { success: false, message: 'This account has been deactivated. Contact your System Administrator.' };
        }
        const updated = { ...existing, lastLogin: new Date().toISOString() };
        setCurrentUser(updated);
        setIsAuthenticated(true);
        updateUserAccount(existing.id, { lastLogin: updated.lastLogin });
        logAudit('User', existing.id, existing.displayName, 'Signed In via Corporate Google SSO', '', 'Authenticated');
        return { success: true };
      }
    }

    // Trigger Real Google Identity Services via Firebase Auth GoogleAuthProvider
    try {
      const fbUser = await signInWithGoogleLive();
      if (fbUser && fbUser.email) {
        const normalizedEmail = fbUser.email.toLowerCase();
        setActiveCloudUser({
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL
        });
        setIsAuthenticated(true);

        const existing = users.find(u => u.email.toLowerCase() === normalizedEmail);
        if (existing) {
          const updated = { ...existing, lastLogin: new Date().toISOString() };
          setCurrentUser(updated);
          updateUserAccount(existing.id, { lastLogin: updated.lastLogin });
          logAudit('User', existing.id, existing.displayName, 'Signed In via Google Identity', '', 'Authenticated');
          return { success: true };
        }

        const isSysAdmin = normalizedEmail.includes('theo') || normalizedEmail.endsWith('@shiekhshoes.org');
        const isSteward = normalizedEmail.includes('vargas') || normalizedEmail.includes('steward');
        const newRole: UserRole = isSysAdmin ? 'System Administrator' : isSteward ? 'Directory Data Steward' : 'Viewer';

        const newUser: UserAccount = {
          id: `usr-fb-${fbUser.uid.substring(0, 8)}`,
          email: normalizedEmail,
          displayName: fbUser.displayName || normalizedEmail.split('@')[0],
          authMethod: 'google',
          role: newRole,
          accessScope: 'Company-wide',
          status: 'Active',
          lastLogin: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        addUserAccount(newUser);
        setCurrentUser(newUser);
        logAudit('User', newUser.id, newUser.displayName, 'Provisioned Account via Google Identity', '', newRole);
        return { success: true };
      }
      return { success: false, message: 'No Google identity credentials returned.' };
    } catch (err: any) {
      console.warn('Live Google Sign-In error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        return { success: false, message: 'Sign-in popup was closed before completing Google authentication.' };
      } else if (err.code === 'auth/popup-blocked') {
        return { success: false, message: 'Browser blocked authentication popup. Please allow popups or use direct email login.' };
      }
      return { success: false, message: `Google Sign-In failed: ${err.message || String(err)}` };
    }
  };

  const loginWithEmailPassword = async (email: string, password?: string): Promise<{ success: boolean; message?: string }> => {
    const targetEmail = email.trim().toLowerCase();
    
    if (!password) {
      return { success: false, message: 'Password is required for email login.' };
    }

    try {
      const auth = getFirebaseAuth();
      const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
      const fbUser = cred.user;
      
      const db = getFirebaseDb();
      
      // Look up user account in local state
      const existing = users.find(u => 
        (u.firebaseUid && u.firebaseUid === fbUser.uid) ||
        u.email.toLowerCase() === targetEmail
      );

      const lastLogin = new Date().toISOString();
      if (existing) {
        if (existing.status === 'Deactivated') {
          return { success: false, message: 'This account has been deactivated. Contact your System Administrator.' };
        }
        const updated: UserAccount = {
          ...existing,
          firebaseUid: fbUser.uid,
          lastLogin
        };
        setCurrentUser(updated);
        setIsAuthenticated(true);
        setDoc(doc(db, 'users', existing.id), sanitizeForFirestore({
          firebaseUid: fbUser.uid,
          lastLogin
        }), { merge: true }).catch(() => {});
        logAudit('User', existing.id, existing.displayName, 'Signed In via Firebase Email/Password Auth', '', 'Authenticated');
        return { success: true };
      } else {
        const isSysAdmin = targetEmail.includes('theo') || targetEmail.endsWith('@shiekhshoes.org');
        const newUser: UserAccount = {
          id: `usr-${Date.now().toString(36)}`,
          email: targetEmail,
          displayName: targetEmail.split('@')[0],
          authMethod: 'email_password',
          role: isSysAdmin ? 'System Administrator' : 'Viewer',
          accessScope: 'Company-wide',
          firebaseUid: fbUser.uid,
          status: 'Active',
          lastLogin,
          createdAt: new Date().toISOString()
        };
        setCurrentUser(newUser);
        setIsAuthenticated(true);
        setDoc(doc(db, 'users', newUser.id), sanitizeForFirestore(newUser)).catch(() => {});
        logAudit('User', newUser.id, newUser.displayName, 'Created & Signed In via Firebase Email/Password Auth', '', newUser.role);
        return { success: true };
      }
    } catch (err: any) {
      console.warn('Firebase signInWithEmailAndPassword error:', err);
      let msg = 'Authentication failed. Please check your email and password.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Invalid email or password. Please verify your credentials or accept your invitation.';
      } else if (err.code === 'auth/user-disabled') {
        msg = 'This account has been disabled. Contact your System Administrator.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Access temporarily disabled due to many failed login attempts. Please try again later.';
      }
      return { success: false, message: msg };
    }
  };

  const acceptInvitation = async (email: string, password: string, token: string): Promise<{ success: boolean; message?: string; user?: UserAccount }> => {
    const targetEmail = email.trim().toLowerCase();
    
    // Query users for matching invitationToken and email
    const db = getFirebaseDb();
    let matchingUser = users.find(u => 
      u.email.toLowerCase() === targetEmail &&
      u.invitationToken === token
    );

    if (!matchingUser) {
      // Check live Firestore if not in local state yet
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        usersSnapshot.forEach(d => {
          const u = d.data() as UserAccount;
          if (u.email.toLowerCase() === targetEmail && u.invitationToken === token) {
            matchingUser = u;
          }
        });
      } catch (e) {
        console.warn('Error querying Firestore for invitation token:', e);
      }
    }

    if (!matchingUser) {
      return { success: false, message: 'Invalid or expired invitation token for this email address.' };
    }

    if (matchingUser.status === 'Deactivated') {
      return { success: false, message: 'This account invitation has been deactivated.' };
    }

    try {
      const auth = getFirebaseAuth();
      let fbUser;
      try {
        const cred = await createUserWithEmailAndPassword(auth, targetEmail, password);
        fbUser = cred.user;
      } catch (createErr: any) {
        // If email already exists in Firebase Auth, attempt sign-in
        if (createErr.code === 'auth/email-already-in-use') {
          const cred = await signInWithEmailAndPassword(auth, targetEmail, password);
          fbUser = cred.user;
        } else {
          throw createErr;
        }
      }

      const now = new Date().toISOString();
      const updatedUser: UserAccount = {
        ...matchingUser,
        status: 'Active',
        firebaseUid: fbUser.uid,
        invitationToken: undefined,
        lastLogin: now
      };

      // Persist to Firestore merging firebaseUid and setting status to Active
      const userDocRef = doc(db, 'users', matchingUser.id);
      await setDoc(userDocRef, sanitizeForFirestore({
        status: 'Active',
        firebaseUid: fbUser.uid,
        invitationToken: null,
        lastLogin: now
      }), { merge: true });

      setCurrentUser(updatedUser);
      setIsAuthenticated(true);
      logAudit('User', updatedUser.id, updatedUser.displayName, 'Accepted Invitation & Configured Credentials', 'Invited', 'Active');
      return { success: true, user: updatedUser };
    } catch (err: any) {
      console.error('acceptInvitation error:', err);
      let message = `Failed to accept invitation: ${err.message || String(err)}`;
      if (err.code === 'auth/weak-password') {
        message = 'Password is too weak. Please choose a password with at least 6 characters.';
      } else if (err.code === 'auth/email-already-in-use') {
        message = 'An account with this email already exists. Please sign in directly or contact support.';
      }
      return { success: false, message };
    }
  };

  const logout = () => {
    try {
      signOutLive().catch(e => console.warn('Firebase signOut error:', e));
    } catch (e) {
      console.warn('signOut error:', e);
    }
    setActiveCloudUser(null);
    setIsAuthenticated(false);
    // Switch to default viewer for public browsing
    const viewerAccount = users.find(u => u.role === 'Viewer') || {
      id: 'usr-guest-viewer',
      email: 'guest@shiekhshoes.com',
      displayName: 'Guest Viewer (Unauthenticated)',
      authMethod: 'email_password' as const,
      role: 'Viewer' as const,
      accessScope: 'Company-wide' as const,
      status: 'Active' as const,
      createdAt: new Date().toISOString()
    };
    setCurrentUser(viewerAccount);
  };

  const switchUserAccount = (userId: string) => {
    const found = users.find(u => u.id === userId);
    if (found) {
      setCurrentUser(found);
      setIsAuthenticated(true);
      logAudit('User', found.id, found.displayName, 'Switched Active Session', '', found.role);
    }
  };

  // User Accounts & Onboarding Lifecycle
  const addUserAccount = async (userData: Omit<UserAccount, 'id' | 'createdAt'>): Promise<UserAccount> => {
    const newUser: UserAccount = {
      ...userData,
      id: `usr-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'users', newUser.id), sanitizeForFirestore(newUser));
    } catch (err) {
      console.warn('Firestore addUserAccount error:', err);
    }
    logAudit('User', newUser.id, newUser.displayName, 'Created User Account', '', newUser.role);
    return newUser;
  };

  const inviteUserAccount = async (
    email: string,
    role: UserRole,
    accessScope: UserAccount['accessScope'],
    personId?: string,
    assignedDistrict?: string,
    assignedStoreId?: string
  ): Promise<UserAccount> => {
    const linkedPerson = personId ? people.find(p => p.id === personId) : undefined;
    const token = `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    
    const newUser: UserAccount = {
      id: `usr-${Date.now().toString(36)}`,
      email: email.trim().toLowerCase(),
      displayName: linkedPerson ? linkedPerson.name : email.split('@')[0],
      authMethod: email.endsWith('@shiekhshoes.org') || email.endsWith('@shiekhshoes.com') ? 'google' : 'email_password',
      role,
      accessScope,
      personId,
      assignedDistrict,
      assignedStoreId,
      status: 'Invited',
      invitationToken: token,
      invitedBy: currentUser.displayName,
      createdAt: new Date().toISOString(),
    };

    // 1. Persist newUser object to live Firestore database (no optimistic setUsers to prevent race conditions)
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'users', newUser.id), sanitizeForFirestore(newUser));
    } catch (dbErr: any) {
      console.error('Firestore setDoc user error:', dbErr);
      throw new Error(`Failed to save user account to database: ${dbErr.message || String(dbErr)}`);
    }

    logAudit('User', newUser.id, newUser.displayName, `Sent Onboarding Invitation (${role})`, '', `Token: ${token}`);

    // 2. Dispatch onboarding invitation email via real SMTP Express backend
    const appUrl = getAppUrl();
    const inviteUrl = `${appUrl}/?inviteToken=${token}&email=${encodeURIComponent(newUser.email)}`;
    
    const hardcodedInviteSubject = `[Action Required] You've been invited to the Shiekh Directory ({{role}})`;
    const hardcodedInviteHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #dc2626; margin: 0; font-size: 22px;">SHIEKH DIRECTORY</h1>
        <p style="color: #737373; margin: 4px 0 0 0; font-size: 13px;">Corporate System of Record</p>
      </div>
      <p>Hello,</p>
      <p>You have been invited by <strong>{{inviterName}}</strong> to access the Shiekh Location & Company Directory SoR.</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #e2e8f0;">
        <p style="margin: 4px 0;"><strong>Assigned Role:</strong> <span style="color: #dc2626; font-weight: bold;">{{role}}</span></p>
        <p style="margin: 4px 0;"><strong>Access Scope:</strong> {{accessScope}}</p>
        <p style="margin: 4px 0;"><strong>Authorized Email:</strong> {{email}}</p>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{inviteUrl}}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation & Set Password</a>
      </div>
      <p style="font-size: 12px; color: #737373; margin-top: 24px;">If the button above does not work, copy and paste this link into your browser:<br/><a href="{{inviteUrl}}" style="color: #dc2626; word-break: break-all;">{{inviteUrl}}</a></p>
    </div>`;

    const tmpl = await fetchEmailTemplateWithFallback('user_invitation', hardcodedInviteSubject, hardcodedInviteHtml);
    const vars: Record<string, string> = {
      role,
      accessScope,
      email: newUser.email,
      inviterName: currentUser.displayName,
      token,
      inviteUrl,
      appUrl
    };

    let subject = renderEmailTemplate(tmpl.subjectTemplate, vars);
    let htmlBody = renderEmailTemplate(tmpl.htmlTemplate, vars);
    if (!htmlBody || !htmlBody.includes(inviteUrl)) {
      htmlBody = renderEmailTemplate(hardcodedInviteHtml, vars);
    }
    const textBody = `Hello,\n\nYou have been invited by ${currentUser.displayName} to access the Shiekh Location & Company Directory System of Record (SoR).\n\nAssigned Role: ${role}\nAccess Scope: ${accessScope}\nAccount Email: ${newUser.email}\n\nAccept your invitation and access the directory here:\n${inviteUrl}`;

    const emailRes = await dispatchEmailApi({
      to: newUser.email,
      subject,
      text: textBody,
      html: htmlBody,
      emailType: 'User Onboarding Notice',
      details: `Invitation link dispatched with token ${token}. Role: ${role}, Scope: ${accessScope}.`,
    });

    if (!emailRes.success) {
      throw new Error(emailRes.error || `Failed to send invitation email to ${newUser.email}`);
    }

    return newUser;
  };

  const activateUserAccount = async (id: string): Promise<void> => {
    await updateUserAccount(id, { status: 'Active' });
    logAudit('User', id, id, 'Activated User Account', 'Invited', 'Active');
  };

  const resendUserInvite = async (id: string): Promise<void> => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const token = `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    await updateUserAccount(id, { invitationToken: token });

    const appUrl = getAppUrl();
    const inviteUrl = `${appUrl}/?inviteToken=${token}&email=${encodeURIComponent(user.email)}`;
    
    const hardcodedInviteSubject = `[Action Required] You've been invited to the Shiekh Directory ({{role}})`;
    const hardcodedInviteHtml = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5e5; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #dc2626; margin: 0; font-size: 22px;">SHIEKH DIRECTORY</h1>
        <p style="color: #737373; margin: 4px 0 0 0; font-size: 13px;">Corporate System of Record</p>
      </div>
      <p>Hello,</p>
      <p>This is a reminder that you have an active invitation from <strong>{{inviterName}}</strong> to access the Shiekh Location & Company Directory SoR.</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0; border: 1px solid #e2e8f0;">
        <p style="margin: 4px 0;"><strong>Assigned Role:</strong> <span style="color: #dc2626; font-weight: bold;">{{role}}</span></p>
        <p style="margin: 4px 0;"><strong>Access Scope:</strong> {{accessScope}}</p>
        <p style="margin: 4px 0;"><strong>Authorized Email:</strong> {{email}}</p>
      </div>
      <div style="text-align: center; margin: 28px 0;">
        <a href="{{inviteUrl}}" style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation & Set Password</a>
      </div>
      <p style="font-size: 12px; color: #737373; margin-top: 24px;">If the button above does not work, copy and paste this link into your browser:<br/><a href="{{inviteUrl}}" style="color: #dc2626; word-break: break-all;">{{inviteUrl}}</a></p>
    </div>`;

    const tmpl = await fetchEmailTemplateWithFallback('user_invitation', hardcodedInviteSubject, hardcodedInviteHtml);
    const vars: Record<string, string> = {
      role: user.role,
      accessScope: user.accessScope,
      email: user.email,
      inviterName: currentUser.displayName,
      token,
      inviteUrl,
      appUrl
    };

    let subject = renderEmailTemplate(tmpl.subjectTemplate, vars);
    let htmlBody = renderEmailTemplate(tmpl.htmlTemplate, vars);
    if (!htmlBody || !htmlBody.includes(inviteUrl)) {
      htmlBody = renderEmailTemplate(hardcodedInviteHtml, vars);
    }
    const textBody = `Hello,\n\nThis is a reminder that you have an active invitation from ${currentUser.displayName} to access the Shiekh Location & Company Directory SoR.\n\nRole: ${user.role}\nAccess Scope: ${user.accessScope}\n\nAccept your invitation here:\n${inviteUrl}`;

    const emailRes = await dispatchEmailApi({
      to: user.email,
      subject,
      text: textBody,
      html: htmlBody,
      emailType: 'User Onboarding Notice',
      details: `Resent onboarding invite token ${token}. Role: ${user.role}, Scope: ${user.accessScope}.`,
    });

    if (!emailRes.success) {
      throw new Error(emailRes.error || `Failed to resend invitation email to ${user.email}`);
    }
  };

  const updateUserAccount = async (id: string, updates: Partial<UserAccount>): Promise<void> => {
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'users', id), sanitizeForFirestore(updates), { merge: true });
    } catch (err) {
      console.warn('Firestore updateUserAccount error:', err);
    }
    const u = users.find(user => user.id === id);
    if (u) {
      const updated = { ...u, ...updates };
      logAudit('User', u.id, u.displayName, 'Updated Account Properties', JSON.stringify(u), JSON.stringify(updated));
    }
  };

  const deactivateUserAccount = async (id: string): Promise<void> => {
    await updateUserAccount(id, { status: 'Deactivated' });
  };

  const offboardUserAccount = (
    userId: string,
    options: {
      reassignments?: { storeId: string; newManagerName: string; newManagerPhone: string; newPersonId?: string }[];
      setRemainingStoresVacant?: boolean;
      deactivateLinkedPerson?: boolean;
      reason?: string;
    }
  ): { success: boolean; affectedStores: number } => {
    const user = users.find(u => u.id === userId);
    if (!user) return { success: false, affectedStores: 0 };

    // 1. Soft-deactivate user account
    updateUserAccount(userId, { status: 'Deactivated' });

    // 2. If requested, deactivate linked person in People roster
    if (options.deactivateLinkedPerson && user.personId) {
      updatePerson(user.personId, { activeStatus: false, notes: `Offboarded on ${new Date().toLocaleDateString()}: ${options.reason || 'User departure'}` });
    }

    // 3. Process store leadership reassignments & vacancies
    let affectedCount = 0;
    const targetPerson = user.personId ? people.find(p => p.id === user.personId) : null;
    const targetName = targetPerson?.name || user.displayName;

    setLocations(prev => prev.map(loc => {
      // Check if user is SM
      const isSM = (loc.storeManagerId && user.personId && loc.storeManagerId === user.personId) || 
                   (loc.storeManagerName && loc.storeManagerName.toLowerCase() === targetName.toLowerCase());
      
      if (!isSM) return loc;
      affectedCount++;

      // Check if specific reassignment was provided
      const customReassign = options.reassignments?.find(r => r.storeId === loc.id);
      if (customReassign) {
        logAudit('Location', loc.id, `Store #${loc.storeNumber} (${loc.name})`, 'Reassigned Store Manager (Offboarding)', `${loc.storeManagerName}`, `${customReassign.newManagerName}`);
        return {
          ...loc,
          storeManagerName: customReassign.newManagerName,
          storeManagerPhone: customReassign.newManagerPhone,
          storeManagerId: customReassign.newPersonId || undefined,
          lastUpdated: new Date().toISOString(),
          lastUpdatedBy: `${currentUser.displayName} (User Offboarding)`,
        };
      }

      if (options.setRemainingStoresVacant) {
        logAudit('Location', loc.id, `Store #${loc.storeNumber} (${loc.name})`, 'Flagged Store Manager as Vacant (Offboarding)', `${loc.storeManagerName}`, 'Vacant (Needs Steward Review)');
        return {
          ...loc,
          storeManagerName: 'Vacant (Offboarded)',
          storeManagerPhone: '',
          storeManagerId: undefined,
          lastUpdated: new Date().toISOString(),
          lastUpdatedBy: `${currentUser.displayName} (User Offboarding)`,
        };
      }

      return loc;
    }));

    // 4. Audit Log preserving historical SOX compliance
    logAudit(
      'User',
      user.id,
      user.displayName,
      'Offboarded User Account (Soft Delete)',
      user.status,
      `Deactivated login. Reassigned/flagged ${affectedCount} store(s). Historical audit logs preserved intact. Reason: ${options.reason || 'N/A'}`
    );

    // 5. Transactional email notification (if enabled)
    if (smtpConfig.notifyOnUserOffboarded || smtpConfig.notifyOnMajorChange) {
      const emailLog: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: 'User Offboarding Notice',
        recipients: [smtpConfig.directoryStewardEmail],
        subject: `[Shiekh Directory SoR] User Offboarded: ${user.displayName} (${user.role})`,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: 'Sent',
        details: `Account ${user.email} (${user.role}) was soft-deactivated by ${currentUser.displayName}. ${affectedCount} stores reviewed. Historical audit logs retained per Blueprint Sec 9.`,
      };
      setEmailLogs(prev => [emailLog, ...prev]);
    }

    return { success: true, affectedStores: affectedCount };
  };

  // API Clients & Integrations (Blueprint Sec 14)
  const addApiClient = (clientData: Omit<ApiClient, 'id' | 'createdAt' | 'apiKey'>): { client: ApiClient; plainTextKey: string } => {
    const rawSecret = `shk_live_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 8)}`;
    const newClient: ApiClient = {
      ...clientData,
      id: `client-${Date.now().toString(36)}`,
      apiKey: rawSecret,
      createdAt: new Date().toISOString(),
    };
    setApiClients(prev => [...prev, newClient]);
    logAudit('Setting', newClient.id, newClient.name, 'Generated API Client Service Account', '', `Scopes: [${newClient.scopes.join(', ')}] RateLimit: ${newClient.rateLimitPerMinute}/min`);
    return { client: newClient, plainTextKey: rawSecret };
  };

  const rotateApiKey = (id: string): { newKey: string } => {
    const newKey = `shk_live_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 8)}`;
    setApiClients(prev => prev.map(c => {
      if (c.id !== id) return c;
      logAudit('Setting', c.id, c.name, 'Rotated API Secret Key', 'old-key-redacted', 'new-key-issued');
      return { ...c, apiKey: newKey };
    }));
    return { newKey };
  };

  const revokeApiClient = (id: string) => {
    setApiClients(prev => prev.map(c => {
      if (c.id !== id) return c;
      logAudit('Setting', c.id, c.name, 'Revoked API Token', 'Active', 'Revoked');
      return { ...c, status: 'Revoked' };
    }));
  };

  const triggerApiSync = (clientId: string) => {
    setApiClients(prev => prev.map(c => {
      if (c.id !== clientId) return c;
      return { ...c, lastUsedAt: new Date().toISOString() };
    }));
  };

  // Communications & SMTP
  const updateSmtpConfig = (updates: Partial<SmtpConfig>) => {
    setSmtpConfig(prev => ({ ...prev, ...updates }));
    logAudit('Setting', 'smtp-config', 'SMTP Configuration', 'Updated Email Settings', '', JSON.stringify(updates));
  };

  const addEmailTemplate = async (template: Omit<EmailTemplate, 'updatedAt'>): Promise<void> => {
    const newTmpl: EmailTemplate = {
      ...template,
      updatedAt: new Date().toISOString()
    };
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'email_templates', newTmpl.id), sanitizeForFirestore(newTmpl));
    } catch (err) {
      console.warn('Firestore addEmailTemplate error:', err);
    }
    setEmailTemplates(prev => [...prev.filter(t => t.id !== newTmpl.id), newTmpl]);
    const varList = (newTmpl.availableVariables || newTmpl.variables || []).join(', ');
    logAudit('Setting', newTmpl.id, newTmpl.name, 'Created Email Template', '', `Variables: ${varList}`);
  };

  const updateEmailTemplate = async (id: string, updates: Partial<EmailTemplate>): Promise<void> => {
    const existing = getEmailTemplate(id);
    const updated: EmailTemplate = {
      ...existing,
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    };
    try {
      const db = getFirebaseDb();
      await setDoc(doc(db, 'email_templates', id), sanitizeForFirestore(updated), { merge: true });
    } catch (err) {
      console.warn('Firestore updateEmailTemplate error:', err);
    }
    setEmailTemplates(prev => {
      const exists = prev.some(t => t.id === id);
      if (exists) {
        return prev.map(t => t.id === id ? updated : t);
      }
      return [...prev, updated];
    });
    logAudit('Setting', id, updated.name, 'Updated Email Template', '', `Updated fields: ${Object.keys(updates).join(', ')}`);
  };

  const deleteEmailTemplate = async (id: string): Promise<void> => {
    try {
      const db = getFirebaseDb();
      await deleteDoc(doc(db, 'email_templates', id));
    } catch (err) {
      console.warn('Firestore deleteEmailTemplate error:', err);
    }
    setEmailTemplates(prev => prev.filter(t => t.id !== id));
    logAudit('Setting', id, id, 'Deleted Email Template', '', 'Removed from active templates');
  };

  const resetEmailTemplatesToDefault = async (): Promise<void> => {
    try {
      const db = getFirebaseDb();
      for (const tmpl of INITIAL_EMAIL_TEMPLATES) {
        await setDoc(doc(db, 'email_templates', tmpl.id), sanitizeForFirestore(tmpl));
      }
    } catch (err) {
      console.warn('Firestore resetEmailTemplatesToDefault error:', err);
    }
    setEmailTemplates(INITIAL_EMAIL_TEMPLATES);
    logAudit('Setting', 'all-templates', 'Email Templates', 'Reset Email Templates to Default System Blueprints', '', 'Restored 4 core templates');
  };

  const sendTestEmail = async (toEmail: string): Promise<{ success: boolean; error?: string; log: EmailLogEntry }> => {
    const appUrl = getAppUrl();
    const tmpl = getEmailTemplate('test_email');
    const vars = {
      targetEmail: toEmail,
      senderName: currentUser.displayName,
      senderRole: currentUser.role,
      host: smtpConfig.host || 'smtp.shiekhshoes.com',
      port: String(smtpConfig.port || 587),
      tlsStatus: smtpConfig.secureTls ? 'STARTTLS Enforced' : 'Standard',
      fromName: smtpConfig.fromName,
      fromEmail: smtpConfig.fromEmail,
      timestamp: new Date().toLocaleString(),
      serverIso: new Date().toISOString(),
      appUrl
    };

    const subject = renderEmailTemplate(tmpl.subjectTemplate, vars);
    const htmlBody = renderEmailTemplate(tmpl.htmlTemplate, vars);
    const textBody = `This is an automated diagnostic test email from the Shiekh Location & Company Directory SoR SMTP Service.\n\nServer Time: ${vars.serverIso}\nTarget Recipient: ${toEmail}\nTriggered By: ${currentUser.displayName} (${currentUser.role})\nHost: ${smtpConfig.host}:${smtpConfig.port} (TLS: ${smtpConfig.secureTls ? 'Enabled' : 'Disabled'})\n\nApplication URL:\n${appUrl}`;

    return await dispatchEmailApi({
      to: toEmail,
      subject,
      text: textBody,
      html: htmlBody,
      emailType: 'Test Email',
      details: `Diagnostic test email dispatched to ${toEmail}.`,
    });
  };

  const sendDirectoryPdfEmail = async (recipients: string[], subject: string, message: string, paperSize: string): Promise<{ success: boolean; error?: string; log: EmailLogEntry }> => {
    const appUrl = getAppUrl();
    const pdfSubject = subject || 'Shiekh Shoes Store Directory (Master Landscape PDF)';
    const attachmentName = `Shiekh_Store_Directory_${new Date().toISOString().split('T')[0]}_${paperSize}.pdf`;
    const textBody = `${message}\n\nGenerated by ${currentUser.displayName} on ${new Date().toLocaleString()}.\nAccess authoritative directory:\n${appUrl}`;
    
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #171717; max-width: 600px; line-height: 1.5;">
        <h2 style="color: #dc2626; margin-bottom: 8px;">Shiekh Shoes Store Directory</h2>
        <p>${message}</p>
        <div style="background: #f5f5f5; border: 1px solid #e5e5e5; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Document:</strong> Master Store Directory (${paperSize})</p>
          <p style="margin: 4px 0;"><strong>Attachment:</strong> ${attachmentName}</p>
          <p style="margin: 4px 0;"><strong>Generated By:</strong> ${currentUser.displayName}</p>
          <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p style="margin: 20px 0;">
          <a href="${appUrl}" style="background: #dc2626; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
            Open Live Shiekh Directory
          </a>
        </p>
        <p style="font-size: 12px; color: #737373;">Shiekh Shoes System of Record • ${appUrl}</p>
      </div>
    `;

    return await dispatchEmailApi({
      to: recipients,
      subject: pdfSubject,
      text: textBody,
      html: htmlBody,
      emailType: 'Store Directory PDF',
      details: message,
    });
  };

  // Google Business Profile (GBP) API Integration Methods (Blueprint Sec 14 & 15)
  const updateGbpConfig = (updates: Partial<GbpConfig>) => {
    setGbpConfig(prev => ({ ...prev, ...updates }));
    logAudit('Setting', 'gbp-config', 'Google Business Profile Config', 'Updated GBP Settings', '', JSON.stringify(updates));
  };

  const testGbpHandshake = async (): Promise<{ success: boolean; message: string; latencyMs: number }> => {
    const start = performance.now();
    // Simulate Google Business Information API v1 accounts endpoint ping
    await new Promise(res => setTimeout(res, 450));
    const latencyMs = Math.round(performance.now() - start);

    if (!gbpConfig.clientEmail && !gbpConfig.clientId) {
      return {
        success: false,
        message: 'Google API credentials missing. Provide Service Account email or OAuth Client ID.',
        latencyMs,
      };
    }

    const handshakeTime = new Date().toISOString();
    setGbpConfig(prev => ({ ...prev, isConnected: true, lastHandshake: handshakeTime }));
    
    const handshakeLog: GbpSyncLogEntry = {
      id: `gbp-log-${Date.now()}`,
      timestamp: handshakeTime,
      locationId: 'GLOBAL',
      storeNumber: 'ALL',
      locationName: 'Google Business Information API Handshake',
      gbpLocationId: gbpConfig.accountId,
      action: 'Handshake Ping',
      payloadSummary: `OAuth / Service Account token verification with scope ${gbpConfig.scope}`,
      httpStatus: 200,
      status: 'SUCCESS',
      diffSummary: `Handshake successful with Google Cloud Project API gateway (${latencyMs}ms latency). Account: ${gbpConfig.accountName}`,
      syncedBy: currentUser.displayName,
    };
    setGbpSyncLogs(prev => [handshakeLog, ...prev]);

    return {
      success: true,
      message: `Google Business Profile API v1 handshake verified in ${latencyMs}ms. Account: ${gbpConfig.accountId}`,
      latencyMs,
    };
  };

  const fetchGbpListingsFromApi = async (): Promise<GbpLocationListing[]> => {
    // Simulates GET https://mybusinessbusinessinformation.googleapis.com/v1/accounts/{accountId}/locations
    await new Promise(res => setTimeout(res, 600));
    return gbpListings;
  };

  const mapLocationToGbp = (locationId: string, gbpLocationId: string, placeId?: string) => {
    const targetListing = gbpListings.find(l => l.locationName === gbpLocationId);
    const targetLoc = locations.find(l => l.id === locationId);
    if (!targetLoc) return;

    // Update location record in SoR
    setLocations(prev => prev.map(loc => {
      if (loc.id !== locationId) return loc;
      return {
        ...loc,
        gbpLocationId,
        gbpPlaceId: placeId || targetListing?.placeId || loc.gbpPlaceId,
        gbpMapsUrl: targetListing?.mapsUrl || loc.gbpMapsUrl,
        gbpListingStatus: targetListing?.verificationStatus || 'VERIFIED',
        gbpSyncStatus: 'Pending Push',
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: currentUser.displayName,
      };
    }));

    // Update listing state in listings table
    setGbpListings(prev => prev.map(listing => {
      if (listing.locationName === gbpLocationId) {
        return { ...listing, linkedLocationId: locationId };
      }
      if (listing.linkedLocationId === locationId && listing.locationName !== gbpLocationId) {
        return { ...listing, linkedLocationId: undefined };
      }
      return listing;
    }));

    const logEntry: GbpSyncLogEntry = {
      id: `gbp-log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      locationId,
      storeNumber: targetLoc.storeNumber,
      locationName: targetLoc.name,
      gbpLocationId,
      action: 'Link GBP Listing',
      payloadSummary: `Mapped internal Store #${targetLoc.storeNumber} to Google Listing (${gbpLocationId})`,
      httpStatus: 200,
      status: 'SUCCESS',
      diffSummary: `Associated Place ID: ${placeId || targetListing?.placeId || 'Auto-linked'}`,
      syncedBy: currentUser.displayName,
    };
    setGbpSyncLogs(prev => [logEntry, ...prev]);
    logAudit('Location', locationId, `Store #${targetLoc.storeNumber} (${targetLoc.name})`, 'Linked Google Maps Listing', '', gbpLocationId);
  };

  const unmapLocationFromGbp = (locationId: string) => {
    const targetLoc = locations.find(l => l.id === locationId);
    if (!targetLoc) return;

    const prevGbpId = targetLoc.gbpLocationId;

    setLocations(prev => prev.map(loc => {
      if (loc.id !== locationId) return loc;
      return {
        ...loc,
        gbpLocationId: undefined,
        gbpSyncStatus: 'Unmapped',
        gbpListingStatus: undefined,
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: currentUser.displayName,
      };
    }));

    setGbpListings(prev => prev.map(listing => {
      if (listing.linkedLocationId === locationId) {
        return { ...listing, linkedLocationId: undefined };
      }
      return listing;
    }));

    if (prevGbpId) {
      logAudit('Location', locationId, `Store #${targetLoc.storeNumber} (${targetLoc.name})`, 'Unlinked Google Maps Listing', prevGbpId, 'Unmapped');
    }
  };

  const autoMatchGbpListings = (): { matchedCount: number; alreadyMappedCount: number } => {
    let matched = 0;
    let alreadyMapped = 0;

    const unmappedLocations = locations.filter(l => !l.gbpLocationId);
    alreadyMapped = locations.length - unmappedLocations.length;

    const updatedLocations = [...locations];
    const updatedListings = [...gbpListings];

    unmappedLocations.forEach(loc => {
      // Clean store number e.g. "007" -> "7" or "115" -> "115"
      const cleanStoreNum = loc.storeNumber.replace(/^0+/, '');
      const candidate = updatedListings.find(listing => {
        const listingStoreCode = listing.storeCode.replace(/^0+/, '');
        if (listingStoreCode === cleanStoreNum && !listing.linkedLocationId) return true;
        // Or check title containing store number
        if (listing.title.includes(`Store #${loc.storeNumber}`) || listing.title.includes(` #${cleanStoreNum}`)) {
          return !listing.linkedLocationId;
        }
        return false;
      });

      if (candidate) {
        matched++;
        const locIdx = updatedLocations.findIndex(l => l.id === loc.id);
        if (locIdx >= 0) {
          updatedLocations[locIdx] = {
            ...updatedLocations[locIdx],
            gbpLocationId: candidate.locationName,
            gbpPlaceId: candidate.placeId,
            gbpMapsUrl: candidate.mapsUrl,
            gbpListingStatus: candidate.verificationStatus,
            gbpSyncStatus: 'Pending Push',
          };
        }

        const listingIdx = updatedListings.findIndex(l => l.locationName === candidate.locationName);
        if (listingIdx >= 0) {
          updatedListings[listingIdx] = {
            ...updatedListings[listingIdx],
            linkedLocationId: loc.id,
          };
        }
      }
    });

    if (matched > 0) {
      setLocations(updatedLocations);
      setGbpListings(updatedListings);
      logAudit('Setting', 'gbp-auto-match', 'GBP Listing Matcher', 'Executed Auto-Match Engine', '', `Auto-linked ${matched} location records by store code.`);
    }

    return { matchedCount: matched, alreadyMappedCount: alreadyMapped };
  };

  const syncSingleLocationToGbp = async (locationId: string): Promise<{ success: boolean; error?: string; log: GbpSyncLogEntry }> => {
    const loc = locations.find(l => l.id === locationId);
    if (!loc) {
      const errLog: GbpSyncLogEntry = {
        id: `gbp-log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        locationId,
        storeNumber: 'UNKNOWN',
        locationName: 'Unknown Store',
        gbpLocationId: 'N/A',
        action: 'Push Full Location',
        payloadSummary: 'Location not found in SoR database.',
        httpStatus: 404,
        status: 'ERROR',
        errorMessage: 'Location record not found.',
        syncedBy: currentUser.displayName,
      };
      setGbpSyncLogs(prev => [errLog, ...prev]);
      return { success: false, error: 'Location record not found.', log: errLog };
    }

    // Step 1: Validate
    const validation = validateLocationForGbp(loc);
    if (!validation.isValid) {
      const errLog: GbpSyncLogEntry = {
        id: `gbp-log-${Date.now()}`,
        timestamp: new Date().toISOString(),
        locationId: loc.id,
        storeNumber: loc.storeNumber,
        locationName: loc.name,
        gbpLocationId: loc.gbpLocationId || 'UNMAPPED',
        action: 'Push Full Location',
        payloadSummary: 'Payload failed pre-flight schema validation.',
        httpStatus: 422,
        status: 'ERROR',
        errorMessage: validation.errors.join('; '),
        syncedBy: currentUser.displayName,
      };

      setLocations(prev => prev.map(l => {
        if (l.id !== loc.id) return l;
        return {
          ...l,
          gbpSyncStatus: 'Error',
          gbpSyncError: validation.errors.join('; '),
        };
      }));

      setGbpSyncLogs(prev => [errLog, ...prev]);
      return { success: false, error: validation.errors.join('; '), log: errLog };
    }

    // Step 2: Translate payload to Google Business Profile v1 schema
    const payload = translateLocationToGbpSchema(loc);
    const diff = generateGbpDiffSummary(loc);

    // Step 3: Simulate Google My Business API network latency & call
    await new Promise(res => setTimeout(res, 350));

    const syncTime = new Date().toISOString();
    const successLog: GbpSyncLogEntry = {
      id: `gbp-log-${Date.now()}`,
      timestamp: syncTime,
      locationId: loc.id,
      storeNumber: loc.storeNumber,
      locationName: loc.name,
      gbpLocationId: payload.name,
      action: 'Push Full Location',
      payloadSummary: JSON.stringify({
        title: payload.title,
        address: payload.storefrontAddress.addressLines[0],
        city: payload.storefrontAddress.locality,
        state: payload.storefrontAddress.administrativeArea,
        zip: payload.storefrontAddress.postalCode,
        phone: payload.phoneNumbers.primaryPhone,
        status: payload.openInfo.status,
        regularHoursPeriods: payload.regularHours.periods.length,
        specialHoursPeriods: payload.specialHours.specialHourPeriods.length,
      }),
      httpStatus: 200,
      status: 'SUCCESS',
      diffSummary: diff,
      syncedBy: currentUser.displayName,
    };

    setLocations(prev => prev.map(l => {
      if (l.id !== loc.id) return l;
      return {
        ...l,
        gbpLastSyncedAt: syncTime,
        gbpSyncStatus: 'Synced',
        gbpSyncError: undefined,
        gbpListingStatus: 'VERIFIED',
        gbpLocationId: payload.name,
      };
    }));

    setGbpSyncLogs(prev => [successLog, ...prev]);
    logAudit('Location', loc.id, `Store #${loc.storeNumber} (${loc.name})`, 'Synced to Google Maps', 'Out of Sync / Pending', 'Synced (HTTP 200)');

    return { success: true, log: successLog };
  };

  const bulkSyncLocationsToGbp = async (locationIds?: string[]): Promise<{ total: number; successCount: number; errorCount: number }> => {
    const targets = locationIds && locationIds.length > 0
      ? locations.filter(l => locationIds.includes(l.id))
      : locations.filter(l => l.recordStatus !== 'Archived');

    let successCount = 0;
    let errorCount = 0;

    for (const loc of targets) {
      const res = await syncSingleLocationToGbp(loc.id);
      if (res.success) {
        successCount++;
      } else {
        errorCount++;
      }
    }

    const bulkLog: GbpSyncLogEntry = {
      id: `gbp-log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      locationId: 'FLEET',
      storeNumber: 'ALL',
      locationName: 'Retail Fleet Batch Sync',
      gbpLocationId: gbpConfig.accountId,
      action: 'Bulk Synchronization',
      payloadSummary: `Bulk one-way push of ${targets.length} stores to Google Maps API.`,
      httpStatus: errorCount === 0 ? 200 : 207,
      status: errorCount === 0 ? 'SUCCESS' : errorCount === targets.length ? 'ERROR' : 'WARNING',
      diffSummary: `Completed fleet push: ${successCount} updated successfully, ${errorCount} errors.`,
      syncedBy: currentUser.displayName,
    };

    setGbpSyncLogs(prev => [bulkLog, ...prev]);
    logAudit('Setting', 'gbp-bulk-sync', 'Google Business Profile Engine', 'Executed Bulk Fleet Synchronization', '', `${successCount}/${targets.length} synced to Google Maps.`);

    return { total: targets.length, successCount, errorCount };
  };

  const clearGbpLogs = () => {
    setGbpSyncLogs([]);
  };

  const exportGbpLogsCsv = () => {
    if (gbpSyncLogs.length === 0) return;
    const headers = ['Timestamp', 'Action', 'Store Number', 'Location Name', 'GBP Location ID', 'HTTP Status', 'Status', 'Diff Summary', 'Error Message', 'Synced By'];
    const rows = gbpSyncLogs.map(l => [
      `"${l.timestamp}"`,
      `"${l.action}"`,
      `"${l.storeNumber}"`,
      `"${l.locationName.replace(/"/g, '""')}"`,
      `"${l.gbpLocationId}"`,
      l.httpStatus,
      `"${l.status}"`,
      `"${(l.diffSummary || '').replace(/"/g, '""')}"`,
      `"${(l.errorMessage || '').replace(/"/g, '""')}"`,
      `"${l.syncedBy}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `GBP_Sync_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV Import & Migration Validation Gate
  const validateAndStageCsv = (csvContent: string): ImportValidationResult => {
    const lines = csvContent
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) {
      return {
        totalRows: 0,
        validCount: 0,
        warningCount: 0,
        errorCount: 0,
        duplicateCount: 0,
        stagedRows: [],
      };
    }

    const headerLine = lines[0].toLowerCase();
    const rows = lines.slice(1);

    const existingStoreNumbers = new Set(locations.map(l => l.storeNumber.trim()));
    const seenInFileStoreNumbers = new Set<string>();
    const seenManagerNames = new Map<string, number>();

    const stagedRows: StagedLocationImport[] = [];
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

    // Helper to parse CSV row handling quotes
    const parseCsvRow = (line: string): string[] => {
      const result: string[] = [];
      let inQuotes = false;
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(cur.trim().replace(/^"|"$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      result.push(cur.trim().replace(/^"|"$/g, ''));
      return result;
    };

    // 1. Dynamic Header Mapping
    const rawHeaders = parseCsvRow(lines[0]);
    const headers = rawHeaders.map(h => h.toLowerCase().trim().replace(/[^a-z0-9 ]/g, ''));

    // Locate column indices dynamically
    const distMgrIdx = headers.findIndex(h => h.includes('district manager') || h.includes('district mgr') || h === 'dm');
    const storeNumIdx = headers.findIndex(h => h === 'store' || h.includes('store number') || h === 'store' || h === 'store num' || h.includes('store '));
    const storeMgrPhoneIdx = headers.findIndex(h => (h.includes('store manager') || h.includes('manager')) && h.includes('phone'));
    const phoneIdx = headers.findIndex(h => h.includes('phone') && !h.includes('manager'));
    const nameIdx = headers.findIndex(h => h.includes('location name') || h.includes('store name') || h.includes('location') || (h.includes('name') && !h.includes('manager')));
    const addressIdx = headers.findIndex(h => h.includes('address') || h.includes('street'));
    const cityIdx = headers.findIndex(h => h.includes('city'));
    const stateIdx = headers.findIndex(h => h.includes('state') || h === 'st');
    const zipIdx = headers.findIndex(h => h.includes('zip') || h.includes('postal'));
    const managerIdx = headers.findIndex(h => (h === 'manager' || h.includes('store manager') || h === 'sm' || h.includes('mgr')) && !h.includes('district') && !h.includes('phone'));
    const districtIdx = headers.findIndex(h => (h === 'district' || h.includes('district name')) && !h.includes('manager'));
    const hoursIdx = headers.findIndex(h => h.includes('hour') || h.includes('schedule'));

    rows.forEach((line, index) => {
      const cols = parseCsvRow(line);
      const rowNum = index + 2;
      const validationMessages: string[] = [];

      // Extract fields dynamically with safe fallbacks
      const rawStoreNum = storeNumIdx >= 0 ? (cols[storeNumIdx] || '').replace(/#/g, '').trim() : '';
      const storeName = nameIdx >= 0 && cols[nameIdx] ? cols[nameIdx] : `Store #${rawStoreNum}`;
      const address = addressIdx >= 0 ? cols[addressIdx] || '' : '';
      const city = cityIdx >= 0 ? cols[cityIdx] || '' : '';
      const state = stateIdx >= 0 ? (cols[stateIdx] || '').toUpperCase().trim() : '';
      const zipCode = zipIdx >= 0 ? cols[zipIdx] || '' : '';
      const phone = phoneIdx >= 0 ? cols[phoneIdx] || '' : '';
      const districtManagerName = distMgrIdx >= 0 ? cols[distMgrIdx] || '' : '';
      const storeManagerName = managerIdx >= 0 ? cols[managerIdx] || '' : '';
      const storeManagerPhone = storeMgrPhoneIdx >= 0 ? cols[storeMgrPhoneIdx] || '' : '';
      const district = districtIdx >= 0 && cols[districtIdx] ? cols[districtIdx] : (districtManagerName ? `District (${districtManagerName})` : 'District 1 (Rudy Calderon)');
      const hoursSummary = hoursIdx >= 0 && cols[hoursIdx] ? cols[hoursIdx] : 'Mon-Sat: 10am-9pm, Sun: 11am-7pm';

      let rowStatus: StagedLocationImport['status'] = 'Valid';

      // Validation Checks
      if (!rawStoreNum) {
        rowStatus = 'Error';
        validationMessages.push('Missing required Store Number.');
      }

      if (!address || !city || !state) {
        rowStatus = 'Error';
        validationMessages.push('Incomplete physical address (requires Address, City, State).');
      }

      if (state && !['CA', 'NV', 'WA', 'OR', 'TX', 'AZ'].includes(state)) {
        rowStatus = 'Warning';
        validationMessages.push(`State '${state}' is outside standard retail footprint.`);
      }

      if (!phone || phone.length < 10) {
        if (rowStatus !== 'Error') rowStatus = 'Warning';
        validationMessages.push('Phone number is missing or incomplete.');
      }

      // Check duplicates
      if (seenInFileStoreNumbers.has(rawStoreNum)) {
        rowStatus = 'Error';
        validationMessages.push(`Duplicate store #${rawStoreNum} found within the same CSV import file.`);
      } else if (rawStoreNum) {
        seenInFileStoreNumbers.add(rawStoreNum);
      }

      if (existingStoreNumbers.has(rawStoreNum)) {
        if (rowStatus !== 'Error') rowStatus = 'Duplicate';
        validationMessages.push(`Store #${rawStoreNum} already exists in Master SoR. Will update/merge.`);
      }

      // Check manager duplicates
      if (storeManagerName && storeManagerName !== 'Vacant') {
        const prevRow = seenManagerNames.get(storeManagerName);
        if (prevRow) {
          if (rowStatus === 'Valid') rowStatus = 'Warning';
          validationMessages.push(`Manager '${storeManagerName}' is also listed for row ${prevRow}.`);
        } else {
          seenManagerNames.set(storeManagerName, rowNum);
        }
      }

      // Determine timezone
      let timeZone: LocationRecord['timeZone'] = 'America/Los_Angeles';
      if (state === 'TX') timeZone = 'America/Chicago';

      // Infer location type
      let type: LocationType = 'Enclosed Mall';
      if (storeName.toLowerCase().includes('plaza') || storeName.toLowerCase().includes('center')) {
        type = 'Strip Center / Shopping Center';
      }
      if (storeName.toLowerCase().includes('flagship') || storeName.toLowerCase().includes('st.') || storeName.toLowerCase().includes('street')) {
        type = 'Street / Standalone Location';
      }

      const stagedItem: StagedLocationImport = {
        rowNumber: rowNum,
        storeNumber: rawStoreNum,
        name: storeName,
        type,
        address,
        city,
        state,
        zipCode,
        phone,
        timeZone,
        district: district || 'District 1 (Rudy Calderon)',
        districtManagerName,
        storeManagerName,
        storeManagerPhone,
        hoursSummary,
        status: rowStatus,
        validationMessages,
        resolved: rowStatus === 'Valid' || rowStatus === 'Duplicate',
      };

      if (rowStatus === 'Valid') validCount++;
      else if (rowStatus === 'Warning') warningCount++;
      else if (rowStatus === 'Error') errorCount++;
      else if (rowStatus === 'Duplicate') duplicateCount++;

      stagedRows.push(stagedItem);
    });

    return {
      totalRows: stagedRows.length,
      validCount,
      warningCount,
      errorCount,
      duplicateCount,
      stagedRows,
    };
  };

  const commitStagedImport = (
    stagedRows: StagedLocationImport[],
    mode: 'merge' | 'append' | 'replace'
  ): { importedCount: number; updatedCount: number } => {
    const validRows = stagedRows.filter(r => r.status !== 'Error');
    let imported = 0;
    let updated = 0;

    const defaultHours: WeeklySchedule = {
      monday: { open: '10:00 AM', close: '09:00 PM' },
      tuesday: { open: '10:00 AM', close: '09:00 PM' },
      wednesday: { open: '10:00 AM', close: '09:00 PM' },
      thursday: { open: '10:00 AM', close: '09:00 PM' },
      friday: { open: '10:00 AM', close: '09:00 PM' },
      saturday: { open: '10:00 AM', close: '09:00 PM' },
      sunday: { open: '11:00 AM', close: '07:00 PM' },
    };

    if (mode === 'replace') {
      const newLocationsList: LocationRecord[] = validRows.map(r => ({
        id: `loc-shk-${r.storeNumber.toLowerCase()}`,
        storeNumber: r.storeNumber,
        name: r.name,
        type: r.type,
        address: r.address,
        city: r.city,
        state: r.state,
        zipCode: r.zipCode,
        phone: r.phone,
        timeZone: r.timeZone,
        district: r.district,
        districtManagerName: r.districtManagerName,
        storeManagerName: r.storeManagerName,
        storeManagerPhone: r.storeManagerPhone,
        storeManagerPhoneVisibility: r.storeManagerPhone ? 'Pending Review' : 'Directory Public',
        isStoreManagerPhoneVerified: !r.storeManagerPhone,
        standardHours: defaultHours,
        specialHours: [],
        holidayHours: [],
        operationalStatus: 'Open — Normal Operations',
        recordStatus: 'Active',
        lastUpdated: new Date().toISOString(),
        lastUpdatedBy: currentUser.displayName,
        lastVerifiedDate: new Date().toISOString().split('T')[0],
        verifiedBy: currentUser.displayName,
      }));

      setLocations(newLocationsList);
      imported = newLocationsList.length;
      logAudit('Setting', 'bulk-migration', 'Migration Pipeline', 'Bulk Replace from CSV Import', '', `Replaced directory with ${imported} locations (contacts quarantined for steward review).`);
    } else {
      setLocations(prev => {
        let list = [...prev];
        validRows.forEach(r => {
          const existingIdx = list.findIndex(l => l.storeNumber.trim() === r.storeNumber.trim());
          if (existingIdx >= 0) {
            if (mode === 'merge') {
              const hasNewManagerPhone = r.storeManagerPhone && r.storeManagerPhone !== list[existingIdx].storeManagerPhone;
              list[existingIdx] = {
                ...list[existingIdx],
                name: r.name || list[existingIdx].name,
                address: r.address || list[existingIdx].address,
                city: r.city || list[existingIdx].city,
                state: r.state || list[existingIdx].state,
                zipCode: r.zipCode || list[existingIdx].zipCode,
                phone: r.phone || list[existingIdx].phone,
                district: r.district || list[existingIdx].district,
                districtManagerName: r.districtManagerName || list[existingIdx].districtManagerName,
                storeManagerName: r.storeManagerName || list[existingIdx].storeManagerName,
                storeManagerPhone: r.storeManagerPhone || list[existingIdx].storeManagerPhone,
                storeManagerPhoneVisibility: hasNewManagerPhone ? 'Pending Review' : list[existingIdx].storeManagerPhoneVisibility || 'Directory Public',
                isStoreManagerPhoneVerified: hasNewManagerPhone ? false : (list[existingIdx].isStoreManagerPhoneVerified ?? true),
                lastUpdated: new Date().toISOString(),
                lastUpdatedBy: currentUser.displayName,
              };
              updated++;
            }
          } else {
            const newLoc: LocationRecord = {
              id: `loc-shk-${r.storeNumber.toLowerCase()}-${Date.now().toString(36)}`,
              storeNumber: r.storeNumber,
              name: r.name,
              type: r.type,
              address: r.address,
              city: r.city,
              state: r.state,
              zipCode: r.zipCode,
              phone: r.phone,
              timeZone: r.timeZone,
              district: r.district,
              districtManagerName: r.districtManagerName,
              storeManagerName: r.storeManagerName,
              storeManagerPhone: r.storeManagerPhone,
              storeManagerPhoneVisibility: r.storeManagerPhone ? 'Pending Review' : 'Directory Public',
              isStoreManagerPhoneVerified: !r.storeManagerPhone,
              standardHours: defaultHours,
              specialHours: [],
              holidayHours: [],
              operationalStatus: 'Open — Normal Operations',
              recordStatus: 'Active',
              lastUpdated: new Date().toISOString(),
              lastUpdatedBy: currentUser.displayName,
              lastVerifiedDate: new Date().toISOString().split('T')[0],
              verifiedBy: currentUser.displayName,
            };
            list.push(newLoc);
            imported++;
          }
        });
        return list;
      });

      logAudit(
        'Setting',
        'bulk-migration',
        'Migration Pipeline',
        `Bulk CSV Migration (${mode})`,
        '',
        `Processed ${validRows.length} rows: ${imported} added, ${updated} updated (manager contacts placed in quarantine review).`
      );
    }

    return { importedCount: imported, updatedCount: updated };
  };

  // Rollback audit entry
  const rollbackAuditEntry = (auditId: string): { success: boolean; message: string } => {
    const entry = auditLogs.find(a => a.id === auditId);
    if (!entry) return { success: false, message: 'Audit entry not found.' };

    if (entry.entityType === 'Location') {
      const field = entry.fieldChanged.split(' (')[0] as keyof LocationRecord;
      try {
        let prevVal = entry.previousValue;
        try {
          prevVal = JSON.parse(entry.previousValue);
        } catch {}

        updateLocation(entry.entityId, { [field]: prevVal }, `Reversal of Event #${auditId}`);
        logAudit(
          'Location',
          entry.entityId,
          entry.entityName,
          `Rollback: Reverted ${entry.fieldChanged} to previous value`,
          entry.newValue,
          entry.previousValue,
          undefined,
          true
        );
        return { success: true, message: `Successfully rolled back ${entry.entityName} ${entry.fieldChanged}.` };
      } catch (e) {
        return { success: false, message: `Failed to rollback location: ${String(e)}` };
      }
    }

    if (entry.entityType === 'Person') {
      const field = entry.fieldChanged as keyof PersonRecord;
      try {
        let prevVal = entry.previousValue;
        try {
          prevVal = JSON.parse(entry.previousValue);
        } catch {}
        updatePerson(entry.entityId, { [field]: prevVal });
        logAudit(
          'Person',
          entry.entityId,
          entry.entityName,
          `Rollback: Reverted ${entry.fieldChanged}`,
          entry.newValue,
          entry.previousValue,
          undefined,
          true
        );
        return { success: true, message: `Successfully rolled back person record ${entry.entityName}.` };
      } catch (e) {
        return { success: false, message: `Failed to rollback person: ${String(e)}` };
      }
    }

    return { success: false, message: `Rollback not supported for entity type ${entry.entityType}.` };
  };

  // Backup & Recovery
  const exportDatabaseBackup = () => {
    const snapshot = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.displayName,
      locations,
      people,
      requests,
      auditLogs,
      users,
      apiClients,
      smtpConfig,
      emailLogs,
    };
    return JSON.stringify(snapshot, null, 2);
  };

  const importDatabaseBackup = (jsonContent: string): boolean => {
    try {
      const data = JSON.parse(jsonContent);
      if (data.locations && Array.isArray(data.locations)) {
        setLocations(data.locations);
        if (data.people) setPeople(data.people);
        if (data.requests) setRequests(data.requests);
        if (data.auditLogs) setAuditLogs(data.auditLogs);
        if (data.users) setUsers(data.users);
        if (data.apiClients) setApiClients(data.apiClients);
        if (data.smtpConfig) setSmtpConfig(data.smtpConfig);
        if (data.emailLogs) setEmailLogs(data.emailLogs);

        logAudit('Setting', 'db-restore', 'Database Snapshot', 'Restored Database from JSON Backup', '', `Imported by ${currentUser.displayName}`);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const createManualBackup = (backupName?: string): DatabaseBackupSnapshot => {
    const rawJson = exportDatabaseBackup();
    const snapshot: DatabaseBackupSnapshot = {
      id: `snap-manual-${Date.now().toString(36)}`,
      name: backupName || `Manual SoR Snapshot (${new Date().toLocaleDateString()})`,
      timestamp: new Date().toISOString(),
      type: 'manual',
      sizeBytes: new Blob([rawJson]).size,
      recordCounts: {
        locations: locations.length,
        people: people.length,
        requests: requests.length,
        auditLogs: auditLogs.length,
        users: users.length,
      },
      createdBy: currentUser.displayName,
      status: 'Completed',
    };

    setBackupSnapshots(prev => {
      const updated = [snapshot, ...prev];
      localStorage.setItem(`${STORAGE_KEY}_backup_snapshots`, JSON.stringify(updated));
      return updated;
    });

    logAudit('Setting', snapshot.id, snapshot.name, 'Created Database Snapshot', '', `${snapshot.recordCounts.locations} locations, ${snapshot.recordCounts.people} personnel`);
    return snapshot;
  };

  const resetToDefaultBaseline = () => {
    setLocations(INITIAL_LOCATIONS);
    setPeople(INITIAL_PEOPLE);
    setUsers(INITIAL_USERS);
    setApiClients(INITIAL_API_CLIENTS);
    setSmtpConfig(INITIAL_SMTP_CONFIG);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setGbpConfig(INITIAL_GBP_CONFIG);
    setGbpListings(INITIAL_GBP_LISTINGS);
    setGbpSyncLogs(INITIAL_GBP_LOGS);
    setRequests([]);
    localStorage.clear();
  };

  const value = useMemo(() => ({
    locations,
    people,
    requests,
    auditLogs,
    users,
    apiClients,
    smtpConfig,
    emailLogs,
    currentUser,
    isAuthenticated,
    // Live Cloud Backend & Firebase (DISPATCH-007)
    firebaseConfig,
    cloudSyncStatus,
    lastCloudSyncAt,
    isCloudConnected,
    activeCloudUser,
    updateFirebaseConfig,
    testCloudConnection,
    pushAllToCloud,
    pullAllFromCloud,
    // GBP Integration
    gbpConfig,
    gbpListings,
    gbpSyncLogs,
    updateGbpConfig,
    testGbpHandshake,
    fetchGbpListingsFromApi,
    mapLocationToGbp,
    unmapLocationFromGbp,
    autoMatchGbpListings,
    syncSingleLocationToGbp,
    bulkSyncLocationsToGbp,
    clearGbpLogs,
    exportGbpLogsCsv,
    // Appearance & Environment
    themePreference,
    setThemePreference,
    effectiveTheme,
    environment,
    setEnvironment,
    backupSnapshots,
    lastAutomatedBackupTime,
    setCurrentUser,
    loginWithGoogle,
    loginWithEmailPassword,
    acceptInvitation,
    logout,
    switchUserAccount,
    switchRole,
    addLocation,
    updateLocation,
    deleteLocation,
    verifyLocation,
    verifyManagerPhone,
    toggleLocationPhonePrivacy,
    // Hours Template Engine & Bulk (DISPATCH-012)
    hoursTemplates,
    addHoursTemplate,
    updateHoursTemplate,
    deleteHoursTemplate,
    bulkUpdateLocationsHours,
    addPerson,
    updatePerson,
    deletePerson,
    verifyPersonContact,
    togglePersonContactPrivacy,
    submitUpdateRequest,
    approveUpdateRequest,
    rejectUpdateRequest,
    addUserAccount,
    inviteUserAccount,
    activateUserAccount,
    resendUserInvite,
    updateUserAccount,
    deactivateUserAccount,
    offboardUserAccount,
    addApiClient,
    rotateApiKey,
    revokeApiClient,
    triggerApiSync,
    // Communications & Dynamic Email Templates (DISPATCH-015)
    emailTemplates,
    addEmailTemplate,
    updateEmailTemplate,
    deleteEmailTemplate,
    resetEmailTemplatesToDefault,
    getEmailTemplate,
    updateSmtpConfig,
    sendTestEmail,
    sendDirectoryPdfEmail,
    validateAndStageCsv,
    commitStagedImport,
    rollbackAuditEntry,
    exportDatabaseBackup,
    importDatabaseBackup,
    createManualBackup,
    resetToDefaultBaseline,
  }), [
    locations,
    people,
    requests,
    auditLogs,
    users,
    apiClients,
    smtpConfig,
    emailLogs,
    emailTemplates,
    gbpConfig,
    gbpListings,
    gbpSyncLogs,
    currentUser,
    isAuthenticated,
    themePreference,
    effectiveTheme,
    environment,
    backupSnapshots,
    firebaseConfig,
    hoursTemplates,
    cloudSyncStatus,
    lastCloudSyncAt,
    isCloudConnected,
    activeCloudUser
  ]);

  return (
    <DirectoryContext.Provider value={value}>
      {children}
    </DirectoryContext.Provider>
  );
};

export const useDirectory = () => {
  const context = useContext(DirectoryContext);
  if (!context) {
    throw new Error('useDirectory must be used within a DirectoryProvider');
  }
  return context;
};
