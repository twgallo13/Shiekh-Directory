import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { AccessDenied, AuthenticationUnavailable, createAuthRouter, type Account, type Authenticate } from "../server/authAuthority";
import { createMailRouter } from "../server/mailApi";

const account: Account = { uid: "synthetic-user", name: "Test User", email: "user@example.test", emailVerified: true, role: "Viewer", status: "Active", accessScope: "Company", personId: null, authenticationMethod: "password" };
async function harness(authenticate: Authenticate | null) {
  const app = express();
  app.use("/api/auth", createAuthRouter(authenticate, { locations: [], people: [] }));
  app.use("/api/mail", createMailRouter({ authenticate, configuration: null, send: async () => { assert.fail("No delivery in authorization checks"); }, audit() {} }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  return {
    request: (route: string, token = "synthetic-token") => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}
test("account endpoint requires a token and emits no-store server-resolved profile", async () => {
  const app = await harness(async () => account);
  try {
    assert.equal((await app.request("/api/auth/me", "")).status, 401);
    assert.equal((await app.request("/api/auth/bootstrap", "")).status, 401);
    assert.deepEqual(await (await app.request("/api/auth/bootstrap")).json(), { locations: [], people: [] });
    const response = await app.request("/api/auth/me");
    assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(await response.json(), account);
    assert.equal((await app.request("/api/mail/status")).status, 403);
  } finally { await app.close(); }
});
test("shared authority denies invalid/inactive mappings and outages on both routes", async () => {
  for (const [failure, status] of [[new Error("private token details"), 401], [new AccessDenied("private mapping"), 403], [new AuthenticationUnavailable("private credentials"), 503]] as const) {
    const app = await harness(async () => { throw failure; });
    try { for (const route of ["/api/auth/me", "/api/auth/bootstrap", "/api/mail/status"]) {
      const response = await app.request(route); assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private/);
    } } finally { await app.close(); }
  }
});
test("Administrator and Steward authorize both endpoints; Viewer and Editor cannot access mail", async () => {
  for (const role of ["System Administrator", "Directory Data Steward", "Viewer", "Editor"] as const) {
    const app = await harness(async () => ({ ...account, role }));
    try {
      assert.equal((await app.request("/api/auth/me")).status, 200);
      assert.equal((await app.request("/api/mail/status")).status, role === "Viewer" || role === "Editor" ? 403 : 200);
    } finally { await app.close(); }
  }
});
test("missing authority fails closed", async () => {
  const app = await harness(null);
  try { assert.equal((await app.request("/api/auth/me")).status, 503); } finally { await app.close(); }
});

test("bootstrap resolves fresh directory data and fails closed when Firestore is unavailable", async () => {
  const live = express();
  let reads = 0;
  live.use("/api/auth", createAuthRouter(async () => account, async () => ({ locations: [{ id: `read-${++reads}` }] })));
  const liveServer = live.listen(0, "127.0.0.1"); await once(liveServer, "listening");
  try {
    const base = `http://127.0.0.1:${(liveServer.address() as { port: number }).port}`;
    assert.deepEqual(await (await fetch(`${base}/api/auth/bootstrap`, { headers: { Authorization: "Bearer token" } })).json(), { locations: [{ id: "read-1" }] });
    assert.deepEqual(await (await fetch(`${base}/api/auth/bootstrap`, { headers: { Authorization: "Bearer token" } })).json(), { locations: [{ id: "read-2" }] });
  } finally { liveServer.closeAllConnections(); await new Promise<void>(resolve => liveServer.close(() => resolve())); }

  const failed = express();
  failed.use("/api/auth", createAuthRouter(async () => account, async () => { throw new Error("private database failure"); }));
  const failedServer = failed.listen(0, "127.0.0.1"); await once(failedServer, "listening");
  try {
    const response = await fetch(`http://127.0.0.1:${(failedServer.address() as { port: number }).port}/api/auth/bootstrap`, { headers: { Authorization: "Bearer token" } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "directory_unavailable" } });
  } finally { failedServer.closeAllConnections(); await new Promise<void>(resolve => failedServer.close(() => resolve())); }
});