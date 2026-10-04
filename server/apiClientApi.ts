import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { parseApiScopes, type ApiScope } from "../src/lib/apiScopes";
import {
  AccessDenied,
  AuthenticationUnavailable,
  type Account,
  type Authenticate,
} from "./authAuthority";

export const API_CLIENT_SCOPE = "locations:read" as const;
export const API_TOKEN_OVERLAP_MS = 24 * 60 * 60_000;
export const API_LAST_USED_THROTTLE_MS = 15 * 60_000;

export type ApiClientStatus = "Active" | "Disabled" | "Revoked";
export type ApiTokenStatus = "Active" | "Retiring" | "Retired" | "Revoked";

export interface ManagedApiCredential {
  clientId: string;
  tokenVersionId: string;
  cursorSigningKey: string;
  scopes: ApiScope[];
  grantsVersion?: number;
}

export interface ApiAuthenticationContext {
  requestId: string;
  method: string;
  path: string;
}

export interface ApiClientAuthenticator {
  authenticate(token: string, context: ApiAuthenticationContext): Promise<ManagedApiCredential | null>;
}

export interface ApiTokenVersionSummary {
  status: ApiTokenStatus;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface ApiClientSummary {
  id: string;
  name: string;
  status: ApiClientStatus;
  scopes: ApiScope[];
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  tokenVersions: ApiTokenVersionSummary[];
}

export interface IssuedApiClient {
  client: ApiClientSummary;
  token: string;
}

export interface ApiClientStore {
  list(): Promise<ApiClientSummary[]>;
  create(name: string, actor: Account, scopes?: ApiScope[]): Promise<IssuedApiClient>;
  updateScopes(id: string, scopes: ApiScope[], expectedScopes: ApiScope[], actor: Account): Promise<ApiClientSummary>;
  disable(id: string, actor: Account): Promise<ApiClientSummary>;
  enable(id: string, actor: Account): Promise<ApiClientSummary>;
  rotate(id: string, retirePreviousImmediately: boolean, actor: Account): Promise<IssuedApiClient>;
  revoke(id: string, actor: Account): Promise<ApiClientSummary>;
}

export class ApiClientConflict extends Error {}
export class ApiClientNotFound extends Error {}

export function createApiClientRouter(authenticate: Authenticate | null, store: ApiClientStore): Router {
  const router = Router();
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });
  router.use(rateLimit({ limit: 60, windowMs: 60_000, standardHeaders: "draft-8", legacyHeaders: false }));
  router.use(async (request, response, next) => {
    const token = request.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return response.status(401).json({ error: { code: "invalid_token" } });
    if (!authenticate) return response.status(503).json({ error: { code: "api_client_management_unavailable" } });
    try {
      const account = await authenticate(token);
      if (account.role !== "System Administrator") return response.status(403).json({ error: { code: "access_denied" } });
      response.locals.account = account;
      next();
    } catch (error) {
      const status = error instanceof AuthenticationUnavailable ? 503 : error instanceof AccessDenied ? 403 : 401;
      return response.status(status).json({ error: { code: status === 503 ? "api_client_management_unavailable" : status === 403 ? "access_denied" : "invalid_token" } });
    }
  });

  router.get("/", async (_request, response) => {
    try {
      response.json({ clients: await store.list() });
    } catch {
      response.status(503).json({ error: { code: "api_client_management_unavailable" } });
    }
  });

  router.post("/", async (request, response) => {
    if (!(exactObject(request.body, ["name"]) || exactObject(request.body, ["name", "scopes"])) || typeof request.body.name !== "string") {
      return response.status(400).json({ error: { code: "invalid_request" } });
    }
    const name = request.body.name.trim();
    if (!name || name.length > 100) return response.status(400).json({ error: { code: "invalid_request" } });
    const scopes = parseApiScopes(request.body.scopes, !Object.hasOwn(request.body, "scopes"));
    if (!scopes) return response.status(400).json({ error: { code: "invalid_request" } });
    await lifecycleResponse(response, () => store.create(name, response.locals.account, scopes));
  });

  router.post("/:id/scopes", async (request, response) => {
    if (!exactObject(request.body, ["scopes", "expectedScopes"])) return response.status(400).json({ error: { code: "invalid_request" } });
    const scopes = parseApiScopes(request.body.scopes);
    const expected = parseApiScopes(request.body.expectedScopes);
    if (!scopes || !expected) return response.status(400).json({ error: { code: "invalid_request" } });
    await lifecycleResponse(response, () => store.updateScopes(request.params.id, scopes, expected, response.locals.account));
  });

  router.post("/:id/disable", async (request, response) => {
    if (!emptyObject(request.body)) return response.status(400).json({ error: { code: "invalid_request" } });
    await lifecycleResponse(response, () => store.disable(request.params.id, response.locals.account));
  });

  router.post("/:id/enable", async (request, response) => {
    if (!emptyObject(request.body)) return response.status(400).json({ error: { code: "invalid_request" } });
    await lifecycleResponse(response, () => store.enable(request.params.id, response.locals.account));
  });

  router.post("/:id/rotate", async (request, response) => {
    if (!exactObject(request.body, ["retirePreviousImmediately"]) || typeof request.body.retirePreviousImmediately !== "boolean") {
      return response.status(400).json({ error: { code: "invalid_request" } });
    }
    await lifecycleResponse(response, () => store.rotate(request.params.id, request.body.retirePreviousImmediately, response.locals.account));
  });

  router.post("/:id/revoke", async (request, response) => {
    if (!emptyObject(request.body)) return response.status(400).json({ error: { code: "invalid_request" } });
    await lifecycleResponse(response, () => store.revoke(request.params.id, response.locals.account));
  });

  return router;
}

async function lifecycleResponse(response: Parameters<Parameters<Router["post"]>[1]>[1], operation: () => Promise<ApiClientSummary | IssuedApiClient>) {
  try {
    response.json(await operation());
  } catch (error) {
    if (error instanceof ApiClientNotFound) return response.status(404).json({ error: { code: "api_client_not_found" } });
    if (error instanceof ApiClientConflict) return response.status(409).json({ error: { code: "api_client_conflict" } });
    response.status(503).json({ error: { code: "api_client_management_unavailable" } });
  }
}

function exactObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function emptyObject(value: unknown): boolean {
  return value === undefined || exactObject(value, []);
}