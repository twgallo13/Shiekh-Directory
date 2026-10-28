import { createHash, randomUUID } from "node:crypto";
import { Firestore, type QueryDocumentSnapshot } from "@google-cloud/firestore";
import type { Account } from "./authAuthority";
import type { DirectorySeed } from "../src/lib/directorySeed";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";
import { isPlainRecord, parseCustomFieldDefinition, validateCustomMetadata, type CustomFieldDefinition } from "../src/lib/customFields";
import { normalizeUsPhone } from "../src/lib/contactNormalization";
import { type HierarchyFieldContract, type HierarchyRegistry, validateLocationHierarchyFields, validateUserPersonLink } from "../src/lib/hierarchyAssignmentContract";
import { normalizeLocationWriteValues } from "../src/lib/locationWriteContract";
import { locationInboxConflictDigest, normalizeLocationInboxEmail, normalizePersonEmail, type LocationInboxAcknowledgment, type LocationInboxConflictMember } from "../src/lib/locationInboxEmail";
import { isDeepStrictEqual } from "node:util";
import { applyCorrection } from '../src/lib/correctionRequest';
import { validateRequestProposal } from '../src/lib/requestValidation';
import { personLifecycle } from '../src/lib/personLifecycle';
import { sharedPersonEmailKind } from '../src/lib/personInboxResponsibilities';
import { validatePersonPositionState } from './personPositionValidation';
import { allowsLeadershipPosition } from '../src/lib/personPositions';
import { isRetailHierarchyType } from '../src/lib/hierarchyResolution';
import { assertDistrictHandoverAuditSize, validateDistrictLeadershipState } from './districtLeadership';
import { readOrganizationGuardState, validateOrganizationLeadershipWrites } from './organizationLeadershipGuards';
import { readPersonTransitionAuthority } from './personTransitionAuthority';
import { normalizeLocationCreationCommand, assertLocationCreationActor, prepareLocationCreation, readLocationCreation, cancelLocationCreation, listLocationCreations, readLocationCreationCommit, finishLocationCreationCommit, locationCreationAuditId, type LocationCreationCommand } from './locationCreationRecovery';
import { organizationLeadershipCapabilities, requireOrganizationLeadershipAdmission } from './organizationLeadershipConfiguration';
import { readOrganizationCatalog } from './organizationLeadershipCatalog';
import { prepareOrganizationLeadership, commitOrganizationLeadership, readOrganizationLeadershipOperation, cancelOrganizationLeadershipOperation, listOrganizationLeadershipOperations } from './organizationLeadershipOperations';
import { prepareOrganizationMove, commitOrganizationMove, readOrganizationMoveOperation, cancelOrganizationMoveOperation, listOrganizationMoveOperations } from './organizationMoveOperations';
import { previewOperating, commitOperating, cancelOperating, type OperatingPreview } from './firestoreOperating';
import { previewPersonTransition } from './personTransitionPreview';
import { previewPersonTransitionCommand } from './personTransitionCommandPreview';
import { loadPersonTransitionReviewSigner } from './personTransitionReviewEnvelope';
import { personTransitionCapabilities, requirePersonTransitionAdmission } from './personTransitionConfiguration';
import { preparePersonTransitionRecovery, readPersonTransitionRecovery, cancelPersonTransitionRecovery, listPersonTransitionPreparations } from './firestorePersonTransitionRecovery';
import { commitPersonTransitionAtomic } from './firestorePersonTransitionAtomic';
import {
  LOCATION_IMPORT_MAX_ATOMIC_BYTES,
  digestLocationImportManifest,
  expiredConfirmation,
  type LocationImportManifest,
  type LocationImportReceipt,
} from "./locationImportConfirmation";

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
  regions: "regions",
  districts: "districts",
} as const;

export type DirectoryCollection = typeof DIRECTORY_COLLECTIONS[keyof typeof DIRECTORY_COLLECTIONS];
export interface DirectoryWrite { collection: DirectoryCollection; id: string; operation: "set" | "delete"; data?: Record<string, unknown>; expectedDefinition?: CustomFieldDefinition | null; expectedCustomMetadata?: Record<string, unknown>; expectedVersion?: number | null; locationInboxAcknowledgment?: LocationInboxAcknowledgment; districtLeadershipMembers?: import('../src/lib/districtLeadership').DistrictLeadershipMember[] }
export interface DirectoryAudit { action: string; entityType: string; entityId: string; entityName: string; details: string }
export interface DirectoryCommittedRecord { collection: DirectoryCollection; id: string; operation: "set" | "delete"; data: Record<string, unknown> | null }
export interface DirectoryCommitResult { records: DirectoryCommittedRecord[]; replayed?: boolean }
export class DirectoryConflict extends Error {}
export interface DirectoryDependency {
  type: 'Location' | 'District';
  id: string;
  name: string;
  storeNumber?: string;
  href?: string;
}
export class DirectoryValidationError extends Error {
  constructor(message: string, public readonly details?: { dependencies?: DirectoryDependency[]; correction?: string }) {
    super(message);
  }
}
export class DirectoryWriteDenied extends Error {}
export class LocationImportIdempotencyConflict extends Error {}
export class LocationImportPayloadTooLarge extends Error {}

type RelationshipPerson = {
  positionIds?: unknown;
  id: string;
  fullName: string;
  status?: string;
  activeStatus?: boolean;
  phone?: string;
  workPhone?: string;
  primaryLocationId?: unknown;
  supportedLocationIds?: unknown;
};

export interface DirectoryReader {
  read(): Promise<DirectorySeed>;
}

export interface DirectoryWriter {
  locationCreationCapabilities?(): ReturnType<typeof organizationLeadershipCapabilities>;
  prepareLocationCreation?(input: unknown, actor: Account): ReturnType<typeof prepareLocationCreation>;
  commitLocationCreation?(input: unknown, actor: Account): ReturnType<typeof readLocationCreation>;
  readLocationCreation?(input: unknown, actor: Account): ReturnType<typeof readLocationCreation>;
  cancelLocationCreation?(input: unknown, actor: Account): ReturnType<typeof cancelLocationCreation>;
  listLocationCreations?(actor: Account): ReturnType<typeof listLocationCreations>;
  organizationLeadershipCapabilities?(): ReturnType<typeof organizationLeadershipCapabilities>;
  readOrganizationCatalog?(actor: Account): ReturnType<typeof readOrganizationCatalog>;
  prepareOrganizationLeadership?(input: unknown, actor: Account): ReturnType<typeof prepareOrganizationLeadership>;
  commitOrganizationLeadership?(input: unknown, actor: Account): ReturnType<typeof commitOrganizationLeadership>;
  readOrganizationLeadershipOperation?(input: unknown, actor: Account): ReturnType<typeof readOrganizationLeadershipOperation>;
  cancelOrganizationLeadershipOperation?(input: unknown, actor: Account): ReturnType<typeof cancelOrganizationLeadershipOperation>;
  listOrganizationLeadershipOperations?(actor: Account): ReturnType<typeof listOrganizationLeadershipOperations>;
  organizationMoveCapabilities?(): ReturnType<typeof organizationLeadershipCapabilities>;
  readOrganizationMoveCatalog?(actor: Account): ReturnType<typeof readOrganizationCatalog>;
  prepareOrganizationMove?(input: unknown, actor: Account): ReturnType<typeof prepareOrganizationMove>;
  commitOrganizationMove?(input: unknown, actor: Account): ReturnType<typeof commitOrganizationMove>;
  readOrganizationMoveOperation?(input: unknown, actor: Account): ReturnType<typeof readOrganizationMoveOperation>;
  cancelOrganizationMoveOperation?(input: unknown, actor: Account): ReturnType<typeof cancelOrganizationMoveOperation>;
  listOrganizationMoveOperations?(actor: Account): ReturnType<typeof listOrganizationMoveOperations>;
  personTransitionCapabilities?(): ReturnType<typeof personTransitionCapabilities>;
  preparePersonTransitionCommand?(command: unknown, actor: Account): ReturnType<typeof preparePersonTransitionRecovery>;
  commitPersonTransitionCommand?(command: unknown, actor: Account): ReturnType<typeof commitPersonTransitionAtomic>;
  readPersonTransitionOperation?(marker: unknown, actor: Account): ReturnType<typeof readPersonTransitionRecovery>;
  cancelPersonTransitionOperation?(marker: unknown, actor: Account): ReturnType<typeof cancelPersonTransitionRecovery>;
  listPersonTransitionOperations?(actor: Account): ReturnType<typeof listPersonTransitionPreparations>;
  previewPersonTransitionCommand?(intent: unknown, actor: Account): ReturnType<typeof previewPersonTransitionCommand>;
  previewPersonTransition?(personId: string, actor: Account): ReturnType<typeof previewPersonTransition>;
  readOperatingDirectory?(): Promise<Pick<DirectorySeed, 'locations' | 'people' | 'hoursTemplates' | 'regions' | 'districts' | 'serverNow'>>;
  commit(writes: DirectoryWrite[], audit: DirectoryAudit | null, actor: Account): Promise<DirectoryCommitResult>;
  cancelRequestSubmission?(write: DirectoryWrite, actor: Account): Promise<DirectoryCommitResult & { cancelled: boolean }>;
  previewOperating?(locationId: string, action: string, actor: Account): Promise<OperatingPreview>;
  commitOperating?(input: unknown, actor: Account): ReturnType<typeof commitOperating>;
  cancelOperating?(input: unknown, actor: Account): ReturnType<typeof cancelOperating>;
}

