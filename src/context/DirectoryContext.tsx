import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  LocationRecord, 
  Person, 
  UserProfile, 
  UserOnboardingChoice,
  UpdateRequest, 
  HoursTemplate, 
  CorporateHoliday,
  AuditLogEntry, 
  ContactPrivacyLevel,
  OperationalStatus,
  EmailTemplate,
  NotificationRule,
  OutboxLogEntry,
  SopRunbook
} from '../types';
import type { DirectorySeed } from '../lib/directorySeed';
import { migrateDirectoryRelationships } from '../lib/directoryMigration';
import { commitDirectory, type DirectoryAudit, type DirectoryWrite } from '../lib/directoryClient';
import { createInvitationLink, mailRequest, sendInvitationEmail, sendMailEvent } from '../lib/mailClient';
import { useAuth } from './AuthContext';
import { parseCustomFieldDefinition, type CustomFieldDefinition, type CustomFieldValue } from '../lib/customFields';

interface DirectoryContextType {
  locations: LocationRecord[];
  people: Person[];
  users: UserProfile[];
  currentUser: UserProfile;
  hoursTemplates: HoursTemplate[];
  corporateHolidays: CorporateHoliday[];
  requests: UpdateRequest[];
  auditLogs: AuditLogEntry[];
  emailTemplates: EmailTemplate[];
  notificationRules: NotificationRule[];
  outboxLogs: OutboxLogEntry[];
  sopRunbooks: SopRunbook[];
  customFieldDefinitions: CustomFieldDefinition[];
  saveCustomFieldDefinition: (definition: CustomFieldDefinition) => Promise<void>;
  saveLocationRecord: (location: LocationRecord, create: boolean, expectedCustomMetadata: Record<string, CustomFieldValue>) => Promise<void>;
  persistenceError: string | null;
  clearPersistenceError: () => void;
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
  createUserAccount: (user: Omit<UserProfile, 'id'>, onboarding: UserOnboardingChoice) => Promise<{ user: UserProfile; outcome: 'email-submitted' | 'link-generated' | 'access-only' | 'failed'; activationLink?: string; errorMessage?: string }>;
  sendUserInvitation: (id: string) => Promise<void>;
  createUserInvitationLink: (id: string) => Promise<string>;
  updateUserAccount: (id: string, updates: Partial<UserProfile>) => void;
  deleteUserAccount: (id: string) => void;
  addCorporateHoliday: (holiday: Omit<CorporateHoliday, 'id'>) => CorporateHoliday;
  updateCorporateHoliday: (id: string, updates: Partial<CorporateHoliday>) => void;
  deleteCorporateHoliday: (id: string) => void;
  broadcastHolidaysToFleet: () => void;
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

export const DirectoryProvider: React.FC<{ children: React.ReactNode; seed: DirectorySeed }> = ({ children, seed }) => {
  const { account, user } = useAuth();
  if (!account || !user) throw new Error('Authorized directory account required.');
  const currentUser: UserProfile = { id: account.uid, name: account.name, email: account.email || '', role: account.role, status: 'Active', accessScope: account.accessScope, personId: account.personId || undefined };
  const [initialDirectory] = useState(() => {
    const migrated = migrateDirectoryRelationships(seed.locations, seed.people, seed.hoursTemplates);
    return { ...migrated, templates: seed.hoursTemplates };
  });
  const [locations, setLocations] = useState<LocationRecord[]>(initialDirectory.locations);
  const [people, setPeople] = useState<Person[]>(initialDirectory.people);
  const [users, setUsers] = useState<UserProfile[]>(seed.users);
  const [hoursTemplates, setHoursTemplates] = useState<HoursTemplate[]>(initialDirectory.templates);
  const [corporateHolidays, setCorporateHolidays] = useState<CorporateHoliday[]>(seed.corporateHolidays);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>(seed.emailTemplates);
  const [notificationRules, setNotificationRules] = useState<NotificationRule[]>(seed.notificationRules);
  const [outboxLogs, setOutboxLogs] = useState<OutboxLogEntry[]>(seed.outboxLogs);
  const [sopRunbooks, setSopRunbooks] = useState<SopRunbook[]>(seed.sopRunbooks);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomFieldDefinition[]>(seed.customFieldDefinitions || []);
  const [requests, setRequests] = useState<UpdateRequest[]>(seed.requests);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => seed.auditLogs.map(scrubLegacyApiKeyAuditEntry));
  const [persistenceError, setPersistenceError] = useState<string | null>(null);

