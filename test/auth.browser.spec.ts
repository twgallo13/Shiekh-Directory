import { test, expect, type Page } from "@playwright/test";

const origin = process.env.AUTH_BROWSER_TEST_ORIGIN || "http://127.0.0.1:3001";
const sdk = `
export const browserPopupRedirectResolver = {};
export const browserSessionPersistence = 'session';
export class GoogleAuthProvider { providerId = 'google.com'; }
let auth;
let listeners = new Set();
const user = { uid: 'synthetic-uid', email: 'user@example.test', getIdToken: async () => 'synthetic-token' };
window.__authCalls = [];
window.__restore = (signedIn) => { auth.currentUser = signedIn ? user : null; for (const listener of listeners) listener(auth.currentUser); };
export function initializeAuth(app, options) { window.__persistence = options.persistence; return auth = { app, currentUser: null }; }
export function onIdTokenChanged(instance, listener) { listeners.add(listener); return () => listeners.delete(listener); }
async function action(name, ...args) { window.__authCalls.push({ name, args }); if (window.__authFailure) throw { code: window.__authFailure }; }
export async function signInWithPopup(instance, provider) { await action('google', provider.providerId); window.__restore(true); }
export async function signInWithEmailAndPassword(instance, email, password) { await action('password', email, password); window.__restore(true); }
export async function sendPasswordResetEmail(instance, email, settings) { await action('reset', email, settings); }
export async function sendSignInLinkToEmail(instance, email, settings) { await action('sendLink', email, settings); }
export function isSignInWithEmailLink(instance, link) { return new URL(link).searchParams.get('mode') === 'signIn'; }
export async function signInWithEmailLink(instance, email, link) { await action('completeLink', email, link); window.__restore(true); }
export async function signOut() { await action('signOut'); window.__restore(false); }
`;

async function prepare(page: Page, role = "Viewer") {
  await page.route("https://**/*", route => route.abort());
  await page.route("**/node_modules/.vite/deps/firebase_auth.js*", route => route.fulfill({ contentType: "application/javascript", body: sdk }));
  await page.route("**/api/auth/me", async route => {
    expect(route.request().headers().authorization).toBe("Bearer synthetic-token");
    await route.fulfill({ json: { uid: "synthetic-uid", email: "user@example.test", emailVerified: true, name: "Synthetic User", role, status: "Active", accessScope: "Company-wide", personId: null, authenticationMethod: "password" } });
  });
  await page.route("**/api/mail/**", route => route.fulfill({ status: 403, json: { error: { message: "No delivery in browser tests" } } }));
  await page.route("**/api/auth/bootstrap", route => route.fulfill({ json: { locations: [], people: [], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [] } }));
}
async function restore(page: Page, signedIn: boolean) {
  await page.waitForFunction(() => typeof (window as any).__restore === "function" && (window as any).__persistence);
  await page.evaluate(value => (window as any).__restore(value), signedIn);
}

test("loading gate, password errors, reset and Google share one session", async ({ page }) => {
  await prepare(page);
  await page.goto(`${origin}/account`);
  await expect(page.getByRole("status")).toHaveText("Restoring secure session...");
  await expect(page.getByText("My Profile / Account", { exact: true })).toHaveCount(0);
  await restore(page, false);
  await page.getByLabel("Email", { exact: true }).fill("user@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-test-password");
  await page.evaluate(() => { (window as any).__authFailure = "auth/invalid-credential"; });
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByRole("alert")).toContainText("Check your email and password");
  await page.evaluate(() => { (window as any).__authFailure = null; });
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("button", { name: "Send password reset" }).click();
  await expect(page.getByRole("status")).toContainText("If this account is eligible");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "My Profile / Account" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__persistence)).toBe("session");
});

