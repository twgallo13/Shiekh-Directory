import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { test } from "node:test";
import express from "express";
import { parse } from "csv-parse/sync";
import { AccessDenied, AuthenticationUnavailable, type Account } from "../server/authAuthority";
import { createLocationExportRouter, createFirestoreLocationExportStore, type LocationExportRecord, type LocationExportStore } from "../server/locationExport";

const now = new Date("2026-09-09T12:00:00.000Z");
const companyAccount: Account = { uid: "uid-company", email: "company@example.test", emailVerified: true, name: "Company User", role: "Viewer", status: "Active", accessScope: "Company-wide", personId: null, authenticationMethod: "password" };
const otherCompanyAccount: Account = { ...companyAccount, uid: "uid-company-2", email: "company2@example.test" };
const exactStoreAccount: Account = { ...companyAccount, uid: "uid-store", accessScope: "Store 007" };
interface CsvRow { StoreNumber: string; ZipCode: string; StoreName: string; StoreManager: string; StoreManagerPhone: string; DistrictManager: string; AssistantStoreManagers: string }
interface PreparedBody { token: string; metadata: { recordCount: number; authorizationScope: { label: string; type: string; storeNumber?: string }; storeNumberSetDigest: string; missingCanonicalPersonReferences: number } }

test("Export All prepares and downloads every active authorized location from the authoritative snapshot", async () => {
  const locations = Array.from({ length: 120 }, (_value, index) => location(String(index + 1).padStart(3, "0"), { zipCode: String(index).padStart(5, "0") }));
  locations.push(location("999", { id: "retired", recordStatus: "Retired" }));
  const app = await harness({ locations, people: [person("mgr-001", "Canonical Manager")], account: companyAccount });
  try {
    const prepared = await prepare(app.baseUrl, "company-token");
    assert.equal(prepared.metadata.recordCount, 120);
    assert.equal(prepared.metadata.authorizationScope.label, "Company-wide");
    assert.equal(prepared.metadata.storeNumberSetDigest, digest(locations.slice(0, 120).map(record => record.storeNumber as string)));
    const response = await fetch(`${app.baseUrl}/api/exports/locations/${prepared.token}`, { headers: { Authorization: "Bearer company-token" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") || "", /text\/csv/);
    assert.match(response.headers.get("content-disposition") || "", /shiekh_active_store_directory_2026-09-09\.csv/);
    assert.equal(response.headers.get("x-location-export-count"), "120");
    const rows = parse(await response.text(), { columns: true }) as CsvRow[];
    assert.equal(rows.length, 120);
    assert.equal(rows[0].StoreNumber, "001");
    assert.equal(rows[0].ZipCode, "00000");
    assert.equal(rows.at(-1).StoreNumber, "120");
  } finally { await app.close(); }
});

test("matching company scopes receive the same deterministic store-number set", async () => {
  const snapshot = { locations: [location("07"), location("08")], people: [] };
  const first = await harness({ ...snapshot, account: companyAccount });
  const second = await harness({ ...snapshot, account: otherCompanyAccount });
  try {
    const firstPrepared = await prepare(first.baseUrl, "first-token");
    const secondPrepared = await prepare(second.baseUrl, "second-token");
    assert.equal(firstPrepared.metadata.storeNumberSetDigest, secondPrepared.metadata.storeNumberSetDigest);
    assert.equal(firstPrepared.metadata.recordCount, secondPrepared.metadata.recordCount);
  } finally { await first.close(); await second.close(); }
});

test("exact-store scope receives only its authorized active store", async () => {
  const app = await harness({ locations: [location("007"), location("008")], people: [], account: exactStoreAccount });
  try {
    const prepared = await prepare(app.baseUrl, "store-token");
    assert.equal(prepared.metadata.recordCount, 1);
    assert.deepEqual(prepared.metadata.authorizationScope, { type: "exact-store", label: "Store 007", storeNumber: "007" });
    const rows = parse(await download(app.baseUrl, prepared.token, "store-token"), { columns: true }) as CsvRow[];
    assert.deepEqual(rows.map((row: { StoreNumber: string }) => row.StoreNumber), ["007"]);
  } finally { await app.close(); }
});

test("unsupported scopes, duplicate identities, duplicate normalized stores, and read failures fail visibly", async () => {
  const cases: Array<[Account, { locations: LocationExportRecord[]; people: LocationExportRecord[] } | null, number, string]> = [
    [{ ...companyAccount, accessScope: "District 1" }, { locations: [location("07")], people: [] }, 403, "unsupported_export_scope"],
    [companyAccount, { locations: [location("07"), location("08", { id: "loc-07" })], people: [] }, 409, "duplicate_location_id"],
    [companyAccount, { locations: [location("07"), location("007")], people: [] }, 409, "duplicate_store_number"],
    [companyAccount, null, 503, "export_snapshot_unavailable"],
  ];
  for (const [account, snapshot, status, code] of cases) {
    const app = await harness({ locations: snapshot?.locations || [], people: snapshot?.people || [], account, failRead: snapshot === null });
    try {
      const response = await fetch(`${app.baseUrl}/api/exports/locations/prepare`, { method: "POST", headers: { Authorization: "Bearer token" } });
      const body = await response.json();
      assert.equal(response.status, status);
      assert.equal(body.error.code, code);
    } finally { await app.close(); }
  }
});

test("canonical person relationships override stale copied names and missing references are explicit metadata", async () => {
  const app = await harness({
    account: companyAccount,
    people: [person("mgr-1", "Fresh Manager", { phone: "555-1111" }), person("dm-1", "Fresh District Manager"), person("asm-1", "Assistant One")],
    locations: [location("07", { storeManagerId: "mgr-1", storeManagerName: "Stale Manager", storeManagerPhone: "555-9999", districtManagerId: "dm-1", districtManagerName: "Stale DM", assistantStoreManagerIds: ["asm-1", "missing-asm"], assistantStoreManagerNames: ["Stale Assistant"] })],
  });
  try {
    const prepared = await prepare(app.baseUrl, "token");
    assert.equal(prepared.metadata.missingCanonicalPersonReferences, 1);
    const [row] = parse(await download(app.baseUrl, prepared.token, "token"), { columns: true }) as CsvRow[];
    assert.equal(row.StoreManager, "Fresh Manager");
    assert.equal(row.StoreManagerPhone, "555-1111");
    assert.equal(row.DistrictManager, "Fresh District Manager");
    assert.equal(row.AssistantStoreManagers, "Assistant One");
  } finally { await app.close(); }
});

test("CSV output preserves textual values and escapes commas, quotes, CR/LF, and Unicode", async () => {
  const app = await harness({ locations: [location("001", { name: "Shiekh \"Downtown\", São José", address: "One Way\r\nSuite A", zipCode: "00123" })], people: [], account: companyAccount });
  try {
    const prepared = await prepare(app.baseUrl, "token");
    const csv = await download(app.baseUrl, prepared.token, "token");
    assert.match(csv, /"Shiekh ""Downtown"", São José"/);
    assert.match(csv, /"One Way\r\nSuite A"/);
    const [row] = parse(csv, { columns: true }) as CsvRow[];
    assert.equal(row.StoreNumber, "001");
    assert.equal(row.ZipCode, "00123");
    assert.equal(row.StoreName, "Shiekh \"Downtown\", São José");
  } finally { await app.close(); }
});

test("empty authorized result sets return a header-only export", async () => {
  const app = await harness({ locations: [location("99", { recordStatus: "Retired" })], people: [], account: companyAccount });
  try {
    const prepared = await prepare(app.baseUrl, "token");
    assert.equal(prepared.metadata.recordCount, 0);
    const rows = parse(await download(app.baseUrl, prepared.token, "token"), { columns: true }) as CsvRow[];
    assert.equal(rows.length, 0);
  } finally { await app.close(); }
});

test("download requires the same authenticated authority and consumes the prepared token", async () => {
  const app = await harness({ locations: [location("07")], people: [], account: companyAccount, tokenAccounts: { changed: { ...companyAccount, accessScope: "Store 07" } } });
  try {
    const prepared = await prepare(app.baseUrl, "token");
    const changed = await fetch(`${app.baseUrl}/api/exports/locations/${prepared.token}`, { headers: { Authorization: "Bearer changed" } });
    assert.equal(changed.status, 403);
    assert.equal((await changed.json()).error.code, "export_authority_changed");
    assert.equal((await fetch(`${app.baseUrl}/api/exports/locations/${prepared.token}`, { headers: { Authorization: "Bearer token" } })).status, 200);
    assert.equal((await fetch(`${app.baseUrl}/api/exports/locations/${prepared.token}`, { headers: { Authorization: "Bearer token" } })).status, 410);
  } finally { await app.close(); }
});

test("authentication failures do not prepare or download exports", async () => {
  for (const [failure, status] of [[new AccessDenied(), 403], [new AuthenticationUnavailable(), 503], [new Error("bad token"), 401]] as const) {
    const app = await harness({ locations: [location("07")], people: [], account: companyAccount, authFailure: failure });
    try {
      const response = await fetch(`${app.baseUrl}/api/exports/locations/prepare`, { method: "POST", headers: { Authorization: "Bearer token" } });
      assert.equal(response.status, status);
    } finally { await app.close(); }
  }
});

test("Firestore export store refuses the default database", () => {
  const previous = process.env.FIRESTORE_DATABASE_ID;
  process.env.FIRESTORE_DATABASE_ID = "(default)";
  try { assert.throws(() => createFirestoreLocationExportStore(), /named Firestore database/); }
  finally {
    if (previous === undefined) delete process.env.FIRESTORE_DATABASE_ID;
    else process.env.FIRESTORE_DATABASE_ID = previous;
  }
});

function location(storeNumber: string, overrides: Partial<LocationExportRecord> = {}): LocationExportRecord {
  return {
    id: `loc-${storeNumber}`,
    storeNumber,
    name: `Store ${storeNumber}`,
    type: "Strip Center / Shopping Center",
    address: `${storeNumber} Main Street`,
    city: "Los Angeles",
    state: "CA",
    zipCode: "90001",
    phone: "555-0100",
    district: "District 1",
    operationalStatus: "Open — Normal Operations",
    recordStatus: "Active",
    ...overrides,
  };
}

function person(id: string, fullName: string, overrides: Partial<LocationExportRecord> = {}): LocationExportRecord {
  return { id, fullName, ...overrides };
}

async function harness(options: { locations: LocationExportRecord[]; people: LocationExportRecord[]; account: Account; failRead?: boolean; authFailure?: Error; tokenAccounts?: Record<string, Account> }) {
  const app = express();
  const store: LocationExportStore = { async readLocationExportSnapshot() {
    if (options.failRead) throw new Error("read failed");
    return { locations: options.locations, people: options.people };
  } };
  app.use("/api/exports", createLocationExportRouter(async token => {
    if (options.authFailure) throw options.authFailure;
    return options.tokenAccounts?.[token] || options.account;
  }, store, { now: () => now, rateLimit: false }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); },
  };
}

async function prepare(baseUrl: string, token: string) {
  const response = await fetch(`${baseUrl}/api/exports/locations/prepare`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (response.status !== 200) assert.fail(await response.text());
  return await response.json() as PreparedBody;
}

async function download(baseUrl: string, exportToken: string, authToken: string) {
  const response = await fetch(`${baseUrl}/api/exports/locations/${exportToken}`, { headers: { Authorization: `Bearer ${authToken}` } });
  if (response.status !== 200) assert.fail(await response.text());
  return response.text();
}

function digest(storeNumbers: string[]) {
  return createHash("sha256").update(JSON.stringify([...storeNumbers].sort())).digest("hex");
}