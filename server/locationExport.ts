import { createHash, randomUUID } from "node:crypto";
import { Firestore, type QueryDocumentSnapshot } from "@google-cloud/firestore";
import { stringify } from "csv-stringify/sync";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from "./authAuthority";
import { buildLocationReadProjection, type ReadProjectionPerson } from "../src/lib/readProjectionContract";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

export type LocationExportMode = "all-stores";

export interface LocationExportRecord {
  id: string;
  [key: string]: unknown;
}

export interface LocationExportSnapshot {
  locations: LocationExportRecord[];
  people: LocationExportRecord[];
}

export interface LocationExportStore {
  readLocationExportSnapshot(): Promise<LocationExportSnapshot>;
}

export interface LocationExportMetadata {
  exportMode: LocationExportMode;
  recordCount: number;
  storeNumberSetDigest: string;
  generatedAt: string;
  appliedLifecycle: "Active";
  authorizationScope: { type: "company-wide"; label: string } | { type: "exact-store"; label: string; storeNumber: string };
  missingCanonicalPersonReferences: number;
  filename: string;
  expiresAt: string;
}

export interface PreparedLocationExport {
  token: string;
  metadata: LocationExportMetadata;
  csv: string;
  ownerUid: string;
  authorityDigest: string;
}

export class LocationExportFailure extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

const LOCATION_EXPORT_COLUMNS = [
  "StoreNumber",
  "StoreName",
  "Type",
  "Address",
  "City",
  "State",
  "ZipCode",
  "Phone",
  "District",
  "StoreManager",
  "StoreManagerPhone",
  "DistrictManager",
  "AssistantStoreManagers",
  "OperationalStatus",
  "RecordStatus",
  "GoogleReviewUrl",
  "StorePageUrl",
] as const;

const EXPORT_TOKEN_TTL_MS = 2 * 60_000;
const preparedExports = new Map<string, PreparedLocationExport>();

export function createLocationExportRouter(authenticate: Authenticate | null, store: LocationExportStore, options: { now?: () => Date; rateLimit?: false } = {}) {
  const router = Router();
  const now = options.now ?? (() => new Date());
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  if (options.rateLimit !== false) router.use(rateLimit({ limit: 30, windowMs: 60_000, standardHeaders: "draft-8", legacyHeaders: false }));

  router.post("/locations/prepare", async (request, response) => {
    let account: Account;
    try { account = await authenticateRequest(authenticate, request.get("authorization")); }
    catch (error) { return sendLocationExportError(response, error); }

    try {
      const prepared = await prepareLocationExport(account, store, now());
      preparedExports.set(prepared.token, prepared);
      cleanupExpiredExports(now());
      response.json({ token: prepared.token, metadata: prepared.metadata });
    } catch (error) {
      sendLocationExportError(response, error);
    }
  });

  router.get("/locations/:token", async (request, response) => {
    let account: Account;
    try { account = await authenticateRequest(authenticate, request.get("authorization")); }
    catch (error) { return sendLocationExportError(response, error); }

    try {
      cleanupExpiredExports(now());
      const token = request.params.token;
      if (!token || token.length > 128) throw new LocationExportFailure(400, "invalid_export_token", "The export token is invalid.");
      const prepared = preparedExports.get(token);
      if (!prepared || new Date(prepared.metadata.expiresAt).getTime() <= now().getTime()) throw new LocationExportFailure(410, "export_expired", "Prepare the export again before downloading.");
      if (prepared.ownerUid !== account.uid || prepared.authorityDigest !== authorityDigest(account)) throw new LocationExportFailure(403, "export_authority_changed", "Your export authorization changed. Prepare the export again.");
      preparedExports.delete(token);
      response
        .status(200)
        .type("text/csv; charset=utf-8")
        .set("Content-Disposition", `attachment; filename="${prepared.metadata.filename}"`)
        .set("X-Location-Export-Count", String(prepared.metadata.recordCount))
        .set("X-Location-Export-Digest", prepared.metadata.storeNumberSetDigest)
        .send(prepared.csv);
    } catch (error) {
      sendLocationExportError(response, error);
    }
  });

  return router;
}