test("passwordless send and completion scrub URL and require email confirmation", async ({ page }) => {
  await prepare(page);
  await page.goto(`${origin}/sign-in`); await restore(page, false);
  await page.getByRole("tab", { name: "Email link", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("user@example.test");
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  const sent = await page.evaluate(() => (window as any).__authCalls.at(-1));
  expect(sent.args[1]).toEqual({ url: `${origin}/auth/email-link`, handleCodeInApp: true });
  await page.goto(`${origin}/auth/email-link?mode=signIn&oobCode=synthetic-code&apiKey=test-key`);
  await restore(page, false);
  await expect(page).toHaveURL(`${origin}/auth/email-link`);
  await page.getByLabel("Email", { exact: true }).fill("user@example.test");
  await page.getByRole("button", { name: "Complete sign-in" }).click();
  await expect(page.getByRole("heading", { name: "Complete email sign-in" })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__authCalls.at(-1).name)).toBe("completeLink");
});

test("unsafe email link never reaches Firebase completion", async ({ page }) => {
  await prepare(page);
  await page.goto(`${origin}/auth/email-link?mode=signIn&oobCode=synthetic-code&apiKey=test-key&continueUrl=https://evil.example.test/sign-in`);
  await restore(page, false);
  await page.getByLabel("Email", { exact: true }).fill("user@example.test");
  await page.getByRole("button", { name: "Complete sign-in" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__authCalls.length)).toBe(0);
});

test("password sign-in and sign-out failure keep protected content cleared", async ({ page }) => {
  await prepare(page);
  await page.goto(`${origin}/account`); await restore(page, false);
  await page.getByLabel("Email", { exact: true }).fill("user@example.test");
  await page.getByLabel("Password", { exact: true }).fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in with password" }).click();
  await expect(page.getByRole("heading", { name: "My Profile / Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send password reset" })).toBeVisible();
  await page.evaluate(() => { (window as any).__authFailure = "auth/network-request-failed"; });
  await page.getByRole("button", { name: "Sign out", exact: true }).last().click();
  await expect(page.getByRole("alert")).toContainText("Sign-out could not finish");
  await expect(page.getByRole("heading", { name: "My Profile / Account" })).toHaveCount(0);
  await page.evaluate(() => { (window as any).__authFailure = null; });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/sign-in`);
});

test("server denial on recheck removes the authorized shell", async ({ page }) => {
  await prepare(page);
  await page.goto(`${origin}/account`); await restore(page, true);
  await expect(page.getByRole("heading", { name: "My Profile / Account" })).toBeVisible();
  await page.route("**/api/auth/me", route => route.fulfill({ status: 403, json: { error: { code: "access_denied" } } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Directory access unavailable" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "My Profile / Account" })).toHaveCount(0);
});

test("diagnostic mail uses the account session without separate sign-in controls", async ({ page }) => {
  await prepare(page, "Directory Data Steward");
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole("button", { name: /SMTP Relay/ }).click();
  await expect(page.getByRole("heading", { name: "Secure Mail", exact: true })).toBeVisible();
  await expect(page.getByText("user@example.test", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Sign In With Google|Continue with Google/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send Diagnostic" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__authCalls.length)).toBe(0);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`profile, theme, protected admin and sign-out at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport); await prepare(page);
    await page.goto(`${origin}/account`); await restore(page, true);
    await expect(page.getByRole("heading", { name: "My Profile / Account" })).toBeVisible();
    await expect(page.getByText("user@example.test", { exact: true })).toBeVisible();
    await page.getByLabel("Appearance").selectOption("dark");
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/shiekh-auth-account-${viewport.width}.png`, fullPage: true });
    await page.getByLabel("Account menu").click();
    await expect(page.getByRole("link", { name: "My Profile / Account" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
    await expect(page).toHaveURL(`${origin}/sign-in`);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("shiekh_")))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("app-theme"))).toBe("dark");
    await restore(page, false);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await page.goto(`${origin}/admin`); await restore(page, true);
    await expect(page).toHaveURL(`${origin}/`);
    await expect(page.getByRole("heading", { name: "Admin & Integrations" })).toHaveCount(0);
  });
}