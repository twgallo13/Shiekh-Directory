import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { FieldPath, Firestore, Timestamp } from "@google-cloud/firestore";
import { digestApiToken } from "../server/directoryApi";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "../server/firestoreLocations";

async function main() {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const token = randomBytes(32).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const server = spawn(process.execPath, ["dist/server.cjs"], {
    env: {
      ...process.env,
      NODE_ENV: process.argv.includes("--default-env") ? undefined : "production",
      PORT: String(port),
      GOOGLE_CLOUD_PROJECT: DEFAULT_GOOGLE_CLOUD_PROJECT,
      FIRESTORE_DATABASE_ID: DEFAULT_FIRESTORE_DATABASE,
      DIRECTORY_API_TOKEN_HMAC_SECRET: secret,
      DIRECTORY_API_CREDENTIALS_JSON: JSON.stringify([{
        id: "ephemeral-review-check", digest: digestApiToken(token, secret),
        scopes: ["locations:read"], expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      }]),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(server, "exit");
  server.stderr.on("data", () => {});
  const firestore = new Firestore({ projectId: DEFAULT_GOOGLE_CLOUD_PROJECT, databaseId: DEFAULT_FIRESTORE_DATABASE });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 30_000);
      server.on("error", () => { clearTimeout(timer); reject(new Error("Server startup failed")); });
      server.on("exit", () => { clearTimeout(timer); reject(new Error("Server exited before readiness")); });
      server.stdout.on("data", (chunk) => {
        if (String(chunk).includes("Server running")) { clearTimeout(timer); resolve(); }
      });
    });

    function check(name: string, path: string, status: number, code?: string, authenticated = false, method = "GET") {
      const response = spawnSync("curl", [
        "--silent", "--show-error", "--max-time", "30", "--config", "-",
        "--write-out", "\n%{http_code}\n%{content_type}", `http://127.0.0.1:${port}${path}`,
      ], {
        encoding: "utf8",
        input: `request = ${JSON.stringify(method)}\n${authenticated ? `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}\n` : ""}`,
      });
      assert.equal(response.status, 0, `${name}: curl must succeed`);
      const lines = response.stdout.split("\n");
      const contentType = lines.pop()!;
      const actualStatus = Number(lines.pop());
      assert.equal(actualStatus, status, name);
      assert.match(contentType, /^application\/json/, name);
      const body = JSON.parse(lines.join("\n"));
      if (code) {
        assert.equal(body.error.code, code, name);
        assert.equal(typeof body.error.requestId, "string", name);
        assert.equal(body.data, undefined, name);
      }
      console.log(`${name}: ${actualStatus} application/json${code ? ` ${code}` : ""}`);
    }

    check("missing authentication", "/api/v1/locations", 401, "invalid_token");
    for (const authenticated of [false, true]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/me`, { headers: authenticated ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(response.status, 401);
      assert.equal((await response.json()).error.code, "invalid_token");
      assert.equal(response.headers.get("cache-control"), "no-store");
      console.log(`account guard (${authenticated ? "Directory API token" : "no token"}): 401 invalid_token, no-store`);
      const bootstrap = await fetch(`http://127.0.0.1:${port}/api/auth/bootstrap`, { headers: authenticated ? { Authorization: `Bearer ${token}` } : {} });
      assert.equal(bootstrap.status, 401);
      console.log(`directory bootstrap guard (${authenticated ? "Directory API token" : "no token"}): 401`);
    }
    for (const path of ["/server.cjs", "/server.cjs.map", "/src/data/initialData.ts", "/server/directorySeed.ts", "/reference-data/store-directory-2025-09-26.csv"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.ok(response.status === 403 || response.headers.get("content-type")?.startsWith("text/html"));
      const text = await response.text();
      assert.ok(!text.includes("INITIAL_LOCATIONS") && !text.includes("INITIAL_PEOPLE"));
    }
    console.log("private seed, reference data, server bundle and source map are not publicly served");
    if (process.argv.includes("--default-env")) {
      const viteClient = await fetch(`http://127.0.0.1:${port}/@vite/client`);
      assert.equal(viteClient.status, 200);
      assert.match(viteClient.headers.get("content-type") || "", /javascript/);
      console.log("Vite development client remains available behind private-file restrictions");
    }
    check("unauthenticated SMTP status", "/api/mail/status", 401, "invalid_token");
    check("unauthenticated SMTP dispatch", "/api/mail/dispatch", 401, "invalid_token", false, "POST");
    check("directory token cannot authorize SMTP", "/api/mail/status", 401, "invalid_token", true);
    check("conflicting live directory", "/api/v1/locations?limit=1", 409, "location_conflict", true);
    check("impossible timestamp", "/api/v1/locations?updatedSince=2026-02-30T00:00:00Z", 400, "invalid_updated_since", true);
    check("unknown store", "/api/v1/locations/__review_unknown_store__", 404, "location_not_found", true);
    check("unversioned fallback", "/api/review-unknown", 404, "api_route_not_found");
    check("versioned fallback", "/api/v1/review-unknown", 404, "api_route_not_found", true);

    const readTime = Timestamp.fromMillis(Math.floor(Date.now() / 1000) * 1000);
    const query = firestore.collection("locations").select("storeNumber").orderBy(FieldPath.documentId()).limit(2);
    const first = await firestore.runTransaction((transaction) => transaction.get(query), { readOnly: true, readTime });
    assert.equal(first.size, 2);
    const second = await firestore.runTransaction(
      (transaction) => transaction.get(query.startAfter(first.docs.at(-1)!.id)), { readOnly: true, readTime },
    );
    assert.equal(second.size, 2);
    assert.equal(first.readTime.isEqual(second.readTime), true);
    assert.equal(first.docs.some((document) => second.docs.some((other) => other.id === document.id)), false);
    console.log("masked Firestore snapshot paging: two bounded pages, same readTime, no repeated document IDs");
    const storeNumber = first.docs[0].get("storeNumber");
    assert.equal(typeof storeNumber, "string");
    check("conflicting live store", `/api/v1/locations/${encodeURIComponent(storeNumber)}`, 409, "location_conflict", true);
  } finally {
    server.kill("SIGTERM");
    await exited;
    await firestore.terminate();
  }
}

main().catch(() => {
  console.error("Live validation failed; no credential or document contents were logged.");
  process.exitCode = 1;
});