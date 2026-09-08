import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  LocationRecord, 
  Person, 
  UserProfile, 
  UpdateRequest, 
  HoursTemplate, 
  ApiKeyRecord,
  CorporateHoliday,
  AuditLogEntry, 
  ContactPrivacyLevel,
  OperationalStatus,
  SmtpConfig,
  EmailTemplate,
  NotificationRule,
  OutboxLogEntry,
  SopRunbook
} from '../types';
import { 
  INITIAL_LOCATIONS, 
  INITIAL_PEOPLE, 
  INITIAL_USERS, 
  INITIAL_HOURS_TEMPLATES,
  INITIAL_API_KEYS,
  INITIAL_CORPORATE_HOLIDAYS,
  INITIAL_SMTP_CONFIG,
  INITIAL_EMAIL_TEMPLATES,
  INITIAL_NOTIFICATION_RULES,
  INITIAL_OUTBOX_LOGS,
  INITIAL_SOP_RUNBOOKS
} from '../data/initialData';
import { mergeHoursTemplates, migrateDirectoryRelationships } from '../lib/directoryMigration';

interface DirectoryContextType {
  locations: LocationRecord[];
  people: Person[];
  users: UserProfile[];
  currentUser: UserProfile;
  hoursTemplates: HoursTemplate[];
  apiKeys: ApiKeyRecord[];
  corporateHolidays: CorporateHoliday[];
  requests: UpdateRequest[];
  auditLogs: AuditLogEntry[];
  smtpConfig: SmtpConfig;
  emailTemplates: EmailTemplate[];
  notificationRules: NotificationRule[];
  outboxLogs: OutboxLogEntry[];
  sopRunbooks: SopRunbook[];
  switchUser: (userId: string) => void;
  updateLocation: (id: string, updates: Partial<LocationRecord>) => void;
  createLocation: (location: Omit<LocationRecord, 'id'>) => LocationRecord;
  deleteLocation: (id: string) => void;
  retireLocation: (id: string) => void;
  reactivateLocation: (id: string) => void;
  verifyLocation: (id: string) => void;
  verifyManagerPhone: (id: string) => void;
  toggleLocationPhonePrivacy: (id: string, privacy: ContactPrivacyLevel) => void;
  addPerson: (person: Omit<Person, 'id'>) => Person;
  updatePerson: (id: string, updates: Partial<Person>) => void;
  togglePersonPhonePrivacy: (id: string, privacy: ContactPrivacyLevel) => void;
  submitRequest: (request: Omit<UpdateRequest, 'id' | 'requestedAt' | 'status'>) => void;
  approveRequest: (requestId: string, reviewerNotes?: string) => void;
  rejectRequest: (requestId: string, reviewerNotes?: string) => void;
  applyHoursTemplate: (locationId: string, templateId: string) => void;
  createHoursTemplate: (template: Omit<HoursTemplate, 'id'>) => HoursTemplate;
  updateHoursTemplate: (id: string, updates: Partial<HoursTemplate>) => void;
  deleteHoursTemplate: (id: string) => void;
  createUserAccount: (user: Omit<UserProfile, 'id'>) => UserProfile;
  updateUserAccount: (id: string, updates: Partial<UserProfile>) => void;
  deleteUserAccount: (id: string) => void;
  generateApiKey: (name: string, role: string, expirationDays?: number) => ApiKeyRecord;
  revokeApiKey: (id: string) => void;
  addCorporateHoliday: (holiday: Omit<CorporateHoliday, 'id'>) => CorporateHoliday;
  updateCorporateHoliday: (id: string, updates: Partial<CorporateHoliday>) => void;
  deleteCorporateHoliday: (id: string) => void;
  broadcastHolidaysToFleet: () => void;
  updateSmtpConfig: (config: Partial<SmtpConfig>) => void;
  createEmailTemplate: (template: Omit<EmailTemplate, 'id' | 'updatedAt'>) => EmailTemplate;
  updateEmailTemplate: (id: string, updates: Partial<EmailTemplate>) => void;
  deleteEmailTemplate: (id: string) => void;
  updateNotificationRule: (id: string, enabled: boolean) => void;
  sendDiagnosticTestEmail: (recipient: string, customSubject?: string, templateId?: string) => Promise<{ success: boolean; latencyMs: number; messageId: string; message: string; errorMessage?: string }>;
  rollbackAuditChange: (auditLogId: string) => { success: boolean; message: string };
  createSopRunbook: (runbook: Omit<SopRunbook, 'id' | 'lastUpdated'>) => SopRunbook;
  updateSopRunbook: (id: string, updates: Partial<SopRunbook>) => void;
  deleteSopRunbook: (id: string) => void;
}