export async function prepareLocationExport(account: Account, store: LocationExportStore, generatedAt: Date): Promise<PreparedLocationExport> {
  const scope = resolveExportScope(account.accessScope);
  let snapshot: LocationExportSnapshot;
  try { snapshot = await store.readLocationExportSnapshot(); }
  catch { throw new LocationExportFailure(503, "export_snapshot_unavailable", "The authoritative directory snapshot could not be read."); }

  const activeLocations = snapshot.locations.filter(location => location.recordStatus === "Active");
  assertUniqueIdentities(activeLocations);
  const peopleById = new Map(snapshot.people.filter(person => typeof person.id === "string" && person.id.trim()).map(person => [person.id, person]));
  const people: ReadProjectionPerson[] = snapshot.people
    .filter(person => typeof person.id === 'string' && person.id.trim())
    .map(person => ({
      id: String(person.id),
      fullName: String(person.fullName ?? person.name ?? 'Unknown Person'),
      status: typeof person.status === 'string' ? person.status : 'Active',
    }));
  const authorizedLocations = scope.type === "company-wide"
    ? activeLocations
    : activeLocations.filter(location => normalizeStoreNumber(location.storeNumber) === scope.normalizedStoreNumber);
  const sortedLocations = [...authorizedLocations].sort(compareLocations);
  const storeNumbers = sortedLocations.map(location => stringField(location.storeNumber));
  const missingReferences = new Set<string>();
  const rows = sortedLocations.map(location => toCsvRow(location, peopleById, missingReferences, people));
  const csv = stringify(rows, { header: true, columns: [...LOCATION_EXPORT_COLUMNS], record_delimiter: "\r\n", bom: false });
  const generatedIso = generatedAt.toISOString();
  const expiresAt = new Date(generatedAt.getTime() + EXPORT_TOKEN_TTL_MS).toISOString();
  const metadata: LocationExportMetadata = {
    exportMode: "all-stores",
    recordCount: sortedLocations.length,
    storeNumberSetDigest: digestStoreNumbers(storeNumbers),
    generatedAt: generatedIso,
    appliedLifecycle: "Active",
    authorizationScope: scope.type === "company-wide"
      ? { type: "company-wide", label: scope.label }
      : { type: "exact-store", label: scope.label, storeNumber: scope.storeNumber },
    missingCanonicalPersonReferences: missingReferences.size,
    filename: `shiekh_active_store_directory_${generatedIso.slice(0, 10)}.csv`,
    expiresAt,
  };
  return { token: randomUUID(), metadata, csv, ownerUid: account.uid, authorityDigest: authorityDigest(account) };
}

export class FirestoreLocationExportStore implements LocationExportStore {
  constructor(private readonly firestore: Firestore) {}

  async readLocationExportSnapshot(): Promise<LocationExportSnapshot> {
    return this.firestore.runTransaction(async transaction => {
      const [locations, people] = await Promise.all([
        transaction.get(this.firestore.collection("locations")),
        transaction.get(this.firestore.collection("people")),
      ]);
      return {
        locations: locations.docs.map(toRecord),
        people: people.docs.map(toRecord),
      };
    }, { readOnly: true });
  }
}

export function createFirestoreLocationExportStore(): FirestoreLocationExportStore {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === "(default)") throw new Error("A named Firestore database is required.");
  return new FirestoreLocationExportStore(new Firestore({ projectId, databaseId }));
}

function authenticateRequest(authenticate: Authenticate | null, authorization: string | undefined): Promise<Account> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) throw new LocationExportFailure(401, "invalid_token", "A valid Firebase ID token is required.");
  if (!authenticate) throw new LocationExportFailure(503, "auth_unavailable", "Directory authentication is unavailable.");
  return authenticate(token).catch(error => {
    if (error instanceof AuthenticationUnavailable) throw new LocationExportFailure(503, "auth_unavailable", "Directory authentication is unavailable.");
    if (error instanceof AccessDenied) throw new LocationExportFailure(403, "access_denied", "Your account is not authorized to export locations.");
    throw new LocationExportFailure(401, "invalid_token", "A valid Firebase ID token is required.");
  });
}

