import { randomUUID } from "node:crypto";
import { Firestore, type QueryDocumentSnapshot } from "@google-cloud/firestore";
import type { Account } from "./authAuthority";
import type { DirectorySeed } from "../src/lib/directorySeed";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";
import { isPlainRecord, parseCustomFieldDefinition, validateCustomMetadata, type CustomFieldDefinition } from "../src/lib/customFields";
import { normalizeUsPhone, normalizeWebUrl } from "../src/lib/contactNormalization";
import { type HierarchyFieldContract, validateLocationHierarchyFields, validateUserPersonLink } from "../src/lib/hierarchyAssignmentContract";
import { isDeepStrictEqual } from "node:util";

export const DIRECTORY_COLLECTIONS = {
  locations: "locations",
  people: "people",
  users: "users",
  hoursTemplates: "hours_templates",
  corporateHolidays: "corporate_holidays",
  requests: "requests",
  auditLogs: "audit_logs",
  emailTemplates: "email_templates",
  notificationRules: "notification_rules",
  outboxLogs: "outbox_logs",
  sopRunbooks: "sop_runbooks",
  customFieldDefinitions: "custom_field_definitions",
} as const;

export type DirectoryCollection = typeof DIRECTORY_COLLECTIONS[keyof typeof DIRECTORY_COLLECTIONS];
export interface DirectoryWrite { collection: DirectoryCollection; id: string; operation: "set" | "delete"; data?: Record<string, unknown>; expectedDefinition?: CustomFieldDefinition | null; expectedCustomMetadata?: Record<string, unknown>; expectedVersion?: number }
export interface DirectoryAudit { action: string; entityType: string; entityId: string; entityName: string; details: string }
export interface DirectoryCommittedRecord { collection: DirectoryCollection; id: string; operation: "set" | "delete"; data: Record<string, unknown> | null }
export interface DirectoryCommitResult { records: DirectoryCommittedRecord[] }
export class DirectoryConflict extends Error {}
export class DirectoryValidationError extends Error {}
export class DirectoryWriteDenied extends Error {}

export interface DirectoryReader {
  read(): Promise<DirectorySeed>;
}

export interface DirectoryWriter {
  commit(writes: DirectoryWrite[], audit: DirectoryAudit | null, actor: Account): Promise<DirectoryCommitResult>;
}

export class FirestoreDirectoryStore implements DirectoryReader, DirectoryWriter {
  constructor(private readonly firestore: Firestore) {}

  async read(): Promise<DirectorySeed> {
    const entries = await Promise.all(Object.entries(DIRECTORY_COLLECTIONS).map(async ([field, collection]) => {
      const snapshot = await this.firestore.collection(collection).get();
      return [field, snapshot.docs.map(document => toRecord(document, collection))] as const;
    }));
    return Object.fromEntries(entries) as unknown as DirectorySeed;
  }

