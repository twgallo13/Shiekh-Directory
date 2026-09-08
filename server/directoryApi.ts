import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { publicCustomMetadata, sortedCustomFields, type CustomFieldDefinition } from "../src/lib/customFields";

export const LOCATION_READ_SCOPE = "locations:read";

export interface ApiCredential {
  id: string;
  digest: string;
  scopes: string[];
  expiresAt?: string;
  revoked?: boolean;
}

export interface LocationDocument {
  id: string;
  data: Record<string, unknown>;
  updatedAt: Date;
}

export interface LocationRepository {
  readPage(options: LocationPageOptions): Promise<LocationPage>;
  findActiveByStoreNumber(storeNumber: string): Promise<LocationDocument | null>;
  readCustomFieldDefinitions?(): Promise<CustomFieldDefinition[]>;
}

export interface LocationPageOptions {
  snapshotAt: Date;
  limit: number;
  afterId?: string;
}

export interface LocationPage {
  records: LocationDocument[];
  nextId: string | null;
}

export class LocationConflictError extends Error {}

export function assertUniqueStoreNumbers(records: { data: Record<string, unknown> }[]): void {
  const seen = new Set<string>();
  for (const record of records) {
    const storeNumber = record.data.storeNumber;
    if (typeof storeNumber !== "string" || !storeNumber.trim() || seen.has(storeNumber)) {
      throw new LocationConflictError();
    }
    seen.add(storeNumber);
  }
}

export interface DirectoryApiOptions {
  credentials: ApiCredential[];
  tokenHmacSecret: string;
  locations: LocationRepository;
  now?: () => Date;
  rateLimit?: false | {
    limit: number;
    windowMs: number;
  };
}

interface CursorPayload {
  v: 2;
  id: string;
  updatedSince: string | null;
  snapshotAt: string;
  customFieldsVersion?: string;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const SNAPSHOT_TTL_MS = 15 * 60_000;

export function digestApiToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function loadApiCredentials(value = process.env.DIRECTORY_API_CREDENTIALS_JSON): ApiCredential[] {
  if (!value) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("DIRECTORY_API_CREDENTIALS_JSON must be valid JSON.");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("DIRECTORY_API_CREDENTIALS_JSON must contain an array.");
  }

  const ids = new Set<string>();
  const digests = new Set<string>();
  return parsed.map((credential, index) => {
    if (!credential || typeof credential !== "object") {
      throw new Error(`Credential at index ${index} must be an object.`);
    }

    const candidate = credential as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" || !candidate.id.trim() ||
      typeof candidate.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(candidate.digest) ||
      !Array.isArray(candidate.scopes) ||
      !candidate.scopes.every((scope) => typeof scope === "string")
    ) {
      throw new Error(`Credential at index ${index} is invalid.`);
    }

    if (candidate.expiresAt !== undefined && parseIsoTimestamp(candidate.expiresAt) === null) {
      throw new Error(`Credential at index ${index} has an invalid expiresAt timestamp.`);
    }
    if (candidate.revoked !== undefined && typeof candidate.revoked !== "boolean") {
      throw new Error(`Credential at index ${index} has an invalid revoked flag.`);
    }
    if (ids.has(candidate.id)) throw new Error("Duplicate credential IDs are not allowed.");
    if (digests.has(candidate.digest)) throw new Error("Duplicate token digests are not allowed.");
    ids.add(candidate.id);
    digests.add(candidate.digest);

    return {
      id: candidate.id,
      digest: candidate.digest,
      scopes: candidate.scopes,
      expiresAt: candidate.expiresAt as string | undefined,
      revoked: candidate.revoked === true,
    };
  });
}

