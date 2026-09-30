import assert from "node:assert/strict";
import { test } from "node:test";
import type { Firestore } from "@google-cloud/firestore";
import { FirestoreApiClientStore, hashApiToken } from "../server/firestoreApiClients";
import type { Account } from "../server/authAuthority";

const actor: Account = {
  uid: "admin-uid", email: "admin@example.test", emailVerified: true, name: "Test Administrator",
  role: "System Administrator", status: "Active", accessScope: "Company-wide", personId: null,
  authenticationMethod: "password",
};

function memoryFirestore() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const writes: { collection: string; id: string; data: Record<string, unknown> }[] = [];
  const records = (name: string) => {
    let result = collections.get(name);
    if (!result) { result = new Map(); collections.set(name, result); }
    return result;
  };
  class DocumentReference {
    constructor(public collectionName: string, public id: string) {}
  }
  class Snapshot {
    constructor(public ref: DocumentReference, private value?: Record<string, unknown>) {}
    get id() { return this.ref.id; }
    get exists() { return Boolean(this.value); }
    data() { return this.value ? structuredClone(this.value) : undefined; }
  }
  class Query {
    constructor(public collectionName: string, private field?: string, private value?: unknown) {}
    doc(id: string) { return new DocumentReference(this.collectionName, id); }
    where(field: string, operator: string, value: unknown) { assert.equal(operator, "=="); return new Query(this.collectionName, field, value); }
    async get() { return snapshotQuery(this); }
    matches(value: Record<string, unknown>) { return !this.field || value[this.field] === this.value; }
  }
  const snapshotDocument = (reference: DocumentReference) => new Snapshot(reference, records(reference.collectionName).get(reference.id));
  const snapshotQuery = (query: Query) => {
    const docs = [...records(query.collectionName)].filter(([, value]) => query.matches(value)).map(([id, value]) => new Snapshot(new DocumentReference(query.collectionName, id), value));
    return { docs, size: docs.length, empty: docs.length === 0 };
  };
  const write = (reference: DocumentReference, data: Record<string, unknown>, merge = false) => {
    const next = merge ? { ...records(reference.collectionName).get(reference.id), ...structuredClone(data) } : structuredClone(data);
    records(reference.collectionName).set(reference.id, next);
    writes.push({ collection: reference.collectionName, id: reference.id, data: structuredClone(data) });
  };
  const firestore = {
    collection(name: string) { return new Query(name); },
    async runTransaction(callback: (transaction: unknown) => unknown) {
      const transaction = {
        get: async (target: DocumentReference | Query) => target instanceof DocumentReference ? snapshotDocument(target) : snapshotQuery(target),
        create: (reference: DocumentReference, data: Record<string, unknown>) => {
          if (records(reference.collectionName).has(reference.id)) throw new Error("already exists");
          write(reference, data);
        },
        set: (reference: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }) => write(reference, data, options?.merge),
      };
      return callback(transaction);
    },
  };
  return { firestore: firestore as unknown as Firestore, collections, writes };
}