  async commit(writes: DirectoryWrite[], audit: DirectoryAudit | null, actor: Account): Promise<DirectoryCommitResult> {
    return this.firestore.runTransaction(async transaction => {
      const snapshots = await Promise.all(writes.map(write => transaction.get(this.firestore.collection(write.collection).doc(write.id))));
      const needsDefinitions = writes.some(write => write.collection === 'custom_field_definitions' || (write.collection === 'locations' && write.operation === 'set'));
      const definitionSnapshot = needsDefinitions ? await transaction.get(this.firestore.collection('custom_field_definitions').limit(101)) : null;
      const definitions = definitionSnapshot?.docs.map(document => parseCustomFieldDefinition({ ...document.data(), id: document.id })) || [];
      const needsRelationshipState = writes.some(write => ["locations", "people", "users", "requests"].includes(write.collection));
      const peopleSnapshot = needsRelationshipState
        ? await transaction.get(this.firestore.collection("people"))
        : null;
      const locationSnapshot = needsRelationshipState
        ? await transaction.get(this.firestore.collection("locations"))
        : null;
      const userSnapshot = needsRelationshipState
        ? await transaction.get(this.firestore.collection("users"))
        : null;

      const peopleMap = new Map<string, { id: string; fullName: string; status?: string; activeStatus?: boolean }>(
        peopleSnapshot?.docs.map(document => [
          document.id,
          {
            id: document.id,
            fullName: String(document.data().fullName || document.data().name || "Unknown Person"),
            status: document.data().status as string | undefined,
            activeStatus: document.data().activeStatus as boolean | undefined,
          },
        ]) || [],
      );

      for (const write of writes) {
        if (write.collection === "people") {
          if (write.operation === "delete") {
            peopleMap.delete(write.id);
          } else if (write.operation === "set" && write.data) {
            peopleMap.set(write.id, {
              id: write.id,
              fullName: String(write.data.fullName || write.data.name || "Unknown Person"),
              status: write.data.status as string | undefined,
              activeStatus: write.data.activeStatus as boolean | undefined,
            });
          }
        }
      }

      const combinedPeople = Array.from(peopleMap.values());
      const locations = locationSnapshot?.docs.map(document => ({ ...document.data(), id: document.id })) || [];
      const users = userSnapshot?.docs.map(document => ({ ...document.data(), id: document.id })) || [];
      const validatedWrites = validateMetadataWrites(writes, snapshots.map(snapshot => snapshot.data()), definitions, actor, combinedPeople, locations, users);
      const locationQueries = writes.filter(write => write.collection === "locations" && write.operation === "set")
        .map(write => ({ write, query: this.firestore.collection("locations").where("storeNumber", "==", write.data?.storeNumber).limit(2) }));
      const locationMatches = await Promise.all(locationQueries.map(({ query }) => transaction.get(query)));
      locationMatches.forEach((snapshot, index) => {
        const targetId = locationQueries[index].write.id;
        if (snapshot.docs.some(document => document.id !== targetId)) throw new DirectoryConflict("A location with that store number already exists.");
      });
      const userQueries = writes.filter(write => write.collection === "users" && write.operation === "set")
        .map(write => ({ write, query: this.firestore.collection("users").where("email", "==", write.data?.email).limit(2) }));
      const userMatches = await Promise.all(userQueries.map(({ query }) => transaction.get(query)));
      userMatches.forEach((snapshot, index) => {
        const targetId = userQueries[index].write.id;
        if (snapshot.docs.some(document => document.id !== targetId)) throw new DirectoryConflict("An access record with that email already exists.");
      });
      writes.forEach((write, index) => {
        if (write.collection !== "users") return;
        const current = snapshots[index].data();
        if (current?.firebaseUid === actor.uid && (write.operation === "delete" || write.data?.status !== "Active")) {
          throw new DirectoryConflict("You cannot revoke your own active directory access.");
        }
      });

      validatedWrites.forEach(write => {
        const reference = this.firestore.collection(write.collection).doc(write.id);
        if (write.operation === "delete") transaction.delete(reference);
        else transaction.set(reference, { ...write.data, id: write.id }, { merge: write.collection === "users" });
      });
      const committedRecords: DirectoryCommittedRecord[] = validatedWrites.map(write => ({
        collection: write.collection,
        id: write.id,
        operation: write.operation,
        data: write.operation === "set" ? { ...write.data, id: write.id } : null,
      }));
      if (audit) {
        const id = `aud-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const previousState = snapshots.length === 1 && snapshots[0].exists ? snapshots[0].data() : undefined;
        const nextState = validatedWrites.length === 1 && validatedWrites[0].operation === "set" ? { ...validatedWrites[0].data, id: validatedWrites[0].id } : undefined;
        const previousStates = snapshots.map((snapshot, index) => ({
          collection: validatedWrites[index].collection,
          id: validatedWrites[index].id,
          exists: snapshot.exists,
          data: snapshot.exists ? snapshot.data() : null,
        }));
        const newStates = committedRecords;
        transaction.set(this.firestore.collection("audit_logs").doc(id), {
          id,
          timestamp: new Date().toISOString(),
          userId: actor.uid,
          userName: actor.name,
          action: audit.action,
          entityType: audit.entityType,
          entityId: audit.entityId,
          entityName: audit.entityName,
          details: audit.details,
          ...(previousState ? { previousState } : {}),
          ...(nextState ? { newState: nextState } : {}),
          previousStates,
          newStates,
        });
      }
      return { records: committedRecords };
    });
  }
}

export function validateMetadataWrites(
  writes: DirectoryWrite[],
  previous: (Record<string, unknown> | undefined)[],
  definitions: CustomFieldDefinition[],
  actor: Account,
  people: Array<{ id: string; fullName: string; status?: string; activeStatus?: boolean }> = [],
  locations: Array<Record<string, unknown>> = [],
  users: Array<Record<string, unknown>> = [],
): DirectoryWrite[] {
  if (new Set(writes.map(write => `${write.collection}/${write.id}`)).size !== writes.length) throw new DirectoryValidationError('Duplicate writes are not allowed.');
  if (writes.some(write => write.collection === 'custom_field_definitions') && writes.length !== 1) throw new DirectoryValidationError('Save one custom field definition at a time.');

  const peopleMap = new Map<string, { id: string; fullName: string; status?: string; activeStatus?: boolean }>(
    people.map(p => [
      p.id,
      {
        id: p.id,
        fullName: p.fullName || "Unknown Person",
        status: p.status,
        activeStatus: p.activeStatus,
      },
    ]),
  );

  for (const write of writes) {
    if (write.collection === "people") {
      if (write.operation === "delete") {
        peopleMap.delete(write.id);
      } else if (write.operation === "set" && write.data) {
        peopleMap.set(write.id, {
          id: write.id,
          fullName: String(write.data.fullName || write.data.name || "Unknown Person"),
          status: write.data.status as string | undefined,
          activeStatus: write.data.activeStatus as boolean | undefined,
        });
      }
    }
  }

  const combinedPeople = Array.from(peopleMap.values());

  const validatedWrites = writes.map((write, index) => {
    const current = previous[index];

    const expectedVer = write.expectedVersion ?? (typeof write.data?.expectedVersion === "number" ? write.data.expectedVersion : undefined);
    if (current && ['locations', 'people', 'users', 'requests'].includes(write.collection)) {
      if (expectedVer === undefined) {
        throw new DirectoryConflict("Record changed concurrently. Reload the directory before saving.");
      }
      const currentVersion = typeof current.version === "number" ? current.version : 0;
      if (currentVersion !== expectedVer) {
        throw new DirectoryConflict("Record changed concurrently. Reload the directory before saving.");
      }
    }
    if (!current && expectedVer !== undefined && expectedVer !== 0) {
      throw new DirectoryConflict("Record changed concurrently. Reload the directory before saving.");
    }

    if (write.collection === 'custom_field_definitions') {
      if (actor.role !== 'System Administrator') throw new DirectoryWriteDenied('Only system administrators can define custom fields.');
      if (write.operation !== 'set') throw new DirectoryValidationError('Retire custom fields instead of deleting them.');
      if (!Object.hasOwn(write, 'expectedDefinition') || !isDeepStrictEqual(write.expectedDefinition, current ? parseCustomFieldDefinition(current) : null)) {
        throw new DirectoryConflict('This field definition changed. Reload the directory before saving.');
      }
      let definition: CustomFieldDefinition;
      try { definition = parseCustomFieldDefinition(write.data); }
      catch (error) { throw new DirectoryValidationError((error as Error).message); }
      if (definition.id !== write.id) throw new DirectoryValidationError('The field key cannot change.');
      if (!current && definitions.length >= 100) throw new DirectoryValidationError('The directory supports up to 100 custom field definitions, including retired fields.');
      if (current && (definition.type !== current.type || (current.options as string[]).some(option => !definition.options.includes(option)))) {
        throw new DirectoryValidationError('Field types and existing choices cannot change. Retire the field and create a new one.');
      }
      return { ...write, data: { ...definition } };
    }

    if (write.operation !== 'set' || !['locations', 'people', 'users', 'requests'].includes(write.collection)) return write;
    const data = { ...write.data };

    if (current || write.expectedVersion !== undefined || typeof data.version === 'number') {
      data.version = ((current?.version as number) || 0) + 1;
      data.updatedAt = new Date().toISOString();
    }

    if (write.collection === 'requests') {
      if (data.status === 'Approved' && current?.status === 'Approved') {
        throw new DirectoryConflict('Request has already been approved.');
      }
      if (data.status === 'Approved') {
        if (!current) throw new DirectoryConflict('Request changed concurrently. Reload the directory before saving.');
        const targetType = String(current.targetType || '');
        const targetId = String(current.targetId || '');
        if (String(data.targetType || '') !== targetType || String(data.targetId || '') !== targetId) {
          throw new DirectoryValidationError('Approved correction requests must use the persisted request target.');
        }
        const targetCollection = targetType === 'Location' ? 'locations' : targetType === 'Person' ? 'people' : '';
        const targetWrite = writes.find(candidate => candidate.collection === targetCollection && candidate.id === targetId && candidate.operation === 'set');
        if (!targetWrite) {
          throw new DirectoryValidationError('Approved correction requests must save the target record in the same transaction.');
        }
        const targetPrevious = previous[writes.indexOf(targetWrite)];
        assertApprovalTargetAppliesPersistedChanges(current, targetWrite, targetPrevious);
      }
      return { ...write, data };
    }

    normalizePhoneWrite(data, current, 'phone', 'phoneExtension', write.collection === 'locations');

    if (write.collection === 'locations') {
      const hierarchyTouched = ['type', 'hierarchyApplicability', 'regionId', 'districtId'].some(field => Object.hasOwn(write.data || {}, field) && !isDeepStrictEqual(write.data?.[field], current?.[field]));
      const preserveField = (field: string) => {
        if (!Object.hasOwn(data, field) && current && Object.hasOwn(current, field)) {
          data[field] = current[field];
        }
      };
      [
        'hierarchyApplicability',
        'regionId',
        'districtId',
        'storeManagerId',
        'districtManagerId',
        'regionalManagerId',
        'assistantStoreManagerIds',
        'keyHolderIds',
      ].forEach(preserveField);

      const hierarchyApplicability = data.hierarchyApplicability ?? current?.hierarchyApplicability;
      const normalizedApplicability = hierarchyApplicability === 'Applicable' || hierarchyApplicability === 'Not Applicable' || hierarchyApplicability === 'Unknown'
        ? hierarchyApplicability
        : undefined;

      const hierarchyInput: HierarchyFieldContract = {
        type: String(data.type ?? current?.type ?? 'Street / Standalone Location'),
        hierarchyApplicability: hierarchyTouched ? normalizedApplicability : undefined,
        regionId: hierarchyTouched && typeof data.regionId === 'string' && data.regionId.trim() ? data.regionId : undefined,
        districtId: hierarchyTouched && typeof data.districtId === 'string' && data.districtId.trim() ? data.districtId : undefined,
        storeManagerId: typeof data.storeManagerId === 'string' && data.storeManagerId.trim() ? data.storeManagerId : undefined,
        assistantStoreManagerIds: Array.isArray(data.assistantStoreManagerIds)
          ? data.assistantStoreManagerIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          : undefined,
        keyHolderIds: Array.isArray(data.keyHolderIds)
          ? data.keyHolderIds.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          : undefined,
        districtManagerId: typeof data.districtManagerId === 'string' && data.districtManagerId.trim() ? data.districtManagerId : undefined,
        regionalManagerId: typeof data.regionalManagerId === 'string' && data.regionalManagerId.trim() ? data.regionalManagerId : undefined,
      };

      const hierarchyIssues = validateLocationHierarchyFields(hierarchyInput);
      if (hierarchyIssues.length > 0) {
        throw new DirectoryValidationError(hierarchyIssues.join('; '));
      }

      const leadershipRefs = [
        ['storeManagerId', hierarchyInput.storeManagerId],
        ['districtManagerId', hierarchyInput.districtManagerId],
        ['regionalManagerId', hierarchyInput.regionalManagerId],
        ...((hierarchyInput.assistantStoreManagerIds || []).map(id => ['assistantStoreManagerIds', id] as const)),
        ...((hierarchyInput.keyHolderIds || []).map(id => ['keyHolderIds', id] as const)),
      ] as const;

      for (const [field, id] of leadershipRefs) {
        if (!id) continue;
        const personMatch = combinedPeople.find(p => p.id === id);
        if (!personMatch) {
          throw new DirectoryValidationError(`${field} references missing person ${id}.`);
        }
        if ((personMatch.status && personMatch.status !== "Active") || personMatch.activeStatus === false) {
          throw new DirectoryValidationError(`${field} references inactive person ${personMatch.fullName} (${id}).`);
        }
      }
    }

    if (write.collection === 'people') {
      normalizePhoneWrite(data, current, 'workPhone', 'workPhoneExtension');
      if (Object.hasOwn(data, 'personId')) {
        try {
          validateUserPersonLink(typeof data.personId === 'string' ? data.personId : undefined, combinedPeople);
        } catch (error) {
          throw new DirectoryValidationError((error as Error).message);
        }
      }
      return { ...write, data };
    }

    if (write.collection === 'users') {
      const personId = Object.hasOwn(data, 'personId') && typeof data.personId === 'string' ? data.personId : undefined;
      try {
        validateUserPersonLink(personId, combinedPeople);
      } catch (error) {
        throw new DirectoryValidationError((error as Error).message);
      }
      return { ...write, data };
    }

    const existing = isPlainRecord(current?.customMetadata) ? current.customMetadata : {};
    const supplied = Object.hasOwn(data, 'customMetadata') ? data.customMetadata : existing;
    const changed = !isDeepStrictEqual(supplied, existing);
    if (changed) {
      if (!['System Administrator', 'Directory Data Steward', 'Editor'].includes(actor.role)) throw new DirectoryWriteDenied('Your role cannot edit location metadata.');
      const companyScope = ['Company', 'Company-wide'].includes(actor.accessScope);
      const storeScope = actor.accessScope.match(/^Store ([0-9]+)$/)?.[1];
      if (!companyScope && (!storeScope || storeScope !== data.storeNumber || (current && storeScope !== current.storeNumber))) {
        throw new DirectoryWriteDenied('Your access scope does not permit metadata changes for this store.');
      }
      if (!isDeepStrictEqual(write.expectedCustomMetadata, existing)) throw new DirectoryConflict('Custom metadata changed. Reload the directory before saving.');
    }
    for (const key of ['googleReviewUrl', 'storePageUrl']) {
      if (data[key] !== undefined && data[key] !== '' && data[key] !== current?.[key]) {
        const normalized = normalizeWebUrl(data[key]);
        if (!normalized) throw new DirectoryValidationError(`${key} must be an HTTP or HTTPS URL without credentials.`);
        data[key] = normalized;
      }
    }
    try {
      if (changed) data.customMetadata = validateCustomMetadata(supplied, definitions, existing);
      else if (Object.hasOwn(data, 'customMetadata') || Object.keys(existing).length > 0) data.customMetadata = supplied as Record<string, unknown>;
    } catch (error) { throw new DirectoryValidationError((error as Error).message); }
    return { ...write, data };
  });

  validateCombinedRelationshipState(validatedWrites, locations, combinedPeople, users);
  return validatedWrites;
}

function assertApprovalTargetAppliesPersistedChanges(
  persistedRequest: Record<string, unknown>,
  targetWrite: DirectoryWrite,
  targetPrevious: Record<string, unknown> | undefined,
): void {
  if (!targetPrevious) throw new DirectoryConflict('Request target changed concurrently. Reload the directory before saving.');
  const requestedChanges = isPlainRecord(persistedRequest.requestedChanges) ? persistedRequest.requestedChanges : {};
  const targetData = targetWrite.data || {};
  const changedEntries = Object.entries(requestedChanges).filter(([key, value]) => !isDeepStrictEqual(targetPrevious[key], value));
  if (changedEntries.length === 0) {
    throw new DirectoryValidationError('Approved correction request does not change the target record.');
  }
  for (const [key, value] of changedEntries) {
    if (!Object.hasOwn(targetData, key) || !isDeepStrictEqual(targetData[key], value)) {
      throw new DirectoryValidationError('Approved correction request target update does not match the persisted requested changes.');
    }
  }
}

function validateCombinedRelationshipState(
  writes: DirectoryWrite[],
  currentLocations: Array<Record<string, unknown>>,
  people: Array<{ id: string; fullName: string; status?: string; activeStatus?: boolean }>,
  users: Array<Record<string, unknown>>,
): void {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const locationsById = new Map(currentLocations.map(location => [String(location.id), { ...location }]));
  const writtenLocationIds = new Set(writes.filter(write => write.collection === 'locations').map(write => write.id));
  const changedPersonIds = new Set(writes.filter(write => write.collection === 'people').map(write => write.id));

  for (const write of writes) {
    if (write.collection !== 'locations') continue;
    if (write.operation === 'delete') locationsById.delete(write.id);
    else if (write.data) locationsById.set(write.id, { ...write.data, id: write.id });
  }

  for (const location of locationsById.values()) {
    const locationId = String(location.id);
    const leadershipRefs = [
      ['storeManagerId', location.storeManagerId],
      ['districtManagerId', location.districtManagerId],
      ['regionalManagerId', location.regionalManagerId],
      ...(Array.isArray(location.assistantStoreManagerIds) ? location.assistantStoreManagerIds.map(id => ['assistantStoreManagerIds', id] as const) : []),
      ...(Array.isArray(location.keyHolderIds) ? location.keyHolderIds.map(id => ['keyHolderIds', id] as const) : []),
    ] as const;
    const affectedByChangedPerson = leadershipRefs.some(([, id]) => typeof id === 'string' && changedPersonIds.has(id));
    if (!writtenLocationIds.has(locationId) && !affectedByChangedPerson) continue;

    for (const [field, id] of leadershipRefs) {
      if (typeof id !== 'string' || !id.trim()) continue;
      const person = peopleById.get(id);
      if (!person) throw new DirectoryValidationError(`${field} references missing person ${id}.`);
      if ((person.status && person.status !== 'Active') || person.activeStatus === false) {
        throw new DirectoryValidationError(`${field} references inactive person ${person.fullName} (${id}).`);
      }
    }
  }

  for (const write of writes) {
    if (write.collection !== 'people') continue;
    const nextPerson = peopleById.get(write.id);
    const deletingOrInactive = !nextPerson || (nextPerson.status && nextPerson.status !== 'Active') || nextPerson.activeStatus === false;
    if (!deletingOrInactive) continue;
    const incomingLinks = users.filter(user => user.personId === write.id);
    if (incomingLinks.length > 0) {
      const unresolvedLinks = incomingLinks.filter(user => !writes.some(candidate => candidate.collection === 'users' && candidate.id === user.id && candidate.operation === 'set' && candidate.data && Object.hasOwn(candidate.data, 'personId') && !candidate.data.personId));
      if (unresolvedLinks.length > 0) {
        throw new DirectoryValidationError(`Person ${write.id} has linked user account records that must be unlinked or reviewed before inactivation/deletion.`);
      }
    }
  }
}

function normalizePhoneWrite(data: Record<string, unknown>, current: Record<string, unknown> | undefined, field: string, extensionField: string, required = false) {
  if (!Object.hasOwn(data, field)) return;
  const value = data[field];
  if (value === current?.[field] && data[extensionField] === current?.[extensionField]) return;
  if (value === '' && !required) {
    delete data[extensionField];
    return;
  }
  const normalized = normalizeUsPhone(value);
  if (!normalized) throw new DirectoryValidationError(`${field} must be a valid US phone number.`);
  data[field] = normalized.e164;
  if (normalized.extension) data[extensionField] = normalized.extension;
  else delete data[extensionField];
}

export function createFirestoreDirectoryStore(): FirestoreDirectoryStore {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === "(default)") throw new Error("A named Firestore database is required.");
  return new FirestoreDirectoryStore(new Firestore({ projectId, databaseId }));
}

function toRecord(snapshot: QueryDocumentSnapshot, collection: DirectoryCollection) {
  const data = snapshot.data();
  if (collection === "users") return {
    id: snapshot.id,
    version: data.version,
    name: data.name || data.displayName || data.email || "Directory user",
    email: data.email || "",
    role: data.role,
    status: data.status,
    accessScope: data.accessScope,
    personId: data.personId,
    storeNumber: data.storeNumber || data.assignedStoreId,
    identityLinked: Boolean(data.firebaseUid),
    firebaseIdentityProvisioned: Boolean(data.firebaseIdentityProvisioned || data.firebaseUid),
    invitationStatus: data.invitationStatus,
    invitationDelivery: data.invitationDelivery,
    invitationDeliveryStatus: data.invitationDeliveryStatus,
    invitedAt: data.invitedAt,
    lastLogin: data.lastLogin,
  };
  return { ...data, id: snapshot.id };
}