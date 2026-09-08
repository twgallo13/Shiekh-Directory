import { randomUUID } from "node:crypto";
import { Firestore, type QueryDocumentSnapshot } from "@google-cloud/firestore";
import type { Account } from "./authAuthority";
import type { DirectorySeed } from "../src/lib/directorySeed";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

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
} as const;

export type DirectoryCollection = typeof DIRECTORY_COLLECTIONS[keyof typeof DIRECTORY_COLLECTIONS];
export interface DirectoryWrite { collection: DirectoryCollection; id: string; operation: "set" | "delete"; data?: Record<string, unknown> }
export interface DirectoryAudit { action: string; entityType: string; entityId: string; entityName: string; details: string }
export class DirectoryConflict extends Error {}

export interface DirectoryReader {
  read(): Promise<DirectorySeed>;
}

export interface DirectoryWriter {
  commit(writes: DirectoryWrite[], audit: DirectoryAudit | null, actor: Account): Promise<void>;
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

  async commit(writes: DirectoryWrite[], audit: DirectoryAudit | null, actor: Account): Promise<void> {
    await this.firestore.runTransaction(async transaction => {
      const snapshots = await Promise.all(writes.map(write => transaction.get(this.firestore.collection(write.collection).doc(write.id))));
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

      writes.forEach(write => {
        const reference = this.firestore.collection(write.collection).doc(write.id);
        if (write.operation === "delete") transaction.delete(reference);
        else transaction.set(reference, { ...write.data, id: write.id }, { merge: write.collection === "users" });
      });
      if (audit) {
        const id = `aud-${Date.now()}-${randomUUID().slice(0, 8)}`;
        const previousState = snapshots.length === 1 && snapshots[0].exists ? snapshots[0].data() : undefined;
        const nextState = writes.length === 1 && writes[0].operation === "set" ? { ...writes[0].data, id: writes[0].id } : undefined;
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
        });
      }
    });
  }
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
    name: data.name || data.displayName || data.email || "Directory user",
    email: data.email || "",
    role: data.role,
    status: data.status,
    accessScope: data.accessScope,
    personId: data.personId,
    storeNumber: data.storeNumber || data.assignedStoreId,
    identityLinked: Boolean(data.firebaseUid),
    invitationStatus: data.invitationStatus,
    invitedAt: data.invitedAt,
    lastLogin: data.lastLogin,
  };
  return { ...data, id: snapshot.id };
}