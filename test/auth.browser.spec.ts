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

function hierarchyBrowserSeed() {
  const seed = seedDirectory(0) as any;
  const standardHours = seedDirectory(1).locations[0].standardHours;
  const location = (overrides: Record<string, unknown>) => ({
    id: '', storeNumber: '', name: '', type: 'Street / Standalone Location',
    address: '1 Test Way', city: 'Los Angeles', state: 'CA', zipCode: '90001', phone: '555-0100',
    timeZone: 'America/Los_Angeles', operationalStatus: 'Open — Normal Operations', recordStatus: 'Active',
    standardHours, version: 0, ...overrides,
  });
  seed.locations = [
    location({ id: 'loc-retail', storeNumber: '101', name: 'Retail Store', type: 'Enclosed Mall', hierarchyApplicability: 'Applicable', regionId: 'reg-west', districtId: '01', district: 'Legacy Location District', districtManagerId: 'person-dm', districtManagerName: 'District Manager' }),
    location({ id: 'loc-center', storeNumber: '201', name: 'Operations Center', type: 'Warehouse / Distribution Center', hierarchyApplicability: 'Not Applicable' }),
    location({ id: 'loc-unassigned', storeNumber: '102', name: 'Unassigned Retail', type: 'Street / Standalone Location', hierarchyApplicability: 'Applicable' }),
    location({ id: 'loc-unclassified', storeNumber: '301', name: 'Unclassified Store', type: 'Unsupported Type', hierarchyApplicability: 'Applicable', regionId: 'reg-west', districtId: '01' }),
  ];
  seed.people = [{ id: 'person-dm', fullName: 'District Manager', role: 'District Manager', status: 'Active', activeStatus: true, district: 'Legacy Manager Territory' }];
  seed.regions = [{ id: 'reg-west', name: 'West', status: 'Active' }, { id: 'reg-east', name: 'East', status: 'Active' }];
  seed.districts = [{ id: '01', name: 'Renamed North', regionId: 'reg-west', status: 'Active' }, { id: '02', name: 'East District', regionId: 'reg-east', status: 'Active' }];
  return seed;
}

async function prepareHierarchyBrowser(page: Page) {
  await prepare(page, 'System Administrator');
  const seed = hierarchyBrowserSeed();
  const commits: any[] = [];
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON();
    commits.push(body);
    await route.fulfill({ json: commitResponseFor(body) });
  });
  return { seed, commits };
}