export class FirestoreDirectoryStore implements DirectoryReader, DirectoryWriter {
  constructor(private readonly firestore: Firestore) {}

  organizationLeadershipCapabilities() { return organizationLeadershipCapabilities(); }
  readOrganizationCatalog(actor: Account) { requireOrganizationLeadershipAdmission('catalog'); return readOrganizationCatalog(this.firestore, actor); }
  prepareOrganizationLeadership(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('command'); return prepareOrganizationLeadership(this.firestore, input, actor); }
  commitOrganizationLeadership(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('command'); return commitOrganizationLeadership(this.firestore, input, actor); }
  readOrganizationLeadershipOperation(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('recovery'); return readOrganizationLeadershipOperation(this.firestore, input, actor); }
  cancelOrganizationLeadershipOperation(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('recovery'); return cancelOrganizationLeadershipOperation(this.firestore, input, actor); }
  listOrganizationLeadershipOperations(actor: Account) { requireOrganizationLeadershipAdmission('recovery'); return listOrganizationLeadershipOperations(this.firestore, actor); }
  organizationMoveCapabilities() { return organizationLeadershipCapabilities(); }
  readOrganizationMoveCatalog(actor: Account) { requireOrganizationLeadershipAdmission('catalog'); return readOrganizationCatalog(this.firestore, actor); }
  prepareOrganizationMove(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('command'); return prepareOrganizationMove(this.firestore, input, actor); }
  commitOrganizationMove(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('command'); return commitOrganizationMove(this.firestore, input, actor); }
  readOrganizationMoveOperation(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('recovery'); return readOrganizationMoveOperation(this.firestore, input, actor); }
  cancelOrganizationMoveOperation(input: unknown, actor: Account) { requireOrganizationLeadershipAdmission('recovery'); return cancelOrganizationMoveOperation(this.firestore, input, actor); }
  listOrganizationMoveOperations(actor: Account) { requireOrganizationLeadershipAdmission('recovery'); return listOrganizationMoveOperations(this.firestore, actor); }

  personTransitionCapabilities() { return personTransitionCapabilities(); }
  preparePersonTransitionCommand(command: unknown, actor: Account) { requirePersonTransitionAdmission('command'); return preparePersonTransitionRecovery(this.firestore, command, actor, loadPersonTransitionReviewSigner()); }
  commitPersonTransitionCommand(command: unknown, actor: Account) { requirePersonTransitionAdmission('command'); return commitPersonTransitionAtomic(this.firestore, command, actor, loadPersonTransitionReviewSigner()); }
  readPersonTransitionOperation(marker: unknown, actor: Account) { requirePersonTransitionAdmission('recovery'); return readPersonTransitionRecovery(this.firestore, marker, actor); }
  cancelPersonTransitionOperation(marker: unknown, actor: Account) { requirePersonTransitionAdmission('recovery'); return cancelPersonTransitionRecovery(this.firestore, marker, actor); }
  listPersonTransitionOperations(actor: Account) { requirePersonTransitionAdmission('recovery'); return listPersonTransitionPreparations(this.firestore, actor); }

  previewPersonTransition(personId: string, actor: Account) { return previewPersonTransition(this.firestore, personId, actor); }
  previewPersonTransitionCommand(intent: unknown, actor: Account) { return previewPersonTransitionCommand(this.firestore, intent, actor, loadPersonTransitionReviewSigner()); }

  async read(): Promise<DirectorySeed> {
    const entries = await Promise.all(Object.entries(DIRECTORY_COLLECTIONS).map(async ([field, collection]) => {
      const snapshot = await this.firestore.collection(collection).get();
      return [field, snapshot.docs.map(document => toRecord(document, collection))] as const;
    }));
    return { ...Object.fromEntries(entries), serverNow: new Date().toISOString() } as unknown as DirectorySeed;
  }

  /** Bounded coherent business-state refresh: never scans growing request/audit/outbox histories. */
  async readOperatingDirectory() {
    const limits = { locations: 1000, people: 5000, hoursTemplates: 100, regions: 100, districts: 500 } as const;
    return this.firestore.runTransaction(async transaction => {
      const entries = await Promise.all(Object.entries(limits).map(async ([field, maximum]) => {
        const collection = DIRECTORY_COLLECTIONS[field as keyof typeof limits];
        const snapshot = await transaction.get(this.firestore.collection(collection).limit(maximum + 1));
        if (snapshot.size > maximum) throw new Error('Operating refresh capacity exceeded; retain existing state and use explicit reconciliation.');
        return [field, snapshot.docs.map(document => toRecord(document, collection))] as const;
      }));
      return { ...Object.fromEntries(entries), serverNow: new Date().toISOString() } as Pick<DirectorySeed, 'locations' | 'people' | 'hoursTemplates' | 'regions' | 'districts' | 'serverNow'>;
    }, { readOnly: true });
  }

  previewOperating(locationId: string, action: string, actor: Account) { return previewOperating(this.firestore, locationId, action, actor); }
  commitOperating(input: unknown, actor: Account) { return commitOperating(this.firestore, input, actor); }
  cancelOperating(input: unknown, actor: Account) { return cancelOperating(this.firestore, input, actor); }

  locationCreationCapabilities() { return organizationLeadershipCapabilities(); }
  prepareLocationCreation(input: unknown, actor: Account) { return prepareLocationCreation(this.firestore, input, actor); }
  readLocationCreation(input: unknown, actor: Account) { return readLocationCreation(this.firestore, input, actor); }
  cancelLocationCreation(input: unknown, actor: Account) { return cancelLocationCreation(this.firestore, input, actor); }
  listLocationCreations(actor: Account) { return listLocationCreations(this.firestore, actor); }
  async commitLocationCreation(input: unknown, actor: Account) {
    const command = normalizeLocationCreationCommand(input);
    await this.commit([command.write], null, actor, command);
    return readLocationCreation(this.firestore, { locationId: command.write.id }, actor);
  }

