import assert from "node:assert/strict";
import { test } from "node:test";
import { digestApiToken, loadApiCredentials } from "../server/directoryApi";

const first = { id: "reader", digest: digestApiToken("first-test-token", "test-secret"), scopes: ["locations:read"] };
const second = { id: "other", digest: digestApiToken("second-test-token", "test-secret"), scopes: ["locations:read"] };

test("credential loader rejects duplicate IDs even with distinct digests", () => {
  assert.throws(() => loadApiCredentials(JSON.stringify([first, { ...second, id: first.id }])), /Duplicate credential IDs/);
});

test("credential loader rejects active and revoked duplicate digests in either order", () => {
  const revoked = { ...first, id: "revoked-copy", revoked: true };
  for (const credentials of [[first, revoked], [revoked, first]]) {
    assert.throws(() => loadApiCredentials(JSON.stringify(credentials)), /Duplicate token digests/);
  }
});

test("credential loader accepts unique records and rejects non-boolean revocation", () => {
  assert.equal(loadApiCredentials(JSON.stringify([first, second])).length, 2);
  assert.throws(() => loadApiCredentials(JSON.stringify([{ ...first, revoked: "true" }])), /invalid revoked flag/);
});