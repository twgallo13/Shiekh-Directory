import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Firestore, type DocumentSnapshot, type QueryDocumentSnapshot, type Transaction } from "@google-cloud/firestore";
import {
  API_CLIENT_SCOPE,
  API_LAST_USED_THROTTLE_MS,
  API_TOKEN_OVERLAP_MS,
  ApiClientConflict,
  ApiClientNotFound,
  type ApiAuthenticationContext,
  type ApiClientAuthenticator,
  type ApiClientStatus,
  type ApiClientStore,
  type ApiClientSummary,
  type ApiTokenStatus,
  type ApiTokenVersionSummary,
  type IssuedApiClient,
  type ManagedApiCredential,
} from "./apiClientApi";
import type { Account } from "./authAuthority";
import { parseApiScopes, type ApiScope } from "../src/lib/apiScopes";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

const CLIENT_COLLECTION = "api_clients";
const TOKEN_COLLECTION = "api_client_tokens";

interface ApiClientDocument {
  id: string;
  name: string;
  status: ApiClientStatus;
  scopes?: unknown;
  grantsVersion?: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

interface ApiTokenDocument {
  clientId: string;
  tokenVersionId: string;
  cursorSigningKey: string;
  status: ApiTokenStatus;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateApiToken(): string {
  return `dir_v1_${randomBytes(32).toString("base64url")}`;
}

export class FirestoreApiClientStore implements ApiClientStore, ApiClientAuthenticator {
  constructor(private readonly firestore: Firestore, private readonly now: () => Date = () => new Date()) {}

  async authenticate(token: string, context: ApiAuthenticationContext): Promise<ManagedApiCredential | null> {
    const tokenReference = this.firestore.collection(TOKEN_COLLECTION).doc(hashApiToken(token));
    try {
      const credential = await this.firestore.runTransaction(async transaction => {
        const tokenSnapshot = await transaction.get(tokenReference);
        const tokenData = tokenSnapshot.data() as ApiTokenDocument | undefined;
        if (!tokenSnapshot.exists || !tokenData || !validCursorSigningKey(tokenData.cursorSigningKey)) return null;
        const clientReference = this.firestore.collection(CLIENT_COLLECTION).doc(tokenData.clientId);
        const clientSnapshot = await transaction.get(clientReference);
        const clientData = clientSnapshot.data() as ApiClientDocument | undefined;
        const current = this.now();
        if (!clientSnapshot.exists || !clientData || clientData.status !== "Active" || !tokenIsActive(tokenData, current)) return null;
        const scopes = parseApiScopes(clientData.scopes, !Object.hasOwn(clientData, 'scopes'));
        if (!scopes || (clientData.grantsVersion !== undefined && (!Number.isSafeInteger(clientData.grantsVersion) || clientData.grantsVersion < 0))) return null;

        const timestamp = current.toISOString();
        if (shouldUpdateLastUsed(tokenData.lastUsedAt, current)) transaction.set(tokenReference, { lastUsedAt: timestamp }, { merge: true });
        if (shouldUpdateLastUsed(clientData.lastUsedAt, current)) transaction.set(clientReference, { lastUsedAt: timestamp }, { merge: true });
        return {
          clientId: clientData.id,
          tokenVersionId: tokenData.tokenVersionId,
          cursorSigningKey: tokenData.cursorSigningKey,
          scopes,
          grantsVersion: clientData.grantsVersion ?? 0,
        } satisfies ManagedApiCredential;
      });
      logAuthentication(context, credential ? "authorized" : "denied", credential);
      return credential;
    } catch {
      logAuthentication(context, "unavailable");
      throw new Error("API credential provider unavailable.");
    }
  }