async function prepareLocationImportConfirmationBrowser(page: Page, options: { holdConfirmation?: boolean; staleConfirmation?: boolean } = {}) {
  await prepare(page, 'System Administrator');
  let previewCalls = 0;
  let confirmationCalls = 0;
  let releaseConfirmation: () => void = () => {};
  const confirmationGate = new Promise<void>(resolve => { releaseConfirmation = resolve; });
  const preview = {
    schemaVersion: 'locations-v1',
    snapshotReadAt: '2026-09-30T12:00:00.000Z',
    mode: 'add-and-update',
    mappings: [
      { sourceIndex: 0, sourceHeader: 'StoreNumber', target: 'StoreNumber', kind: 'exact' },
      { sourceIndex: 1, sourceHeader: 'StoreName', target: 'StoreName', kind: 'exact' },
    ],
    selectedRowNumbers: [2, 3, 4],
    confirmationToken: 'synthetic-signed-token',
    operationId: 'synthetic-operation-1',
    batchId: 'synthetic-batch-1',
    expiresAt: '2026-09-30T12:10:00.000Z',
    summary: { totalRows: 3, additions: 1, updates: 2, unchanged: 0, blocked: 0, warnings: 0 },
    rows: [
      { rowNumber: 2, action: 'add', locationId: 'loc-synthetic-new', currentVersion: null, matchedBy: null, storeNumber: '9001', displayName: 'SYNTHETIC ADD', changes: [{ field: 'name', before: null, after: 'SYNTHETIC ADD' }], issues: [], sourceValues: ['9001', 'SYNTHETIC ADD'] },
      { rowNumber: 3, action: 'update', locationId: 'loc-synthetic-update', currentVersion: 1, matchedBy: 'StoreNumber', storeNumber: '9002', displayName: 'SYNTHETIC UPDATE', changes: [{ field: 'name', before: 'Before', after: 'SYNTHETIC UPDATE' }], issues: [], sourceValues: ['9002', 'SYNTHETIC UPDATE'] },
      { rowNumber: 4, action: 'update', locationId: 'loc-synthetic-retire', currentVersion: 1, matchedBy: 'StoreNumber', storeNumber: '9003', displayName: 'SYNTHETIC RETIRE', changes: [{ field: 'recordStatus', before: 'Active', after: 'Retired' }], issues: [], sourceValues: ['9003', 'SYNTHETIC RETIRE'] },
    ],
  };
  await page.route('**/api/imports/locations/preview', async route => {
    previewCalls++;
    expect(route.request().headers().authorization).toBe('Bearer synthetic-token');
    return route.fulfill({ json: preview });
  });
  await page.route('**/api/imports/locations/confirm', async route => {
    confirmationCalls++;
    expect(route.request().headers().authorization).toBe('Bearer synthetic-token');
    if (options.holdConfirmation) await confirmationGate;
    if (options.staleConfirmation) return route.fulfill({ status: 409, json: { error: { code: 'confirmation_expired', message: 'The confirmation token has expired. Preview the CSV again.' } } });
    return route.fulfill({ json: {
      operationId: 'synthetic-operation-1', batchId: 'synthetic-batch-1', committedAt: '2026-09-30T12:01:00.000Z',
      additions: 1, updates: 2, unchanged: 0, replayed: false,
      locations: preview.rows.map(row => ({ id: row.locationId, name: row.displayName, storeNumber: row.storeNumber, record: { id: row.locationId, name: row.displayName, storeNumber: row.storeNumber, recordStatus: row.rowNumber === 4 ? 'Retired' : 'Draft' } })),
    } });
  });
  return {
    calls: () => ({ previewCalls, confirmationCalls }),
    releaseConfirmation: () => releaseConfirmation(),
  };
}

async function openLocationImportPreview(page: Page) {
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  await page.getByLabel('Upload Location CSV').setInputFiles({
    name: 'synthetic-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('StoreNumber,StoreName\r\n9001,SYNTHETIC ADD\r\n9002,SYNTHETIC UPDATE\r\n9003,SYNTHETIC RETIRE\r\n'),
  });
  await page.getByLabel('I reviewed every heading, including ignored informational and unsupported columns.').check();
  await page.getByRole('button', { name: 'Validate and Preview' }).click();
  await expect(page.getByText('Preview only. No directory records have been saved yet.')).toBeVisible();
}
async function restore(page: Page, signedIn: boolean) {
  await page.waitForFunction(() => typeof (window as any).__restore === "function" && (window as any).__persistence);
  await page.evaluate(value => (window as any).__restore(value), signedIn);
}

function commitResponseFor(body: { writes: Array<{ collection: string; id: string; operation: string; data?: Record<string, unknown> }> }) {
  const versionedCollections = new Set(['locations', 'people', 'users', 'requests']);
  return {
    records: body.writes.map(write => ({
      collection: write.collection,
      id: write.id,
      operation: write.operation,
      data: write.operation === 'set' ? {
        ...write.data,
        id: write.id,
        ...(versionedCollections.has(write.collection) ? { version: ((write.data?.version as number | undefined) ?? 0) + 1 } : {}),
      } : null,
    })),
  };
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
    const response = commitResponseFor(body);
    for (const [index, write] of body.writes.entries()) {
      const key = write.collection === 'custom_field_definitions' ? 'customFieldDefinitions' : 'locations';
      const committed = response.records[index].data;
      seed[key] = [...seed[key].filter((record: any) => record.id !== write.id), committed];
    }
    await route.fulfill({ json: response });
  });
  return { seed, commits, failWrites: () => { fail = true; } };
}

