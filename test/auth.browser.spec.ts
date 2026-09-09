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
  await page.route("**/api/mail/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/mail/settings" && route.request().method() === "GET") return route.fulfill({ json: { settings: { smtpHost: "smtp.example.test", smtpPort: 587, smtpUser: "mail-user@example.test", fromName: "Directory Mail", fromEmail: "mail@example.test", replyToEmail: "replies@example.test", stewardAlertRecipient: "steward@example.test", diagnosticRecipients: ["user@example.test"] }, passwordConfigured: true } });
    if (path === "/api/mail/status") return route.fulfill({ json: { configured: true } });
    return route.fulfill({ status: 403, json: { error: { message: "No delivery in browser tests" } } });
  });
  await page.route("**/api/auth/bootstrap", route => route.fulfill({ json: { locations: [], people: [], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [] } }));
}

function seedDirectory(locationCount: number) {
  const standardHours = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { open: '10:00', close: '20:00', isClosed: false }]));
  return {
    locations: Array.from({ length: locationCount }, (_value, index) => ({
      id: `loc-${index + 1}`,
      storeNumber: String(index + 1).padStart(3, '0'),
      name: `Bootstrap Store ${index + 1}`,
      type: 'Strip Center / Shopping Center',
      address: `${index + 1} Local State Street`,
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
      phone: '555-0100',
      timeZone: 'America/Los_Angeles',
      operationalStatus: 'Open — Normal Operations',
      recordStatus: 'Active',
      standardHours,
    })),
    people: [], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], customFieldDefinitions: [],
  };
}

async function prepareExportBrowser(page: Page, options: { bootstrapCount?: number; exportCount?: number; failPrepare?: boolean } = {}) {
  await prepare(page, 'System Administrator');
  const bootstrapSeed = seedDirectory(options.bootstrapCount ?? 3);
  let prepareCalls = 0;
  let downloadCalls = 0;
  await page.route("**/api/auth/bootstrap", route => route.fulfill({ json: bootstrapSeed }));
  await page.route("**/api/exports/locations/prepare", async route => {
    prepareCalls++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe('Bearer synthetic-token');
    expect(route.request().postData()).toBeNull();
    if (options.failPrepare) return route.fulfill({ status: 409, json: { error: { message: 'Duplicate store numbers prevent a complete export.' } } });
    const exportCount = options.exportCount ?? 120;
    return route.fulfill({ json: { token: 'export-token', metadata: { exportMode: 'all-stores', recordCount: exportCount, storeNumberSetDigest: 'abcdef1234567890', generatedAt: '2026-09-09T12:00:00.000Z', appliedLifecycle: 'Active', authorizationScope: { type: 'company-wide', label: 'Company-wide' }, missingCanonicalPersonReferences: 0, filename: 'shiekh_active_store_directory_2026-09-09.csv', expiresAt: '2026-09-09T12:02:00.000Z' } } });
  });
  await page.route("**/api/exports/locations/export-token", async route => {
    downloadCalls++;
    expect(route.request().headers().authorization).toBe('Bearer synthetic-token');
    return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', headers: { 'Content-Disposition': 'attachment; filename="shiekh_active_store_directory_2026-09-09.csv"', 'X-Location-Export-Count': String(options.exportCount ?? 120), 'X-Location-Export-Digest': 'abcdef1234567890' }, body: 'StoreNumber,StoreName\r\n001,Authoritative Store\r\n' });
  });
  return { calls: () => ({ prepareCalls, downloadCalls }) };
}
async function restore(page: Page, signedIn: boolean) {
  await page.waitForFunction(() => typeof (window as any).__restore === "function" && (window as any).__persistence);
  await page.evaluate(value => (window as any).__restore(value), signedIn);
}

async function prepareCustomFields(page: Page, role = 'System Administrator') {
  await prepare(page, role);
  const field = { id: 'capacity', label: 'Capacity', type: 'number', helpText: '', options: [], order: 1, apiVisible: false, retired: false };
  const seed: any = { locations: [{ id: 'loc-custom', storeNumber: '07', name: 'Metadata Test Store', type: 'Strip Center / Shopping Center', address: '700 Test Avenue', city: 'Los Angeles', state: 'CA', zipCode: '90001', phone: '555-555-0107', timeZone: 'America/Los_Angeles', operationalStatus: 'Open — Normal Operations', recordStatus: 'Active', standardHours: Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { open: '10:00', close: '20:00', isClosed: false }])), customMetadata: {} }], people: [], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], customFieldDefinitions: [field, { ...field, id: 'pickup', label: 'Pickup available', type: 'boolean' }, { ...field, id: 'platform', label: 'Platform', type: 'select', options: ['Yelp', 'Apple Maps'] }, { ...field, id: 'reference', label: 'Platform reference', type: 'text' }] };
  const commits: any[] = [];
  let fail = false;
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); commits.push(body);
    if (fail) return route.fulfill({ status: 409, json: { error: { message: 'Custom metadata changed. Reload the directory before saving.' } } });
    for (const write of body.writes) {
      const key = write.collection === 'custom_field_definitions' ? 'customFieldDefinitions' : 'locations';
      seed[key] = [...seed[key].filter((record: any) => record.id !== write.id), { ...write.data, id: write.id }];
    }
    await route.fulfill({ status: 204, body: '' });
  });
  return { seed, commits, failWrites: () => { fail = true; } };
}