  async list(): Promise<ApiClientSummary[]> {
    const [clients, tokens] = await Promise.all([
      this.firestore.collection(CLIENT_COLLECTION).get(),
      this.firestore.collection(TOKEN_COLLECTION).get(),
    ]);
    const tokensByClient = new Map<string, ApiTokenVersionSummary[]>();
    for (const snapshot of tokens.docs) {
      const token = snapshot.data() as ApiTokenDocument;
      const summaries = tokensByClient.get(token.clientId) || [];
      summaries.push(toTokenSummary(token, this.now()));
      tokensByClient.set(token.clientId, summaries);
    }
    return clients.docs
      .map(snapshot => toClientSummary(snapshot, tokensByClient.get(snapshot.id) || []))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async create(name: string, actor: Account, requestedScopes: ApiScope[] = [API_CLIENT_SCOPE]): Promise<IssuedApiClient> {
    const scopes = parseApiScopes(requestedScopes);
    if (!scopes) throw new ApiClientConflict();
    const token = generateApiToken();
    const digest = hashApiToken(token);
    const clientId = `api-${randomUUID()}`;
    const tokenVersionId = `tok-${randomUUID()}`;
    const timestamp = this.now().toISOString();
    const client: ApiClientDocument = {
      id: clientId,
      name,
      status: "Active",
      scopes,
      grantsVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const tokenDocument: ApiTokenDocument = {
      clientId,
      tokenVersionId,
      cursorSigningKey: generateCursorSigningKey(),
      status: "Active",
      createdAt: timestamp,
    };
    await this.firestore.runTransaction(async transaction => {
      const tokenReference = this.firestore.collection(TOKEN_COLLECTION).doc(digest);
      if ((await transaction.get(tokenReference)).exists) throw new ApiClientConflict();
      transaction.create(this.firestore.collection(CLIENT_COLLECTION).doc(clientId), client);
      transaction.create(tokenReference, tokenDocument);
      writeLifecycleAudit(transaction, this.firestore, timestamp, "API Client Created", client, actor, "Created a read-only Directory API client.");
    });
    return { client: toClientSummaryData(client, [toTokenSummary(tokenDocument, this.now())]), token };
  }

  async disable(id: string, actor: Account): Promise<ApiClientSummary> {
    return this.changeStatus(id, "Active", "Disabled", "API Client Disabled", actor, "Disabled Directory API access.");
  }

  async updateScopes(id: string, requested: ApiScope[], expected: ApiScope[], actor: Account): Promise<ApiClientSummary> {
    const scopes = parseApiScopes(requested);
    const expectedScopes = parseApiScopes(expected);
    if (!scopes || !expectedScopes) throw new ApiClientConflict();
    return this.firestore.runTransaction(async transaction => {
      const reference = this.firestore.collection(CLIENT_COLLECTION).doc(id);
      const [snapshot, tokens] = await Promise.all([
        transaction.get(reference),
        transaction.get(this.firestore.collection(TOKEN_COLLECTION).where('clientId', '==', id)),
      ]);
      if (!snapshot.exists) throw new ApiClientNotFound();
      const client = snapshot.data() as ApiClientDocument;
      const currentScopes = parseApiScopes(client.scopes, !Object.hasOwn(client, 'scopes'));
      if (client.status === 'Revoked' || !currentScopes || JSON.stringify(currentScopes) !== JSON.stringify(expectedScopes)) throw new ApiClientConflict();
      const timestamp = this.now().toISOString();
      const grantsVersion = (client.grantsVersion ?? 0) + 1;
      if (!Number.isSafeInteger(grantsVersion) || grantsVersion < 1) throw new ApiClientConflict();
      const updated = { ...client, scopes, grantsVersion, updatedAt: timestamp };
      transaction.set(reference, { scopes, grantsVersion, updatedAt: timestamp }, { merge: true });
      writeLifecycleAudit(transaction, this.firestore, timestamp, 'API Client Scopes Changed', updated, actor,
        `Changed grants from ${currentScopes.join(', ')} to ${scopes.join(', ')}. Active tokens immediately use these grants.`);
      return toClientSummaryData(updated, tokens.docs.map(document => toTokenSummary(document.data() as ApiTokenDocument, this.now())));
    });
  }

  async enable(id: string, actor: Account): Promise<ApiClientSummary> {
    return this.changeStatus(id, "Disabled", "Active", "API Client Re-enabled", actor, "Re-enabled Directory API access.");
  }

  async rotate(id: string, retirePreviousImmediately: boolean, actor: Account): Promise<IssuedApiClient> {
    const token = generateApiToken();
    const digest = hashApiToken(token);
    const tokenVersionId = `tok-${randomUUID()}`;
    const current = this.now();
    const timestamp = current.toISOString();
    const overlapExpiresAt = new Date(current.getTime() + API_TOKEN_OVERLAP_MS).toISOString();
    const newToken: ApiTokenDocument = { clientId: id, tokenVersionId, cursorSigningKey: generateCursorSigningKey(), status: "Active", createdAt: timestamp };
    let result!: ApiClientSummary;
    await this.firestore.runTransaction(async transaction => {
      const clientReference = this.firestore.collection(CLIENT_COLLECTION).doc(id);
      const tokenReference = this.firestore.collection(TOKEN_COLLECTION).doc(digest);
      const [clientSnapshot, tokenSnapshot, existingTokens] = await Promise.all([
        transaction.get(clientReference),
        transaction.get(tokenReference),
        transaction.get(this.firestore.collection(TOKEN_COLLECTION).where("clientId", "==", id)),
      ]);
      if (!clientSnapshot.exists) throw new ApiClientNotFound();
      const client = clientSnapshot.data() as ApiClientDocument;
      if (client.status !== "Active" || tokenSnapshot.exists || !parseApiScopes(client.scopes, !Object.hasOwn(client, 'scopes'))) throw new ApiClientConflict();

      for (const existingSnapshot of existingTokens.docs) {
        const existing = existingSnapshot.data() as ApiTokenDocument;
        if (!tokenIsActive(existing, current)) continue;
        if (retirePreviousImmediately) {
          transaction.set(existingSnapshot.ref, { status: "Retired", expiresAt: timestamp }, { merge: true });
        } else {
          const expiresAt = earlierTimestamp(existing.expiresAt, overlapExpiresAt);
          transaction.set(existingSnapshot.ref, { status: "Retiring", expiresAt }, { merge: true });
        }
      }
      transaction.create(tokenReference, newToken);
      transaction.set(clientReference, { updatedAt: timestamp }, { merge: true });
      writeLifecycleAudit(
        transaction,
        this.firestore,
        timestamp,
        "API Client Token Rotated",
        client,
        actor,
        retirePreviousImmediately ? "Rotated the token and retired previous versions immediately." : "Rotated the token with a 24-hour overlap.",
      );
      const versions = existingTokens.docs.map(snapshot => {
        const existing = snapshot.data() as ApiTokenDocument;
        if (!tokenIsActive(existing, current)) return toTokenSummary(existing, current);
        return toTokenSummary({
          ...existing,
          status: retirePreviousImmediately ? "Retired" : "Retiring",
          expiresAt: retirePreviousImmediately ? timestamp : earlierTimestamp(existing.expiresAt, overlapExpiresAt),
        }, current);
      });
      result = toClientSummaryData({ ...client, updatedAt: timestamp }, [...versions, toTokenSummary(newToken, current)]);
    });
    return { client: result, token };
  }

  async revoke(id: string, actor: Account): Promise<ApiClientSummary> {
    const current = this.now();
    const timestamp = current.toISOString();
    let result!: ApiClientSummary;
    await this.firestore.runTransaction(async transaction => {
      const clientReference = this.firestore.collection(CLIENT_COLLECTION).doc(id);
      const [clientSnapshot, tokens] = await Promise.all([
        transaction.get(clientReference),
        transaction.get(this.firestore.collection(TOKEN_COLLECTION).where("clientId", "==", id)),
      ]);
      if (!clientSnapshot.exists) throw new ApiClientNotFound();
      const client = clientSnapshot.data() as ApiClientDocument;
      if (client.status === "Revoked") throw new ApiClientConflict();
      transaction.set(clientReference, { status: "Revoked", updatedAt: timestamp }, { merge: true });
      tokens.docs.forEach(snapshot => transaction.set(snapshot.ref, { status: "Revoked", expiresAt: timestamp }, { merge: true }));
      writeLifecycleAudit(transaction, this.firestore, timestamp, "API Client Revoked", client, actor, "Permanently revoked Directory API access.");
      result = toClientSummaryData(
        { ...client, status: "Revoked", updatedAt: timestamp },
        tokens.docs.map(snapshot => toTokenSummary({ ...(snapshot.data() as ApiTokenDocument), status: "Revoked", expiresAt: timestamp }, current)),
      );
    });
    return result;
  }

  private async changeStatus(id: string, expected: ApiClientStatus, status: ApiClientStatus, action: string, actor: Account, details: string): Promise<ApiClientSummary> {
    const timestamp = this.now().toISOString();
    let client!: ApiClientDocument;
    let tokenVersions: ApiTokenVersionSummary[] = [];
    await this.firestore.runTransaction(async transaction => {
      const clientReference = this.firestore.collection(CLIENT_COLLECTION).doc(id);
      const [clientSnapshot, tokens] = await Promise.all([
        transaction.get(clientReference),
        transaction.get(this.firestore.collection(TOKEN_COLLECTION).where("clientId", "==", id)),
      ]);
      if (!clientSnapshot.exists) throw new ApiClientNotFound();
      const current = clientSnapshot.data() as ApiClientDocument;
      if (current.status !== expected) throw new ApiClientConflict();
      client = { ...current, status, updatedAt: timestamp };
      tokenVersions = tokens.docs.map(snapshot => toTokenSummary(snapshot.data() as ApiTokenDocument, this.now()));
      transaction.set(clientReference, { status, updatedAt: timestamp }, { merge: true });
      writeLifecycleAudit(transaction, this.firestore, timestamp, action, current, actor, details);
    });
    return toClientSummaryData(client, tokenVersions);
  }
}

export function createFirestoreApiClientStore(): FirestoreApiClientStore {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === "(default)") throw new Error("A named Firestore database is required.");
  return new FirestoreApiClientStore(new Firestore({ projectId, databaseId }));
}

function tokenIsActive(token: ApiTokenDocument, now: Date): boolean {
  if (token.status !== "Active" && token.status !== "Retiring") return false;
  return !token.expiresAt || Date.parse(token.expiresAt) > now.getTime();
}

function generateCursorSigningKey(): string {
  return randomBytes(32).toString("base64url");
}

function validCursorSigningKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function shouldUpdateLastUsed(lastUsedAt: string | undefined, now: Date): boolean {
  return !lastUsedAt || !Number.isFinite(Date.parse(lastUsedAt)) || now.getTime() - Date.parse(lastUsedAt) >= API_LAST_USED_THROTTLE_MS;
}

function earlierTimestamp(existing: string | undefined, maximum: string): string {
  return existing && Date.parse(existing) < Date.parse(maximum) ? existing : maximum;
}

function toClientSummary(snapshot: QueryDocumentSnapshot, tokenVersions: ApiTokenVersionSummary[]): ApiClientSummary {
  return toClientSummaryData(snapshot.data() as ApiClientDocument, tokenVersions);
}

function toClientSummaryData(client: ApiClientDocument, tokenVersions: ApiTokenVersionSummary[]): ApiClientSummary {
  const scopes = parseApiScopes(client.scopes, !Object.hasOwn(client, 'scopes'));
  if (!scopes) throw new ApiClientConflict('Invalid stored API client grants.');
  return {
    id: client.id,
    name: client.name,
    status: client.status,
    scopes,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
    ...(client.lastUsedAt ? { lastUsedAt: client.lastUsedAt } : {}),
    tokenVersions: tokenVersions.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

function toTokenSummary(token: ApiTokenDocument, now: Date): ApiTokenVersionSummary {
  const status = token.status === "Retiring" && token.expiresAt && Date.parse(token.expiresAt) <= now.getTime() ? "Retired" : token.status;
  return {
    status,
    createdAt: token.createdAt,
    ...(token.expiresAt ? { expiresAt: token.expiresAt } : {}),
    ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt } : {}),
  };
}

function writeLifecycleAudit(
  transaction: Transaction,
  firestore: Firestore,
  timestamp: string,
  action: string,
  client: Pick<ApiClientDocument, "id" | "name">,
  actor: Account,
  details: string,
): void {
  const reference = firestore.collection("audit_logs").doc(`aud-api-${Date.now()}-${randomUUID().slice(0, 8)}`);
  transaction.create(reference, {
    id: reference.id,
    timestamp,
    userId: actor.uid,
    userName: actor.name,
    action,
    entityType: "Setting",
    entityId: client.id,
    entityName: client.name,
    details,
  });
}

function logAuthentication(
  context: ApiAuthenticationContext,
  outcome: "authorized" | "denied" | "unavailable",
  credential?: ManagedApiCredential | null,
): void {
  console.info("[Directory API Authentication]", JSON.stringify({
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    outcome,
    ...(credential ? { clientId: credential.clientId, tokenVersionId: credential.tokenVersionId } : {}),
  }));
}