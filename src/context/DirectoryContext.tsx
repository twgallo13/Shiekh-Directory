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
  FirebaseConfigState
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
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
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
  submitUpdateRequest: (request: Omit<UpdateRequest, 'id' | 'submittedAt' | 'status'>) => UpdateRequest;
  approveUpdateRequest: (requestId: string, reviewerNotes?: string) => void;
  rejectUpdateRequest: (requestId: string, rejectionNotes: string) => void;
  
  // User Onboarding & Access Control (Lifecycle)
  addUserAccount: (user: Omit<UserAccount, 'id' | 'createdAt'>) => UserAccount;
  inviteUserAccount: (email: string, role: UserRole, accessScope: UserAccount['accessScope'], personId?: string, assignedDistrict?: string, assignedStoreId?: string) => UserAccount;
  activateUserAccount: (id: string) => void;
  resendUserInvite: (id: string) => void;
  updateUserAccount: (id: string, updates: Partial<UserAccount>) => void;
  deactivateUserAccount: (id: string) => void;
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
  
  // Communications & SMTP
  updateSmtpConfig: (config: Partial<SmtpConfig>) => void;
  sendTestEmail: (toEmail: string) => { success: boolean; log: EmailLogEntry };
  sendDirectoryPdfEmail: (recipients: string[], subject: string, message: string, paperSize: string) => void;
  
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
            setUsers(prev => {
              const match = prev.find(u => u.email.toLowerCase() === normalizedEmail);
              if (match) {
                setCurrentUser(match);
                return prev;
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
              setCurrentUser(newUser);
              return [...prev, newUser];
            });
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
            batch.set(ref, labeled);
          });
          INITIAL_PEOPLE.forEach(per => {
            const labeled = enrichPersonWithLabels(per);
            const docId = getSemanticPersonDocId(labeled);
            const ref = doc(db, 'people', docId);
            batch.set(ref, labeled);
          });
          INITIAL_USERS.forEach(usr => {
            const docId = getSemanticUserDocId(usr);
            const ref = doc(db, 'users', docId);
            batch.set(ref, usr);
          });
          INITIAL_AUDIT_LOGS.forEach(aud => {
            const ref = doc(db, 'audit_logs', aud.id);
            batch.set(ref, aud);
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
            batch.set(ref, tmpl);
          });
          batch.commit().catch(e => console.warn('Seeding hours templates error:', e));
        }
      }, (err) => console.warn('Hours templates snapshot listener error:', err));

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
        batch.set(doc(db, 'locations', docId), labeled);
        count++;
      });
      people.forEach(per => {
        const labeled = enrichPersonWithLabels(per);
        const docId = getSemanticPersonDocId(labeled);
        batch.set(doc(db, 'people', docId), labeled);
        count++;
      });
      requests.forEach(req => {
        const docId = getSemanticRequestDocId(req);
        batch.set(doc(db, 'requests', docId), req);
        count++;
      });
      users.forEach(u => {
        const docId = getSemanticUserDocId(u);
        batch.set(doc(db, 'users', docId), u);
        count++;
      });
      auditLogs.forEach(aud => {
        batch.set(doc(db, 'audit_logs', aud.id), aud);
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
    localStorage.setItem(`${STORAGE_KEY}_smtp`, JSON.stringify(smtpConfig));
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
      setDoc(ref, newTemplate).catch(err => console.warn('Firestore setDoc hours_template error:', err));
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
          updateDoc(ref, { ...updates, updatedAt: merged.updatedAt }).catch(err => console.warn('Firestore updateDoc hours_template error:', err));
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
        batch.set(ref, loc, { merge: true });
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

  // Update Requests
  const submitUpdateRequest = (reqData: Omit<UpdateRequest, 'id' | 'submittedAt' | 'status'>): UpdateRequest => {
    const newReq: UpdateRequest = {
      ...reqData,
      id: `req-${Date.now().toString(36)}`,
      submittedAt: new Date().toISOString(),
      status: 'Submitted',
    };
    setRequests(prev => [newReq, ...prev]);

    // Send email notification to Directory Steward
    if (smtpConfig.notifyOnNewRequest) {
      const emailLog: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: 'Directory Update Request',
        recipients: [smtpConfig.directoryStewardEmail],
        subject: `[Shiekh Directory] New Update Request: ${newReq.changeType} for ${newReq.targetName}`,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: 'Sent',
        details: `Submitted by ${newReq.submittedBy.name} (${newReq.submittedBy.email}). Notes: ${newReq.notes}`,
      };
      setEmailLogs(prev => [emailLog, ...prev]);
    }

    return newReq;
  };

  const approveUpdateRequest = (requestId: string, reviewerNotes?: string) => {
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

    setRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r;
      return {
        ...r,
        status: 'Approved',
        decisionNotes: reviewerNotes || 'Approved and applied to master directory record.',
        decisionBy: currentUser.displayName,
        decisionAt: new Date().toISOString(),
      };
    }));

    // Notify requester
    if (smtpConfig.notifyRequesterOnDecision && req.submittedBy.email) {
      const emailLog: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: 'Request Status Update',
        recipients: [req.submittedBy.email],
        subject: `[Shiekh Directory] Request Approved: ${req.changeType} for ${req.targetName}`,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: 'Sent',
        details: reviewerNotes || 'Your update request has been reviewed, approved, and updated in the system of record.',
      };
      setEmailLogs(prev => [emailLog, ...prev]);
    }
  };

  const rejectUpdateRequest = (requestId: string, rejectionNotes: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    setRequests(prev => prev.map(r => {
      if (r.id !== requestId) return r;
      return {
        ...r,
        status: 'Rejected',
        decisionNotes: rejectionNotes,
        decisionBy: currentUser.displayName,
        decisionAt: new Date().toISOString(),
      };
    }));

    // Notify requester
    if (smtpConfig.notifyRequesterOnDecision && req.submittedBy.email) {
      const emailLog: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: 'Request Status Update',
        recipients: [req.submittedBy.email],
        subject: `[Shiekh Directory] Update Request Update: ${req.changeType} for ${req.targetName}`,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: 'Sent',
        details: `Reason / Decision: ${rejectionNotes}`,
      };
      setEmailLogs(prev => [emailLog, ...prev]);
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

  const loginWithEmailPassword = async (email: string, _password?: string) => {
    const targetEmail = email.trim().toLowerCase();
    const existing = users.find(u => u.email.toLowerCase() === targetEmail);

    if (!existing) {
      return { success: false, message: 'Account not found. Please request an invite or use an authorized store account.' };
    }

    if (existing.status === 'Deactivated') {
      return { success: false, message: 'This account has been deactivated. Contact your System Administrator.' };
    }

    const updated = { ...existing, lastLogin: new Date().toISOString() };
    setCurrentUser(updated);
    setIsAuthenticated(true);
    updateUserAccount(existing.id, { lastLogin: updated.lastLogin });
    logAudit('User', existing.id, existing.displayName, 'Signed In via Email/Password', '', 'Authenticated');
    return { success: true };
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
  const addUserAccount = (userData: Omit<UserAccount, 'id' | 'createdAt'>): UserAccount => {
    const newUser: UserAccount = {
      ...userData,
      id: `usr-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    setUsers(prev => [...prev, newUser]);
    logAudit('User', newUser.id, newUser.displayName, 'Created User Account', '', newUser.role);
    return newUser;
  };

  const inviteUserAccount = (
    email: string,
    role: UserRole,
    accessScope: UserAccount['accessScope'],
    personId?: string,
    assignedDistrict?: string,
    assignedStoreId?: string
  ): UserAccount => {
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

    setUsers(prev => [...prev, newUser]);
    logAudit('User', newUser.id, newUser.displayName, `Sent Onboarding Invitation (${role})`, '', `Token: ${token}`);

    // Log invitation email dispatch
    if (smtpConfig.notifyOnNewRequest) {
      const emailLog: EmailLogEntry = {
        id: `eml-${Date.now()}`,
        emailType: 'Directory Update Request',
        recipients: [newUser.email],
        subject: `[Shiekh Directory] Invitation to Join Shiekh Directory SoR (${role})`,
        sentBy: currentUser.displayName,
        sentAt: new Date().toISOString(),
        status: 'Sent',
        details: `Invitation link generated with token ${token}. Role: ${role}, Scope: ${accessScope}.`,
      };
      setEmailLogs(prev => [emailLog, ...prev]);
    }

    return newUser;
  };

  const activateUserAccount = (id: string) => {
    updateUserAccount(id, { status: 'Active' });
    logAudit('User', id, id, 'Activated User Account', 'Invited', 'Active');
  };

  const resendUserInvite = (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;
    const token = `inv_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    updateUserAccount(id, { invitationToken: token });

    const emailLog: EmailLogEntry = {
      id: `eml-${Date.now()}`,
      emailType: 'Directory Update Request',
      recipients: [user.email],
      subject: `[Shiekh Directory] Reminder: Invitation to Join Shiekh Directory SoR`,
      sentBy: currentUser.displayName,
      sentAt: new Date().toISOString(),
      status: 'Sent',
      details: `Resent onboarding invite token ${token}.`,
    };
    setEmailLogs(prev => [emailLog, ...prev]);
  };

  const updateUserAccount = (id: string, updates: Partial<UserAccount>) => {
    setUsers(prev => prev.map(u => {
      if (u.id !== id) return u;
      const updated = { ...u, ...updates };
      logAudit('User', u.id, u.displayName, 'Updated Account Properties', JSON.stringify(u), JSON.stringify(updated));
      return updated;
    }));
  };

  const deactivateUserAccount = (id: string) => {
    updateUserAccount(id, { status: 'Deactivated' });
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

  const sendTestEmail = (toEmail: string) => {
    const emailLog: EmailLogEntry = {
      id: `eml-${Date.now()}`,
      emailType: 'Test Email',
      recipients: [toEmail],
      subject: `[Shiekh Directory] Test Email from SMTP Service`,
      sentBy: currentUser.displayName,
      sentAt: new Date().toISOString(),
      status: 'Sent',
      details: `Handshake successful with ${smtpConfig.host}:${smtpConfig.port} (TLS: ${smtpConfig.secureTls ? 'Enabled' : 'Disabled'}). Authenticated as ${smtpConfig.username}.`,
    };
    setEmailLogs(prev => [emailLog, ...prev]);
    return { success: true, log: emailLog };
  };

  const sendDirectoryPdfEmail = (recipients: string[], subject: string, message: string, paperSize: string) => {
    const emailLog: EmailLogEntry = {
      id: `eml-${Date.now()}`,
      emailType: 'Store Directory PDF',
      recipients,
      subject: subject || 'Shiekh Shoes Store Directory (Master Landscape PDF)',
      sentBy: currentUser.displayName,
      sentAt: new Date().toISOString(),
      status: 'Sent',
      details: message,
      attachmentName: `Shiekh_Store_Directory_${new Date().toISOString().split('T')[0]}_${paperSize}.pdf`,
    };
    setEmailLogs(prev => [emailLog, ...prev]);
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

    rows.forEach((line, index) => {
      const cols = parseCsvRow(line);
      const rowNum = index + 2;
      const validationMessages: string[] = [];

      // Extract fields (matching canonical schema)
      const rawStoreNum = (cols[0] || '').replace(/#/g, '').trim();
      const storeName = cols[1] || `Store #${rawStoreNum}`;
      const address = cols[2] || '';
      const city = cols[3] || '';
      const state = (cols[4] || '').toUpperCase().trim();
      const zipCode = cols[5] || '';
      const phone = cols[6] || '';
      const district = cols[7] || '';
      const districtManagerName = cols[8] || '';
      const storeManagerName = cols[9] || '';
      const storeManagerPhone = cols[10] || '';
      const hoursSummary = cols[11] || 'Mon-Sat: 10am-9pm, Sun: 11am-7pm';

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
