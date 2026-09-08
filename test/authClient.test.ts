import assert from "node:assert/strict";
import { test } from "node:test";
import type { Auth } from "firebase/auth";
import { authErrorMessage, createAuthActions, firebaseConfiguration, FIREBASE_PROJECT, safeContinueUrl, validateEmailLink } from "../src/lib/authClient";
import { clearProtectedStorage, createSessionController, loadAccount, serializeLocalDraft, type Account, type SessionState } from "../src/lib/authSession";

const origin = "https://directory.example.test";
const link = `${origin}/auth/email-link?mode=signIn&oobCode=synthetic-code&apiKey=test-key`;
const account: Account = { uid: "test-uid", email: "user@example.test", name: "Test User", emailVerified: true, role: "Viewer", status: "Active", accessScope: "Company", personId: null, authenticationMethod: "google.com" };
const user = { uid: account.uid, async getIdToken() { return "synthetic-token"; } };
test("configuration fails closed unless all web settings name the pinned project", () => {
  const config = { VITE_FIREBASE_PROJECT_ID: FIREBASE_PROJECT, VITE_FIREBASE_AUTH_DOMAIN: `${FIREBASE_PROJECT}.firebaseapp.com`, VITE_FIREBASE_API_KEY: "test-key", VITE_FIREBASE_APP_ID: "test-app" };
  assert.equal(firebaseConfiguration(config).projectId, FIREBASE_PROJECT);
  for (const field of Object.keys(config)) assert.throws(() => firebaseConfiguration({ ...config, [field]: "" }));
  assert.throws(() => firebaseConfiguration({ ...config, VITE_FIREBASE_PROJECT_ID: "other" }));
});
test("redirects require same origin, exact path, allowlist and no secret-bearing parameters", () => {
  assert.equal(safeContinueUrl("/auth/email-link", origin, [origin]), `${origin}/auth/email-link`);
  for (const value of ["https://evil.test/auth/email-link", "//evil.test/sign-in", "/admin", "/sign-in?role=admin", "/sign-in#token", "javascript:alert(1)", "https://user@directory.example.test/sign-in"]) assert.throws(() => safeContinueUrl(value, origin, [origin]));
  assert.throws(() => safeContinueUrl("/sign-in", origin, []));
  assert.equal(validateEmailLink(link, origin, [origin], "test-key"), link);
  for (const value of [`${link}&continueUrl=https://evil.test/sign-in`, `${link}&role=admin`, `${link}&oobCode=duplicate`, link.replace("test-key", "other"), `${link}#token`]) assert.throws(() => validateEmailLink(value, origin, [origin], "test-key"));
});
test("Google, password, reset, passwordless send/completion and sign-out delegate to Firebase APIs", async () => {
  const calls: { name: string; args: unknown[] }[] = [];
  const sdk = Object.fromEntries(["signInWithPopup", "signInWithEmailAndPassword", "sendPasswordResetEmail", "sendSignInLinkToEmail", "signInWithEmailLink", "signOut"].map(name => [name, async (...args: unknown[]) => { calls.push({ name, args }); }])) as unknown as NonNullable<Parameters<typeof createAuthActions>[3]>;
  sdk.isSignInWithEmailLink = () => true;
  const auth = { app: { options: { apiKey: "test-key" } } } as Auth;
  const actions = createAuthActions(auth, origin, [origin], sdk);
  await actions.google(); await actions.password(" user@example.test ", "test-password"); await actions.reset("user@example.test"); await actions.sendLink("user@example.test"); await actions.completeLink("user@example.test", link); await actions.signOut();
  assert.deepEqual(calls.map(call => call.name), ["signInWithPopup", "signInWithEmailAndPassword", "sendPasswordResetEmail", "sendSignInLinkToEmail", "signInWithEmailLink", "signOut"]);
  assert.ok(calls.every(call => call.args[0] === auth));
  assert.equal((calls[0].args[1] as { providerId: string }).providerId, "google.com");
  assert.equal(calls[1].args[1], "user@example.test");
  assert.deepEqual(calls[3].args[2], { url: `${origin}/auth/email-link`, handleCodeInApp: true });
  sdk.sendPasswordResetEmail = async () => { throw { code: "auth/user-not-found" }; };
  await actions.reset("missing@example.test");
  sdk.signInWithEmailAndPassword = async () => { throw { code: "auth/invalid-credential" }; };
  await assert.rejects(actions.password("user@example.test", "wrong"));
  assert.match(authErrorMessage({ code: "auth/invalid-credential" }), /Check your email and password/);
  assert.match(authErrorMessage({ code: "auth/operation-not-allowed" }), /not enabled/);
});
test("session restoration gates content and late authorization cannot undo sign-out", async () => {
  const states: SessionState[] = [];
  let finish!: (account: Account) => void;
  const session = createSessionController(state => states.push(state), () => new Promise(resolve => { finish = resolve; }));
  const pending = session.restore(user);
  assert.equal(states.at(-1)?.status, "loading"); assert.equal(states.at(-1)?.account, null);
  session.clear(); finish(account); await pending;
  assert.equal(states.at(-1)?.status, "signed-out");
  const resolved = createSessionController(state => states.push(state), async () => account);
  await resolved.restore(user); assert.equal(states.at(-1)?.status, "authorized");
  await resolved.restore(null); assert.equal(states.at(-1)?.account, null);
});
test("account fetch uses only Authorization header and fails closed on denied or mismatched identity", async () => {
  const request = async (url: unknown, init: RequestInit) => { assert.equal(url, "/api/auth/me"); assert.equal((init.headers as Record<string,string>).Authorization, "Bearer synthetic-token"); return Response.json(account); };
  assert.deepEqual(await loadAccount(user, request as typeof fetch), account);
  await assert.rejects(loadAccount(user, async () => Response.json({}, { status: 403 })), /unique active/);
  await assert.rejects(loadAccount(user, async () => Response.json({ ...account, uid: "other" })));
});

test("local draft storage excludes roles and tokens; sign-out cleanup preserves only unrelated preferences", () => {
  assert.deepEqual(JSON.parse(serializeLocalDraft({ requestedBy: { name: "Test", role: "Viewer", accessScope: "Company" }, idToken: "test-token", invitationToken: "test-invite" })), { requestedBy: { name: "Test" } });
  const storage = { shiekh_locations_v3: "draft", shiekh_users_v3: "untrusted-role", "app-theme": "dark", emailForSignIn: "user@example.test" } as unknown as Storage;
  Object.defineProperty(storage, "removeItem", { enumerable: false, value(key: string) { delete storage[key]; } });
  clearProtectedStorage(storage);
  assert.deepEqual(Object.keys(storage), ["app-theme"]);
});

test("background authorization preserves the shell until a denial clears it", async () => {
  const states: SessionState[] = [];
  const session = createSessionController(state => states.push(state), async () => { throw new Error("Access changed"); });
  const pending = session.restore(user, true);
  assert.equal(states.length, 0);
  await pending;
  assert.equal(states.at(-1)?.status, "denied"); assert.equal(states.at(-1)?.account, null);
});