for (const width of [1440, 390]) {
  test(`Custom Fields create, save, reload and retire at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const fixture = await prepareCustomFields(page);
    await page.goto(`${origin}/admin`); await restore(page, true);
    await page.getByRole('button', { name: 'Custom Fields', exact: true }).click();
    await page.getByRole('button', { name: 'Add field', exact: true }).click();
    await page.getByLabel('Field label', { exact: true }).fill('Yelp profile');
    await page.getByLabel('Permanent field key').fill('yelpUrl');
    await page.getByLabel('Help text').fill('Public listing');
    await page.getByLabel('Expose in read-only API').check();
    await page.getByRole('button', { name: 'Save field', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Yelp profile saved.');
    expect(fixture.commits[0].writes[0].expectedDefinition).toBeNull();
    expect(fixture.seed.customFieldDefinitions.find((field: any) => field.id === 'yelpUrl').apiVisible).toBe(true);
    await page.getByRole('heading', { name: 'Custom Fields', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`custom-fields-${width}.png`), fullPage: true });
    await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
    await page.getByLabel('Yelp profile', { exact: true }).fill('https://example.test/yelp');
    await page.getByLabel('Capacity', { exact: true }).fill('0');
    await page.getByLabel('Pickup available', { exact: true }).check();
    await page.getByLabel('Pickup available', { exact: true }).uncheck();
    await page.getByLabel('Platform', { exact: true }).selectOption('Apple Maps');
    await page.getByLabel('Platform reference', { exact: true }).fill('Store 07 listing');
    await page.getByRole('region', { name: 'Custom Metadata', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`custom-metadata-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: /Save.*Record/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(fixture.seed.locations[0].customMetadata).toEqual({ yelpUrl: 'https://example.test/yelp', capacity: 0, pickup: false, platform: 'Apple Maps', reference: 'Store 07 listing' });
    await page.goto(`${origin}/locations/loc-custom`); await restore(page, true);
    await expect(page.getByRole('link', { name: 'https://example.test/yelp' })).toBeVisible();
    await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
    await expect(page.getByLabel('Yelp profile', { exact: true })).toHaveValue('https://example.test/yelp');
    await page.goto(`${origin}/admin`); await restore(page, true);
    await page.getByRole('button', { name: 'Custom Fields', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Yelp profile', exact: true }).click();
    await expect(page.getByLabel('Permanent field key')).toBeDisabled();
    await expect(page.getByLabel('Field type', { exact: true })).toBeDisabled();
    await page.getByLabel('Retired', { exact: true }).check();
    await page.getByRole('button', { name: 'Save field', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Yelp profile saved.');
    await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
    await expect(page.getByLabel('Capacity', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Yelp profile', { exact: true })).toHaveCount(0);
    expect(fixture.seed.locations[0].customMetadata.yelpUrl).toBe('https://example.test/yelp');
  });
}

test('Custom Fields failed saves preserve the location draft and never report success', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await prepareCustomFields(page); fixture.failWrites();
  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
  await page.getByLabel('Capacity', { exact: true }).fill('12');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Custom metadata changed');
  await expect(page.getByLabel('Capacity', { exact: true })).toHaveValue('12');
  expect(fixture.seed.locations[0].customMetadata).toEqual({});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Custom Fields definitions are read-only for data stewards', async ({ page }) => {
  await prepareCustomFields(page, 'Directory Data Steward');
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Custom Fields', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Capacity', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add field', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Capacity', exact: true })).toHaveCount(0);
});

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
  await page.getByRole("tab", { name: "Email link (no password)", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("user@example.test");
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Check Spam or company quarantine");
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
  await expect(page.getByRole("button", { name: "Set or change password" })).toBeVisible();
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

test("Export All Stores prepares authoritative metadata, confirms, and downloads after server response", async ({ page }) => {
  const fixture = await prepareExportBrowser(page, { bootstrapCount: 3, exportCount: 120 });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  await page.evaluate(() => localStorage.setItem('shiekh_locations_v3', JSON.stringify([{ storeNumber: '999' }])));
  await page.getByRole('button', { name: 'Export All Stores' }).click();
  await expect(page.getByRole('status')).toContainText('120 active stores for Company-wide');
  await expect(page.getByRole('button', { name: 'Export All Stores' })).toBeDisabled();
  await expect(page.getByRole('alertdialog')).toContainText('120 active stores for Company-wide');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe('shiekh_active_store_directory_2026-09-09.csv');
  await expect(page.getByRole('status')).toContainText('Export complete: downloaded 120 active stores for Company-wide');
  expect(fixture.calls()).toEqual({ prepareCalls: 1, downloadCalls: 1 });
});

test("active location filters, selected rows, returning state, and browser-held locations do not affect Export All", async ({ page }) => {
  const fixture = await prepareExportBrowser(page, { bootstrapCount: 3, exportCount: 75 });
  await page.goto(`${origin}/locations`); await restore(page, true);
  await page.getByPlaceholder('Search store #, name, city, manager, district...').fill('no-visible-store');
  await expect(page.getByText('No store locations match the active search and filter criteria.').first()).toBeVisible();
  await page.evaluate(() => {
    sessionStorage.setItem('shiekh_selected_locations', JSON.stringify(['loc-1']));
    localStorage.setItem('shiekh_locations_v3', JSON.stringify([{ storeNumber: '001' }]));
  });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  await page.getByRole('button', { name: 'Export All Stores' }).click();
  await expect(page.getByRole('status')).toContainText('75 active stores for Company-wide');
  await page.getByRole('button', { name: 'Cancel' }).click();
  expect(fixture.calls()).toEqual({ prepareCalls: 1, downloadCalls: 0 });
});

test("Export All Stores shows server failures visibly and does not download", async ({ page }) => {
  const fixture = await prepareExportBrowser(page, { failPrepare: true });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  await page.getByRole('button', { name: 'Export All Stores' }).click();
  await expect(page.getByRole('alert')).toContainText('Duplicate store numbers prevent a complete export.');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(fixture.calls()).toEqual({ prepareCalls: 1, downloadCalls: 0 });
});

test("diagnostic mail uses the account session without separate sign-in controls", async ({ page }) => {
  await prepare(page, "Directory Data Steward");
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole("button", { name: /SMTP Relay/ }).click();
  await expect(page.getByRole("heading", { name: "Secure Mail", exact: true })).toBeVisible();
  await expect(page.getByText("user@example.test", { exact: true })).toBeVisible();
  await expect(page.getByLabel("SMTP host")).toHaveValue("smtp.example.test");
  await expect(page.getByText("Secret Manager connected")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save settings" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Sign In With Google|Continue with Google/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send Diagnostic" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__authCalls.length)).toBe(0);
});

test("administrators can save non-secret mail settings without a password field", async ({ page }) => {
  await prepare(page, "System Administrator");
  let submitted: Record<string, unknown> | null = null;
  await page.route("**/api/mail/settings", async route => {
    const settings = { smtpHost: "smtp.example.test", smtpPort: 587, smtpUser: "mail-user@example.test", fromName: "Directory Mail", fromEmail: "mail@example.test", replyToEmail: "replies@example.test", stewardAlertRecipient: "steward@example.test", diagnosticRecipients: ["user@example.test"] };
    if (route.request().method() === "PUT") submitted = route.request().postDataJSON();
    await route.fulfill({ json: { settings: submitted || settings, passwordConfigured: true } });
  });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole("button", { name: /SMTP Relay/ }).click();
  await page.getByLabel("From name").fill("Shiekh Directory Operations");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Mail settings saved.");
  expect(submitted?.fromName).toBe("Shiekh Directory Operations");
  expect(Object.hasOwn(submitted || {}, "password")).toBe(false);
  await expect(page.getByLabel(/password/i)).toHaveCount(0);
});

test("Add User provisions Firebase identity, sends SMTP signup email, and shows accepted evidence", async ({ page }) => {
  await prepare(page, "System Administrator");
  let commit: any = null;
  let invitation: any = null;
  await page.route("**/api/directory/commit", async route => { commit = route.request().postDataJSON(); await route.fulfill({ status: 204, body: "" }); });
  await page.route("**/api/mail/invitation-email", async route => { invitation = route.request().postDataJSON(); await route.fulfill({ json: { success: true, status: "accepted", transport: "smtp", requestId: "signup-request-1" } }); });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole("button", { name: "User RBAC" }).click();
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("Full Name *").fill("New Directory User");
  await page.getByLabel("Email Address *").fill("new.user@example.test");
  await page.getByLabel("Role / Permissions *").selectOption("Editor");
  await page.getByRole("button", { name: "Save Account" }).click();
  await expect(page.getByRole("status")).toContainText("provisioned the Firebase account");
  await expect(page.getByRole("status")).toContainText("relay accepted it; inbox delivery is not yet confirmed");
  expect(commit.writes[0].collection).toBe("users");
  expect(commit.writes[0].data.email).toBe("new.user@example.test");
  expect(invitation).toEqual({ entityId: commit.writes[0].id });
  await page.getByRole("button", { name: /Outbox/ }).click();
  await expect(page.getByText("Your Shiekh Directory secure sign-in link", { exact: true })).toBeVisible();
  await expect(page.getByText("new.user@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
});

test("Add User supports copy-link and access-only onboarding without sending mail", async ({ page, context }) => {
  await prepare(page, "System Administrator");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
  const commits: any[] = [];
  const linkRequests: any[] = [];
  let invitationEmails = 0;
  await page.route("**/api/directory/commit", async route => { commits.push(route.request().postDataJSON()); await route.fulfill({ status: 204, body: "" }); });
  await page.route("**/api/mail/invitation-link", async route => { linkRequests.push(route.request().postDataJSON()); await route.fulfill({ json: { success: true, activationLink: "https://secure.example.test/firebase-action-code" } }); });
  await page.route("**/api/mail/invitation-email", async route => { invitationEmails++; await route.fulfill({ json: { success: true, status: "accepted", transport: "smtp", requestId: "unused" } }); });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole("button", { name: "User RBAC" }).click();
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("Full Name *").fill("Copied Link User");
  await page.getByLabel("Email Address *").fill("copied.link@example.test");
  await page.getByLabel("Role / Permissions *").selectOption("Editor");
  await page.getByRole("radio", { name: /Copy secure sign-in link/ }).check();
  await page.getByRole("button", { name: "Save Account" }).click();
  await expect(page.getByRole("status")).toContainText("copied a fresh secure sign-in link");
  expect(linkRequests[0].entityId).toBe(commits[0].writes[0].id);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("https://secure.example.test/firebase-action-code");
  expect(invitationEmails).toBe(0);

  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("Full Name *").fill("Access Only User");
  await page.getByLabel("Email Address *").fill("access.only@example.test");
  await page.getByLabel("Role / Permissions *").selectOption("Editor");
  await page.getByRole("radio", { name: /Grant access without email/ }).check();
  await page.getByRole("button", { name: "Save Account" }).click();
  await expect(page.getByRole("status")).toContainText("No onboarding email was submitted");
  expect(commits).toHaveLength(2);
  expect(linkRequests).toHaveLength(1);
  expect(invitationEmails).toBe(0);
});

test("User accounts distinguish readiness from access and protect the current session", async ({ page }) => {
  await prepare(page, "System Administrator");
  await page.route("**/api/auth/bootstrap", route => route.fulfill({ json: {
    locations: [], people: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [],
    users: [
      { id: "usr-current", name: "Synthetic User", email: "user@example.test", role: "System Administrator", status: "Active", accessScope: "Company-wide", identityLinked: true },
      { id: "usr-setup", name: "Setup User", email: "setup@example.test", role: "Editor", status: "Active", accessScope: "Company-wide", identityLinked: false, firebaseIdentityProvisioned: true, invitationStatus: "Pending", invitationDelivery: "SMTP email", invitationDeliveryStatus: "Accepted", invitedAt: "2026-09-08T12:00:00Z" },
      { id: "usr-suspended", name: "Suspended User", email: "suspended@example.test", role: "Viewer", status: "Suspended", accessScope: "Store 07", storeNumber: "07", identityLinked: true },
    ],
  } }));
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole("button", { name: "User RBAC" }).click();

  const current = page.getByRole("region", { name: "Synthetic User account" });
  await expect(current).toContainText("Current session");
  await expect(current.getByRole("button", { name: /Suspend|Revoke/ })).toHaveCount(0);

  const setup = page.getByRole("region", { name: "Setup User account" });
  await expect(setup).toContainText("Setup required");
  await expect(setup).toContainText("AccessGranted");
  await expect(setup).toContainText("Firebase ready; first sign-in pending");
  await expect(setup).toContainText("SMTP email accepted by relay");
  await expect(setup.getByRole("button", { name: "Send setup email" })).toBeVisible();
  await expect(setup.getByRole("button", { name: "Copy link" })).toBeVisible();

  const suspended = page.getByRole("region", { name: "Suspended User account" });
  await expect(suspended).toContainText("Suspended");
  await expect(suspended.getByRole("button", { name: "Send setup email" })).toHaveCount(0);
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