function resolveExportScope(accessScope: string) {
  const label = accessScope.trim();
  if (label === "Company" || label === "Company-wide") return { type: "company-wide" as const, label };
  const match = label.match(/^Store ([0-9]+)$/);
  if (!match) throw new LocationExportFailure(403, "unsupported_export_scope", "This access scope is not supported for store export.");
  return { type: "exact-store" as const, label, storeNumber: match[1], normalizedStoreNumber: normalizeStoreNumber(match[1]) };
}

function assertUniqueIdentities(locations: LocationExportRecord[]) {
  const ids = new Set<string>();
  const storeNumbers = new Set<string>();
  for (const location of locations) {
    if (typeof location.id !== "string" || !location.id.trim() || ids.has(location.id)) throw new LocationExportFailure(409, "duplicate_location_id", "The authoritative location snapshot has duplicate or missing location IDs.");
    ids.add(location.id);
    const normalizedStoreNumber = normalizeStoreNumber(location.storeNumber);
    if (!normalizedStoreNumber || storeNumbers.has(normalizedStoreNumber)) throw new LocationExportFailure(409, "duplicate_store_number", "The authoritative location snapshot has duplicate or missing store numbers.");
    storeNumbers.add(normalizedStoreNumber);
  }
}

function normalizeStoreNumber(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return null;
  return value.trim().replace(/^0+(?=\d)/, "");
}

function toCsvRow(
  location: LocationExportRecord,
  peopleById: Map<string, LocationExportRecord>,
  missingReferences: Set<string>,
  people: ReadProjectionPerson[] = [],
): Record<typeof LOCATION_EXPORT_COLUMNS[number], string> {
  const projection = buildLocationReadProjection(
    {
      id: String(location.id ?? ''),
      storeNumber: String(location.storeNumber ?? ''),
      name: String(location.name ?? ''),
      type: String(location.type ?? 'Street / Standalone Location'),
      district: typeof location.district === 'string' ? location.district : undefined,
      districtManagerId: typeof location.districtManagerId === 'string' ? location.districtManagerId : undefined,
      districtManagerName: typeof location.districtManagerName === 'string' ? location.districtManagerName : undefined,
      storeManagerId: typeof location.storeManagerId === 'string' ? location.storeManagerId : undefined,
      storeManagerName: typeof location.storeManagerName === 'string' ? location.storeManagerName : undefined,
      assistantStoreManagerIds: Array.isArray(location.assistantStoreManagerIds)
        ? location.assistantStoreManagerIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      assistantStoreManagerNames: Array.isArray(location.assistantStoreManagerNames)
        ? location.assistantStoreManagerNames.filter((item): item is string => typeof item === 'string')
        : undefined,
      keyHolderIds: Array.isArray(location.keyHolderIds)
        ? location.keyHolderIds.filter((item): item is string => typeof item === 'string')
        : undefined,
      keyHolderNames: Array.isArray(location.keyHolderNames)
        ? location.keyHolderNames.filter((item): item is string => typeof item === 'string')
        : undefined,
    },
    people,
  );

  const storeManagerPhone = resolvePersonPhoneFromCanonical(
    typeof location.storeManagerId === 'string' ? location.storeManagerId : undefined,
    location.storeManagerPhone,
    peopleById,
    people,
  );

  trackMissingCanonicalReferences(
    typeof location.storeManagerId === 'string' ? location.storeManagerId : undefined,
    typeof location.districtManagerId === 'string' ? location.districtManagerId : undefined,
    Array.isArray(location.assistantStoreManagerIds)
      ? location.assistantStoreManagerIds.filter((item): item is string => typeof item === 'string')
      : [],
    people,
    missingReferences,
  );

  return {
    StoreNumber: stringField(location.storeNumber),
    StoreName: stringField(location.name),
    Type: stringField(location.type),
    Address: stringField(location.address),
    City: stringField(location.city),
    State: stringField(location.state),
    ZipCode: stringField(location.zipCode),
    Phone: stringField(location.phone),
    District: projection.district,
    StoreManager: projection.storeManager,
    StoreManagerPhone: storeManagerPhone,
    DistrictManager: projection.districtManager,
    AssistantStoreManagers: projection.assistantStoreManagers.join('; '),
    OperationalStatus: stringField(location.operationalStatus),
    RecordStatus: stringField(location.recordStatus),
    GoogleReviewUrl: stringField(location.googleReviewUrl),
    StorePageUrl: stringField(location.storePageUrl),
  };
}