  async commit(writes: DirectoryWrite[], audit: DirectoryAudit | null, actor: Account, creationCommand?: LocationCreationCommand): Promise<DirectoryCommitResult> {
    if (creationCommand) {
      requireOrganizationLeadershipAdmission('command'); assertLocationCreationActor(actor);
      creationCommand = normalizeLocationCreationCommand(creationCommand);
      if (writes.length !== 1 || !isDeepStrictEqual(writes[0], creationCommand.write)) throw new DirectoryValidationError('Creation proof must match the exact single create-only write.');
      writes = [structuredClone(creationCommand.write)];
    }
    return this.firestore.runTransaction(async transaction => {
      const creation = creationCommand ? await readLocationCreationCommit(this.firestore, transaction, creationCommand, actor) : null;
      if (creation?.replayed) return { records: [], replayed: true };
      const snapshots = await Promise.all(writes.map(write => transaction.get(this.firestore.collection(write.collection).doc(write.id))));
      // The request itself is the durable receipt. Retained after review and never deleted.
      const submission = writes.length === 1 && writes[0].collection === 'requests' && writes[0].operation === 'set' && writes[0].data?.status === 'Pending';
      const digest = submission ? submissionDigest(writes[0].data!) : undefined;
      const candidates = writes.filter(write => write.collection === 'requests' && write.operation === 'set' && write.data?.status === 'Pending');
      const cancellations = await Promise.all(candidates.map(write => transaction.get(this.firestore.collection('request_submission_receipts').doc(write.id))));
      if (cancellations.some(receipt => receipt.exists)) throw new DirectoryConflict('This submission was safely cancelled. Start a new proposal with a new submission ID.');
      if (submission && snapshots[0].exists) {
        const saved = snapshots[0].data()!;
        if (saved.submissionActor !== actor.uid || saved.submissionDigest !== digest) throw new DirectoryConflict('This submission ID is already used for different content or another actor. Reload saved requests.');
        return { records: [{ collection: 'requests', id: writes[0].id, operation: 'set', data: { ...saved, id: writes[0].id } }], replayed: true };
      }
      const needsDefinitions = writes.some(write => write.collection === 'custom_field_definitions' || (write.collection === 'locations' && write.operation === 'set'));
      const definitionSnapshot = needsDefinitions ? await transaction.get(this.firestore.collection('custom_field_definitions').limit(101)) : null;
      const definitions = definitionSnapshot?.docs.map(document => parseCustomFieldDefinition({ ...document.data(), id: document.id })) || [];
      const needsRelationshipState = writes.some(write => ["locations", "people", "users", "requests", "regions", "districts"].includes(write.collection));
      const peopleSnapshot = needsRelationshipState
        ? await transaction.get(this.firestore.collection("people"))
        : null;
      const locationSnapshot = needsRelationshipState
        ? await transaction.get(this.firestore.collection("locations"))
        : null;
      const userSnapshot = needsRelationshipState
        ? await transaction.get(this.firestore.collection("users"))
        : null;
      const hierarchySnapshot = needsRelationshipState
        ? await Promise.all([
          transaction.get(this.firestore.collection("regions")),
          transaction.get(this.firestore.collection("districts")),
        ])
        : null;

      const people: RelationshipPerson[] = peopleSnapshot?.docs.map(document => ({
        ...document.data(),
        id: document.id,
        fullName: String(document.data().fullName || document.data().name || "Unknown Person"),
      })) || [];
      const locations = locationSnapshot?.docs.map(document => ({ ...document.data(), id: document.id })) || [];
      const users = userSnapshot?.docs.map(document => ({ ...document.data(), id: document.id })) || [];
      const hierarchyRegistry: HierarchyRegistry = {
        regions: hierarchySnapshot?.[0].docs.map(document => ({ id: document.id, name: String(document.data().name || ""), status: document.data().status })) || [],
        districts: hierarchySnapshot?.[1].docs.map(document => ({ ...document.data(), id: document.id, name: String(document.data().name || ""), regionId: String(document.data().regionId || ""), status: document.data().status })) || [],
      };
      const organizationState = await readOrganizationGuardState(this.firestore, transaction, [
        ...(hierarchySnapshot?.[0].docs.map(document => ({ unitType: 'region' as const, id: document.id, data: document.data() })) || []),
        ...(hierarchySnapshot?.[1].docs.map(document => ({ unitType: 'district' as const, id: document.id, data: document.data() })) || []),
      ]);
      const managedUnitEdit = writes.some(write => (write.collection === 'regions' || write.collection === 'districts')
        && organizationState.units.some(unit => unit.unitType === (write.collection === 'regions' ? 'region' : 'district') && unit.id === write.id && unit.data.leadershipModelVersion === 1));
      if (managedUnitEdit) await readPersonTransitionAuthority(this.firestore, transaction, actor);
      applyHierarchyRegistryWrites(hierarchyRegistry, writes);
      const validatedWrites = validateMetadataWrites(writes, snapshots.map(snapshot => snapshot.data()), definitions, actor, people, locations, users, hierarchyRegistry);
      if (creation && (validatedWrites.length !== 1 || validatedWrites[0].data?.version !== 1)) throw new DirectoryValidationError('Creation must save exactly the initial Location version.');
      const managedRename = validateOrganizationLeadershipWrites(validatedWrites, snapshots.map(snapshot => snapshot.data()), organizationState, people, locations);
      if (managedRename) await readPersonTransitionAuthority(this.firestore, transaction, actor);
      validatedWrites.forEach((write, index) => {
        if (write.collection === 'requests' && write.operation === 'set' && !snapshots[index].exists) Object.assign(write.data!, { submissionDigest: submissionDigest(writes[index].data!), submissionActor: actor.uid });
      });
      const acknowledgedInboxConflicts = validateLocationInboxConflicts(validatedWrites, locations);
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
      const requestWrite = validatedWrites.find(write => write.collection === 'requests');
      const managedWrite = managedUnitEdit ? validatedWrites[0] : undefined;
      const storedAudit = creation ? {
        action: 'Location Created', entityType: 'Location', entityId: validatedWrites[0].id, entityName: String(validatedWrites[0].data?.name || validatedWrites[0].id),
        details: 'Server-confirmed create-only Location with actor-bound recovery. Staffing and app access were not granted.',
      } : managedRename ? {
        action: 'Manager Name Updated', entityType: 'Person', entityId: managedRename.personId, entityName: managedRename.fullName,
        details: `Server-confirmed name-only update with ${managedRename.affectedLocations} matching Location display-name records. Staffing, contacts and access were preserved.`,
      } : managedWrite ? {
        action: 'Hierarchy Registry Updated', entityType: managedWrite.collection === 'regions' ? 'Region' : 'District',
        entityId: managedWrite.id, entityName: String(managedWrite.data?.name || managedWrite.id),
        details: 'Server-confirmed managed unit name/status update. IDs, hierarchy membership and leadership responsibilities were preserved.',
      } : requestWrite ? {
        action: requestWrite.data?.status === 'Approved' ? 'Request Approved' : requestWrite.data?.status === 'Rejected' ? 'Request Rejected' : 'Request Submitted',
        entityType: 'Request', entityId: requestWrite.id, entityName: String(requestWrite.data?.changeType || 'Correction'),
        details: `Server-confirmed ${String(requestWrite.data?.status)} correction for ${String(requestWrite.data?.targetName || requestWrite.data?.targetId || requestWrite.id)}.`,
      } : audit;
      if (storedAudit) {
        const id = creation ? locationCreationAuditId(actor, validatedWrites[0].id) : `aud-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const previousState = snapshots.length === 1 && snapshots[0].exists ? snapshots[0].data() : undefined;
        const nextState = validatedWrites.length === 1 && validatedWrites[0].operation === "set" ? { ...validatedWrites[0].data, id: validatedWrites[0].id } : undefined;
        const previousStates = snapshots.map((snapshot, index) => ({
          collection: validatedWrites[index].collection,
          id: validatedWrites[index].id,
          exists: snapshot.exists,
          data: snapshot.exists ? snapshot.data() : null,
        }));
        const newStates = committedRecords;
        const auditRecord = {
          id,
          timestamp: new Date().toISOString(),
          userId: actor.uid,
          userName: actor.name,
          action: storedAudit.action,
          entityType: storedAudit.entityType,
          entityId: storedAudit.entityId,
          entityName: storedAudit.entityName,
          details: acknowledgedInboxConflicts.length > 0
            ? `${storedAudit.details} Acknowledged shared location inbox duplicate(s): ${acknowledgedInboxConflicts.join(', ')}.`
            : storedAudit.details,
          ...(previousState ? { previousState } : {}),
          ...(nextState ? { newState: nextState } : {}),
          previousStates,
          newStates,
        };
        if (creation || managedRename || managedUnitEdit || writes.some(write => write.districtLeadershipMembers !== undefined)) assertDistrictHandoverAuditSize(auditRecord);
        if (creation) transaction.create(this.firestore.collection("audit_logs").doc(id), auditRecord);
        else transaction.set(this.firestore.collection("audit_logs").doc(id), auditRecord);
      }
      if (creation) finishLocationCreationCommit(transaction, creation, actor);
      return { records: committedRecords };
    });
  }

  /** Seal an unresolved operation before permitting an edited/new submission. Reads conflict with late commits. */
  async cancelRequestSubmission(write: DirectoryWrite, actor: Account): Promise<DirectoryCommitResult & { cancelled: boolean }> {
    if (write.collection !== 'requests' || write.operation !== 'set' || write.data?.status !== 'Pending') throw new DirectoryValidationError('A pending submission envelope is required.');
    const digest = submissionDigest(write.data);
    return this.firestore.runTransaction(async transaction => {
      const ref = this.firestore.collection('requests').doc(write.id);
      const seal = this.firestore.collection('request_submission_receipts').doc(write.id);
      const [saved, receipt] = await Promise.all([transaction.get(ref), transaction.get(seal)]);
      if (saved.exists) {
        const data = saved.data()!;
        if (data.submissionActor !== actor.uid || data.submissionDigest !== digest) throw new DirectoryConflict('Submission belongs to different content or another actor.');
        return { records: [{ collection: 'requests', id: write.id, operation: 'set', data: { ...data, id: write.id } }], replayed: true, cancelled: false };
      }
      if (receipt.exists) {
        if (receipt.data()?.actorId !== actor.uid || receipt.data()?.digest !== digest) throw new DirectoryConflict('Submission belongs to different content or another actor.');
        return { records: [], cancelled: true, replayed: true };
      }
      const timestamp = new Date().toISOString();
      transaction.set(seal, { id: write.id, actorId: actor.uid, digest, cancelledAt: timestamp });
      const auditId = `aud-${randomUUID()}`;
      transaction.set(this.firestore.collection('audit_logs').doc(auditId), { id: auditId, timestamp, userId: actor.uid, userName: actor.name, action: 'Request Submission Cancelled', entityType: 'Request', entityId: write.id, entityName: 'Unconfirmed submission', details: 'Uncommitted submission sealed against late arrival before replacement.' });
      return { records: [], cancelled: true };
    });
  }

  async confirmLocationImport(manifest: LocationImportManifest, actor: Account, options: { replayOnly?: boolean } = {}): Promise<LocationImportReceipt> {
    const manifestDigest = digestLocationImportManifest(manifest);
    const receiptReference = this.firestore.collection("location_import_receipts").doc(manifest.operationId);
    return this.firestore.runTransaction(async transaction => {
      const receiptSnapshot = await transaction.get(receiptReference);
      if (receiptSnapshot.exists) {
        const receipt = receiptSnapshot.data() as LocationImportReceipt & { manifestDigest?: string };
        if (receipt.manifestDigest !== manifestDigest) throw new LocationImportIdempotencyConflict("This operation ID was already used for different import content.");
        return toLocationImportReceipt(receipt, true);
      }
      if (options.replayOnly) throw expiredConfirmation();

      const writes: DirectoryWrite[] = manifest.writes.map(write => ({
        collection: "locations",
        id: write.id,
        operation: "set",
        expectedVersion: write.expectedVersion,
        data: write.data,
        ...(write.locationInboxAcknowledgment ? { locationInboxAcknowledgment: write.locationInboxAcknowledgment } : {}),
      }));
      const reviewedIdentities = [
        ...writes.map(write => ({ id: write.id, storeNumber: String(write.data?.storeNumber || "") })),
        ...manifest.unchanged.map(assertion => ({ id: assertion.id, storeNumber: assertion.storeNumber })),
      ];
      if (new Set(reviewedIdentities.map(target => target.id)).size !== reviewedIdentities.length) {
        throw new DirectoryValidationError("Each reviewed Location must appear exactly once.");
      }
      const [targetSnapshots, unchangedSnapshots, definitionSnapshot, peopleSnapshot, locationSnapshot, regionSnapshot, districtSnapshot] = await Promise.all([
        Promise.all(writes.map(write => transaction.get(this.firestore.collection("locations").doc(write.id)))),
        Promise.all(manifest.unchanged.map(assertion => transaction.get(this.firestore.collection("locations").doc(assertion.id)))),
        transaction.get(this.firestore.collection("custom_field_definitions").limit(101)),
        transaction.get(this.firestore.collection("people")),
        transaction.get(this.firestore.collection("locations")),
        transaction.get(this.firestore.collection("regions")),
        transaction.get(this.firestore.collection("districts")),
      ]);

      manifest.writes.forEach((write, index) => {
        const exists = targetSnapshots[index].exists;
        if ((write.action === "add" && exists) || (write.action === "update" && !exists)) {
          throw new DirectoryConflict("A Location was created or deleted after preview.");
        }
      });

      manifest.unchanged.forEach((assertion, index) => {
        const snapshot = unchangedSnapshots[index];
        const current = snapshot.data();
        const currentVersion = typeof current?.version === "number" ? current.version : 0;
        if (!snapshot.exists || currentVersion !== assertion.expectedVersion || current?.storeNumber !== assertion.storeNumber) {
          throw new DirectoryConflict("An unchanged Location changed after preview.");
        }
      });
      const finalLocations = new Map<string, Record<string, unknown>>(locationSnapshot.docs.map(document => [document.id, { ...document.data(), id: document.id }]));
      writes.forEach(write => finalLocations.set(write.id, { ...finalLocations.get(write.id), ...write.data, id: write.id }));
      reviewedIdentities.forEach(target => {
        const normalizedStoreNumber = normalizeImportStoreNumber(target.storeNumber);
        const matches = [...finalLocations.values()].filter(location => normalizeImportStoreNumber(location.storeNumber) === normalizedStoreNumber);
        if (!normalizedStoreNumber || matches.length !== 1 || matches[0].id !== target.id) {
          throw new DirectoryConflict("A reviewed Location identity changed after preview.");
        }
      });
      const definitions = definitionSnapshot.docs.map(document => parseCustomFieldDefinition({ ...document.data(), id: document.id }));
      const people: RelationshipPerson[] = peopleSnapshot.docs.map(document => ({
        ...document.data(), id: document.id, fullName: String(document.data().fullName || document.data().name || "Unknown Person"),
      }));
      const locations = locationSnapshot.docs.map(document => ({ ...document.data(), id: document.id }));
      const hierarchyRegistry: HierarchyRegistry = {
        regions: regionSnapshot.docs.map(document => ({ id: document.id, name: String(document.data().name || ""), status: document.data().status })),
        districts: districtSnapshot.docs.map(document => ({ ...document.data(), id: document.id, name: String(document.data().name || ""), regionId: String(document.data().regionId || ""), status: document.data().status })),
      };
      const validatedWrites = validateMetadataWrites(writes, targetSnapshots.map(snapshot => snapshot.data()), definitions, actor, people, locations, [], hierarchyRegistry);
      const organizationState = await readOrganizationGuardState(this.firestore, transaction, [
        ...regionSnapshot.docs.map(document => ({ unitType: 'region' as const, id: document.id, data: document.data() })),
        ...districtSnapshot.docs.map(document => ({ unitType: 'district' as const, id: document.id, data: document.data() })),
      ]);
      validateOrganizationLeadershipWrites(validatedWrites, targetSnapshots.map(snapshot => snapshot.data()), organizationState, people);
      validateLocationInboxConflicts(validatedWrites, locations);
      const committedAt = new Date().toISOString();
      const savedLocations = validatedWrites.map(write => {
        const record = { ...write.data, id: write.id };
        return {
          id: write.id,
          name: String(write.data?.name || ""),
          storeNumber: String(write.data?.storeNumber || ""),
          record: record as LocationImportReceipt['locations'][number]['record'],
        };
      });
      const receipt = {
        operationId: manifest.operationId,
        batchId: manifest.batchId,
        manifestDigest,
        sourceDigest: manifest.sourceDigest,
        actorId: actor.uid,
        additions: manifest.writes.filter(write => write.action === "add").length,
        updates: manifest.writes.filter(write => write.action === "update").length,
        unchanged: manifest.summary.unchanged,
        locations: savedLocations,
        committedAt,
        replayed: false,
      };
      const audits = validatedWrites.map((write, index) => ({
        id: `aud-locimp-${createHash("sha256").update(`${manifest.operationId}\0${write.id}`).digest("hex").slice(0, 32)}`,
        value: {
          timestamp: committedAt,
          userId: actor.uid,
          userName: actor.name,
          action: manifest.writes[index].action === "add" ? "Location Imported" : "Location Updated by Import",
          entityType: "Location",
          entityId: write.id,
          entityName: String(write.data?.name || write.id),
          details: `Location import batch ${manifest.batchId}.${write.locationInboxAcknowledgment ? ' Explicit shared inbox duplicate acknowledgment recorded.' : ''}`,
          ...(write.locationInboxAcknowledgment ? { locationInboxAcknowledgment: write.locationInboxAcknowledgment } : {}),
          operationId: manifest.operationId,
          batchId: manifest.batchId,
          previousState: targetSnapshots[index].exists ? targetSnapshots[index].data() : null,
          newState: { ...write.data, id: write.id },
        },
      }));
      const estimatedBytes = Buffer.byteLength(JSON.stringify({
        locations: savedLocations.map(location => location.record), audits, receipt,
      }), "utf8");
      if (estimatedBytes > LOCATION_IMPORT_MAX_ATOMIC_BYTES) throw new LocationImportPayloadTooLarge("The import exceeds the atomic write payload limit.");

      validatedWrites.forEach(write => transaction.set(this.firestore.collection("locations").doc(write.id), { ...write.data, id: write.id }));
      audits.forEach(audit => transaction.set(this.firestore.collection("audit_logs").doc(audit.id), { id: audit.id, ...audit.value }));
      transaction.set(receiptReference, receipt);
      return toLocationImportReceipt(receipt, false);
    });
  }
}

function normalizeImportStoreNumber(value: unknown): string {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, '') : '';
}

function toLocationImportReceipt(receipt: LocationImportReceipt, replayed: boolean): LocationImportReceipt {
  return {
    operationId: receipt.operationId,
    batchId: receipt.batchId,
    committedAt: receipt.committedAt,
    additions: receipt.additions,
    updates: receipt.updates,
    unchanged: receipt.unchanged,
    locations: receipt.locations,
    replayed,
  };
}

/** Validate transaction writes and their final relationships without persisting any records. */
export function validateMetadataWrites(
  writes: DirectoryWrite[],
  previous: (Record<string, unknown> | undefined)[],
  definitions: CustomFieldDefinition[],
  actor: Account,
  people: RelationshipPerson[] = [],
  locations: Array<Record<string, unknown>> = [],
  users: Array<Record<string, unknown>> = [],
  hierarchyRegistry?: HierarchyRegistry,
): DirectoryWrite[] {
  if (new Set(writes.map(write => `${write.collection}/${write.id}`)).size !== writes.length) throw new DirectoryValidationError('Duplicate writes are not allowed.');
  if (writes.filter(write => write.collection === 'requests').length > 1) throw new DirectoryValidationError('Submit or review one correction request at a time.');
  if (writes.some(write => write.collection === 'custom_field_definitions') && writes.length !== 1) throw new DirectoryValidationError('Save one custom field definition at a time.');

  const peopleMap = new Map<string, RelationshipPerson>(people.map(person => [person.id, { ...person }]));
  const normalizedPersonWrites = new Map<string, Record<string, unknown>>();

  for (const [index, write] of writes.entries()) {
    if (write.collection === "people") {
      if (write.operation === "delete") {
        peopleMap.delete(write.id);
      } else if (write.operation === "set" && write.data) {
        const currentPerson = peopleMap.get(write.id);
        const normalizedData = normalizePersonContactWrite(write.data, previous[index]);
        normalizedPersonWrites.set(write.id, normalizedData);
        peopleMap.set(write.id, {
          ...currentPerson,
          ...normalizedData,
          id: write.id,
          fullName: String(write.data.fullName || write.data.name || "Unknown Person"),
        });
      }
    }
  }

  const combinedPeople = Array.from(peopleMap.values());

  const validatedWrites = writes.map((write, index) => {
    const current = previous[index];

    const expectedVer = Object.hasOwn(write, "expectedVersion")
      ? write.expectedVersion
      : typeof write.data?.expectedVersion === "number" ? write.data.expectedVersion : undefined;
    if (write.collection === 'regions' || write.collection === 'districts') {
      if (!Object.hasOwn(write, 'expectedVersion') || (write.expectedVersion === null ? Boolean(current) : !current)) {
        throw new DirectoryConflict("Hierarchy registry record changed concurrently. Reload the directory before saving.");
      }
    }
    if (current && ['locations', 'people', 'users', 'requests', 'regions', 'districts'].includes(write.collection)) {
      if (write.collection === 'locations' && expectedVer === null) {
        throw new DirectoryConflict("Record changed concurrently. Reload the directory before saving.");
      }
      if (expectedVer === undefined) {
        throw new DirectoryConflict("Record changed concurrently. Reload the directory before saving.");
      }
      const currentVersion = typeof current.version === "number" ? current.version : 0;
      if (currentVersion !== expectedVer) {
        throw new DirectoryConflict("Record changed concurrently. Reload the directory before saving.");
      }
    }
    if (!current && expectedVer !== undefined && expectedVer !== null && expectedVer !== 0) {
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

    if (write.collection === 'regions' || write.collection === 'districts') {
      if (actor.role !== 'System Administrator') throw new DirectoryWriteDenied('Only system administrators can manage hierarchy registry records.');
      if (write.operation !== 'set') throw new DirectoryValidationError('Retire hierarchy registry records instead of deleting them.');
      const managed = current?.leadershipModelVersion === 1;
      if (managed && (actor.status !== 'Active' || actor.accessScope !== 'Company-wide')) throw new DirectoryWriteDenied('Current Company-wide Active administrator is required.');
      if (managed && (!Number.isSafeInteger(current.version) || Number(current.version) < 1 || Number(current.version) >= Number.MAX_SAFE_INTEGER)) throw new DirectoryConflict('Resolve the managed unit version before saving.');
      const data: Record<string, unknown> = { ...(managed ? current : {}), ...write.data, version: ((current?.version as number) || 0) + 1, updatedAt: new Date().toISOString() };
      if (Object.hasOwn(data, 'id') && data.id !== write.id) throw new DirectoryValidationError('Hierarchy registry IDs cannot be changed.');
      data.id = write.id;
      if (typeof data.name !== 'string' || !data.name.trim()) throw new DirectoryValidationError('Hierarchy registry records require a name.');
      if (data.status !== 'Active' && data.status !== 'Retired') throw new DirectoryValidationError('Hierarchy registry status must be Active or Retired.');
      if (write.collection === 'districts') {
        if (current && Object.hasOwn(current, 'districtManagerId') && !Object.hasOwn(data, 'districtManagerId')) {
          data.districtManagerId = current.districtManagerId;
        }
        if (typeof data.regionId !== 'string' || !data.regionId.trim()) throw new DirectoryValidationError('Districts require a Region.');
        const parentMustBeValidated = !current
          || data.regionId !== current.regionId
          || (current.status === 'Retired' && data.status === 'Active');
        if (parentMustBeValidated) {
          const parent = hierarchyRegistry?.regions.find(region => region.id === data.regionId);
          if (!parent) throw new DirectoryValidationError('District references a missing Region.');
          if (data.status === 'Active' && parent.status === 'Retired') throw new DirectoryValidationError('Active Districts require an active parent Region.');
        }
      }
      return { ...write, data };
    }

    if (write.collection === 'requests' && write.operation === 'delete') {
      throw new DirectoryValidationError('Correction requests are retained as history. Reject a pending request instead of deleting it.');
    }
    if (write.collection === 'locations' && write.operation === 'delete' && !['Company', 'Company-wide'].includes(actor.accessScope)
      && actor.accessScope !== `Store ${String(current?.storeNumber)}`) throw new DirectoryWriteDenied('Your access scope does not permit deletion of this Location.');
    if (write.operation !== 'set' || !['locations', 'people', 'users', 'requests'].includes(write.collection)) return write;
    let data = { ...(write.collection === 'people' ? normalizedPersonWrites.get(write.id) : write.data) };

    if (current || write.expectedVersion !== undefined || typeof data.version === 'number') {
      data.version = ((current?.version as number) || 0) + 1;
      data.updatedAt = new Date().toISOString();
    }

    if (write.collection === 'requests') {
      if (Object.hasOwn(data, 'id') && data.id !== write.id) throw new DirectoryValidationError('Correction request IDs cannot change.');
      if (current) {
        if (current.status !== 'Pending' || !['Approved', 'Rejected'].includes(String(data.status))) {
          throw new DirectoryConflict('Submitted requests cannot be edited or reopened. Review a pending request, or submit a replacement.');
        }
        const reviewFields = new Set(['id', 'status', 'reviewedBy', 'reviewedAt', 'reviewerNotes', 'version', 'updatedAt']);
        for (const [field, value] of Object.entries(data)) {
          if (!reviewFields.has(field) && !isDeepStrictEqual(value, current[field])) {
            throw new DirectoryValidationError(`Submitted request ${field} is immutable. Reject this request and submit a replacement.`);
          }
        }
        // Older review clients may omit submission fields. Preserve them, never erase history.
        data = { ...current, ...data, id: write.id };
      } else if (data.status !== 'Pending') {
        throw new DirectoryValidationError('New correction requests must be submitted as Pending.');
      }
      if (!current && data.changeType === 'Store Manager Change') {
        if (data.status !== 'Pending' || data.targetType !== 'Location') {
          throw new DirectoryValidationError('Leadership corrections must be submitted as pending Location requests.');
        }
        const target = locations.find(location => location.id === data.targetId);
        if (!target) throw new DirectoryConflict('The selected Location no longer exists. Reload before submitting.');
        if (writes.some(candidate => candidate.collection === 'locations' && candidate.id === target.id)) {
          throw new DirectoryConflict('Submit a leadership request separately from changes to its Location. Reload after saving the Location.');
        }
        const changes = isPlainRecord(data.requestedChanges) ? data.requestedChanges : {};
        const fields = ['storeManagerId', 'storeManagerName', 'storeManagerPhone'];
        if (Object.keys(changes).length !== fields.length || fields.some(field => !Object.hasOwn(changes, field))) {
          throw new DirectoryValidationError('Choose an active Store Manager; leadership corrections may change only the manager identity, name and phone.');
        }
        const manager = combinedPeople.find(person => person.id === changes.storeManagerId);
        if (!manager || personLifecycle(manager) !== 'active' || !allowsLeadershipPosition(manager, 'Store Manager')) {
          throw new DirectoryValidationError('Choose an active Store Manager before submitting this request.');
        }
        if (changes.storeManagerId === target.storeManagerId) {
          throw new DirectoryValidationError('Choose a different Store Manager. This request would not change the assignment.');
        }
        if (changes.storeManagerName !== manager.fullName || changes.storeManagerPhone !== (manager.workPhone || manager.phone || '')) {
          throw new DirectoryValidationError('The selected manager details changed. Reload and select the manager again.');
        }
        const baseline = isPlainRecord(data.currentSnapshot) ? data.currentSnapshot : {};
        if (fields.some(field => !Object.hasOwn(baseline, field))) {
          throw new DirectoryValidationError('The manager submission baseline is missing. Reload and submit a replacement request.');
        }
        if (fields.some(field => !isDeepStrictEqual(baseline[field] ?? null, target[field] ?? null))) {
          throw new DirectoryConflict('The store leadership changed while drafting. Reload and submit a replacement request.');
        }
      }
      if (data.status === 'Approved' || data.status === 'Rejected') {
        if (!['System Administrator', 'Directory Data Steward'].includes(actor.role)) {
          throw new DirectoryWriteDenied('Only a steward or administrator can review correction requests.');
        }
        if (!current || current.status !== 'Pending') throw new DirectoryConflict('Only pending requests can be reviewed. Reload the directory.');
        data.reviewedBy = actor.name;
        data.reviewedAt = new Date().toISOString();
        data.reviewerId = actor.uid;
        if (data.reviewerNotes != null && (typeof data.reviewerNotes !== 'string' || data.reviewerNotes.length > 2000)) throw new DirectoryValidationError('Reviewer notes must be plain text of at most 2,000 characters.');
      }
      if (!current && data.changeType === 'Standard Hours Adjustment') {
        if (data.status !== 'Pending' || data.targetType !== 'Location') throw new DirectoryValidationError('Hours corrections must be submitted as pending Location requests.');
        const target = locations.find(location => location.id === data.targetId);
        if (!target) throw new DirectoryConflict('The selected Location no longer exists. Reload before submitting.');
        const changes = isPlainRecord(data.requestedChanges) ? data.requestedChanges : {};
        const baseline = isPlainRecord(data.currentSnapshot) ? data.currentSnapshot : {};
        if (!Object.hasOwn(changes, 'standardHours')) throw new DirectoryValidationError('Hours correction requests require proposed standard hours.');
        assertHoursBaseline(baseline, target);
        if (isDeepStrictEqual(changes.standardHours, target.standardHours)) {
          throw new DirectoryValidationError('Choose different hours. This request would not change the Location.');
        }
      }
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
        const checked = validateRequestProposal(current, targetPrevious || {});
        if (checked.error) throw new DirectoryValidationError(checked.error);
        // Historical proposals that need normalization must be replaced, never rewritten during review.
        if (!isDeepStrictEqual(checked.changes, current.requestedChanges)) throw new DirectoryValidationError('This historical proposal needs normalized values. Reject it and submit a replacement.');
      }
      if (!current) {
        if (Object.hasOwn(data, 'submissionDigest') || Object.hasOwn(data, 'submissionActor')) throw new DirectoryValidationError('Submission receipt fields are server owned.');
        const target = data.targetType === 'Person' ? combinedPeople.find(person => person.id === data.targetId) as unknown as Record<string, unknown> : locations.find(location => location.id === data.targetId);
        if (!target) throw new DirectoryValidationError('Choose an existing correction target.');
        const collection = data.targetType === 'Person' ? 'people' : 'locations';
        if (writes.some(candidate => candidate.collection === collection && candidate.id === target.id)) throw new DirectoryConflict('Submit a correction separately from changes to its target.');
        const checked = validateRequestProposal(data, target);
        if (checked.error) throw new DirectoryValidationError(checked.error);
        data.requestedChanges = checked.changes;
        if (data.targetType === 'Person') {
          const primaryTouched = Object.hasOwn(checked.changes, 'primaryLocationId');
          const supportsTouched = Object.hasOwn(checked.changes, 'supportedLocationIds');
          const supports = (supportsTouched ? checked.changes.supportedLocationIds : target.supportedLocationIds) as string[] | undefined;
          const primary = primaryTouched ? checked.changes.primaryLocationId : target.primaryLocationId;
          const proposedReferences = [...(supportsTouched ? supports || [] : []), ...(primaryTouched && typeof primary === 'string' ? [primary] : [])];
          for (const id of proposedReferences) if (!locations.some(location => location.id === id && location.recordStatus === 'Active')) throw new DirectoryValidationError('Employment proposals must reference active Locations.');
          if ((primaryTouched || supportsTouched) && Array.isArray(supports) && typeof primary === 'string' && supports.includes(primary)) throw new DirectoryValidationError('Works at and Supports must be separate relationships.');
        }
        data.targetName = target.fullName || target.name || target.id;
        if (data.targetType === 'Location') data.targetStoreNumber = target.storeNumber;
        else delete data.targetStoreNumber;
        data.version = 1;
        data.requestedBy = { id: actor.uid, name: actor.name, email: actor.email || '', role: actor.role };
        data.requestedAt = new Date().toISOString();
        data.updatedAt = data.requestedAt;
        for (const key of ['reviewedBy', 'reviewedAt', 'reviewerId', 'reviewerNotes']) delete data[key];
      }
      return { ...write, data };
    }

    if (write.collection !== 'locations' && write.collection !== 'people') normalizePhoneWrite(data, current, 'phone', 'phoneExtension');

    if (write.collection === 'locations') {
      if (data.operationalStatus === 'Temporarily Closed — Emergency' && current?.operationalStatus !== data.operationalStatus) throw new DirectoryValidationError('Use Report temporary closure on the Location detail screen; new indefinite emergency statuses are not supported.');
      // The immediate command is the only writer of this server-owned override. Older editors/imports preserve it.
      if (Object.hasOwn(data, 'temporaryClosure') && !isDeepStrictEqual(data.temporaryClosure ?? null, current?.temporaryClosure ?? null)) throw new DirectoryWriteDenied('Use the dedicated temporary operating update command to change closures.');
      if (current && Object.hasOwn(current, 'temporaryClosure')) data.temporaryClosure = current.temporaryClosure;
      // Older editors omit new fields. Omission preserves; explicit null clears through validation.
      for (const field of ['suite', 'wayfindingDirections', 'mallOrCenterName']) if (!Object.hasOwn(data, field) && current && Object.hasOwn(current, field)) data[field] = current[field];
      const companyScope = ['Company', 'Company-wide'].includes(actor.accessScope);
      const scopedStore = actor.accessScope.match(/^Store ([0-9]+)$/)?.[1];
      if (!companyScope && (!scopedStore || scopedStore !== data.storeNumber || (current && scopedStore !== current.storeNumber))) throw new DirectoryWriteDenied('Your access scope does not permit direct changes to this Location.');
      if (!Object.hasOwn(data, 'locationInboxEmail') && current && Object.hasOwn(current, 'locationInboxEmail')) {
        data.locationInboxEmail = current.locationInboxEmail;
      }
      const normalizedLocation = normalizeLocationWriteValues(data, current);
      if (normalizedLocation.issues.length > 0) {
        throw new DirectoryValidationError(normalizedLocation.issues.map(issue => issue.message).join('; '));
      }
      data = normalizedLocation.values;
      const approvalIndex = writes.findIndex((candidate, index) => candidate.collection === 'requests' && candidate.data?.status === 'Approved'
        && previous[index]?.targetType === 'Location' && previous[index]?.targetId === write.id);
      const approvalChanges = approvalIndex >= 0 ? previous[approvalIndex]?.requestedChanges : undefined;
      if (isPlainRecord(approvalChanges) && Object.hasOwn(approvalChanges, 'standardHours')) {
        data = applyCorrection(data, { standardHours: data.standardHours });
      }
      const originalData = write.data || {};
      const isFieldChanged = (field: string) => Object.hasOwn(originalData, field) && !isDeepStrictEqual(originalData[field], current?.[field]);
      const hierarchyTouched = ['type', 'hierarchyApplicability', 'regionId', 'districtId'].some(isFieldChanged);
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
      for (const field of ['regionId', 'districtId', 'storeManagerId', 'districtManagerId', 'regionalManagerId']) {
        if (data[field] === null) delete data[field];
      }

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

      const hierarchyIssues = validateLocationHierarchyFields(hierarchyInput, hierarchyRegistry);
      if (hierarchyIssues.length > 0) {
        throw new DirectoryValidationError(hierarchyIssues.join('; '));
      }

      // Only validate leadership references that this write actually changed; unchanged legacy values are preserved as-is.
      const leadershipRefs = [
        ['storeManagerId', hierarchyInput.storeManagerId, isFieldChanged('storeManagerId')],
        ['districtManagerId', hierarchyInput.districtManagerId, isFieldChanged('districtManagerId')],
        ['regionalManagerId', hierarchyInput.regionalManagerId, isFieldChanged('regionalManagerId')],
        ...((hierarchyInput.assistantStoreManagerIds || []).map(id => ['assistantStoreManagerIds', id, isFieldChanged('assistantStoreManagerIds')] as const)),
        ...((hierarchyInput.keyHolderIds || []).map(id => ['keyHolderIds', id, isFieldChanged('keyHolderIds')] as const)),
      ] as const;

      for (const [field, id, changed] of leadershipRefs) {
        if (!id || !changed) continue;
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
      const originalData = write.data || {};
      for (const field of ['primaryLocationId', 'supportedLocationIds'] as const) {
        if (!Object.hasOwn(originalData, field) && current && Object.hasOwn(current, field)) data[field] = current[field];
      }
      if (Object.hasOwn(originalData, 'primaryLocationId')) {
        if (data.primaryLocationId === null) delete data.primaryLocationId;
        else if (typeof data.primaryLocationId !== 'string' || !data.primaryLocationId.trim()) {
          throw new DirectoryValidationError('Works at must reference a Location ID or be explicitly cleared.');
        }
      }
      if (Object.hasOwn(originalData, 'supportedLocationIds')) {
        if (!Array.isArray(data.supportedLocationIds) || data.supportedLocationIds.some(id => typeof id !== 'string' || !id.trim())) {
          throw new DirectoryValidationError('Supports must be a list of Location IDs.');
        }
        data.supportedLocationIds = [...data.supportedLocationIds];
      }
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
    try {
      if (changed) data.customMetadata = validateCustomMetadata(supplied, definitions, existing);
      else if (Object.hasOwn(data, 'customMetadata') || Object.keys(existing).length > 0) data.customMetadata = supplied as Record<string, unknown>;
    } catch (error) { throw new DirectoryValidationError((error as Error).message); }
    return { ...write, data };
  });

  validateIndividualPersonEmails(validatedWrites, previous, locations);
  try { validatePersonPositionState(validatedWrites, previous, combinedPeople, locations, hierarchyRegistry?.districts || []); }
  catch (error) { throw new DirectoryValidationError(error instanceof Error ? error.message : 'Invalid position assignment.'); }
  validateDistrictLeadershipState(validatedWrites, previous, locations, combinedPeople, hierarchyRegistry, actor);
  validateCombinedRelationshipState(validatedWrites, locations, combinedPeople, users, hierarchyRegistry);
  validateEmploymentRelationshipState(validatedWrites, people, locations);
  validateRegistryRetirement(validatedWrites, locations, hierarchyRegistry, previous);
  validateFinalHierarchyState(validatedWrites, locations, hierarchyRegistry, previous);
  return validatedWrites;
}

/** Use the transaction's existing Location reads and proposed writes; preserve untouched legacy contacts. */
function validateIndividualPersonEmails(writes: DirectoryWrite[], previous: (Record<string, unknown> | undefined)[], locations: Array<Record<string, unknown>>) {
  // Retain old inbox keys too: clearing/deleting a Location in the same transaction cannot launder a shared contact.
  const knownInboxes = [...locations, ...writes.filter(w => w.collection === 'locations' && w.operation === 'set' && w.data).map(w => w.data!)];
  writes.forEach((write, index) => {
    if (write.collection !== 'people' || write.operation !== 'set' || !write.data) return;
    for (const field of ['email', 'workEmail'] as const) {
      if (!Object.hasOwn(write.data, field) || isDeepStrictEqual(write.data[field], previous[index]?.[field])) continue;
      if (sharedPersonEmailKind(write.data[field], knownInboxes)) throw new DirectoryValidationError('Shared store inboxes belong on Location records, not individual Person email. Leave the individual email blank or use an individually assigned work address.');
    }
  });
}

/** Stable JSON digest binds a retry to the exact original submission, independent of object key ordering. */
function submissionDigest(data: Record<string, unknown>): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(Reflect.get(v, k))])) : v;
  return createHash('sha256').update(JSON.stringify(canonical(data))).digest('hex');
}

function validateEmploymentRelationshipState(
  writes: DirectoryWrite[],
  currentPeople: RelationshipPerson[],
  currentLocations: Array<Record<string, unknown>>,
): void {
  const finalLocations = new Map(currentLocations.map(location => [String(location.id), { ...location }]));
  for (const write of writes) {
    if (write.collection !== 'locations') continue;
    if (write.operation === 'delete') finalLocations.delete(write.id);
    else if (write.data) finalLocations.set(write.id, { ...write.data, id: write.id });
  }

  const finalPeople = new Map(currentPeople.map(person => [person.id, { ...person }]));
  for (const write of writes) {
    if (write.collection !== 'people') continue;
    if (write.operation === 'delete') finalPeople.delete(write.id);
    else if (write.data) finalPeople.set(write.id, { ...write.data, id: write.id, fullName: String(write.data.fullName || write.data.name || 'Unknown Person') });
  }

  for (const write of writes) {
    if (write.collection !== 'people' || write.operation !== 'set') continue;
    const current = currentPeople.find(person => person.id === write.id);
    const next = finalPeople.get(write.id);
    if (!next) continue;
    const primaryChanged = !isDeepStrictEqual(next.primaryLocationId, current?.primaryLocationId);
    const supportsChanged = !isDeepStrictEqual(next.supportedLocationIds, current?.supportedLocationIds);
    if (!primaryChanged && !supportsChanged) continue;

    const primaryLocationId = typeof next.primaryLocationId === 'string' && next.primaryLocationId.trim() ? next.primaryLocationId : undefined;
    const supportedLocationIds = Array.isArray(next.supportedLocationIds) ? next.supportedLocationIds as string[] : [];
    if (supportsChanged && new Set(supportedLocationIds).size !== supportedLocationIds.length) {
      throw new DirectoryValidationError('Supports cannot contain duplicate Locations.');
    }
    if (primaryLocationId && supportedLocationIds.includes(primaryLocationId)) {
      throw new DirectoryValidationError('Works at cannot also be selected as a Supports Location.');
    }

    const changedReferences = [
      ...(primaryChanged && primaryLocationId ? [['Works at', primaryLocationId] as const] : []),
      ...(supportsChanged ? supportedLocationIds.map(id => ['Supports', id] as const) : []),
    ];
    for (const [label, locationId] of changedReferences) {
      const location = finalLocations.get(locationId);
      if (!location) throw new DirectoryValidationError(`${label} references missing Location ${locationId}.`);
      if (location.recordStatus === 'Retired') throw new DirectoryValidationError(`${label} references retired Location ${locationId}.`);
    }
  }

  for (const write of writes) {
    if (write.collection !== 'locations') continue;
    const current = currentLocations.find(location => String(location.id) === write.id);
    const retiring = write.operation === 'set' && write.data?.recordStatus === 'Retired' && current?.recordStatus !== 'Retired';
    if (write.operation !== 'delete' && !retiring) continue;
    const referenced = Array.from(finalPeople.values()).some(person => person.primaryLocationId === write.id
      || (Array.isArray(person.supportedLocationIds) && person.supportedLocationIds.includes(write.id)));
    if (referenced) {
      throw new DirectoryValidationError(`Location ${write.id} has incoming Works at or Supports relationships that must be reassigned or cleared before retirement/deletion.`);
    }
  }
}

function validateLocationInboxConflicts(
  writes: DirectoryWrite[],
  currentLocations: Array<Record<string, unknown>>,
): string[] {
  const finalLocations = new Map(currentLocations.map(location => [String(location.id), { ...location }]));
  for (const write of writes) {
    if (write.collection !== 'locations') continue;
    if (write.operation === 'delete') finalLocations.delete(write.id);
    else if (write.data) finalLocations.set(write.id, { ...write.data, id: write.id });
  }

  const acknowledged: string[] = [];
  for (const write of writes) {
    if (write.collection !== 'locations' || write.operation !== 'set' || !write.data) continue;
    const current = currentLocations.find(location => String(location.id) === write.id);
    const proposedEmail = write.data.locationInboxEmail;
    const changed = !isDeepStrictEqual(proposedEmail, current?.locationInboxEmail);
    if (!changed || typeof proposedEmail !== 'string') continue;
    const normalized = normalizeLocationInboxEmail(proposedEmail);
    if (!normalized) continue;
    const members: LocationInboxConflictMember[] = [...finalLocations.values()]
      .filter(location => normalizeLocationInboxEmail(location.locationInboxEmail)?.comparisonKey === normalized.comparisonKey)
      .map(location => ({
        id: String(location.id),
        storeNumber: String(location.storeNumber || ''),
        version: typeof location.version === 'number' ? location.version : 0,
      }));
    if (members.length < 2) {
      if (write.locationInboxAcknowledgment) {
        throw new DirectoryConflict('The location inbox duplicate set changed. Review the current conflicts before saving.');
      }
      continue;
    }

    const acknowledgment = write.locationInboxAcknowledgment;
    const expectedDigest = locationInboxConflictDigest(proposedEmail, members);
    if (!acknowledgment
      || acknowledgment.normalizedEmail !== normalized.comparisonKey
      || acknowledgment.conflictDigest !== expectedDigest) {
      throw new DirectoryConflict('This location inbox is already shared. Review and acknowledge the current affected Locations before saving.');
    }
    acknowledged.push(members.map(member => `#${member.storeNumber}`).sort().join(', '));
  }
  return [...new Set(acknowledged)];
}

function applyHierarchyRegistryWrites(registry: HierarchyRegistry, writes: DirectoryWrite[]): void {
  for (const write of writes) {
    if (write.operation !== 'set' || !write.data) continue;
    if (write.collection === 'regions') {
      registry.regions = [...registry.regions.filter(region => region.id !== write.id), {
        id: write.id,
        name: String(write.data.name || ''),
        status: write.data.status as 'Active' | 'Retired',
      }];
    }
    if (write.collection === 'districts') {
      registry.districts = [...registry.districts.filter(district => district.id !== write.id), {
        ...registry.districts.find(district => district.id === write.id),
        ...(Object.hasOwn(write.data, 'districtManagerId') ? { districtManagerId: write.data.districtManagerId as string | null } : {}),
        id: write.id,
        name: String(write.data.name || ''),
        regionId: String(write.data.regionId || ''),
        status: write.data.status as 'Active' | 'Retired',
      }];
    }
  }
}

function validateFinalHierarchyState(
  writes: DirectoryWrite[],
  currentLocations: Array<Record<string, unknown>>,
  registry: HierarchyRegistry | undefined,
  previous: (Record<string, unknown> | undefined)[],
): void {
  if (!registry) return;
  const finalLocations = new Map(currentLocations.map(location => [String(location.id), { ...location }]));
  const affectedLocationIds = new Set<string>();
  const affectedRegionIds = new Set<string>();
  const affectedDistrictIds = new Set<string>();
  const dependencies: DirectoryDependency[] = [];
  const issueMessages = new Set<string>();

  for (const write of writes) {
    if (write.collection === 'locations') {
      const current = currentLocations.find(location => String(location.id) === write.id);
      const hierarchyChanged = ['type', 'hierarchyApplicability', 'regionId', 'districtId'].some(field =>
        Object.hasOwn(write.data || {}, field) && !isDeepStrictEqual(write.data?.[field], current?.[field]),
      );
      if (hierarchyChanged) affectedLocationIds.add(write.id);
      if (write.operation === 'delete') finalLocations.delete(write.id);
      else if (write.data) finalLocations.set(write.id, { ...write.data, id: write.id });
    }
    if (write.collection === 'regions') {
      const current = previous[writes.indexOf(write)];
      if (!isDeepStrictEqual(write.data?.status, current?.status)) affectedRegionIds.add(write.id);
    }
    if (write.collection === 'districts') {
      const current = previous[writes.indexOf(write)];
      if (!isDeepStrictEqual(write.data?.status, current?.status) || !isDeepStrictEqual(write.data?.regionId, current?.regionId)) {
        affectedDistrictIds.add(write.id);
      }
    }
  }

  for (const location of finalLocations.values()) {
    const affected = affectedLocationIds.has(String(location.id))
      || affectedRegionIds.has(String(location.regionId || ''))
      || affectedDistrictIds.has(String(location.districtId || ''));
    if (!affected) continue;
    const issues = validateLocationHierarchyFields({
      type: String(location.type || 'Street / Standalone Location'),
      hierarchyApplicability: location.hierarchyApplicability as HierarchyFieldContract['hierarchyApplicability'],
      regionId: typeof location.regionId === 'string' ? location.regionId : undefined,
      districtId: typeof location.districtId === 'string' ? location.districtId : undefined,
    }, registry);
    if (issues.length > 0) {
      const id = String(location.id);
      const storeNumber = String(location.storeNumber || '');
      issues.forEach(issue => issueMessages.add(issue));
      dependencies.push({ type: 'Location', id, name: String(location.name || id), storeNumber, href: `/locations/${encodeURIComponent(id)}` });
    }
  }
  if (dependencies.length > 0) {
    throw new DirectoryValidationError(
      `${Array.from(issueMessages).join('; ')} Affected Locations: ${dependencies.map(item => `${item.name} (${item.storeNumber ? `Store ${item.storeNumber}, ` : ''}${item.id})`).join(', ')}.`,
      {
        dependencies,
        correction: 'Reassign every affected Location or clear its District assignment before changing the District parent, then explicitly reassign each Location as appropriate.',
      },
    );
  }
}

function validateRegistryRetirement(
  writes: DirectoryWrite[],
  currentLocations: Array<Record<string, unknown>>,
  registry: HierarchyRegistry | undefined,
  previous: (Record<string, unknown> | undefined)[],
): void {
  if (!registry) return;
  const finalLocations = new Map(currentLocations.map(location => [String(location.id), { ...location }]));
  for (const write of writes) {
    if (write.collection !== 'locations') continue;
    if (write.operation === 'delete') finalLocations.delete(write.id);
    else if (write.data) finalLocations.set(write.id, { ...write.data, id: write.id });
  }
  for (const write of writes) {
    if ((write.collection !== 'regions' && write.collection !== 'districts') || write.operation !== 'set' || write.data?.status !== 'Retired') continue;
    const current = previous[writes.indexOf(write)];
    if (current?.status === 'Retired') continue;
    const referenceField = write.collection === 'regions' ? 'regionId' : 'districtId';
    const referencedLocations = Array.from(finalLocations.values()).filter(location => location[referenceField] === write.id);
    const referencedDistricts = write.collection === 'regions'
      ? registry.districts.filter(district => district.regionId === write.id && district.status !== 'Retired')
      : [];
    if (referencedLocations.length > 0 || referencedDistricts.length > 0) {
      const dependencies: DirectoryDependency[] = [
        ...referencedLocations.map(location => {
          const id = String(location.id);
          return { type: 'Location' as const, id, name: String(location.name || id), storeNumber: String(location.storeNumber || ''), href: `/locations/${encodeURIComponent(id)}` };
        }),
        ...referencedDistricts.map(district => ({ type: 'District' as const, id: district.id, name: district.name })),
      ];
      throw new DirectoryValidationError(
        `Cannot retire this ${write.collection.slice(0, -1)} while ${dependencies.map(item => `${item.type} ${item.name} (${item.id})`).join(', ')} still depend on it.`,
        { dependencies, correction: 'Reassign or clear every dependency, then retry retirement.' },
      );
    }
  }
}

function assertApprovalTargetAppliesPersistedChanges(
  persistedRequest: Record<string, unknown>,
  targetWrite: DirectoryWrite,
  targetPrevious: Record<string, unknown> | undefined,
): void {
  if (!targetPrevious) throw new DirectoryConflict('Request target changed concurrently. Reload the directory before saving.');
  const requestedChanges = isPlainRecord(persistedRequest.requestedChanges) ? persistedRequest.requestedChanges : {};
  const targetData = targetWrite.data || {};
  const requestedEntries = Object.entries(requestedChanges);
  if (requestedEntries.length === 0) {
    throw new DirectoryValidationError('Approved correction request has no requested changes to apply.');
  }
  // Every persisted requested field must land in the final target state, not just the ones that moved.
  let appliesAtLeastOneChange = false;
  if (Object.hasOwn(requestedChanges, 'standardHours')) {
    if (persistedRequest.targetType !== 'Location') throw new DirectoryValidationError('Standard hours corrections require a Location target.');
    if (Object.hasOwn(requestedChanges, 'hoursTemplateId') || (Object.hasOwn(requestedChanges, 'hoursMode') && requestedChanges.hoursMode !== 'custom')) {
      throw new DirectoryValidationError('Hours corrections apply a custom schedule, not a template assignment.');
    }
    assertHoursBaseline(isPlainRecord(persistedRequest.currentSnapshot) ? persistedRequest.currentSnapshot : {}, targetPrevious);
    if (isDeepStrictEqual(requestedChanges.standardHours, targetPrevious.standardHours)) {
      throw new DirectoryValidationError('Approved correction request does not change the target record.');
    }
  }
  for (const [key, value] of requestedEntries) {
    if (key === 'locationInboxEmail') {
      const currentSnapshot = isPlainRecord(persistedRequest.currentSnapshot) ? persistedRequest.currentSnapshot : {};
      const requestedCurrentValue = Object.hasOwn(currentSnapshot, key) ? currentSnapshot[key] : null;
      const actualCurrentValue = Object.hasOwn(targetPrevious, key) ? targetPrevious[key] : null;
      if (!isDeepStrictEqual(requestedCurrentValue, actualCurrentValue)) {
        throw new DirectoryConflict('The Location inbox changed after the correction request was submitted. Review the request again.');
      }

    }
    const baseline = isPlainRecord(persistedRequest.currentSnapshot) ? persistedRequest.currentSnapshot : {};
    if (key !== 'locationInboxEmail' && Object.hasOwn(baseline, key)
      && !isDeepStrictEqual(baseline[key] ?? null, targetPrevious[key] ?? null)) {
      throw new DirectoryConflict(`${key} changed since submission. Reject this stale request and submit a replacement after reviewing the current record.`);
    }
    if (!Object.hasOwn(targetData, key) || !isDeepStrictEqual(targetData[key], value)) {
      throw new DirectoryValidationError('Approved correction request target update does not match the persisted requested changes.');
    }
    if (!isDeepStrictEqual(targetPrevious[key], value)) appliesAtLeastOneChange = true;
  }
  if (!appliesAtLeastOneChange) {
    throw new DirectoryValidationError('Approved correction request does not change the target record.');
  }
}

function assertHoursBaseline(baseline: Record<string, unknown>, target: Record<string, unknown>): void {
  if (!Object.hasOwn(baseline, 'standardHours')) {
    throw new DirectoryConflict('The submission hours baseline is missing. Reject this request and submit a replacement after reviewing current hours.');
  }
  for (const field of ['standardHours', 'hoursMode', 'hoursTemplateId']) {
    if (Object.hasOwn(baseline, field) && !isDeepStrictEqual(baseline[field] ?? null, target[field] ?? null)) {
      throw new DirectoryConflict('Hours or their template selection changed since submission. Reject this stale request and submit a replacement after reviewing current hours.');
    }
  }
}

function validateCombinedRelationshipState(
  writes: DirectoryWrite[],
  currentLocations: Array<Record<string, unknown>>,
  people: Array<{ id: string; fullName: string; status?: string; activeStatus?: boolean }>,
  users: Array<Record<string, unknown>>,
  registry?: HierarchyRegistry,
): void {
  const peopleById = new Map(people.map(person => [person.id, person]));
  const changedPersonIds = new Set(writes.filter(write => write.collection === 'people').map(write => write.id));

  // Final proposed Location state: pre-transaction snapshot overlaid with this transaction's writes.
  const finalLocationsById = new Map(currentLocations.map(location => [String(location.id), location]));
  for (const write of writes) {
    if (write.collection !== 'locations') continue;
    if (write.operation === 'delete') finalLocationsById.delete(write.id);
    else if (write.data) finalLocationsById.set(write.id, { ...write.data, id: write.id });
  }

  // A leadership reference must stay valid whenever the relationship itself changed (checked at the
  // per-write step) or the Person it points to changed/was removed in this same transaction, whether
  // or not the owning Location document was written.
  if (changedPersonIds.size > 0) {
    for (const location of finalLocationsById.values()) {
      const leadershipRefs = [
        ['storeManagerId', location.storeManagerId],
        ['districtManagerId', location.districtManagerId],
        ['regionalManagerId', location.regionalManagerId],
        ...(Array.isArray(location.assistantStoreManagerIds) ? location.assistantStoreManagerIds.map(id => ['assistantStoreManagerIds', id] as const) : []),
        ...(Array.isArray(location.keyHolderIds) ? location.keyHolderIds.map(id => ['keyHolderIds', id] as const) : []),
      ] as const;

      for (const [field, id] of leadershipRefs) {
        if (typeof id !== 'string' || !id.trim() || !changedPersonIds.has(id)) continue;
        const district = registry?.districts.find(d => d.id === location.districtId);
        if (field === 'districtManagerId' && isRetailHierarchyType(location.type) && district && Object.hasOwn(district, 'districtManagerId')) continue;
        const person = peopleById.get(id);
        if (!person) throw new DirectoryValidationError(`${field} references missing person ${id}.`);
        if ((person.status && person.status !== 'Active') || person.activeStatus === false) {
          throw new DirectoryValidationError(`${field} references inactive person ${person.fullName} (${id}).`);
        }
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

/** Prepare the exact saved Person contact values once for final-state reference checks and persistence. */
function normalizePersonContactWrite(input: Record<string, unknown>, current: Record<string, unknown> | undefined): Record<string, unknown> {
  const data = { ...input };
  if (Object.hasOwn(input, 'phonePrivacy') && !isDeepStrictEqual(input.phonePrivacy, current?.phonePrivacy) && !['Public', 'Internal', 'Restricted'].includes(String(input.phonePrivacy))) throw new DirectoryValidationError('Phone visibility must be Public, Internal or Restricted.');
  for (const field of ['phone', 'workPhone', 'email', 'workEmail', 'phonePrivacy', 'positionIds'] as const) {
    if (!Object.hasOwn(input, field) && current && Object.hasOwn(current, field)) data[field] = current[field];
  }
  for (const [phone, extension] of [['phone', 'phoneExtension'], ['workPhone', 'workPhoneExtension']] as const) {
    if (!Object.hasOwn(input, extension) && data[phone] === current?.[phone] && current && Object.hasOwn(current, extension)) {
      data[extension] = current[extension];
    }
    normalizePhoneWrite(data, current, phone, extension);
  }
  for (const field of ['email', 'workEmail'] as const) {
    if (!Object.hasOwn(input, field) || isDeepStrictEqual(input[field], current?.[field]) || input[field] === '') continue;
    const normalized = normalizePersonEmail(input[field]);
    if (!normalized) throw new DirectoryValidationError(`${field} must be one valid email address.`);
    data[field] = normalized;
  }
  return data;
}

/** Normalize changed phone values while preserving untouched historical values and explicit clears. */
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
  else if (typeof data[extensionField] === 'string' && data[extensionField].trim()) {
    const extension = data[extensionField].trim();
    if (!/^\d{1,10}$/.test(extension)) throw new DirectoryValidationError(`${extensionField} must contain 1 to 10 digits.`);
    data[extensionField] = extension;
  } else delete data[extensionField];
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