const DirectoryContext = createContext<DirectoryContextType | null>(null);

const LOCATIONS_STORAGE_KEY = 'shiekh_locations_v3';
const PEOPLE_STORAGE_KEY = 'shiekh_people_v3';
const USERS_STORAGE_KEY = 'shiekh_users_v3';
const HOURS_TEMPLATES_STORAGE_KEY = 'shiekh_hours_templates_v3';
const API_KEYS_STORAGE_KEY = 'shiekh_api_keys_v3';
const CORPORATE_HOLIDAYS_STORAGE_KEY = 'shiekh_corporate_holidays_v3';
const REQUESTS_STORAGE_KEY = 'shiekh_requests_v3';
const AUDIT_STORAGE_KEY = 'shiekh_audit_v3';
const SMTP_CONFIG_STORAGE_KEY = 'shiekh_smtp_config_v3';
const EMAIL_TEMPLATES_STORAGE_KEY = 'shiekh_email_templates_v3';
const NOTIFICATION_RULES_STORAGE_KEY = 'shiekh_notification_rules_v3';
const OUTBOX_LOGS_STORAGE_KEY = 'shiekh_outbox_logs_v3';
const SOP_RUNBOOKS_STORAGE_KEY = 'shiekh_sop_runbooks_v3';

const readStoredArray = <T,>(key: string, fallback: T[]): T[] => {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const DirectoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [initialDirectory] = useState(() => {
    const templates = mergeHoursTemplates(
      readStoredArray(HOURS_TEMPLATES_STORAGE_KEY, INITIAL_HOURS_TEMPLATES),
      INITIAL_HOURS_TEMPLATES,
    );
    const migrated = migrateDirectoryRelationships(
      readStoredArray(LOCATIONS_STORAGE_KEY, INITIAL_LOCATIONS),
      readStoredArray(PEOPLE_STORAGE_KEY, INITIAL_PEOPLE),
      templates,
    );
    return { ...migrated, templates };
  });
  const [locations, setLocations] = useState<LocationRecord[]>(initialDirectory.locations);
  const [people, setPeople] = useState<Person[]>(initialDirectory.people);

  const [users, setUsers] = useState<UserProfile[]>(() => {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_USERS;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    return users[0] || INITIAL_USERS[0];
  });

  const [hoursTemplates, setHoursTemplates] = useState<HoursTemplate[]>(initialDirectory.templates);

  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>(() => {
    const saved = localStorage.getItem(API_KEYS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_API_KEYS;
  });

  const [corporateHolidays, setCorporateHolidays] = useState<CorporateHoliday[]>(() => {
    const saved = localStorage.getItem(CORPORATE_HOLIDAYS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_CORPORATE_HOLIDAYS;
  });

  const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>(() => {
    const saved = localStorage.getItem(SMTP_CONFIG_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Scrub any legacy stored password from client storage
        delete parsed.smtpPassword;
        return { ...INITIAL_SMTP_CONFIG, ...parsed, smtpPassword: '' };
      } catch {
        return INITIAL_SMTP_CONFIG;
      }
    }
    return INITIAL_SMTP_CONFIG;
  });

  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(() => {
    const saved = localStorage.getItem(EMAIL_TEMPLATES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_EMAIL_TEMPLATES;
  });

  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>(() => {
    const saved = localStorage.getItem(NOTIFICATION_RULES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATION_RULES;
  });

  const [outboxLogs, setOutboxLogs] = useState<OutboxLogEntry[]>(() => {
    const saved = localStorage.getItem(OUTBOX_LOGS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_OUTBOX_LOGS;
  });

  const [sopRunbooks, setSopRunbooks] = useState<SopRunbook[]>(() => {
    const saved = localStorage.getItem(SOP_RUNBOOKS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : INITIAL_SOP_RUNBOOKS;
  });

  const [requests, setRequests] = useState<UpdateRequest[]>(() => {
    const saved = localStorage.getItem(REQUESTS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [
      {
        id: 'req-01',
        targetId: 'loc-08',
        targetType: 'Location',
        targetStoreNumber: '08',
        targetName: 'Shiekh Shoes — Downtown LA Broadway',
        changeType: 'Operational Status Change',
        requestedBy: {
          id: 'usr-sm-01',
          name: 'Marcus Vance (SM #01)',
          email: 'm.vance@shiekhshoes.com',
          role: 'Store Manager'
        },
        requestedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        status: 'Pending',
        requestedChanges: {
          operationalStatus: 'Temporarily Modified Hours',
          activeNotice: {
            shortDescription: 'AC Unit Repair — Closing 1 Hour Early this week',
            effectiveDate: '2026-09-04',
            expectedResolutionDate: '2026-09-10'
          }
        },
        currentSnapshot: {
          operationalStatus: 'Open — Normal Operations'
        },
        reason: 'HVAC technician on site, early closure approved by DM.'
      }
    ];
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    const saved = localStorage.getItem(AUDIT_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [
      {
        id: 'aud-01',
        timestamp: new Date().toISOString(),
        userId: currentUser?.id || 'usr-sys',
        userName: currentUser?.name || 'System Admin',
        action: 'System Startup',
        entityType: 'Setting',
        entityId: 'sys-0',
        entityName: 'Directory Baseline Loaded',
        details: 'Loaded directory records into active memory.'
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem(LOCATIONS_STORAGE_KEY, JSON.stringify(locations));
  }, [locations]);

  useEffect(() => {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
  }, [people]);

  useEffect(() => {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    localStorage.setItem(HOURS_TEMPLATES_STORAGE_KEY, JSON.stringify(hoursTemplates));
  }, [hoursTemplates]);

  useEffect(() => {
    localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem(CORPORATE_HOLIDAYS_STORAGE_KEY, JSON.stringify(corporateHolidays));
  }, [corporateHolidays]);

  useEffect(() => {
    // Security: Strip sensitive credentials so smtpPassword is never written to browser localStorage
    const { smtpPassword, ...safeConfig } = smtpConfig;
    localStorage.setItem(SMTP_CONFIG_STORAGE_KEY, JSON.stringify(safeConfig));
  }, [smtpConfig]);

  useEffect(() => {
    localStorage.setItem(EMAIL_TEMPLATES_STORAGE_KEY, JSON.stringify(emailTemplates));
  }, [emailTemplates]);

  useEffect(() => {
    localStorage.setItem(NOTIFICATION_RULES_STORAGE_KEY, JSON.stringify(notificationRules));
  }, [notificationRules]);

  useEffect(() => {
    localStorage.setItem(OUTBOX_LOGS_STORAGE_KEY, JSON.stringify(outboxLogs));
  }, [outboxLogs]);

  useEffect(() => {
    localStorage.setItem(SOP_RUNBOOKS_STORAGE_KEY, JSON.stringify(sopRunbooks));
  }, [sopRunbooks]);

  useEffect(() => {
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(requests));
  }, [requests]);

  useEffect(() => {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(auditLogs));
  }, [auditLogs]);

  const addAuditLog = (
    action: string, 
    entityType: 'Location' | 'Person' | 'User' | 'Setting' | 'Request' | 'Communication', 
    entityId: string, 
    entityName: string, 
    details: string,
    previousState?: any,
    newState?: any
  ) => {
    const log: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      userId: currentUser?.id || 'sys',
      userName: currentUser?.name || 'System',
      action,
      entityType,
      entityId,
      entityName,
      details,
      previousState,
      newState
    };
    setAuditLogs(prev => [log, ...prev].slice(0, 200));
  };

  const switchUser = (userId: string) => {
    const found = users.find(u => u.id === userId);
    if (found) {
      setCurrentUser(found);
      addAuditLog('User Switched', 'User', found.id, found.name, `Active session switched to ${found.name} (${found.role})`);
    }
  };

  const updateLocation = (id: string, updates: Partial<LocationRecord>) => {
    setLocations(prev => prev.map(loc => {
      if (loc.id === id) {
        const updated = { ...loc, ...updates, updatedAt: new Date().toISOString() };
        addAuditLog('Location Updated', 'Location', loc.id, `Store #${loc.storeNumber}`, `Updated attributes: ${Object.keys(updates).join(', ')}`, loc, updated);
        return updated;
      }
      return loc;
    }));
  };

  const createLocation = (newLocData: Omit<LocationRecord, 'id'>): LocationRecord => {
    const newLoc: LocationRecord = {
      ...newLocData,
      id: `loc-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
      lastVerifiedBy: currentUser.name,
      recordStatus: newLocData.recordStatus || 'Active'
    };
    setLocations(prev => [...prev, newLoc]);
    addAuditLog('Location Created', 'Location', newLoc.id, `Store #${newLoc.storeNumber}`, `Created new location: ${newLoc.name}`, undefined, newLoc);
    return newLoc;
  };

  const deleteLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      setLocations(prev => prev.filter(l => l.id !== id));
      addAuditLog('Location Deleted', 'Location', loc.id, `Store #${loc.storeNumber}`, `Deleted location record.`, loc, undefined);
    }
  };

  const retireLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      setLocations(prev => prev.map(l => {
        if (l.id === id) {
          const updated = {
            ...l,
            recordStatus: 'Retired' as const,
            operationalStatus: 'Permanently Closed' as const,
            updatedAt: new Date().toISOString()
          };
          addAuditLog('Location Retired', 'Location', loc.id, `Store #${loc.storeNumber}`, `Retired store location (recordStatus set to Retired).`, loc, updated);
          return updated;
        }
        return l;
      }));
    }
  };

  const reactivateLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      setLocations(prev => prev.map(l => {
        if (l.id === id) {
          const updated = {
            ...l,
            recordStatus: 'Active' as const,
            operationalStatus: 'Open — Normal Operations' as const,
            updatedAt: new Date().toISOString()
          };
          addAuditLog('Location Reactivated', 'Location', loc.id, `Store #${loc.storeNumber}`, `Reactivated store location (recordStatus set to Active).`, loc, updated);
          return updated;
        }
        return l;
      }));
    }
  };

  const verifyLocation = (id: string) => {
    updateLocation(id, {
      lastVerifiedAt: new Date().toISOString(),
      lastVerifiedBy: currentUser.name
    });
  };

  const verifyManagerPhone = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      updateLocation(id, {
        lastVerifiedAt: new Date().toISOString(),
        lastVerifiedBy: currentUser.name
      });
    }
  };

  const toggleLocationPhonePrivacy = (id: string, privacy: ContactPrivacyLevel) => {
    updateLocation(id, { phonePrivacy: privacy });
  };

  const addPerson = (personData: Omit<Person, 'id'>): Person => {
    const newPerson: Person = {
      ...personData,
      id: `per-${Date.now()}`,
    };
    setPeople(prev => [...prev, newPerson]);
    addAuditLog('Person Created', 'Person', newPerson.id, newPerson.fullName, `Added person record for ${newPerson.fullName}`, undefined, newPerson);
    return newPerson;
  };

  const updatePerson = (id: string, updates: Partial<Person>) => {
    const currentPerson = people.find(person => person.id === id);
    if (!currentPerson) return;

    const updatedPerson = { ...currentPerson, ...updates };
    const personById = (personId: string) => personId === id
      ? updatedPerson
      : people.find(person => person.id === personId);

    setPeople(previous => previous.map(person => person.id === id ? updatedPerson : person));
    setLocations(previous => previous.map(location => ({
      ...location,
      ...(location.storeManagerId === id ? {
        storeManagerName: updatedPerson.fullName,
        storeManagerPhone: updatedPerson.phone || updatedPerson.workPhone || '',
        storeManagerPhonePrivacy: updatedPerson.phonePrivacy,
      } : {}),
      ...(location.districtManagerId === id ? {
        districtManagerName: updatedPerson.fullName,
        district: updatedPerson.district || location.district,
      } : {}),
      assistantStoreManagerNames: (location.assistantStoreManagerIds || [])
        .map(personId => personById(personId)?.fullName)
        .filter((name): name is string => Boolean(name)),
      keyHolderNames: (location.keyHolderIds || [])
        .map(personId => personById(personId)?.fullName)
        .filter((name): name is string => Boolean(name)),
    })));
    addAuditLog('Person Updated', 'Person', currentPerson.id, currentPerson.fullName, `Updated attributes: ${Object.keys(updates).join(', ')}`, currentPerson, updatedPerson);
  };

  const togglePersonPhonePrivacy = (id: string, privacy: ContactPrivacyLevel) => {
    updatePerson(id, { phonePrivacy: privacy });
  };

  const submitRequest = (reqData: Omit<UpdateRequest, 'id' | 'requestedAt' | 'status'>) => {
    const newReq: UpdateRequest = {
      ...reqData,
      id: `req-${Date.now()}`,
      requestedAt: new Date().toISOString(),
      status: 'Pending'
    };
    setRequests(prev => [newReq, ...prev]);
    addAuditLog('Request Submitted', 'Request', newReq.id, newReq.changeType, `Submitted change request for ${newReq.targetName}`);
  };

  const approveRequest = (requestId: string, reviewerNotes?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    if (req.targetType === 'Location') {
      updateLocation(req.targetId, req.requestedChanges);
    }

    setRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'Approved',
          reviewedBy: currentUser.name,
          reviewedAt: new Date().toISOString(),
          reviewerNotes
        };
      }
      return r;
    }));

    addAuditLog('Request Approved', 'Request', req.id, req.changeType, `Approved request by ${currentUser.name}`);
  };

  const rejectRequest = (requestId: string, reviewerNotes?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    setRequests(prev => prev.map(r => {
      if (r.id === requestId) {
        return {
          ...r,
          status: 'Rejected',
          reviewedBy: currentUser.name,
          reviewedAt: new Date().toISOString(),
          reviewerNotes
        };
      }
      return r;
    }));

    addAuditLog('Request Rejected', 'Request', req.id, req.changeType, `Rejected request by ${currentUser.name}: ${reviewerNotes || 'No notes'}`);
  };

  const applyHoursTemplate = (locationId: string, templateId: string) => {
    const template = hoursTemplates.find(t => t.id === templateId);
    if (template) {
      updateLocation(locationId, {
        standardHours: structuredClone(template.schedule),
        hoursTemplateId: template.id,
        hoursMode: 'template',
      });
    }
  };

  // Hours Template CUD
  const createHoursTemplate = (templateData: Omit<HoursTemplate, 'id'>): HoursTemplate => {
    const newTemplate: HoursTemplate = {
      ...templateData,
      id: `tmpl-${Date.now()}`
    };
    setHoursTemplates(prev => [...prev, newTemplate]);
    addAuditLog('Hours Template Created', 'Setting', newTemplate.id, newTemplate.name, `Created hours template "${newTemplate.name}"`, undefined, newTemplate);
    return newTemplate;
  };

  const updateHoursTemplate = (id: string, updates: Partial<HoursTemplate>) => {
    setHoursTemplates(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, ...updates };
        addAuditLog('Hours Template Updated', 'Setting', t.id, t.name, `Updated hours template "${t.name}"`, t, updated);
        return updated;
      }
      return t;
    }));
    if (updates.schedule) {
      setLocations(previous => previous.map(location =>
        location.hoursTemplateId === id && location.hoursMode === 'template'
          ? { ...location, standardHours: structuredClone(updates.schedule!) }
          : location,
      ));
    }
  };

  const deleteHoursTemplate = (id: string) => {
    const target = hoursTemplates.find(t => t.id === id);
    if (target) {
      setHoursTemplates(prev => prev.filter(t => t.id !== id));
      setLocations(previous => previous.map(location =>
        location.hoursTemplateId === id
          ? { ...location, hoursTemplateId: undefined, hoursMode: 'custom' }
          : location,
      ));
      addAuditLog('Hours Template Deleted', 'Setting', target.id, target.name, `Deleted hours template "${target.name}"`, target, undefined);
    }
  };

  // User Accounts CUD
  const createUserAccount = (userData: Omit<UserProfile, 'id'>): UserProfile => {
    const newUser: UserProfile = {
      ...userData,
      id: `usr-${Date.now()}`,
      status: userData.status || 'Active'
    };
    setUsers(prev => [...prev, newUser]);
    addAuditLog('User Account Created', 'User', newUser.id, newUser.name, `Created user account for ${newUser.name} with role ${newUser.role}`, undefined, newUser);
    return newUser;
  };

  const updateUserAccount = (id: string, updates: Partial<UserProfile>) => {
    setUsers(prev => prev.map(u => {
      if (u.id === id) {
        const updated = { ...u, ...updates };
        addAuditLog('User Account Updated', 'User', u.id, u.name, `Updated user account ${u.name}: ${Object.keys(updates).join(', ')}`, u, updated);
        return updated;
      }
      return u;
    }));
  };

  const deleteUserAccount = (id: string) => {
    const target = users.find(u => u.id === id);
    if (target) {
      setUsers(prev => prev.filter(u => u.id !== id));
      addAuditLog('User Account Deleted', 'User', target.id, target.name, `Revoked/Deleted user account for ${target.name}`, target, undefined);
    }
  };

  // API Key Management
  const generateApiKey = (name: string, role: string, expirationDays: number = 365): ApiKeyRecord => {
    const randomHex = Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    const newKey: ApiKeyRecord = {
      id: `key-${Date.now()}`,
      name,
      key: `shk_live_${randomHex}`,
      role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + expirationDays * 86400000).toISOString(),
      status: 'Active',
      lastUsedAt: new Date().toISOString()
    };
    setApiKeys(prev => [newKey, ...prev]);
    addAuditLog('API Key Generated', 'Setting', newKey.id, newKey.name, `Generated new ${role} API token: ${newKey.name}`, undefined, newKey);
    return newKey;
  };

  const revokeApiKey = (id: string) => {
    setApiKeys(prev => prev.map(k => {
      if (k.id === id) {
        const updated = { ...k, status: 'Revoked' as const };
        addAuditLog('API Key Revoked', 'Setting', k.id, k.name, `Revoked API token ${k.name}`, k, updated);
        return updated;
      }
      return k;
    }));
  };

  // Corporate Holiday Overrides
  const addCorporateHoliday = (holidayData: Omit<CorporateHoliday, 'id'>): CorporateHoliday => {
    const newHoliday: CorporateHoliday = {
      ...holidayData,
      id: `hol-${Date.now()}`
    };
    setCorporateHolidays(prev => [...prev, newHoliday]);
    addAuditLog('Corporate Holiday Added', 'Setting', newHoliday.id, newHoliday.name, `Added holiday override for ${newHoliday.name} on ${newHoliday.date}`, undefined, newHoliday);
    return newHoliday;
  };

  const updateCorporateHoliday = (id: string, updates: Partial<CorporateHoliday>) => {
    setCorporateHolidays(prev => prev.map(h => {
      if (h.id === id) {
        const updated = { ...h, ...updates };
        addAuditLog('Corporate Holiday Updated', 'Setting', h.id, h.name, `Updated holiday override ${h.name}`, h, updated);
        return updated;
      }
      return h;
    }));
  };

  const deleteCorporateHoliday = (id: string) => {
    const target = corporateHolidays.find(h => h.id === id);
    if (target) {
      setCorporateHolidays(prev => prev.filter(h => h.id !== id));
      addAuditLog('Corporate Holiday Deleted', 'Setting', target.id, target.name, `Deleted holiday override "${target.name}"`, target, undefined);
    }
  };

  const broadcastHolidaysToFleet = () => {
    setLocations(prev => prev.map(loc => {
      const overrides = corporateHolidays.map(hol => ({
        id: `hol-ovr-${loc.id}-${hol.id}`,
        holidayName: hol.name,
        date: hol.date,
        hours: hol.hours || { open: '00:00', close: '00:00', isClosed: hol.status.includes('Closed') }
      }));
      return {
        ...loc,
        holidayHours: overrides,
        updatedAt: new Date().toISOString()
      };
    }));
    addAuditLog('Holiday Broadcast', 'Setting', 'fleet-holidays', 'Fleet Holiday Broadcast', `Broadcasted ${corporateHolidays.length} holiday schedule overrides across ${locations.length} stores.`);
  };

  // SMTP & Communications CUD
  const updateSmtpConfig = (updates: Partial<SmtpConfig>) => {
    setSmtpConfig(prev => {
      const next = { ...prev, ...updates };
      const { smtpPassword: prevPass, ...safePrev } = prev;
      const { smtpPassword: nextPass, ...safeNext } = next;
      const safeUpdatedKeys = Object.keys(updates).filter(k => k !== 'smtpPassword');
      addAuditLog('SMTP Config Updated', 'Setting', 'smtp-cfg', 'SMTP Relay Settings', `Updated SMTP parameters: ${safeUpdatedKeys.join(', ')}`, safePrev, safeNext);
      return next;
    });
  };

  const createEmailTemplate = (templateData: Omit<EmailTemplate, 'id' | 'updatedAt'>): EmailTemplate => {
    const newTmpl: EmailTemplate = {
      ...templateData,
      id: `tmpl-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };
    setEmailTemplates(prev => [...prev, newTmpl]);
    addAuditLog('Email Template Created', 'Communication', newTmpl.id, newTmpl.name, `Created transactional email template "${newTmpl.name}"`, undefined, newTmpl);
    return newTmpl;
  };

  const updateEmailTemplate = (id: string, updates: Partial<EmailTemplate>) => {
    setEmailTemplates(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, ...updates, updatedAt: new Date().toISOString() };
        addAuditLog('Email Template Updated', 'Communication', t.id, t.name, `Updated email template "${t.name}"`, t, updated);
        return updated;
      }
      return t;
    }));
  };

  const deleteEmailTemplate = (id: string) => {
    const target = emailTemplates.find(t => t.id === id);
    if (target) {
      setEmailTemplates(prev => prev.filter(t => t.id !== id));
      addAuditLog('Email Template Deleted', 'Communication', target.id, target.name, `Deleted email template "${target.name}"`, target, undefined);
    }
  };

  const updateNotificationRule = (id: string, enabled: boolean) => {
    setNotificationRules(prev => prev.map(rule => {
      if (rule.id === id) {
        const updated = { ...rule, enabled };
        addAuditLog('Notification Rule Changed', 'Setting', rule.id, rule.eventName, `Set notification rule for "${rule.eventName}" to ${enabled ? 'Enabled' : 'Disabled'}`, rule, updated);
        return updated;
      }
      return rule;
    }));
  };

  const sendDiagnosticTestEmail = async (
    recipient: string, 
    customSubject?: string, 
    templateId?: string
  ): Promise<{ success: boolean; latencyMs: number; messageId: string; message: string; errorMessage?: string }> => {
    const startTime = performance.now();
    const effectiveSubject = customSubject || '[Diagnostic Ping] Shiekh Directory SMTP Relay Verification';
    const effectiveTemplateId = templateId || 'tmpl-diagnostic-test';

    try {
      const response = await fetch('/api/mail/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipient,
          subject: effectiveSubject,
          templateId: effectiveTemplateId,
          ...smtpConfig,
          smtpConfig
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error || response.statusText || `Relay dispatch failed with HTTP ${response.status}`);
      }

      const responseData = await response.json().catch(() => ({}));
      const messageId = responseData?.messageId || '';

      const newLog: OutboxLogEntry = {
        id: `out-${Date.now()}`,
        timestamp: new Date().toISOString(),
        recipient,
        subject: effectiveSubject,
        status: 'Delivered',
        templateId: effectiveTemplateId
      };

      setOutboxLogs(prev => [newLog, ...prev].slice(0, 50));
      addAuditLog(
        'SMTP Diagnostic Test Sent', 
        'Communication', 
        newLog.id, 
        `Relay Ping to ${recipient}`, 
        `Dispatched live diagnostic email ping to ${recipient} via ${smtpConfig.smtpHost}:${smtpConfig.smtpPort} (TLS: ${smtpConfig.enforceTls ? 'Enforced' : 'Opportunistic'}).`
      );

      return { 
        success: true, 
        latencyMs: Math.round(performance.now() - startTime), 
        messageId, 
        message: `Diagnostic test email transmitted successfully to ${recipient}${messageId ? ` (ID: ${messageId})` : ''}` 
      };
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to dispatch email';

      const failedLog: OutboxLogEntry = {
        id: `out-${Date.now()}`,
        timestamp: new Date().toISOString(),
        recipient,
        subject: effectiveSubject,
        status: 'Failed',
        templateId: effectiveTemplateId,
        errorMessage
      };

      setOutboxLogs(prev => [failedLog, ...prev].slice(0, 50));
      addAuditLog(
        'SMTP Diagnostic Test Failed',
        'Communication',
        failedLog.id,
        `Relay Ping Failed to ${recipient}`,
        `Failed diagnostic email ping to ${recipient} via ${smtpConfig.smtpHost}:${smtpConfig.smtpPort}: ${errorMessage}`
      );

      throw err;
    }
  };

  // Rollback Engine
  const rollbackAuditChange = (auditLogId: string): { success: boolean; message: string } => {
    const targetLog = auditLogs.find(a => a.id === auditLogId);
    if (!targetLog) {
      return { success: false, message: 'Audit entry not found.' };
    }
    if (!targetLog.previousState) {
      return { success: false, message: 'No prior snapshot state exists for this audit entry.' };
    }

    const prev = targetLog.previousState;

    if (targetLog.entityType === 'Location') {
      const exists = locations.some(l => l.id === targetLog.entityId);
      if (exists) {
        setLocations(current => current.map(l => l.id === targetLog.entityId ? prev : l));
      } else {
        setLocations(current => [prev, ...current]);
      }
      addAuditLog(
        'Audit Rollback Executed',
        'Location',
        targetLog.entityId,
        targetLog.entityName,
        `Reverted record state back to snapshot before "${targetLog.action}" (Audit Log ID: ${targetLog.id})`,
        targetLog.newState,
        prev
      );
      return { success: true, message: `Successfully reverted ${targetLog.entityName} to prior state.` };
    }

    if (targetLog.entityType === 'Person') {
      const exists = people.some(p => p.id === targetLog.entityId);
      if (exists) {
        setPeople(current => current.map(p => p.id === targetLog.entityId ? prev : p));
      } else {
        setPeople(current => [prev, ...current]);
      }
      addAuditLog(
        'Audit Rollback Executed',
        'Person',
        targetLog.entityId,
        targetLog.entityName,
        `Reverted person state back to snapshot before "${targetLog.action}" (Audit Log ID: ${targetLog.id})`,
        targetLog.newState,
        prev
      );
      return { success: true, message: `Successfully reverted ${targetLog.entityName} to prior state.` };
    }

    if (targetLog.entityType === 'Setting' && targetLog.entityId === 'smtp-cfg') {
      setSmtpConfig(prev);
      addAuditLog(
        'Audit Rollback Executed',
        'Setting',
        'smtp-cfg',
        'SMTP Relay Settings',
        `Reverted SMTP configuration to prior snapshot.`,
        targetLog.newState,
        prev
      );
      return { success: true, message: 'Successfully reverted SMTP settings to prior state.' };
    }

    if (targetLog.entityType === 'Communication') {
      const exists = emailTemplates.some(t => t.id === targetLog.entityId);
      if (exists) {
        setEmailTemplates(current => current.map(t => t.id === targetLog.entityId ? prev : t));
      } else {
        setEmailTemplates(current => [prev, ...current]);
      }
      addAuditLog(
        'Audit Rollback Executed',
        'Communication',
        targetLog.entityId,
        targetLog.entityName,
        `Reverted email template state to prior snapshot.`,
        targetLog.newState,
        prev
      );
      return { success: true, message: `Successfully reverted ${targetLog.entityName} template.` };
    }

    return { success: false, message: `Automated rollback not supported for entity type ${targetLog.entityType}.` };
  };

  // SOP Runbooks CUD
  const createSopRunbook = (runbookData: Omit<SopRunbook, 'id' | 'lastUpdated'>): SopRunbook => {
    const newRunbook: SopRunbook = {
      ...runbookData,
      id: `sop-${Date.now()}`,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    setSopRunbooks(prev => [...prev, newRunbook]);
    addAuditLog('SOP Runbook Created', 'Setting', newRunbook.id, newRunbook.title, `Created SOP runbook "${newRunbook.title}"`);
    return newRunbook;
  };

  const updateSopRunbook = (id: string, updates: Partial<SopRunbook>) => {
    setSopRunbooks(prev => prev.map(s => {
      if (s.id === id) {
        const updated = { 
          ...s, 
          ...updates, 
          lastUpdated: new Date().toISOString().split('T')[0] 
        };
        addAuditLog('SOP Runbook Updated', 'Setting', s.id, s.title, `Updated runbook "${s.title}"`);
        return updated;
      }
      return s;
    }));
  };

  const deleteSopRunbook = (id: string) => {
    const target = sopRunbooks.find(s => s.id === id);
    if (target) {
      setSopRunbooks(prev => prev.filter(s => s.id !== id));
      addAuditLog('SOP Runbook Deleted', 'Setting', target.id, target.title, `Deleted SOP runbook "${target.title}"`);
    }
  };

  return (
    <DirectoryContext.Provider
      value={{
        locations,
        people,
        users,
        currentUser,
        hoursTemplates,
        apiKeys,
        corporateHolidays,
        requests,
        auditLogs,
        smtpConfig,
        emailTemplates,
        notificationRules,
        outboxLogs,
        sopRunbooks,
        switchUser,
        updateLocation,
        createLocation,
        deleteLocation,
        retireLocation,
        reactivateLocation,
        verifyLocation,
        verifyManagerPhone,
        toggleLocationPhonePrivacy,
        addPerson,
        updatePerson,
        togglePersonPhonePrivacy,
        submitRequest,
        approveRequest,
        rejectRequest,
        applyHoursTemplate,
        createHoursTemplate,
        updateHoursTemplate,
        deleteHoursTemplate,
        createUserAccount,
        updateUserAccount,
        deleteUserAccount,
        generateApiKey,
        revokeApiKey,
        addCorporateHoliday,
        updateCorporateHoliday,
        deleteCorporateHoliday,
        broadcastHolidaysToFleet,
        updateSmtpConfig,
        createEmailTemplate,
        updateEmailTemplate,
        deleteEmailTemplate,
        updateNotificationRule,
        sendDiagnosticTestEmail,
        rollbackAuditChange,
        createSopRunbook,
        updateSopRunbook,
        deleteSopRunbook
      }}
    >
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