function resolveCanonicalPhone(id: string | undefined, fallback: unknown, people: ReadProjectionPerson[]): string | undefined {
  if (!id) return undefined;
  const person = people.find(p => p.id === id);
  if (person && (!person.status || person.status === 'Active')) {
    return undefined;
  }
  return undefined;
}

function trackMissingCanonicalReferences(
  storeManagerId: string | undefined,
  districtManagerId: string | undefined,
  assistantIds: string[],
  people: ReadProjectionPerson[],
  missingReferences: Set<string>,
): void {
  const peopleMap = new Map(people.map(p => [p.id, p]));
  for (const id of [storeManagerId, districtManagerId, ...assistantIds].filter((id): id is string => Boolean(id))) {
    const person = peopleMap.get(id);
    if (!person || (person.status && person.status !== 'Active')) {
      missingReferences.add(id);
    }
  }
}

function resolvePersonPhoneFromCanonical(
  id: string | undefined,
  fallbackPhone: unknown,
  peopleById: Map<string, LocationExportRecord>,
  people: ReadProjectionPerson[],
): string {
  if (typeof id === 'string' && id.trim()) {
    const person = people.find(p => p.id === id);
    if (person && (!person.status || person.status === 'Active')) {
      const personRecord = peopleById.get(id);
      if (personRecord) {
        const phone = personRecord.phone || personRecord.workPhone;
        if (typeof phone === 'string' && phone.trim()) return phone;
      }
    }
  }
  return stringField(fallbackPhone);
}

function resolvePersonText(id: unknown, fallback: unknown, peopleById: Map<string, LocationExportRecord>, missingReferences: Set<string>, fields: string[] = ["fullName", "name"]): string {
  if (typeof id === "string" && id.trim()) {
    const person = peopleById.get(id);
    if (!person) {
      missingReferences.add(id);
      return "";
    }
    for (const field of fields) {
      const value = person[field];
      if (typeof value === "string" && value.trim()) return value;
    }
    return "";
  }
  return stringField(fallback);
}

function resolvePeopleList(ids: unknown, fallback: unknown, peopleById: Map<string, LocationExportRecord>, missingReferences: Set<string>): string {
  if (Array.isArray(ids) && ids.length > 0) {
    return ids.map(id => resolvePersonText(id, "", peopleById, missingReferences)).filter(Boolean).join("; ");
  }
  return Array.isArray(fallback) ? fallback.map(stringField).filter(Boolean).join("; ") : stringField(fallback);
}

function stringField(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function compareLocations(left: LocationExportRecord, right: LocationExportRecord) {
  const leftNumber = Number(normalizeStoreNumber(left.storeNumber) ?? Number.MAX_SAFE_INTEGER);
  const rightNumber = Number(normalizeStoreNumber(right.storeNumber) ?? Number.MAX_SAFE_INTEGER);
  return leftNumber - rightNumber || stringField(left.storeNumber).localeCompare(stringField(right.storeNumber)) || stringField(left.id).localeCompare(stringField(right.id));
}

function digestStoreNumbers(storeNumbers: string[]) {
  return createHash("sha256").update(JSON.stringify([...storeNumbers].sort())).digest("hex");
}

function authorityDigest(account: Account) {
  return createHash("sha256").update(JSON.stringify([account.uid, account.role, account.accessScope])).digest("hex");
}

function cleanupExpiredExports(now: Date) {
  for (const [token, prepared] of preparedExports) if (new Date(prepared.metadata.expiresAt).getTime() <= now.getTime()) preparedExports.delete(token);
}

function sendLocationExportError(response: { status(status: number): { json(body: unknown): unknown } }, error: unknown) {
  if (error instanceof LocationExportFailure) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
  return response.status(500).json({ error: { code: "export_failed", message: "The location export could not be prepared." } });
}

function toRecord(snapshot: QueryDocumentSnapshot): LocationExportRecord {
  return { ...snapshot.data(), id: snapshot.id };
}