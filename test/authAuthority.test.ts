import assert from "node:assert/strict";
import { test } from "node:test";
import type { Auth, DecodedIdToken, UserRecord } from "firebase-admin/auth";
import { AccessDenied, AuthenticationUnavailable, firebaseAuthenticator, type UserMapping } from "../server/authAuthority";
import { DEFAULT_GOOGLE_CLOUD_PROJECT } from "../server/firestoreLocations";

const decoded = { uid: "synthetic-uid", aud: DEFAULT_GOOGLE_CLOUD_PROJECT, iss: `https://securetoken.google.com/${DEFAULT_GOOGLE_CLOUD_PROJECT}`, email: "user@example.test", email_verified: true, firebase: { sign_in_provider: "google.com" }, role: "System Administrator" } as unknown as DecodedIdToken;
const identity = { uid: decoded.uid, email: decoded.email, emailVerified: true, disabled: false, customClaims: { role: "System Administrator" }, metadata: { creationTime: "", lastSignInTime: "", toJSON: () => ({}) }, providerData: [], toJSON: () => ({}) } as UserRecord;
const mapping = { firebaseUid: decoded.uid, role: "Viewer", status: "Active", accessScope: "Company", personId: "person-test" };
function harness(records: UserMapping[] = [mapping], user = identity, token = decoded) {
  const calls: unknown[] = [];
  const auth = { async verifyIdToken(value, revoked) { calls.push([value, revoked]); return token; }, async getUser() { return user; } } as Pick<Auth, "verifyIdToken" | "getUser">;
  return { calls, authenticate: firebaseAuthenticator(auth, { async find(field, value) { calls.push([field, value]); return records; } }) };
}
test("revocation is checked and server role/scope override all custom claims", async () => {
  const app = harness();
  const account = await app.authenticate("synthetic-token");
  assert.equal(account.role, "Viewer"); assert.equal(account.accessScope, "Company"); assert.equal(account.personId, "person-test");
  assert.deepEqual(app.calls, [["synthetic-token", true], ["firebaseUid", decoded.uid]]);
});
test("missing, duplicate, inactive, invalid role and missing scope mappings fail closed", async () => {
  for (const records of [[], [mapping, mapping], [{ ...mapping, status: "Invited" }], [{ ...mapping, status: "Inactive" }], [{ ...mapping, role: "Owner" }], [{ ...mapping, accessScope: "" }]]) await assert.rejects(harness(records).authenticate("synthetic-token"), AccessDenied);
});
test("disabled and wrong-project identities fail before lookup", async () => {
  await assert.rejects(harness([mapping], { ...identity, disabled: true, toJSON: () => ({}) }).authenticate("test"));
  await assert.rejects(harness([mapping], identity, { ...decoded, aud: "wrong-project" }).authenticate("test"));
  await assert.rejects(harness([mapping], identity, { ...decoded, iss: "wrong-issuer" }).authenticate("test"));
});
test("expired, revoked and forged tokens are rejected; credential outages are unavailable", async () => {
  for (const code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/user-disabled", "auth/insufficient-permission"]) {
    const authenticate = firebaseAuthenticator({ async verifyIdToken() { throw Object.assign(new Error("private"), { code }); }, async getUser() { assert.fail(); } }, { async find() { assert.fail(); } });
    await assert.rejects(authenticate("test"), code === "auth/insufficient-permission" ? AuthenticationUnavailable : /^Error: Invalid identity$/);
  }
});
test("email fallback requires verified exact unique email and no conflicting UID", async () => {
  for (const verified of [false, true]) for (const records of [[], [{ ...mapping, firebaseUid: undefined }], [mapping, mapping], [{ ...mapping, firebaseUid: "other" }]]) {
    const queries: unknown[] = [];
    const bindings: unknown[] = [];
    const authenticate = firebaseAuthenticator({ async verifyIdToken() { return decoded; }, async getUser() { return { ...identity, emailVerified: verified, toJSON: () => ({}) }; } }, { async find(field, value) { queries.push([field, value]); return field === "firebaseUid" ? [] : records; }, async bindUid(record, uid) { bindings.push([record, uid]); } });
    if (verified && records.length === 1 && !records[0].firebaseUid) {
      assert.equal((await authenticate("test")).role, "Viewer"); assert.deepEqual(queries[1], ["email", "user@example.test"]); assert.deepEqual(bindings, [[records[0], decoded.uid]]);
    } else await assert.rejects(authenticate("test"), AccessDenied);
  }
});