  useEffect(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('shiekh_') && key !== 'shiekh_theme_preference') localStorage.removeItem(key);
  }, []);

  const persist = (writes: DirectoryWrite[], audit: DirectoryAudit) => {
    setPersistenceError(null);
    const operation = commitDirectory(user, writes, audit);
    void operation.catch(error => {
      setPersistenceError(error instanceof Error ? error.message : 'The directory database could not save this change.');
    });
    return operation;
  };

  const notifyAfterSave = (operation: Promise<void>, event: 'request-submitted' | 'request-approved' | 'request-rejected', entityId: string) => {
    void operation.then(() => sendMailEvent(event, entityId)).catch(error => {
      setPersistenceError(error instanceof Error ? error.message : 'The directory email could not be sent.');
    });
  };

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

  const saveCustomFieldDefinition = async (input: CustomFieldDefinition) => {
    const definition = parseCustomFieldDefinition(input);
    const previous = customFieldDefinitions.find(field => field.id === definition.id) || null;
    await persist([{ collection: 'custom_field_definitions', id: definition.id, operation: 'set', data: { ...definition }, expectedDefinition: previous }], {
      action: previous ? 'Custom Field Updated' : 'Custom Field Created', entityType: 'Setting', entityId: definition.id, entityName: definition.label, details: `Saved custom field ${definition.id}. API visible: ${definition.apiVisible}. Retired: ${definition.retired}.`,
    });
    setCustomFieldDefinitions(fields => [...fields.filter(field => field.id !== definition.id), definition]);
    addAuditLog(previous ? 'Custom Field Updated' : 'Custom Field Created', 'Setting', definition.id, definition.label, `Saved custom field ${definition.id}.`, previous, definition);
  };

  const saveLocationRecord = async (location: LocationRecord, create: boolean, expectedCustomMetadata: Record<string, CustomFieldValue>) => {
    const timestamp = new Date().toISOString();
    const saved = { ...location, updatedAt: timestamp, ...(create ? { id: `loc-${crypto.randomUUID()}`, createdAt: timestamp, lastVerifiedAt: timestamp, lastVerifiedBy: currentUser.name } : {}) };
    const previous = locations.find(record => record.id === saved.id);
    const action = create ? 'Location Created' : 'Location Updated';
    await persist([{ collection: 'locations', id: saved.id, operation: 'set', data: saved as unknown as Record<string, unknown>, expectedCustomMetadata }], {
      action, entityType: 'Location', entityId: saved.id, entityName: `Store #${saved.storeNumber}`, details: 'Saved location record and custom metadata.',
    });
    setLocations(records => create ? [...records, saved] : records.map(record => record.id === saved.id ? saved : record));
    addAuditLog(action, 'Location', saved.id, `Store #${saved.storeNumber}`, 'Saved location record and custom metadata.', previous, saved);
  };

  const updateLocation = (id: string, updates: Partial<LocationRecord>) => {
    const current = locations.find(location => location.id === id);
    if (!current) return;
    const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
    const details = `Updated attributes: ${Object.keys(updates).join(', ')}`;
    setLocations(previous => previous.map(location => location.id === id ? updated : location));
    addAuditLog('Location Updated', 'Location', current.id, `Store #${current.storeNumber}`, details, current, updated);
    persist([{ collection: 'locations', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'Location Updated', entityType: 'Location', entityId: id, entityName: `Store #${current.storeNumber}`, details });
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
    persist([{ collection: 'locations', id: newLoc.id, operation: 'set', data: newLoc as unknown as Record<string, unknown> }], { action: 'Location Created', entityType: 'Location', entityId: newLoc.id, entityName: `Store #${newLoc.storeNumber}`, details: `Created new location: ${newLoc.name}` });
    return newLoc;
  };

  const deleteLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      setLocations(prev => prev.filter(l => l.id !== id));
      addAuditLog('Location Deleted', 'Location', loc.id, `Store #${loc.storeNumber}`, `Deleted location record.`, loc, undefined);
      persist([{ collection: 'locations', id, operation: 'delete' }], { action: 'Location Deleted', entityType: 'Location', entityId: id, entityName: `Store #${loc.storeNumber}`, details: 'Deleted location record.' });
    }
  };

  const retireLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      const updated = { ...loc, recordStatus: 'Retired' as const, operationalStatus: 'Permanently Closed' as const, updatedAt: new Date().toISOString() };
      setLocations(previous => previous.map(location => location.id === id ? updated : location));
      addAuditLog('Location Retired', 'Location', loc.id, `Store #${loc.storeNumber}`, 'Retired store location (recordStatus set to Retired).', loc, updated);
      persist([{ collection: 'locations', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'Location Retired', entityType: 'Location', entityId: id, entityName: `Store #${loc.storeNumber}`, details: 'Retired store location (recordStatus set to Retired).' });
    }
  };

  const reactivateLocation = (id: string) => {
    const loc = locations.find(l => l.id === id);
    if (loc) {
      const updated = { ...loc, recordStatus: 'Active' as const, operationalStatus: 'Open — Normal Operations' as const, updatedAt: new Date().toISOString() };
      setLocations(previous => previous.map(location => location.id === id ? updated : location));
      addAuditLog('Location Reactivated', 'Location', loc.id, `Store #${loc.storeNumber}`, 'Reactivated store location (recordStatus set to Active).', loc, updated);
      persist([{ collection: 'locations', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'Location Reactivated', entityType: 'Location', entityId: id, entityName: `Store #${loc.storeNumber}`, details: 'Reactivated store location (recordStatus set to Active).' });
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
    persist([{ collection: 'people', id: newPerson.id, operation: 'set', data: newPerson as unknown as Record<string, unknown> }], { action: 'Person Created', entityType: 'Person', entityId: newPerson.id, entityName: newPerson.fullName, details: `Added person record for ${newPerson.fullName}` });
    return newPerson;
  };

  const updatePerson = (id: string, updates: Partial<Person>) => {
    const currentPerson = people.find(person => person.id === id);
    if (!currentPerson) return;

    const updatedPerson = { ...currentPerson, ...updates };
    const personById = (personId: string) => personId === id
      ? updatedPerson
      : people.find(person => person.id === personId);

    const affectsLocation = (location: LocationRecord) => location.storeManagerId === id || location.districtManagerId === id
      || location.assistantStoreManagerIds?.includes(id) || location.keyHolderIds?.includes(id);
    const updatedLocations = locations.map(location => affectsLocation(location) ? ({
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
    }) : location);
    setPeople(previous => previous.map(person => person.id === id ? updatedPerson : person));
    setLocations(updatedLocations);
    addAuditLog('Person Updated', 'Person', currentPerson.id, currentPerson.fullName, `Updated attributes: ${Object.keys(updates).join(', ')}`, currentPerson, updatedPerson);
    persist([
      { collection: 'people', id, operation: 'set', data: updatedPerson as unknown as Record<string, unknown> },
      ...updatedLocations.filter(affectsLocation).map(location => ({ collection: 'locations' as const, id: location.id, operation: 'set' as const, data: location as unknown as Record<string, unknown> })),
    ], { action: 'Person Updated', entityType: 'Person', entityId: id, entityName: currentPerson.fullName, details: `Updated attributes: ${Object.keys(updates).join(', ')}` });
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
    notifyAfterSave(persist([{ collection: 'requests', id: newReq.id, operation: 'set', data: newReq as unknown as Record<string, unknown> }], { action: 'Request Submitted', entityType: 'Request', entityId: newReq.id, entityName: newReq.changeType, details: `Submitted change request for ${newReq.targetName}` }), 'request-submitted', newReq.id);
  };

  const approveRequest = (requestId: string, reviewerNotes?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const updatedRequest: UpdateRequest = {
          ...req,
          status: 'Approved',
          reviewedBy: currentUser.name,
          reviewedAt: new Date().toISOString(),
          reviewerNotes
    };
    const writes: DirectoryWrite[] = [{ collection: 'requests', id: requestId, operation: 'set', data: updatedRequest as unknown as Record<string, unknown> }];
    if (req.targetType === 'Location') {
      const location = locations.find(item => item.id === req.targetId);
      if (location) {
        const updatedLocation = { ...location, ...req.requestedChanges, updatedAt: new Date().toISOString() };
        setLocations(previous => previous.map(item => item.id === location.id ? updatedLocation : item));
        writes.push({ collection: 'locations', id: location.id, operation: 'set', data: updatedLocation as unknown as Record<string, unknown> });
      }
    }
    setRequests(previous => previous.map(item => item.id === requestId ? updatedRequest : item));

    addAuditLog('Request Approved', 'Request', req.id, req.changeType, `Approved request by ${currentUser.name}`);
    notifyAfterSave(persist(writes, { action: 'Request Approved', entityType: 'Request', entityId: req.id, entityName: req.changeType, details: `Approved request by ${currentUser.name}` }), 'request-approved', req.id);
  };

  const rejectRequest = (requestId: string, reviewerNotes?: string) => {
    const req = requests.find(r => r.id === requestId);
    if (!req) return;

    const updatedRequest: UpdateRequest = {
          ...req,
          status: 'Rejected',
          reviewedBy: currentUser.name,
          reviewedAt: new Date().toISOString(),
          reviewerNotes
    };
    setRequests(previous => previous.map(item => item.id === requestId ? updatedRequest : item));

    addAuditLog('Request Rejected', 'Request', req.id, req.changeType, `Rejected request by ${currentUser.name}: ${reviewerNotes || 'No notes'}`);
    notifyAfterSave(persist([{ collection: 'requests', id: requestId, operation: 'set', data: updatedRequest as unknown as Record<string, unknown> }], { action: 'Request Rejected', entityType: 'Request', entityId: req.id, entityName: req.changeType, details: `Rejected request by ${currentUser.name}: ${reviewerNotes || 'No notes'}` }), 'request-rejected', req.id);
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
    persist([{ collection: 'hours_templates', id: newTemplate.id, operation: 'set', data: newTemplate as unknown as Record<string, unknown> }], { action: 'Hours Template Created', entityType: 'Setting', entityId: newTemplate.id, entityName: newTemplate.name, details: `Created hours template "${newTemplate.name}"` });
    return newTemplate;
  };

  const updateHoursTemplate = (id: string, updates: Partial<HoursTemplate>) => {
    const target = hoursTemplates.find(template => template.id === id);
    if (!target) return;
    const updated = { ...target, ...updates };
    const updatedLocations = updates.schedule ? locations.map(location => location.hoursTemplateId === id && location.hoursMode === 'template' ? { ...location, standardHours: structuredClone(updates.schedule!) } : location) : locations;
    setHoursTemplates(previous => previous.map(template => template.id === id ? updated : template));
    if (updates.schedule) setLocations(updatedLocations);
    addAuditLog('Hours Template Updated', 'Setting', target.id, target.name, `Updated hours template "${target.name}"`, target, updated);
    persist([
      { collection: 'hours_templates', id, operation: 'set', data: updated as unknown as Record<string, unknown> },
      ...updatedLocations.filter((location, index) => location !== locations[index]).map(location => ({ collection: 'locations' as const, id: location.id, operation: 'set' as const, data: location as unknown as Record<string, unknown> })),
    ], { action: 'Hours Template Updated', entityType: 'Setting', entityId: id, entityName: target.name, details: `Updated hours template "${target.name}"` });
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
      const affected = locations.filter(location => location.hoursTemplateId === id).map(location => ({ ...location, hoursTemplateId: undefined, hoursMode: 'custom' as const }));
      persist([
        { collection: 'hours_templates', id, operation: 'delete' },
        ...affected.map(location => ({ collection: 'locations' as const, id: location.id, operation: 'set' as const, data: location as unknown as Record<string, unknown> })),
      ], { action: 'Hours Template Deleted', entityType: 'Setting', entityId: id, entityName: target.name, details: `Deleted hours template "${target.name}"` });
    }
  };

  // User Accounts CUD
  const markInvitationIssued = (id: string, invitationDelivery: 'Firebase email' | 'Copied link') => {
    const invitedAt = new Date().toISOString();
    setUsers(previous => previous.map(item => item.id === id ? { ...item, invitationStatus: 'Pending', invitationDelivery, invitationDeliveryStatus: 'Submitted', invitedAt } : item));
  };

  const sendUserInvitation = async (id: string) => {
    await sendInvitationEmail(id);
    markInvitationIssued(id, 'Firebase email');
  };

  const createUserInvitationLink = async (id: string) => {
    const activationLink = await createInvitationLink(id);
    markInvitationIssued(id, 'Copied link');
    return activationLink;
  };

  const createUserAccount = async (userData: Omit<UserProfile, 'id'>, onboarding: UserOnboardingChoice): Promise<{ user: UserProfile; outcome: 'email-submitted' | 'link-generated' | 'access-only' | 'failed'; activationLink?: string; errorMessage?: string }> => {
    const id = `usr-${Date.now()}`;
    const next = { ...userData, id, accessScope: userData.accessScope || (userData.storeNumber ? `Store ${userData.storeNumber}` : 'Company-wide') };
    setUsers(previous => [...previous, next]);
    addAuditLog('User Created', 'User', id, next.name, `Created access record for ${next.email}.`, undefined, next);
    try {
      await persist([{ collection: 'users', id, operation: 'set', data: { ...next, displayName: next.name } as unknown as Record<string, unknown> }], { action: 'User Created', entityType: 'User', entityId: id, entityName: next.name, details: `Created access record for ${next.email}.` });
    } catch (error) {
      setUsers(previous => previous.filter(item => item.id !== id));
      throw error;
    }
    if (onboarding === 'access-only') return { user: next, outcome: 'access-only' };
    try {
      if (onboarding === 'copy') {
        const activationLink = await createUserInvitationLink(id);
        return { user: { ...next, invitationStatus: 'Pending' }, outcome: 'link-generated', activationLink };
      }
      await sendUserInvitation(id);
      return { user: { ...next, invitationStatus: 'Pending', invitationDelivery: 'Firebase email', invitationDeliveryStatus: 'Submitted' }, outcome: 'email-submitted' };
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'The onboarding action failed.';
      setPersistenceError(`Account created, but onboarding was not completed: ${errorMessage}`);
      return { user: next, outcome: 'failed', errorMessage };
    }
  };

  const updateUserAccount = (id: string, updates: Partial<UserProfile>) => {
    const current = users.find(item => item.id === id);
    if (!current) return;
    const next = { ...current, ...updates };
    setUsers(previous => previous.map(item => item.id === id ? next : item));
    addAuditLog('User Updated', 'User', id, next.name, `Updated access record for ${next.email}.`, current, next);
    persist([{ collection: 'users', id, operation: 'set', data: { ...next, displayName: next.name } as unknown as Record<string, unknown> }], { action: 'User Updated', entityType: 'User', entityId: id, entityName: next.name, details: `Updated access record for ${next.email}.` });
  };

  const deleteUserAccount = (id: string) => {
    const current = users.find(item => item.id === id);
    if (!current || id === currentUser.id) return;
    setUsers(previous => previous.filter(item => item.id !== id));
    addAuditLog('User Deleted', 'User', id, current.name, `Deleted access record for ${current.email}.`, current, undefined);
    persist([{ collection: 'users', id, operation: 'delete' }], { action: 'User Deleted', entityType: 'User', entityId: id, entityName: current.name, details: `Deleted access record for ${current.email}.` });
  };

  const addCorporateHoliday = (holidayData: Omit<CorporateHoliday, 'id'>): CorporateHoliday => {
    const newHoliday: CorporateHoliday = {
      ...holidayData,
      id: `hol-${Date.now()}`
    };
    setCorporateHolidays(prev => [...prev, newHoliday]);
    addAuditLog('Corporate Holiday Added', 'Setting', newHoliday.id, newHoliday.name, `Added holiday override for ${newHoliday.name} on ${newHoliday.date}`, undefined, newHoliday);
    persist([{ collection: 'corporate_holidays', id: newHoliday.id, operation: 'set', data: newHoliday as unknown as Record<string, unknown> }], { action: 'Corporate Holiday Added', entityType: 'Setting', entityId: newHoliday.id, entityName: newHoliday.name, details: `Added holiday override for ${newHoliday.name} on ${newHoliday.date}` });
    return newHoliday;
  };

  const updateCorporateHoliday = (id: string, updates: Partial<CorporateHoliday>) => {
    const target = corporateHolidays.find(holiday => holiday.id === id);
    if (!target) return;
    const updated = { ...target, ...updates };
    setCorporateHolidays(previous => previous.map(holiday => holiday.id === id ? updated : holiday));
    addAuditLog('Corporate Holiday Updated', 'Setting', target.id, target.name, `Updated holiday override ${target.name}`, target, updated);
    persist([{ collection: 'corporate_holidays', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'Corporate Holiday Updated', entityType: 'Setting', entityId: id, entityName: target.name, details: `Updated holiday override ${target.name}` });
  };

  const deleteCorporateHoliday = (id: string) => {
    const target = corporateHolidays.find(h => h.id === id);
    if (target) {
      setCorporateHolidays(prev => prev.filter(h => h.id !== id));
      addAuditLog('Corporate Holiday Deleted', 'Setting', target.id, target.name, `Deleted holiday override "${target.name}"`, target, undefined);
      persist([{ collection: 'corporate_holidays', id, operation: 'delete' }], { action: 'Corporate Holiday Deleted', entityType: 'Setting', entityId: id, entityName: target.name, details: `Deleted holiday override "${target.name}"` });
    }
  };

  const broadcastHolidaysToFleet = () => {
    const updatedLocations = locations.map(loc => {
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
    });
    setLocations(updatedLocations);
    addAuditLog('Holiday Broadcast', 'Setting', 'fleet-holidays', 'Fleet Holiday Broadcast', `Broadcasted ${corporateHolidays.length} holiday schedule overrides across ${locations.length} stores.`);
    persist(updatedLocations.map(location => ({ collection: 'locations', id: location.id, operation: 'set', data: location as unknown as Record<string, unknown> })), { action: 'Holiday Broadcast', entityType: 'Setting', entityId: 'fleet-holidays', entityName: 'Fleet Holiday Broadcast', details: `Broadcasted ${corporateHolidays.length} holiday schedule overrides across ${locations.length} stores.` });
  };

  const createEmailTemplate = (templateData: Omit<EmailTemplate, 'id' | 'updatedAt'>): EmailTemplate => {
    const newTmpl: EmailTemplate = {
      ...templateData,
      id: `tmpl-${Date.now()}`,
      updatedAt: new Date().toISOString()
    };
    setEmailTemplates(prev => [...prev, newTmpl]);
    addAuditLog('Email Template Created', 'Communication', newTmpl.id, newTmpl.name, `Created transactional email template "${newTmpl.name}"`, undefined, newTmpl);
    persist([{ collection: 'email_templates', id: newTmpl.id, operation: 'set', data: newTmpl as unknown as Record<string, unknown> }], { action: 'Email Template Created', entityType: 'Communication', entityId: newTmpl.id, entityName: newTmpl.name, details: `Created transactional email template "${newTmpl.name}"` });
    return newTmpl;
  };

  const updateEmailTemplate = (id: string, updates: Partial<EmailTemplate>) => {
    const target = emailTemplates.find(template => template.id === id);
    if (!target) return;
    const updated = { ...target, ...updates, updatedAt: new Date().toISOString() };
    setEmailTemplates(previous => previous.map(template => template.id === id ? updated : template));
    addAuditLog('Email Template Updated', 'Communication', target.id, target.name, `Updated email template "${target.name}"`, target, updated);
    persist([{ collection: 'email_templates', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'Email Template Updated', entityType: 'Communication', entityId: id, entityName: target.name, details: `Updated email template "${target.name}"` });
  };

  const deleteEmailTemplate = (id: string) => {
    const target = emailTemplates.find(t => t.id === id);
    if (target) {
      setEmailTemplates(prev => prev.filter(t => t.id !== id));
      addAuditLog('Email Template Deleted', 'Communication', target.id, target.name, `Deleted email template "${target.name}"`, target, undefined);
      persist([{ collection: 'email_templates', id, operation: 'delete' }], { action: 'Email Template Deleted', entityType: 'Communication', entityId: id, entityName: target.name, details: `Deleted email template "${target.name}"` });
    }
  };

  const updateNotificationRule = (id: string, enabled: boolean) => {
    const target = notificationRules.find(rule => rule.id === id);
    if (!target) return;
    const updated = { ...target, enabled };
    setNotificationRules(previous => previous.map(rule => rule.id === id ? updated : rule));
    addAuditLog('Notification Rule Changed', 'Setting', target.id, target.eventName, `Set notification rule for "${target.eventName}" to ${enabled ? 'Enabled' : 'Disabled'}`, target, updated);
    persist([{ collection: 'notification_rules', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'Notification Rule Changed', entityType: 'Setting', entityId: id, entityName: target.eventName, details: `Set notification rule for "${target.eventName}" to ${enabled ? 'Enabled' : 'Disabled'}` });
  };

  const sendDiagnosticTestEmail = async (
    recipient: string, 
    customSubject?: string, 
    templateId?: string
  ): Promise<{ success: boolean; latencyMs: number; messageId: string; message: string; errorMessage?: string }> => {
    const startTime = performance.now();
    const effectiveSubject = 'Shiekh Directory SMTP Relay Verification';
    const effectiveTemplateId = 'tmpl-diagnostic-test';

    try {
      if (customSubject || (templateId && templateId !== effectiveTemplateId)) {
        throw new Error('Mail subjects and templates are controlled by the server.');
      }
      const delivery = await mailRequest('dispatch', recipient);
      const messageId = '';

      const newLog: OutboxLogEntry = {
        id: `out-${Date.now()}`,
        timestamp: new Date().toISOString(),
        recipient,
        subject: typeof delivery.subject === 'string' ? delivery.subject : effectiveSubject,
        status: 'Queued',
        templateId: effectiveTemplateId
      };

      setOutboxLogs(prev => [newLog, ...prev].slice(0, 50));
      addAuditLog(
        'SMTP Diagnostic Test Sent', 
        'Communication', 
        newLog.id, 
        `Relay Ping to ${recipient}`, 
        'The server mail relay accepted the approved diagnostic message.'
      );

      return { 
        success: true, 
        latencyMs: Math.round(performance.now() - startTime), 
        messageId, 
        message: 'Diagnostic message accepted by the mail relay. Inbox delivery is not yet confirmed.'
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
        `Diagnostic mail request failed: ${errorMessage}`
      );

      throw err;
    }
  };

  // Rollback Engine
  const rollbackAuditChange = (auditLogId: string): { success: boolean; message: string } => {
    const targetLog = auditLogs.find(a => a.id === auditLogId);
    if (targetLog?.entityType === 'User') return { success: false, message: 'Account access cannot be changed through local audit rollback.' };
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
    persist([{ collection: 'sop_runbooks', id: newRunbook.id, operation: 'set', data: newRunbook as unknown as Record<string, unknown> }], { action: 'SOP Runbook Created', entityType: 'Setting', entityId: newRunbook.id, entityName: newRunbook.title, details: `Created SOP runbook "${newRunbook.title}"` });
    return newRunbook;
  };

  const updateSopRunbook = (id: string, updates: Partial<SopRunbook>) => {
    const target = sopRunbooks.find(runbook => runbook.id === id);
    if (!target) return;
    const updated = { ...target, ...updates, lastUpdated: new Date().toISOString().split('T')[0] };
    setSopRunbooks(previous => previous.map(runbook => runbook.id === id ? updated : runbook));
    addAuditLog('SOP Runbook Updated', 'Setting', target.id, target.title, `Updated runbook "${target.title}"`);
    persist([{ collection: 'sop_runbooks', id, operation: 'set', data: updated as unknown as Record<string, unknown> }], { action: 'SOP Runbook Updated', entityType: 'Setting', entityId: id, entityName: target.title, details: `Updated runbook "${target.title}"` });
  };

  const deleteSopRunbook = (id: string) => {
    const target = sopRunbooks.find(s => s.id === id);
    if (target) {
      setSopRunbooks(prev => prev.filter(s => s.id !== id));
      addAuditLog('SOP Runbook Deleted', 'Setting', target.id, target.title, `Deleted SOP runbook "${target.title}"`);
      persist([{ collection: 'sop_runbooks', id, operation: 'delete' }], { action: 'SOP Runbook Deleted', entityType: 'Setting', entityId: id, entityName: target.title, details: `Deleted SOP runbook "${target.title}"` });
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
        corporateHolidays,
        requests,
        auditLogs,
        emailTemplates,
        notificationRules,
        outboxLogs,
        sopRunbooks,
        customFieldDefinitions,
        saveCustomFieldDefinition,
        saveLocationRecord,
        persistenceError,
        clearPersistenceError: () => setPersistenceError(null),
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
        sendUserInvitation,
        createUserInvitationLink,
        deleteUserAccount,
        addCorporateHoliday,
        updateCorporateHoliday,
        deleteCorporateHoliday,
        broadcastHolidaysToFleet,
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

function scrubLegacyApiKeyAuditEntry(entry: AuditLogEntry): AuditLogEntry {
  if (!entry.action.startsWith('API Key')) return entry;

  return {
    ...entry,
    previousState: removeCredentialValue(entry.previousState),
    newState: removeCredentialValue(entry.newState),
  };
}

function removeCredentialValue(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const { key: _key, ...safeValue } = value as Record<string, unknown>;
  return safeValue;
}

