import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import {
  apiErrorHandler,
  assertUniqueStoreNumbers,
  apiNotFoundHandler,
  createDirectoryApiRouter,
  digestApiToken,
  type ApiCredential,
  type DirectoryApiOptions,
  type LocationDocument,
  type LocationRepository,
  type LocationPageOptions,
} from "../server/directoryApi";

const NOW = new Date("2026-09-08T12:00:00.000Z");
const TOKEN_SECRET = "test-only-hmac-secret-with-high-entropy";
const READ_TOKEN = "test_read_4bf91d479b73601ac97c5a46";
const NO_SCOPE_TOKEN = "test_no_scope_b68967b47438475fb2df7d0e";
const REVOKED_TOKEN = "test_revoked_4650082cf18547c9a33c1f05";
const EXPIRED_TOKEN = "test_expired_a9fed8cb9db9445c8f25aba1";

const records: LocationDocument[] = [
  {
    id: "location-07",
    updatedAt: new Date("2026-09-01T10:00:00.000Z"),
    data: {
      storeNumber: "07",
      recordStatus: "Active",
      name: "Public Store Seven",
      address: "700 Public Ave",
      city: "Los Angeles",
      state: "CA",
      zipCode: "90001",
      phone: "555-0107",
      phonePrivacy: "Public",
      timeZone: "America/Los_Angeles",
      storeManagerName: "Private Manager",
      storeManagerPhone: "555-9999",
      storeManagerId: "person-private",
      districtManagerName: "Private District Manager",
      assistantStoreManagerNames: ["Private Assistant"],
      lastVerifiedBy: "private-user@example.test",
      privateEmail: "private@example.test",
      standardHours: {
        monday: { open: "10:00", close: "20:00", isClosed: false, privateNote: "do not expose" },
      },
    },
  },
  {
    id: "location-08",
    updatedAt: new Date("2026-09-05T14:30:00.000Z"),
    data: {
      storeNumber: "08",
      recordStatus: "Active",
      name: "Restricted Phone Store",
      phone: "555-0108",
      phonePrivacy: "Internal",
      operationalStatus: "Open — Normal Operations",
    },
  },
  {
    id: "location-99",
    updatedAt: new Date("2026-09-07T08:00:00.000Z"),
    data: {
      storeNumber: "99",
      recordStatus: "Retired",
      name: "Retired Store",
    },
  },
];

const repository: LocationRepository = {
  async readPage(options) {
    return fixturePage(records, options);
  },
  async findActiveByStoreNumber(storeNumber) {
    return records.find((record) => record.data.storeNumber === storeNumber) ?? null;
  },
};

const credentials: ApiCredential[] = [
  credential("reader", READ_TOKEN, ["locations:read"], "2027-01-01T00:00:00Z"),
  credential("no-scope", NO_SCOPE_TOKEN, [], "2027-01-01T00:00:00Z"),
  { ...credential("revoked", REVOKED_TOKEN, ["locations:read"], "2027-01-01T00:00:00Z"), revoked: true },
  credential("expired", EXPIRED_TOKEN, ["locations:read"], "2026-01-01T00:00:00Z"),
];

let server: Server;
let baseUrl: string;

before(async () => {
  ({ server, baseUrl } = await startTestServer({
    credentials,
    tokenHmacSecret: TOKEN_SECRET,
    locations: repository,
    now: () => NOW,
    rateLimit: false,
  }));
});

after(async () => {
  await closeServer(server);
});

