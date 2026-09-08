import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { AccessDenied, APPLICATION_ROLES, AuthenticationUnavailable, type Account, type Authenticate } from "./authAuthority";
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryAudit, type DirectoryCollection, type DirectoryWrite, type DirectoryWriter } from "./firestoreDirectory";

const COLLECTION_ROLES: Record<DirectoryCollection, Account["role"][]> = {
  locations: ["System Administrator", "Directory Data Steward", "Editor"],
  people: ["System Administrator", "Directory Data Steward", "Editor"],
  users: ["System Administrator"],
  hours_templates: ["System Administrator", "Directory Data Steward"],
  corporate_holidays: ["System Administrator", "Directory Data Steward"],
  requests: ["System Administrator", "Directory Data Steward", "Editor", "Viewer"],
  audit_logs: [],
  email_templates: ["System Administrator", "Directory Data Steward"],
  notification_rules: ["System Administrator", "Directory Data Steward"],
  outbox_logs: [],
  sop_runbooks: ["System Administrator", "Directory Data Steward"],
  custom_field_definitions: ["System Administrator"],
};
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ENTITY_TYPES = new Set(["Location", "Person", "User", "Setting", "Request", "Communication"]);

export function createDirectoryDataRouter(authenticate: Authenticate | null, store: DirectoryWriter) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(rateLimit({ limit: 120, windowMs: 60_000, standardHeaders: "draft-8", legacyHeaders: false }));
  router.post("/commit", async (request, response) => {
    const token = request.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return response.status(401).json({ error: { code: "invalid_token" } });
    if (!authenticate) return response.status(503).json({ error: { code: "directory_unavailable" } });
    let account: Account;
    try { account = await authenticate(token); }
    catch (error) {
      const status = error instanceof AuthenticationUnavailable ? 503 : error instanceof AccessDenied ? 403 : 401;
      return response.status(status).json({ error: { code: status === 503 ? "directory_unavailable" : status === 403 ? "access_denied" : "invalid_token" } });
    }

    const writes = parseWrites(request.body?.writes);
    const audit = parseAudit(request.body?.audit);
    if (!writes || !audit || writes.length > 100 || writes.some(write => !COLLECTION_ROLES[write.collection]?.includes(account.role))) {
      return response.status(403).json({ error: { code: "write_not_allowed" } });
    }
    try {
      await store.commit(writes, audit, account);
      response.status(204).end();
    } catch (error) {
      if (error instanceof DirectoryValidationError) return response.status(400).json({ error: { code: "invalid_metadata", message: error.message } });
      if (error instanceof DirectoryWriteDenied) return response.status(403).json({ error: { code: "write_not_allowed", message: error.message } });
      if (error instanceof DirectoryConflict) return response.status(409).json({ error: { code: "directory_conflict", message: error.message } });
      response.status(503).json({ error: { code: "directory_unavailable" } });
    }
  });
  return router;
}

function parseWrites(value: unknown): DirectoryWrite[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const collections = new Set(Object.keys(COLLECTION_ROLES));
  const writes: DirectoryWrite[] = [];
  for (const candidate of value) {
    if (!plainObject(candidate) || !collections.has(String(candidate.collection)) || !ID_PATTERN.test(String(candidate.id))
      || !["set", "delete"].includes(String(candidate.operation))) return null;
    if (candidate.operation === "set" && (!plainObject(candidate.data) || JSON.stringify(candidate.data).length > 200_000)) return null;
    const collection = candidate.collection as DirectoryCollection;
    let data = candidate.operation === "set" ? candidate.data as Record<string, unknown> : undefined;
    if (collection === "users" && data) {
      const email = String(data.email || "").trim().toLowerCase();
      const name = String(data.name || data.displayName || "").trim();
      const role = String(data.role || "");
      const status = String(data.status || "");
      const accessScope = String(data.accessScope || "").trim();
      if (!/^\S+@\S+\.\S+$/.test(email) || !name || !APPLICATION_ROLES.some(value => value === role)
        || !["Active", "Suspended", "Revoked"].includes(status) || !accessScope) return null;
      data = { email, name, displayName: name, role, status, accessScope,
        ...(typeof data.personId === "string" && data.personId ? { personId: data.personId } : {}),
        ...(typeof data.storeNumber === "string" && data.storeNumber ? { storeNumber: data.storeNumber } : {}) };
    }
    if (Object.hasOwn(candidate, 'expectedCustomMetadata') && !plainObject(candidate.expectedCustomMetadata)) return null;
    if (Object.hasOwn(candidate, 'expectedDefinition') && candidate.expectedDefinition !== null && !plainObject(candidate.expectedDefinition)) return null;
    writes.push({ collection, id: String(candidate.id), operation: candidate.operation as "set" | "delete", ...(data ? { data } : {}),
      ...(Object.hasOwn(candidate, 'expectedCustomMetadata') ? { expectedCustomMetadata: candidate.expectedCustomMetadata as Record<string, unknown> } : {}),
      ...(Object.hasOwn(candidate, 'expectedDefinition') ? { expectedDefinition: candidate.expectedDefinition as DirectoryWrite['expectedDefinition'] } : {}) });
  }
  const locationNumbers = writes.filter(write => write.collection === "locations" && write.operation === "set").map(write => String(write.data?.storeNumber || ""));
  if (locationNumbers.some(number => !number.trim()) || new Set(locationNumbers).size !== locationNumbers.length) return null;
  return writes;
}

function parseAudit(value: unknown): DirectoryAudit | null {
  if (!plainObject(value) || !ENTITY_TYPES.has(String(value.entityType))) return null;
  const audit = Object.fromEntries(["action", "entityType", "entityId", "entityName", "details"].map(field => [field, String(value[field] || "").trim()]));
  if (Object.values(audit).some(field => !field) || audit.action.length > 100 || audit.entityId.length > 128 || audit.entityName.length > 200 || audit.details.length > 1000) return null;
  return audit as unknown as DirectoryAudit;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}