import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from "../server/authAuthority";
import { ApiClientConflict, createApiClientRouter, type ApiClientStore, type ApiClientSummary } from "../server/apiClientApi";

const account: Account = {
  uid: "admin", email: "admin@example.test", emailVerified: true, name: "Test Administrator",
  role: "System Administrator", status: "Active", accessScope: "Company-wide", personId: null,
  authenticationMethod: "password",
};
const client: ApiClientSummary = {
  id: "api-client", name: "Store Manager", status: "Active", scopes: ["locations:read"],
  createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z", tokenVersions: [],
};

async function harness(authenticate: Authenticate | null, overrides: Partial<ApiClientStore> = {}) {
  const calls: string[] = [];
  const store: ApiClientStore = {
    async list() { calls.push("list"); return [client]; },
    async create(name) { calls.push(`create:${name}`); return { client, token: "one-time-secret-token" }; },
    async disable() { calls.push("disable"); return { ...client, status: "Disabled" }; },
    async enable() { calls.push("enable"); return client; },
    async updateScopes(_id, scopes) { calls.push("scopes"); return { ...client, scopes }; },
    async rotate(_id, immediate) { calls.push(`rotate:${immediate}`); return { client, token: "rotated-one-time-token" }; },
    async revoke() { calls.push("revoke"); return { ...client, status: "Revoked" }; },
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/api/api-clients", createApiClientRouter(authenticate, store));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/api-clients`;
  return {
    calls,
    request: (path = "", method = "GET", body?: unknown, token = "firebase-token") => fetch(`${base}${path}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

test("API client management requires Firebase authentication and System Administrator authority", async () => {
  for (const [authenticate, expected] of [
    [null, 503],
    [async () => { throw new Error("private identity"); }, 401],
    [async () => { throw new AccessDenied("private mapping"); }, 403],
    [async () => { throw new AuthenticationUnavailable("private authority"); }, 503],
    [async () => ({ ...account, role: "Directory Data Steward" as const }), 403],
    [async () => account, 200],
  ] as const) {
    const app = await harness(authenticate);
    try {
      const response = await app.request();
      assert.equal(response.status, expected);
      assert.doesNotMatch(await response.text(), /private|admin@example/);
      assert.equal(app.calls.length, expected === 200 ? 1 : 0);
    } finally { await app.close(); }
  }
});

test("scope management is explicit, strict and administrator-only", async () => {
  const app = await harness(async () => account, {
    async create(_name, _actor, scopes) { assert.deepEqual(scopes, ['personnel:read', 'staffing:read']); return { client: { ...client, scopes }, token: 'synthetic' }; },
  });
  try {
    assert.equal((await app.request('', 'POST', { name: 'Personnel', scopes: ['staffing:read', 'personnel:read'] })).status, 200);
    for (const scopes of [[], null, 'personnel:read', ['people:read'], ['personnel:read', 'personnel:read'], [' staffing:read']]) {
      assert.equal((await app.request('', 'POST', { name: 'Invalid', scopes })).status, 400);
      assert.equal((await app.request('/api-client/scopes', 'POST', { scopes, expectedScopes: ['locations:read'] })).status, 400);
    }
    assert.equal((await app.request('/api-client/scopes', 'POST', { scopes: ['staffing:read'], expectedScopes: ['locations:read'] })).status, 200);
    assert.equal((await app.request('/api-client/scopes', 'POST', { scopes: ['staffing:read'] })).status, 400);
  } finally { await app.close(); }
  const viewer = await harness(async () => ({ ...account, role: 'Viewer' }));
  try { assert.equal((await viewer.request('/api-client/scopes', 'POST', { scopes: ['personnel:read'], expectedScopes: ['locations:read'] })).status, 403); }
  finally { await viewer.close(); }
});

test("creation returns plaintext once while list and lifecycle responses remain secret-free", async () => {
  const app = await harness(async () => account);
  try {
    const created = await app.request("", "POST", { name: " Store Manager " });
    assert.equal(created.status, 200);
    assert.equal((await created.json()).token, "one-time-secret-token");
    const listed = await app.request();
    assert.equal(JSON.stringify(await listed.json()).includes("one-time-secret-token"), false);
    for (const [path, body] of [
      ["/api-client/disable", {}], ["/api-client/enable", {}],
      ["/api-client/rotate", { retirePreviousImmediately: false }],
      ["/api-client/rotate", { retirePreviousImmediately: true }], ["/api-client/revoke", {}],
    ] as const) assert.equal((await app.request(path, "POST", body)).status, 200);
    assert.deepEqual(app.calls, ["create:Store Manager", "list", "disable", "enable", "rotate:false", "rotate:true", "revoke"]);
  } finally { await app.close(); }
});

test("management requests reject extra fields and sanitize store failures", async () => {
  const failed = await harness(async () => account, { async create() { throw new Error("private digest and token"); } });
  try {
    for (const body of [{ name: "Client", scope: "admin" }, { name: "" }, { name: "Client", token: "caller-token" }]) {
      assert.equal((await failed.request("", "POST", body)).status, 400);
    }
    assert.equal((await failed.request("/api-client/rotate", "POST", { retirePreviousImmediately: false, expiresAt: "later" })).status, 400);
    const response = await failed.request("", "POST", { name: "Client" });
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private|digest|token/);
  } finally { await failed.close(); }

  const conflict = await harness(async () => account, { async disable() { throw new ApiClientConflict("private state"); } });
  try {
    const response = await conflict.request("/api-client/disable", "POST", {});
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: { code: "api_client_conflict" } });
  } finally { await conflict.close(); }
});