export function createDirectoryApiRouter(options: DirectoryApiOptions): Router {
  const router = Router();
  const now = options.now ?? (() => new Date());

  router.use(requestIdMiddleware);

  if (options.rateLimit !== false) {
    const rateLimitOptions = options.rateLimit ?? {
      limit: readPositiveInteger(process.env.DIRECTORY_API_RATE_LIMIT) ?? 100,
      windowMs: readPositiveInteger(process.env.DIRECTORY_API_RATE_WINDOW_MS) ?? 60_000,
    };

    router.use(rateLimit({
      windowMs: rateLimitOptions.windowMs,
      limit: rateLimitOptions.limit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_request, response) => {
        sendError(response, 429, "rate_limit_exceeded", "Too many requests. Try again later.");
      },
    }));
  }

  router.use(createAuthenticationMiddleware(options.credentials, options.tokenHmacSecret, now));
  router.use(requireScope(LOCATION_READ_SCOPE));
  router.use(async (_request, response, next) => {
    const definitions = sortedCustomFields(await options.locations.readCustomFieldDefinitions?.() || []);
    const fields = definitions.filter(field => field.apiVisible && !field.retired);
    response.locals.customFieldDefinitions = fields;
    response.locals.customFieldsVersion = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
    response.locals.hasCustomFieldSchema = Boolean(options.locations.readCustomFieldDefinitions);
    next();
  });

  router.get('/location-fields', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ version: response.locals.customFieldsVersion, fields: response.locals.customFieldDefinitions });
  });

  router.get("/locations", async (request, response) => {
    const limit = parsePageSize(request.query.limit);
    if (limit === null) {
      return sendError(response, 400, "invalid_limit", `limit must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
    }

    const updatedSince = parseUpdatedSince(request.query.updatedSince);
    if (updatedSince === undefined) {
      return sendError(response, 400, "invalid_updated_since", "updatedSince must be an ISO 8601 timestamp with a timezone.");
    }

    const canonicalUpdatedSince = updatedSince?.toISOString() ?? null;
    const cursor = parseCursor(request.query.cursor, options.tokenHmacSecret);
    if (cursor === undefined) {
      return sendError(response, 400, "invalid_cursor", "cursor is invalid or malformed.");
    }
    if (cursor && cursor.updatedSince !== canonicalUpdatedSince) {
      return sendError(response, 400, "cursor_filter_mismatch", "cursor does not match the current updatedSince filter.");
    }

    const snapshotAt = cursor ? new Date(cursor.snapshotAt) : new Date(Math.floor(now().getTime() / 1000) * 1000);
    if (snapshotAt.getTime() > now().getTime() || now().getTime() - snapshotAt.getTime() > SNAPSHOT_TTL_MS) {
      return sendError(response, 400, "snapshot_expired", "Restart synchronization from the last completed watermark.");
    }
    if (updatedSince && updatedSince > snapshotAt) {
      return sendError(response, 400, "invalid_updated_since", "updatedSince cannot exceed the snapshot watermark.");
    }
    const customFieldsVersion = response.locals.customFieldsVersion as string;
    if ((cursor && cursor.customFieldsVersion !== customFieldsVersion)
      || (request.query.customFieldsVersion !== undefined && request.query.customFieldsVersion !== customFieldsVersion)) {
      return sendError(response, 409, 'custom_fields_changed', 'Custom fields changed. Restart a full reconciliation without a cursor, updatedSince, or customFieldsVersion.');
    }
    const effectiveUpdatedSince = response.locals.hasCustomFieldSchema && request.query.customFieldsVersion === undefined ? null : updatedSince;

    const result = await options.locations.readPage({ snapshotAt, limit, afterId: cursor?.id });
    const page = result.records
      .filter((record) => record.data.recordStatus === "Active")
      .filter((record) => record.updatedAt <= snapshotAt)
      .filter((record) => !effectiveUpdatedSince || record.updatedAt.getTime() >= effectiveUpdatedSince.getTime());
    const nextCursor = result.nextId
      ? encodeCursor({
          v: 2,
          id: result.nextId,
          updatedSince: canonicalUpdatedSince,
          snapshotAt: snapshotAt.toISOString(),
          customFieldsVersion,
        }, options.tokenHmacSecret)
      : null;

    return sendCacheableJson(request, response, {
      data: page.map(record => mapPublicLocation(record, response.locals.customFieldDefinitions)),
      sync: {
        watermark: snapshotAt.toISOString(),
        mode: effectiveUpdatedSince ? "delta" : "full",
        customFieldsVersion,
        fullReconciliationRequired: true,
      },
      pagination: {
        limit,
        nextCursor,
      },
    });
  });

  router.get("/locations/:storeNumber", async (request, response) => {
    const storeNumber = request.params.storeNumber;
    if (!storeNumber || storeNumber.length > 64) {
      return sendError(response, 400, "invalid_store_number", "storeNumber is invalid.");
    }

    const location = await options.locations.findActiveByStoreNumber(storeNumber);
    if (!location || location.data.recordStatus !== "Active") {
      return sendError(response, 404, "location_not_found", "Location not found.");
    }

    return sendCacheableJson(request, response, { data: mapPublicLocation(location, response.locals.customFieldDefinitions), customFieldsVersion: response.locals.customFieldsVersion });
  });

  router.use((_request, response) => {
    sendError(response, 404, "api_route_not_found", "API route not found.");
  });

  return router;
}

export const apiNotFoundHandler: RequestHandler = (_request, response) => {
  ensureRequestId(response);
  sendError(response, 404, "api_route_not_found", "API route not found.");
};

export const apiErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  ensureRequestId(response);
  if (response.headersSent) return;
  if (error instanceof LocationConflictError) {
    sendError(response, 409, "location_conflict", "Location identity is ambiguous. Data owner reconciliation is required.");
    return;
  }
  console.error("[Directory API Error]", response.locals.requestId, "Repository or request failure");
  sendError(response, 500, "internal_error", "An unexpected error occurred.");
};

const requestIdMiddleware: RequestHandler = (_request, response, next) => {
  ensureRequestId(response);
  next();
};

function ensureRequestId(response: Response): string {
  const existing = response.locals.requestId;
  if (typeof existing === "string") return existing;

  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader("X-Request-ID", requestId);
  return requestId;
}

function createAuthenticationMiddleware(
  credentials: ApiCredential[],
  tokenHmacSecret: string,
  now: () => Date,
): RequestHandler {
  return (request, response, next) => {
    if (!tokenHmacSecret || credentials.length === 0) {
      return sendError(response, 503, "api_not_configured", "API authentication is not configured.");
    }

    const authorization = request.get("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match || match[1].length > 4096) {
      return sendError(response, 401, "invalid_token", "A valid Bearer token is required.");
    }

    const presentedDigest = Buffer.from(digestApiToken(match[1], tokenHmacSecret), "hex");
    const credential = credentials.find((candidate) => {
      const storedDigest = Buffer.from(candidate.digest, "hex");
      return storedDigest.length === presentedDigest.length && timingSafeEqual(storedDigest, presentedDigest);
    });

    if (!credential || credential.revoked) {
      return sendError(response, 401, "invalid_token", "A valid Bearer token is required.");
    }

    if (credential.expiresAt) {
      const expiresAt = parseIsoTimestamp(credential.expiresAt);
      if (!expiresAt || expiresAt.getTime() <= now().getTime()) {
        return sendError(response, 401, "invalid_token", "A valid Bearer token is required.");
      }
    }

    response.locals.apiCredential = credential;
    next();
  };
}

function requireScope(scope: string): RequestHandler {
  return (_request, response, next) => {
    const credential = response.locals.apiCredential as ApiCredential | undefined;
    if (!credential?.scopes.includes(scope)) {
      return sendError(response, 403, "insufficient_scope", `The ${scope} scope is required.`);
    }
    next();
  };
}

function sendError(response: Response, status: number, code: string, message: string): Response {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json({
    error: {
      code,
      message,
      requestId: ensureRequestId(response),
    },
  });
}

function sendCacheableJson(request: Request, response: Response, payload: unknown): Response {
  const body = JSON.stringify(payload);
  const etag = `"${createHash("sha256").update(body).digest("base64url")}"`;
  response.setHeader("Cache-Control", response.locals.hasCustomFieldSchema ? "no-store" : "private, max-age=60, must-revalidate");
  response.setHeader("ETag", etag);

  if (request.get("if-none-match")?.split(",").map((value) => value.trim()).includes(etag)) {
    return response.status(304).end();
  }

  return response.type("application/json").send(body);
}

function mapPublicLocation(record: LocationDocument, definitions: CustomFieldDefinition[]): Record<string, unknown> {
  const source = record.data;
  const location: Record<string, unknown> = {
    id: record.id,
    storeNumber: getStoreNumber(record),
    recordStatus: "Active",
    updatedAt: record.updatedAt.toISOString(),
    customMetadata: publicCustomMetadata(source.customMetadata, definitions),
  };

  copyStrings(source, location, [
    "name",
    "type",
    "mallOrCenterName",
    "address",
    "city",
    "state",
    "zipCode",
    "timeZone",
    "district",
    "operationalStatus",
    "lastVerifiedAt",
    "slug",
    "googleReviewUrl",
    "storePageUrl",
  ]);

  const phonePrivacy = optionalString(source.phonePrivacy);
  if ((!phonePrivacy || phonePrivacy === "Public") && typeof source.phone === "string") {
    location.phone = source.phone;
  }
  if (phonePrivacy) location.phonePrivacy = phonePrivacy;

  const standardHours = mapWeeklySchedule(source.standardHours);
  if (standardHours) location.standardHours = standardHours;

  const activeNotice = mapActiveNotice(source.activeNotice);
  if (activeNotice) location.activeNotice = activeNotice;

  const holidayHours = mapHoursOverrides(source.holidayHours, "holiday");
  if (holidayHours) location.holidayHours = holidayHours;

  const specialHours = mapHoursOverrides(source.specialHours, "special");
  if (specialHours) location.specialHours = specialHours;

  return location;
}

function mapWeeklySchedule(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;

  const schedule: Record<string, unknown> = {};
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]) {
    const hours = mapDayHours(value[day]);
    if (hours) schedule[day] = hours;
  }
  return Object.keys(schedule).length > 0 ? schedule : undefined;
}

function mapDayHours(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || typeof value.isClosed !== "boolean") return undefined;
  const hours: Record<string, unknown> = { isClosed: value.isClosed };
  if (typeof value.open === "string") hours.open = value.open;
  if (typeof value.close === "string") hours.close = value.close;
  return hours;
}

function mapActiveNotice(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const notice: Record<string, unknown> = {};
  copyStrings(value, notice, ["shortDescription", "effectiveDate", "expectedResolutionDate", "displayUntilDate"]);
  return Object.keys(notice).length > 0 ? notice : undefined;
}

function mapHoursOverrides(value: unknown, kind: "holiday" | "special"): Record<string, unknown>[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const override: Record<string, unknown> = {};
    copyStrings(
      candidate,
      override,
      kind === "holiday"
        ? ["id", "holidayName", "date"]
        : ["id", "description", "startDate", "endDate"],
    );
    const hours = mapDayHours(candidate.hours);
    if (hours) override.hours = hours;
    return Object.keys(override).length > 0 ? [override] : [];
  });
}

function copyStrings(source: Record<string, unknown>, target: Record<string, unknown>, keys: string[]): void {
  for (const key of keys) {
    if (typeof source[key] === "string") target[key] = source[key];
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getStoreNumber(record: LocationDocument): string {
  return typeof record.data.storeNumber === "string" ? record.data.storeNumber : record.id;
}

function parsePageSize(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= 1 && parsed <= MAX_PAGE_SIZE ? parsed : null;
}

function parseUpdatedSince(value: unknown): Date | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== "string") return undefined;
  return parseIsoTimestamp(value) ?? undefined;
}

function parseIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
    || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function encodeCursor(payload: CursorPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signCursor(encoded, secret)}`;
}

function signCursor(encoded: string, secret: string): string {
  return createHmac("sha256", secret).update(`directory-cursor-v2:${encoded}`).digest("base64url");
}

function parseCursor(value: unknown, secret: string): CursorPayload | null | undefined {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return undefined;

  try {
    const [encoded, signature] = value.split(".");
    const expected = Buffer.from(signCursor(encoded, secret));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return undefined;
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      parsed.v !== 2 ||
      !parseIsoTimestamp(parsed.snapshotAt) ||
      typeof parsed.id !== "string" || !parsed.id || parsed.id.includes("/") ||
      (parsed.updatedSince !== null && typeof parsed.updatedSince !== "string")
    ) {
      return undefined;
    }
    return parsed as CursorPayload;
  } catch {
    return undefined;
  }
}

function readPositiveInteger(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}