test("managed credentials persist isolated server secrets and enforce lifecycle, overlap, redaction, and throttled last use", async (testContext) => {
  const logs: string[] = [];
  testContext.mock.method(console, "info", (...values: unknown[]) => { logs.push(values.map(String).join(" ")); });
  const memory = memoryFirestore();
  let clock = new Date("2026-09-30T12:00:00.000Z");
  const store = new FirestoreApiClientStore(memory.firestore, () => clock);
  const created = await store.create("Store Manager sync", actor);
  assert.match(created.token, /^dir_v1_[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(created.client.scopes, ["locations:read"]);

  const clients = memory.collections.get("api_clients")!;
  const tokens = memory.collections.get("api_client_tokens")!;
  assert.equal(tokens.has(hashApiToken(created.token)), true);
  assert.equal(JSON.stringify([...clients.values(), ...tokens.values()]).includes(created.token), false);
  assert.equal(JSON.stringify([...tokens.values()]).includes(hashApiToken(created.token)), false);
  const storedToken = tokens.get(hashApiToken(created.token))!;
  assert.match(String(storedToken.cursorSigningKey), /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(storedToken.cursorSigningKey, storedToken.tokenVersionId);

  const context = { requestId: "request-1", method: "GET", path: "/locations" };
  const authenticated = await store.authenticate(created.token, context);
  assert.equal(authenticated?.clientId, created.client.id);
  assert.equal(authenticated?.cursorSigningKey, storedToken.cursorSigningKey);
  const firstLastUsed = clients.get(created.client.id)!.lastUsedAt;
  clock = new Date(clock.getTime() + 10 * 60_000);
  await store.authenticate(created.token, context);
  assert.equal(clients.get(created.client.id)!.lastUsedAt, firstLastUsed);
  clock = new Date(clock.getTime() + 5 * 60_000);
  await store.authenticate(created.token, context);
  assert.equal(clients.get(created.client.id)!.lastUsedAt, clock.toISOString());

  const firstRotation = await store.rotate(created.client.id, false, actor);
  const originalVersion = firstRotation.client.tokenVersions.find(version => version.createdAt === created.client.tokenVersions[0].createdAt)!;
  assert.equal(originalVersion.status, "Retiring");
  assert.equal(Date.parse(originalVersion.expiresAt!) - clock.getTime(), 24 * 60 * 60_000);
  const originalExpiry = originalVersion.expiresAt;

  clock = new Date(clock.getTime() + 60 * 60_000);
  const secondRotation = await store.rotate(created.client.id, false, actor);
  assert.equal(secondRotation.client.tokenVersions.find(version => version.createdAt === originalVersion.createdAt)!.expiresAt, originalExpiry);
  assert.ok(await store.authenticate(created.token, context));

  const immediate = await store.rotate(created.client.id, true, actor);
  assert.equal(await store.authenticate(created.token, context), null);
  assert.equal(await store.authenticate(secondRotation.token, context), null);
  assert.ok(await store.authenticate(immediate.token, context));

  await store.disable(created.client.id, actor);
  assert.equal(await store.authenticate(immediate.token, context), null);
  await store.enable(created.client.id, actor);
  assert.ok(await store.authenticate(immediate.token, context));
  await store.revoke(created.client.id, actor);
  assert.equal(await store.authenticate(immediate.token, context), null);
  await assert.rejects(store.enable(created.client.id, actor));

  const audits = [...memory.collections.get("audit_logs")!.values()];
  assert.deepEqual(audits.map(audit => audit.action), [
    "API Client Created", "API Client Token Rotated", "API Client Token Rotated", "API Client Token Rotated",
    "API Client Disabled", "API Client Re-enabled", "API Client Revoked",
  ]);
  const serializedAudits = JSON.stringify(audits);
  const listed = JSON.stringify(await store.list());
  const serializedLogs = JSON.stringify(logs);
  for (const secret of [created.token, firstRotation.token, secondRotation.token, immediate.token, hashApiToken(created.token), String(storedToken.cursorSigningKey)]) {
    assert.equal(serializedAudits.includes(secret), false);
    assert.equal(listed.includes(secret), false);
    assert.equal(serializedLogs.includes(secret), false);
  }
  assert.equal(serializedAudits.includes("admin@example.test"), false);
  assert.equal(serializedAudits.includes("request-1"), false);
});

test("authentication fails closed when cursor signing material is missing or malformed", async () => {
  for (const cursorSigningKey of [undefined, "too-short", "!".repeat(43)]) {
    const memory = memoryFirestore();
    const token = "dir_v1_missing_cursor_signing_material";
    memory.collections.set("api_clients", new Map([["api-client", {
      id: "api-client", name: "Client", status: "Active", scopes: ["locations:read"],
      createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z",
    }]]));
    memory.collections.set("api_client_tokens", new Map([[hashApiToken(token), {
      clientId: "api-client", tokenVersionId: "tok-version", status: "Active",
      createdAt: "2026-09-30T12:00:00.000Z", ...(cursorSigningKey === undefined ? {} : { cursorSigningKey }),
    }]]));
    const store = new FirestoreApiClientStore(memory.firestore);
    assert.equal(await store.authenticate(token, { requestId: "request", method: "GET", path: "/locations" }), null);
  }
});