test('Location edit reconciles committed versions across consecutive saves and reports stale conflicts', async ({ page }) => {
  const fixture = await prepareCustomFields(page);
  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);

  await page.getByLabel('Capacity', { exact: true }).fill('1');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.commits[0].writes[0].expectedVersion).toBe(0);

  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
  await page.getByLabel('Capacity', { exact: true }).fill('2');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.commits[1].writes[0].expectedVersion).toBe(1);

  fixture.failWrites();
  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
  await page.getByLabel('Capacity', { exact: true }).fill('3');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Custom metadata changed. Reload the directory before saving.');
});

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

test("Location CSV template upload shows a no-write field-level preview", async ({ page }) => {
  await prepare(page, 'System Administrator');
  let previewCalls = 0;
  let releasePreview: () => void = () => {};
  const previewGate = new Promise<void>(resolve => { releasePreview = resolve; });
  await page.route('**/api/imports/locations/template', route => route.fulfill({
    status: 200,
    contentType: 'text/csv; charset=utf-8',
    headers: { 'Content-Disposition': 'attachment; filename="shiekh_locations_import_v1.csv"' },
    body: 'SchemaVersion,LocationId,StoreNumber,StoreName\r\n',
  }));
  await page.route('**/api/imports/locations/preview', async route => {
    previewCalls += 1;
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers().authorization).toBe('Bearer synthetic-token');
    expect(route.request().postDataJSON().csv).toContain('locations-v1');
    await previewGate;
    await route.fulfill({ json: {
      schemaVersion: 'locations-v1',
      snapshotReadAt: '2026-09-30T12:00:00.000Z',
      summary: { totalRows: 2, additions: 0, updates: 1, unchanged: 0, blocked: 1, warnings: 0 },
      rows: [
        { rowNumber: 2, action: 'update', locationId: 'loc-1', storeNumber: '001', displayName: 'Renamed Store', issues: [], changes: [{ field: 'name', before: 'Original Store', after: 'Renamed Store' }] },
        { rowNumber: 3, action: 'blocked', locationId: null, storeNumber: '002', displayName: 'Blocked Store', changes: [], issues: [{ severity: 'error', code: 'missing_person_reference', field: 'storeManagerId', suppliedValue: 'missing-person', currentValue: null, proposedValue: 'missing-person', reason: 'storeManagerId references missing Person ID missing-person.', correction: 'Choose an active Person ID.' }] },
      ],
    } });
  });

  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Blank Template' }).click();
  expect((await download).suggestedFilename()).toBe('shiekh_locations_import_v1.csv');
  await page.getByLabel('Upload Location CSV').setInputFiles({ name: 'locations.csv', mimeType: 'text/csv', buffer: Buffer.from('SchemaVersion,LocationId,StoreNumber\r\nlocations-v1,,\r\n') });
  await expect(page.getByText('locations.csv', { exact: true })).toBeVisible();
  expect(previewCalls).toBe(0);
  await page.getByLabel('I reviewed every heading, including ignored informational and unsupported columns.').check();
  await page.getByRole('button', { name: 'Validate and Preview' }).click();
  await expect(page.getByRole('button', { name: 'Validating...' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Controls are disabled until the request finishes.');
  releasePreview();
  await expect(page.getByText('Preview only. No directory records have been saved yet.')).toBeVisible();
  await expect(page.getByText('Original Store')).toBeVisible();
  await expect(page.getByText('Renamed Store', { exact: true })).toHaveCount(2);
  await expect(page.getByText('storeManagerId references missing Person ID missing-person.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm Import/i })).toHaveCount(0);
  expect(previewCalls).toBe(1);
});

test('Location CSV upload identifies directory exports and retries the same file visibly', async ({ page }) => {
  await prepare(page, 'System Administrator');
  let previewCalls = 0;
  await page.route('**/api/imports/locations/preview', async route => {
    previewCalls += 1;
    if (previewCalls === 1) {
      return route.fulfill({ status: 400, json: { error: { code: 'directory_export_not_importable', message: 'This is a directory export. Download the Blank Template to preview Location changes.' } } });
    }
    return route.fulfill({ json: {
      schemaVersion: 'locations-v1', snapshotReadAt: '2026-09-13T12:00:00.000Z',
      summary: { totalRows: 0, additions: 0, updates: 0, unchanged: 0, blocked: 0, warnings: 0 }, rows: [],
    } });
  });

  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  const upload = page.getByLabel('Upload Location CSV');
  const file = { name: 'shiekh_active_store_directory.csv', mimeType: 'text/csv', buffer: Buffer.from('StoreNumber,StoreName\r\n001,Store One\r\n') };
  await upload.setInputFiles(file);
  await expect(page.getByText(file.name, { exact: true })).toBeVisible();
  await page.getByLabel('I reviewed every heading, including ignored informational and unsupported columns.').check();
  await page.getByRole('button', { name: 'Validate and Preview' }).click();
  await expect(page.getByRole('alert')).toContainText('This is a directory export. Download the Blank Template to preview Location changes.');
  await expect(page.getByRole('button', { name: 'Download Blank Template' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose File Again' })).toBeEnabled();

  await upload.setInputFiles(file);
  await page.getByLabel('I reviewed every heading, including ignored informational and unsupported columns.').check();
  await page.getByRole('button', { name: 'Validate and Preview' }).click();
  await expect(page.getByText('Preview only. No directory records have been saved yet.')).toBeVisible();
  await expect(page.getByText('The CSV contains no data rows.')).toBeVisible();
  expect(previewCalls).toBe(2);
});

test('Location CSV write requires final confirmation and Cancel or Enter on the safe default performs no write', async ({ page }) => {
  const fixture = await prepareLocationImportConfirmationBrowser(page);
  await openLocationImportPreview(page);
  expect(fixture.calls()).toEqual({ previewCalls: 1, confirmationCalls: 0 });

  const importButton = page.getByRole('button', { name: 'Import 3 ready rows' });
  await importButton.click();
  let dialog = page.getByRole('alertdialog', { name: 'Confirm production import' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Additions: 1\. Updates: 1\. Retirements: 1\. Total selected ready rows: 3\./)).toBeVisible();
  await expect(dialog.getByRole('list', { name: 'Selected locations to be written' })).toContainText('Store 9001 · SYNTHETIC ADD · loc-synthetic-new');
  await expect(dialog.getByRole('list', { name: 'Selected locations to be written' })).toContainText('Retirement · Store 9003 · SYNTHETIC RETIRE · loc-synthetic-retire');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  expect(fixture.calls().confirmationCalls).toBe(0);

  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(fixture.calls().confirmationCalls).toBe(0);

  await importButton.click();
  dialog = page.getByRole('alertdialog', { name: 'Confirm production import' });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.calls().confirmationCalls).toBe(0);

  await importButton.click();
  dialog = page.getByRole('alertdialog', { name: 'Confirm production import' });
  await dialog.getByRole('button', { name: 'Confirm and write 3 rows' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Completed import · synthetic-import.csv')).toBeVisible();
  expect(fixture.calls().confirmationCalls).toBe(1);
});

test('Location CSV confirmation locks dismissal while busy and suppresses double submission', async ({ page }) => {
  const fixture = await prepareLocationImportConfirmationBrowser(page, { holdConfirmation: true });
  await openLocationImportPreview(page);
  await page.getByRole('button', { name: 'Import 3 ready rows' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Confirm production import' });
  const confirm = dialog.getByRole('button', { name: 'Confirm and write 3 rows' });
  await confirm.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect(dialog.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(fixture.calls().confirmationCalls).toBe(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  fixture.releaseConfirmation();
  await expect(dialog).toHaveCount(0);
  expect(fixture.calls().confirmationCalls).toBe(1);
});

test('Location CSV stale confirmation closes the dialog and requires a fresh preview without retrying writes', async ({ page }) => {
  const fixture = await prepareLocationImportConfirmationBrowser(page, { staleConfirmation: true });
  await openLocationImportPreview(page);
  await page.getByRole('button', { name: 'Import 3 ready rows' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Confirm production import' });
  await dialog.getByRole('button', { name: 'Confirm and write 3 rows' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('confirmation token has expired');
  await expect(page.getByRole('button', { name: 'Import 3 ready rows' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Choose File Again' })).toBeEnabled();
  expect(fixture.calls().confirmationCalls).toBe(1);
});

test('Location Edit and Fleet Quick Add enforce canonical retail hierarchy transitions without writing', async ({ page }) => {
  const fixture = await prepareHierarchyBrowser(page);
  await page.goto(`${origin}/locations/loc-retail/edit`); await restore(page, true);
  const editRegion = page.getByText('Region Name', { exact: true }).locator('..').locator('select');
  const editDistrict = page.getByText('District Name', { exact: true }).locator('..').locator('select');
  await expect(editRegion).toHaveValue('reg-west');
  await expect(editDistrict).toHaveValue('01');
  await page.getByText('Retail hierarchy', { exact: true }).locator('..').locator('select').selectOption('Unknown');
  await editRegion.selectOption('reg-east');
  await expect(editDistrict).toHaveValue('');
  await expect(editDistrict.locator('option[value="01"]')).toHaveCount(0);
  await expect(editDistrict.locator('option[value="02"]')).toHaveCount(1);
  await editDistrict.selectOption('02');
  await expect(editDistrict).toHaveValue('02');
  await expect(page.getByText('Retail hierarchy', { exact: true }).locator('..').locator('select').locator('option[value="Not Applicable"]')).toHaveCount(0);

  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Fleet CSV' }).click();
  await page.getByRole('button', { name: 'Add Store' }).click();
  const quickAdd = page.getByRole('dialog', { name: 'Add new store location' });
  const quickType = quickAdd.getByText('Location Type', { exact: true }).locator('..').locator('select');
  const quickRegion = quickAdd.getByText('Region', { exact: true }).locator('..').locator('select');
  const quickDistrict = quickAdd.getByText('District', { exact: true }).locator('..').locator('select');
  await expect(quickType.locator('option[value="Enclosed Regional Mall"]')).toHaveCount(0);
  await expect(quickType.locator('option[value="Urban Streetfront"]')).toHaveCount(0);
  await expect(quickType.locator('option[value="Outlet Center"]')).toHaveCount(0);
  await quickType.selectOption('Enclosed Mall');
  await quickRegion.selectOption('reg-west');
  await quickDistrict.selectOption('01');
  await quickRegion.selectOption('reg-east');
  await expect(quickDistrict).toHaveValue('');
  await expect(quickDistrict.locator('option[value="01"]')).toHaveCount(0);
  await expect(quickDistrict.locator('option[value="02"]')).toHaveCount(1);
  await expect(quickAdd.getByText('Retail hierarchy', { exact: true }).locator('..').locator('select').locator('option[value="Not Applicable"]')).toHaveCount(0);
  await quickAdd.getByRole('button', { name: 'Cancel' }).click();
  expect(fixture.commits).toHaveLength(0);
});

test('PrintSheetView groups canonical and exceptional hierarchies by stable IDs with correct type counts and warnings', async ({ page }) => {
  await prepareHierarchyBrowser(page);
  await page.goto(`${origin}/print`); await restore(page, true);
  await expect(page.getByText(/4 of 4 Locations displayed: 2 retail, 1 non-retail, 1 unclassified/)).toBeVisible();
  const sheet = page.locator('#print-directory-sheet');
  await expect(sheet.getByText(/Renamed North \(01\) \(1 Stores\)/)).toBeVisible();
  await expect(sheet.getByText(/Operational Centers \/ Non-retail Locations \(1 Locations\)/)).toBeVisible();
  await expect(sheet.getByText(/Unassigned Retail Locations \(1 Locations\)/)).toBeVisible();
  await expect(sheet.getByText(/Needs Review \(1 Locations\)/)).toBeVisible();
  await expect(sheet.getByText("Location type is 'Unsupported Type', not a recognized business type.")).toBeVisible();
  const groupFilter = page.getByRole('combobox');
  await expect(groupFilter.locator('option[value="district:01"]')).toContainText('Renamed North (01)');
  await groupFilter.selectOption('district:01');
  await expect(sheet.getByText('Total Locations: 1 (1 retail, 0 non-retail, 0 unclassified)')).toBeVisible();
  await expect(sheet.getByText('Retail Store', { exact: true })).toBeVisible();
  await expect(sheet.getByText('Operations Center', { exact: true })).toHaveCount(0);
  await expect(sheet.getByText('Unclassified Store', { exact: true })).toHaveCount(0);

  await page.goto(`${origin}/`); await restore(page, true);
  await expect(page.getByRole('heading', { name: 'Quick Reference Store List / District Roster' })).toBeVisible();
  const dashboardFilter = page.getByLabel('Filter Quick Reference stores by District');
  await expect(dashboardFilter.locator('option[value="district:01"]')).toContainText('Renamed North (01)');
  await dashboardFilter.selectOption('district:01');
  await expect(page.getByText('Retail Store', { exact: true })).toBeVisible();
  await expect(page.getByText('Unclassified Store', { exact: true })).toHaveCount(0);
  await dashboardFilter.selectOption('needs-review');
  await expect(page.getByText('Unclassified Store', { exact: true })).toBeVisible();
  await expect(page.getByText(/Location type is 'Unsupported Type', not a recognized business type/)).toBeVisible();
});

test('Person territory edit does not rewrite the linked Location legacy District', async ({ page }) => {
  const fixture = await prepareHierarchyBrowser(page);
  await page.goto(`${origin}/people`); await restore(page, true);
  await page.getByRole('button', { name: /District Manager/ }).click();
  await page.getByRole('button', { name: 'Edit Person' }).click();
  const territory = page.getByRole('dialog').getByRole('textbox').nth(6);
  await territory.fill('Updated Manager Territory');
  await expect(territory).toHaveValue('Updated Manager Territory');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect(page.getByText('Updated Manager Territory', { exact: true })).toHaveCount(2);
  expect(fixture.commits).toHaveLength(1);
  expect(fixture.commits[0].writes.map((write: { collection: string }) => write.collection)).toEqual(['people', 'locations']);
  const linkedLocationWrite = fixture.commits[0].writes[1];
  expect(linkedLocationWrite.data.district).toBe('Legacy Location District');
  expect(linkedLocationWrite.data.regionId).toBe('reg-west');
  expect(linkedLocationWrite.data.districtId).toBe('01');
  expect(fixture.seed.locations[0].district).toBe('Legacy Location District');
});

test('Location Edit hierarchy draft remains visible after a stale-version conflict', async ({ page }) => {
  await prepareHierarchyBrowser(page);
  let submitted: any;
  await page.route('**/api/directory/commit', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 409, json: { error: { code: 'directory_conflict', message: 'Record changed concurrently. Reload the directory before saving.' } } });
  });
  await page.goto(`${origin}/locations/loc-retail/edit`); await restore(page, true);
  await page.getByText('Retail hierarchy', { exact: true }).locator('..').locator('select').selectOption('Unknown');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('alert')).toContainText('Record changed concurrently');
  await expect(dialog.getByText('Retail hierarchy', { exact: true }).locator('..').locator('select')).toHaveValue('Unknown');
  expect(submitted.writes[0].expectedVersion).toBe(0);
  expect(submitted.writes[0].data.hierarchyApplicability).toBe('Unknown');
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
  await page.route("**/api/directory/commit", async route => { commit = route.request().postDataJSON(); await route.fulfill({ json: commitResponseFor(commit) }); });
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
  await page.route("**/api/directory/commit", async route => { const body = route.request().postDataJSON(); commits.push(body); await route.fulfill({ json: commitResponseFor(body) }); });
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