describe("Directory API authentication", () => {
  it("rejects requests without a Bearer token", async () => {
    const response = await fetch(`${baseUrl}/api/v1/locations`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error.code, "invalid_token");
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
  });

  it("rejects invalid, revoked, and expired credentials", async () => {
    for (const token of ["not-a-real-token", REVOKED_TOKEN, EXPIRED_TOKEN]) {
      const response = await apiFetch(baseUrl, "/api/v1/locations", token);
      const body = await response.json();
      assert.equal(response.status, 401);
      assert.equal(body.error.code, "invalid_token");
    }
  });

  it("rejects credentials without the read scope", async () => {
    const response = await apiFetch(baseUrl, "/api/v1/locations", NO_SCOPE_TOKEN);
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error.code, "insufficient_scope");
  });

  it("accepts a valid read credential without enabling CORS", async () => {
    const response = await apiFetch(baseUrl, "/api/v1/locations", READ_TOKEN);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json/);
    assert.ok(response.headers.get("x-request-id"));
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

describe("Directory API location responses", () => {
  it("full reconciliation removes retired and deleted stores only after the final snapshot page", async () => {
    const replica = new Set(["07", "08", "99", "deleted-store"]);
    const staged = new Set<string>();
    let cursor: string | null = null;
    let watermark: string | undefined;
    do {
      const response = await apiFetch(baseUrl, `/api/v1/locations?limit=1${cursor ? `&cursor=${cursor}` : ""}`, READ_TOKEN);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.sync.mode, "full");
      assert.equal(body.sync.fullReconciliationRequired, true);
      watermark ??= body.sync.watermark;
      assert.equal(body.sync.watermark, watermark);
      for (const location of body.data) staged.add(location.storeNumber);
      cursor = body.pagination.nextCursor;
      assert.equal(replica.has("99"), true);
      assert.equal(replica.has("deleted-store"), true);
    } while (cursor);
    replica.clear();
    for (const storeNumber of staged) replica.add(storeNumber);
    assert.deepEqual([...replica], ["07", "08"]);
    assert.equal(watermark, NOW.toISOString());
  });

  it("keeps a fixed watermark and recovers a lower-numbered concurrent update on the next sync", async () => {
    let clock = NOW;
    const changed = { ...records[0], updatedAt: new Date(NOW.getTime() + 1000), data: { ...records[0].data, name: "Updated after page one" } };
    const observedSnapshots: string[] = [];
    const concurrent = await startTestServer({
      credentials, tokenHmacSecret: TOKEN_SECRET, rateLimit: false, now: () => clock,
      locations: {
        ...repository,
        async readPage(options) {
          const { snapshotAt } = options;
          observedSnapshots.push(snapshotAt.toISOString());
          return fixturePage(snapshotAt >= changed.updatedAt ? [changed, ...records.slice(1)] : records, options);
        },
      },
    });
    try {
      const first = await (await apiFetch(concurrent.baseUrl, "/api/v1/locations?limit=1", READ_TOKEN)).json();
      assert.equal(first.data[0].storeNumber, "07");
      clock = new Date(NOW.getTime() + 2000);
      const second = await (await apiFetch(concurrent.baseUrl, `/api/v1/locations?limit=1&cursor=${first.pagination.nextCursor}`, READ_TOKEN)).json();
      assert.equal(second.sync.watermark, first.sync.watermark);
      const finalPage = await (await apiFetch(concurrent.baseUrl, `/api/v1/locations?limit=1&cursor=${second.pagination.nextCursor}`, READ_TOKEN)).json();
      assert.equal(finalPage.pagination.nextCursor, null);
      assert.equal(finalPage.sync.watermark, first.sync.watermark);
      assert.deepEqual(observedSnapshots, [NOW.toISOString(), NOW.toISOString(), NOW.toISOString()]);
      const next = await (await apiFetch(concurrent.baseUrl, `/api/v1/locations?updatedSince=${first.sync.watermark}`, READ_TOKEN)).json();
      assert.equal(next.data[0].storeNumber, "07");
      assert.equal(next.data[0].name, changed.data.name);
    } finally {
      await closeServer(concurrent.server);
    }
  });

  it("fails closed on duplicate identities even outside the page or delta", async () => {
    const duplicates = [...records, { ...records[0], id: "another-generation", data: { ...records[0].data, recordStatus: "Retired" } }];
    const conflictServer = await startTestServer({
      credentials, tokenHmacSecret: TOKEN_SECRET, rateLimit: false,
      locations: {
        async readPage(options) { return fixturePage(duplicates, options); },
        async findActiveByStoreNumber(storeNumber) {
          const matches = duplicates.filter((record) => record.data.storeNumber === storeNumber);
          assertUniqueStoreNumbers(matches);
          return matches[0] ?? null;
        },
      },
    });
    try {
      for (const path of ["/api/v1/locations?limit=1&updatedSince=2026-09-07T00:00:00Z", "/api/v1/locations/07"]) {
        const response = await apiFetch(conflictServer.baseUrl, path, READ_TOKEN);
        assert.equal(response.status, 409);
        const body = await response.json();
        assert.equal(body.error.code, "location_conflict");
        assert.equal(body.data, undefined);
      }
    } finally {
      await closeServer(conflictServer.server);
    }
  });

  it("returns only active records and strips private personnel fields", async () => {
    const response = await apiFetch(baseUrl, "/api/v1/locations", READ_TOKEN);
    const body = await response.json();
    const serialized = JSON.stringify(body);

    assert.deepEqual(body.data.map((location: { storeNumber: string }) => location.storeNumber), ["07", "08"]);
    assert.equal(body.data[0].phone, "555-0107");
    assert.equal(body.data[1].phone, undefined);
    assert.deepEqual(body.data[0].standardHours.monday, {
      isClosed: false,
      open: "10:00",
      close: "20:00",
    });
    for (const privateField of [
      "storeManagerName",
      "storeManagerPhone",
      "storeManagerId",
      "districtManagerName",
      "assistantStoreManagerNames",
      "lastVerifiedBy",
      "privateEmail",
      "privateNote",
    ]) {
      assert.equal(serialized.includes(privateField), false, `${privateField} must not appear in the response`);
    }
  });

  it("paginates with an opaque cursor and no duplicates", async () => {
    const firstResponse = await apiFetch(baseUrl, "/api/v1/locations?limit=1", READ_TOKEN);
    const firstPage = await firstResponse.json();
    assert.equal(firstPage.data[0].storeNumber, "07");
    assert.ok(firstPage.pagination.nextCursor);

    const secondResponse = await apiFetch(
      baseUrl,
      `/api/v1/locations?limit=1&cursor=${encodeURIComponent(firstPage.pagination.nextCursor)}`,
      READ_TOKEN,
    );
    const secondPage = await secondResponse.json();
    assert.equal(secondPage.data[0].storeNumber, "08");
    assert.ok(secondPage.pagination.nextCursor);
    const finalPage = await (await apiFetch(baseUrl, `/api/v1/locations?limit=1&cursor=${secondPage.pagination.nextCursor}`, READ_TOKEN)).json();
    assert.deepEqual(finalPage.data, []);
    assert.equal(finalPage.pagination.nextCursor, null);
  });

  it("filters by document update timestamp and rejects malformed timestamps", async () => {
    const response = await apiFetch(
      baseUrl,
      "/api/v1/locations?updatedSince=2026-09-03T00%3A00%3A00Z",
      READ_TOKEN,
    );
    const body = await response.json();
    assert.deepEqual(body.data.map((location: { storeNumber: string }) => location.storeNumber), ["08"]);
    assert.equal(body.data[0].updatedAt, "2026-09-05T14:30:00.000Z");

    const malformed = await apiFetch(baseUrl, "/api/v1/locations?updatedSince=yesterday", READ_TOKEN);
    const malformedBody = await malformed.json();
    assert.equal(malformed.status, 400);
    assert.equal(malformedBody.error.code, "invalid_updated_since");
  });

  it("returns JSON 404 for unknown or inactive stores", async () => {
    for (const storeNumber of ["404", "99"]) {
      const response = await apiFetch(baseUrl, `/api/v1/locations/${storeNumber}`, READ_TOKEN);
      const body = await response.json();
      assert.equal(response.status, 404);
      assert.equal(body.error.code, "location_not_found");
    }
  });

  it("supports ETag revalidation", async () => {
    const first = await apiFetch(baseUrl, "/api/v1/locations/07", READ_TOKEN);
    const etag = first.headers.get("etag");
    assert.ok(etag);

    const second = await apiFetch(baseUrl, "/api/v1/locations/07", READ_TOKEN, { "If-None-Match": etag });
    assert.equal(second.status, 304);
  });
});

describe("Directory API route handling", () => {
  it("rejects invalid limits, impossible calendar timestamps, and future checkpoints", async () => {
    for (const query of [
      "limit=0", "limit=101", "limit=1.5", "limit=1&limit=2",
      "updatedSince=2026-02-30T00:00:00Z", "updatedSince=2026-02-29T00:00:00Z",
      "updatedSince=2026-09-08T24:00:00Z", "updatedSince=2026-13-01T00:00:00Z",
      "updatedSince=2026-09-08", "updatedSince=2026-09-09T00:00:00Z",
    ]) {
      const response = await apiFetch(baseUrl, `/api/v1/locations?${query}`, READ_TOKEN);
      assert.equal(response.status, 400, query);
    }
    const valid = await apiFetch(baseUrl, "/api/v1/locations?updatedSince=2024-02-29T00:00:00Z", READ_TOKEN);
    assert.equal(valid.status, 200);
  });

  it("rejects malformed, tampered, and filter-mismatched cursors", async () => {
    const first = await (await apiFetch(baseUrl, "/api/v1/locations?limit=1", READ_TOKEN)).json();
    const cursor = first.pagination.nextCursor as string;
    for (const invalid of ["bad", "e30.signature", `${cursor.slice(0, -1)}${cursor.endsWith("A") ? "B" : "A"}`]) {
      const response = await apiFetch(baseUrl, `/api/v1/locations?cursor=${invalid}`, READ_TOKEN);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "invalid_cursor");
    }
    const mismatch = await apiFetch(baseUrl, `/api/v1/locations?cursor=${cursor}&updatedSince=2026-09-01T00:00:00Z`, READ_TOKEN);
    assert.equal(mismatch.status, 400);
    assert.equal((await mismatch.json()).error.code, "cursor_filter_mismatch");
  });

  it("rejects expired snapshots without reading repository data", async () => {
    let clock = NOW;
    let reads = 0;
    const expiring = await startTestServer({
      credentials, tokenHmacSecret: TOKEN_SECRET, rateLimit: false, now: () => clock,
      locations: { ...repository, async readPage(options) { reads++; return fixturePage(records, options); } },
    });
    try {
      const first = await (await apiFetch(expiring.baseUrl, "/api/v1/locations?limit=1", READ_TOKEN)).json();
      clock = new Date(NOW.getTime() + 16 * 60_000);
      const response = await apiFetch(expiring.baseUrl, `/api/v1/locations?cursor=${first.pagination.nextCursor}`, READ_TOKEN);
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, "snapshot_expired");
      assert.equal(reads, 1);
    } finally { await closeServer(expiring.server); }
  });

  it("fails closed when unconfigured and sanitizes repository failures", async () => {
    for (const configured of [false, true]) {
      let repositoryReads = 0;
      const failing = await startTestServer({
        credentials: configured ? credentials : [],
        tokenHmacSecret: configured ? TOKEN_SECRET : "", rateLimit: false,
        locations: {
          ...repository,
          async readPage() { repositoryReads++; throw new Error("private-repository-detail"); },
        },
      });
      try {
        const response = await apiFetch(failing.baseUrl, "/api/v1/locations", READ_TOKEN);
        const body = await response.json();
        assert.equal(response.status, configured ? 500 : 503);
        assert.equal(body.error.code, configured ? "internal_error" : "api_not_configured");
        assert.equal(body.error.requestId, response.headers.get("x-request-id"));
        assert.equal(JSON.stringify(body).includes("private-repository-detail"), false);
        assert.equal(repositoryReads, configured ? 1 : 0);
      } finally { await closeServer(failing.server); }
    }
  });

  it("returns structured JSON for unknown versioned and unversioned API routes", async () => {
    const versioned = await apiFetch(baseUrl, "/api/v1/not-a-route", READ_TOKEN);
    const versionedBody = await versioned.json();
    assert.equal(versioned.status, 404);
    assert.equal(versionedBody.error.code, "api_route_not_found");

    const unversioned = await fetch(`${baseUrl}/api/not-a-route`);
    const unversionedBody = await unversioned.json();
    assert.equal(unversioned.status, 404);
    assert.match(unversioned.headers.get("content-type") ?? "", /^application\/json/);
    assert.equal(unversionedBody.error.code, "api_route_not_found");
  });

  it("rate limits repeated requests with a structured error", async () => {
    const limited = await startTestServer({
      credentials,
      tokenHmacSecret: TOKEN_SECRET,
      locations: repository,
      now: () => NOW,
      rateLimit: { limit: 1, windowMs: 60_000 },
    });

    try {
      const first = await apiFetch(limited.baseUrl, "/api/v1/locations", READ_TOKEN);
      const second = await apiFetch(limited.baseUrl, "/api/v1/locations", READ_TOKEN);
      const body = await second.json();
      assert.equal(first.status, 200);
      assert.equal(second.status, 429);
      assert.equal(body.error.code, "rate_limit_exceeded");
    } finally {
      await closeServer(limited.server);
    }
  });
});

function credential(id: string, token: string, scopes: string[], expiresAt: string): ApiCredential {
  return {
    id,
    digest: digestApiToken(token, TOKEN_SECRET),
    scopes,
    expiresAt,
  };
}

function fixturePage(source: LocationDocument[], { limit, afterId }: LocationPageOptions) {
  if (!afterId) assertUniqueStoreNumbers(source);
  const ordered = [...source].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const remaining = ordered.filter((record) => !afterId || record.id > afterId);
  const page = remaining.slice(0, limit);
  return { records: page, nextId: remaining.length > limit ? page.at(-1)!.id : null };
}

async function apiFetch(
  origin: string,
  path: string,
  token: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${origin}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...headers,
    },
  });
}

async function startTestServer(options: DirectoryApiOptions): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  app.use(express.json());
  app.use("/api/v1", createDirectoryApiRouter(options));
  app.use("/api", apiNotFoundHandler);
  app.use("/api", apiErrorHandler);

  const testServer = createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const address = testServer.address() as AddressInfo;
  return { server: testServer, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function closeServer(testServer: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    testServer.close((error) => error ? reject(error) : resolve());
  });
}