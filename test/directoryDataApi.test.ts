import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import type { Account } from "../server/authAuthority";
import { createDirectoryDataRouter } from "../server/directoryDataApi";
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryAudit, type DirectoryCommitResult, type DirectoryWrite, type DirectoryWriter } from "../server/firestoreDirectory";

const baseAccount: Account = { uid: "uid-1", email: "admin@example.test", emailVerified: true, name: "Admin", role: "System Administrator", status: "Active", accessScope: "Company-wide", personId: null, authenticationMethod: "password" };

async function harness(role: Account["role"], commit: DirectoryWriter["commit"] = async () => ({ records: [] })) {
  const calls: { writes: DirectoryWrite[]; audit: DirectoryAudit | null; actor: Account }[] = [];
  const app = express(); app.use(express.json());
  app.use("/api/directory", createDirectoryDataRouter(async () => ({ ...baseAccount, role }), { async commit(writes, audit, actor) { calls.push({ writes, audit, actor }); return await commit(writes, audit, actor); } }));
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  return { calls, request: (body: unknown, token = "token") => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/directory/commit`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }), async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

const audit = { action: "Location Updated", entityType: "Location", entityId: "loc-007", entityName: "Store #07", details: "Updated phone" };
const locationWrite = { collection: "locations", id: "loc-007", operation: "set", data: { storeNumber: "07", name: "Southland Mall" } };

test("authenticated editor mutations are committed with the server-resolved actor", async () => {
  const app = await harness("Editor");
  try {
    const response = await app.request({ writes: [locationWrite], audit });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json() as DirectoryCommitResult, { records: [] });
    assert.equal(app.calls.length, 1);
    assert.equal(app.calls[0].actor.uid, "uid-1");
    assert.deepEqual(app.calls[0].writes, [locationWrite]);
  } finally { await app.close(); }
});

test("commit API forwards create and update version expectations and rejects malformed values", async () => {
  const app = await harness("Editor");
  try {
    const versionedWrite = { ...locationWrite, expectedVersion: 0 };
    const response = await app.request({ writes: [versionedWrite], audit });
    assert.equal(response.status, 200);
    assert.equal(app.calls[0].writes[0].expectedVersion, 0);

    const createOnly = await app.request({ writes: [{ ...locationWrite, expectedVersion: null }], audit });
    assert.equal(createOnly.status, 200);
    assert.equal(app.calls[1].writes[0].expectedVersion, null);

    const malformed = await app.request({ writes: [{ ...locationWrite, expectedVersion: -1 }], audit });
    assert.equal(malformed.status, 403);
  } finally { await app.close(); }
});

test("viewer writes and malformed or unauthenticated commits fail closed", async () => {
  const app = await harness("Viewer");
  try {
    assert.equal((await app.request({ writes: [locationWrite], audit })).status, 403);
    assert.equal((await app.request({ writes: [{ ...locationWrite, id: "../bad" }], audit })).status, 403);
    assert.equal((await app.request({ writes: [locationWrite], audit }, "")).status, 401);
    assert.equal(app.calls.length, 0);
  } finally { await app.close(); }
});

test("administrator user writes strip identity fields and reject unsupported roles", async () => {
  const app = await harness("System Administrator");
  try {
    const userAudit = { action: "User Updated", entityType: "User", entityId: "usr-2", entityName: "Editor", details: "Updated directory access." };
    const response = await app.request({ writes: [{ collection: "users", id: "usr-2", operation: "set", data: { name: "Editor", email: "EDITOR@example.test", role: "Editor", status: "Active", accessScope: "Company-wide", firebaseUid: "client-controlled" } }], audit: userAudit });
    assert.equal(response.status, 200);
    assert.deepEqual(app.calls[0].writes[0].data, { name: "Editor", displayName: "Editor", email: "editor@example.test", role: "Editor", status: "Active", accessScope: "Company-wide" });
    assert.equal((await app.request({ writes: [{ collection: "users", id: "usr-3", operation: "set", data: { name: "Manager", email: "manager@example.test", role: "Store Manager", status: "Active", accessScope: "Store 07" } }], audit: userAudit })).status, 403);
  } finally { await app.close(); }
});

test("administrator user writes preserve explicit person unlinking through the API", async () => {
  const app = await harness("System Administrator");
  try {
    const userAudit = { action: "User Updated", entityType: "User", entityId: "usr-2", entityName: "Editor", details: "Unlinked person record." };
    const response = await app.request({ writes: [{ collection: "users", id: "usr-2", operation: "set", expectedVersion: 0, data: { name: "Editor", email: "editor@example.test", role: "Editor", status: "Active", accessScope: "Company-wide", personId: "" } }], audit: userAudit });
    assert.equal(response.status, 200);
    assert.equal(app.calls[0].writes[0].data?.personId, "");
  } finally { await app.close(); }
});

test("directory API preserves explicit null hierarchy clears and does not invent omitted fields", async () => {
  const app = await harness("Editor");
  try {
    const response = await app.request({
      writes: [{ collection: "locations", id: "loc-1", operation: "set", expectedVersion: 0, data: { storeNumber: "01", name: "Cleared", regionId: null, districtId: null, regionalManagerId: null } }],
      audit,
    });
    assert.equal(response.status, 200);
    assert.equal(app.calls[0].writes[0].data?.regionId, null);
    assert.equal(app.calls[0].writes[0].data?.districtId, null);
    assert.equal(app.calls[0].writes[0].data?.regionalManagerId, null);
    assert.equal(Object.hasOwn(app.calls[0].writes[0].data || {}, "storeManagerId"), false);
  } finally { await app.close(); }
});

test("duplicate location conflicts return a stable 409 without leaking internals", async () => {
  const app = await harness("System Administrator", async () => { throw new DirectoryConflict("A location with that store number already exists."); });
  try {
    const response = await app.request({ writes: [locationWrite], audit });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: { code: "directory_conflict", message: "A location with that store number already exists." } });
  } finally { await app.close(); }
});

test('custom field definitions are administrator-only and retain concurrency expectations', async () => {
  const definition = { id: 'yelpUrl', label: 'Yelp', type: 'url', helpText: '', options: [], order: 0, apiVisible: false, retired: false };
  const write = { collection: 'custom_field_definitions', id: definition.id, operation: 'set', data: definition, expectedDefinition: null };
  for (const role of ['System Administrator', 'Directory Data Steward', 'Editor', 'Viewer'] as Account['role'][]) {
    const app = await harness(role);
    try {
      assert.equal((await app.request({ writes: [write], audit })).status, role === 'System Administrator' ? 200 : 403);
      if (role === 'System Administrator') assert.deepEqual(app.calls[0].writes[0], write);
      else assert.equal(app.calls.length, 0);
    } finally { await app.close(); }
  }
});

test('metadata validation and scope failures return actionable non-success responses', async () => {
  for (const [error, status] of [[new DirectoryValidationError('Invalid value for Yelp.'), 400], [new DirectoryWriteDenied('Store scope denied.'), 403]] as const) {
    const app = await harness('System Administrator', async () => { throw error; });
    try {
      const response = await app.request({ writes: [locationWrite], audit });
      assert.equal(response.status, status);
      assert.equal((await response.json()).error.message, error.message);
    } finally { await app.close(); }
  }
});