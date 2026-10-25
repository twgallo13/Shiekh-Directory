import { test, expect, type Page } from "@playwright/test";
import { buildLocationImportPlan } from '../src/lib/locationImportPreview';
import type { LocationRecord, UpdateRequest } from '../src/types';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';

const origin = process.env.AUTH_BROWSER_TEST_ORIGIN || "http://127.0.0.1:3001";

for (const width of [390, 1280]) test(`Person editor layout keeps optional detail collapsed at ${width}px`, async ({ page }, testInfo) => {
  const f = await preparePersonCard(page);
  Object.assign(f.seed.people[0], { positionIds: ['store-manager', 'district-manager'], workPhone: '+12135550101', phonePrivacy: 'Internal', supportedLocationIds: ['loc-2'] });
  f.seed.locations[0].locationInboxEmail = 'store001@example.test';
  await page.setViewportSize({ width, height: 900 });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Find support locations', { exact: true })).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: /Remove support Bootstrap Store 2/ })).toBeVisible();
  await expect(dialog.getByText('Legacy territory/district text (reference only): Legacy territory note. Not an assignment; preserved.', { exact: true })).not.toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Shared store inbox responsibilities', exact: true }).getByRole('heading', { name: 'Assigned store contacts', exact: true })).toBeVisible();
  const footer = await dialog.getByRole('button', { name: 'Save Person', exact: true }).boundingBox();
  expect(footer!.y + footer!.height).toBeLessThanOrEqual(900);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('heading', { name: 'Profile & positions', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('person-editor-profile.png'), fullPage: true });
  await dialog.getByRole('heading', { name: 'Contact details', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('person-editor-contact.png'), fullPage: true });
  await dialog.getByRole('checkbox', { name: 'Regional Manager', exact: true }).check();
  await expect(dialog.getByRole('region', { name: 'Profile and positions', exact: true }).getByRole('heading', { name: 'Review position change', exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Management responsibilities', exact: true }).locator('details[open]')).toHaveCount(1);
  expect(f.commits).toHaveLength(0);
});

test('Person editor keeps unavailable workplace/support links during an unrelated save', async ({ page }) => {
  const f = await preparePersonCard(page);
  Object.assign(f.seed.people[0], { primaryLocationId: 'missing-primary', supportedLocationIds: ['missing-support', 'loc-2'] });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await expect(page.getByText('1 saved support location is unavailable. Review these links before changing them.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove support missing-support', exact: true })).toBeVisible();
  await expect(page.getByLabel('Works at', { exact: true })).toHaveValue('missing-primary');
  await page.getByLabel('Department', { exact: true }).fill('Updated department');
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  expect(f.commits).toHaveLength(1);
  expect(f.commits[0].writes[0].data.primaryLocationId).toBe('missing-primary');
  expect(f.commits[0].writes[0].data.supportedLocationIds).toEqual(['missing-support', 'loc-2']);
});


for (const width of [360, 1280]) test(`Quick contact cards prioritize business information at ${width}px without writes`, async ({ page }, testInfo) => {
  const f = await preparePersonCard(page);
  const location = f.seed.locations[0];
  Object.assign(f.seed.people[0], { positionIds: ['store-manager', 'district-manager'], phone: '(213) 555-0101', workEmail: 'manager@example.test' });
  Object.assign(location, { name: 'Sample Downtown', address: '745 Sample Broadway', suite: 'Suite 200', phone: '(213) 555-0100', locationInboxEmail: 'store001@example.test', mallOrCenterName: 'Sample Center', wayfindingDirections: 'Second floor, beside the north entrance.', phonePrivacy: 'Public' });
  await page.setViewportSize({ width, height: 900 });
  await page.goto(origin + '/locations/loc-1'); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Sample Downtown', exact: true })).toBeVisible();
  const address = dialog.locator('address');
  await expect(address).toContainText('745 Sample Broadway');
  expect((await address.boundingBox())!.y).toBeLessThan(350);
  await expect(dialog.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', /Suite%20200/);
  await expect(dialog.getByRole('link', { name: 'store001@example.test', exact: true })).toHaveAttribute('href', 'mailto:store001%40example.test');
  await expect(dialog).not.toContainText('Synced & Live');
  await expect(dialog).not.toContainText('not automatically verified');
  await expect(dialog.getByText('Record ID', { exact: true })).toHaveCount(0);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('store-quick-card.png'), fullPage: true });
  await dialog.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(dialog.getByText('Record ID', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Hours', exact: true }).or(dialog.getByRole('button', { name: 'Hours & status', exact: true })).click();
  await expect(dialog.getByRole('region', { name: 'Current operating state', exact: true })).toBeVisible();
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await expect(page.getByRole('dialog').getByRole('link', { name: 'manager@example.test', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).not.toContainText('Optional contact only');
  await expect(page.getByRole('dialog')).not.toContainText('Leadership association only');
  await page.screenshot({ path: testInfo.outputPath('person-quick-card.png'), fullPage: true });
  expect(f.commits).toHaveLength(0);
});

for (const state of ['closed', 'unknown'] as const) test(`Quick store card keeps ${state} status truthful and reports clipboard failure`, async ({ page }) => {
  const f = await preparePersonCard(page);
  if (state === 'closed') f.seed.locations[0].operationalStatus = 'Permanently Closed';
  else f.seed.locations[0].timeZone = 'Invalid/Zone';
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Synthetic clipboard denial'); } } }));
  await page.goto(origin + '/locations/loc-1'); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(state === 'closed' ? 'Closed' : 'Needs verification', { exact: true }).first()).toBeVisible();
  await expect(dialog.getByText('Open', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Copy store information', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Clipboard access is unavailable');
  expect(f.commits).toHaveLength(0);
});

test('Quick person card omits empty shared inbox panels but retains legacy-contact warnings', async ({ page }) => {
  const f = await preparePersonCard(page);
  f.seed.locations = [];
  Object.assign(f.seed.people[0], { email: 'shared@example.test', workEmail: '', district: 'Old territory' });
  delete f.seed.people[0].workEmail;
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('region', { name: 'Shared store inbox responsibilities', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Historical contact — needs review before use.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Old territory', { exact: true })).not.toBeVisible();
  await dialog.getByText('Historical territory note', { exact: true }).click();
  await expect(dialog.getByText('Old territory', { exact: true })).toBeVisible();
  expect(f.commits).toHaveLength(0);
});

test('Reviewed contact links use canonical work phone privacy and trimmed mail recipients', async ({ page }) => {
  const f = await preparePersonCard(page);
  Object.assign(f.seed.people[0], { workPhone: '+12135550101', phone: '+12135550199', phonePrivacy: 'Restricted', workEmail: '  manager@example.test  ' });
  f.seed.locations[0].storeManagerPhonePrivacy = 'Internal';
  await page.goto(origin + '/locations/loc-1'); await restore(page, true);
  const roster = page.getByRole('region', { name: 'Store leadership', exact: true });
  await expect(roster.getByRole('link', { name: '(213) 555-0101', exact: true })).toHaveAttribute('href', 'tel:+12135550101');
  await expect(roster.getByText('Internal', { exact: true })).toBeVisible();
  delete f.seed.people[0].workPhone;
  await page.reload(); await restore(page, true);
  await expect(roster.getByRole('link', { name: '(213) 555-0199', exact: true })).toHaveCount(0);
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await expect(page.getByRole('dialog').getByRole('link', { name: 'manager@example.test', exact: true })).toHaveAttribute('href', 'mailto:manager%40example.test');
  expect(f.commits).toHaveLength(0);
});

for (const mode of ['closure', 'malformed-hours'] as const) test(`Overview preserves resolved operating diagnostics: ${mode}`, async ({ page }) => {
  const f = await preparePersonCard(page);
  f.seed.serverNow = '2026-10-22T18:00:00Z';
  if (mode === 'closure') f.seed.locations[0].temporaryClosure = { id: 'synthetic-closure', reason: 'Power outage', startsAt: '2026-10-22T17:00:00Z', expiresAt: '2026-10-23T00:00:00Z', timeZone: 'UTC' };
  else f.seed.locations[0].holidayHours = [{ id: 'malformed', date: 'not-a-date' }];
  await page.goto(origin + '/locations/loc-1'); await restore(page, true);
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const status = page.getByRole('region', { name: 'Current operating state', exact: true });
  await expect(status).toBeVisible();
  await expect(status).toContainText(mode === 'closure' ? 'Temporary closure automatically ends' : 'Dated schedules have invalid or reversed dates.');
  if (mode === 'closure') await expect(status).toContainText('confirmed closure deadline is retained');
  expect(f.commits).toHaveLength(0);
});

test('Operating recovery stays synchronized when switching Overview to Hours during the save', async ({ page }) => {
  const f = await prepareOperating(page, true);
  await page.getByRole('button', { name: 'Report temporary closure' }).click();
  await page.getByLabel('Reason for operating update').fill('Synthetic outage');
  await page.getByRole('button', { name: 'Confirm closure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recover operating update' })).toBeVisible();
  await page.reload(); await restore(page, true);
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/directory/operating/commit', async route => { await held; await route.fallback(); });
  await page.getByRole('button', { name: 'Recover operating update' }).click();
  await page.getByRole('button', { name: 'Hours & status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recover operating update' })).toBeDisabled();
  release();
  await expect(page.getByRole('button', { name: 'End temporary closure' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recover operating update' })).toHaveCount(0);
  expect(f.calls).toHaveLength(2);
  expect(f.calls[1]).toEqual(f.calls[0]);
});

async function preparePersonCard(page: Page, mode: 'normal' | 'unknown' | 'empty' | 'hold' | 'reject' | 'denied' = 'normal', role = 'System Administrator') {
  await prepare(page, role);
  const seed: any = seedDirectory(2);
  const person = { id: 'person-profile', version: 2, fullName: 'Synthetic Profile Manager', jobTitle: ' SM ', role: 'Historical separate alias', department: '  Historic department  ', district: 'Legacy territory note', status: 'Active', activeStatus: true, workEmail: 'profile@example.test' };
  seed.people = [person];
  seed.locations[0] = { ...seed.locations[0], storeManagerId: person.id, storeManagerName: person.fullName, regionId: 'west', districtId: 'north' };
  seed.regions = [{ id: 'west', name: 'West', status: 'Active' }];
  seed.districts = [{ id: 'north', name: 'North District', regionId: 'west', status: 'Active', districtManagerId: person.id }];
  seed.users = [{ id: 'linked-account', name: 'Synthetic linked account', personId: person.id, role: 'Viewer', status: 'Active' }];
  const commits: any[] = [];
  let release: () => void = () => {};
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); commits.push(body);
    if (mode === 'hold') await new Promise<void>(resolve => { release = resolve; });
    if (mode === 'unknown') return route.fulfill({ status: 502, contentType: 'text/html', body: 'Unknown save result' });
    if (mode === 'empty') return route.fulfill({ json: { records: [] } });
    if (mode === 'reject') return route.fulfill({ status: 409, json: { error: { code: 'directory_conflict', message: 'Synthetic saved version changed.' } } });
    if (mode === 'denied') return route.fulfill({ status: 403, json: { error: { code: 'write_not_allowed', message: 'Synthetic permission denied.' } } });
    return route.fulfill({ json: commitResponseFor(body) });
  });
  return { seed, commits, release: () => release() };
}

test('Transition preflight groups canonical leadership stale copies accounts and pending references without writes on mobile', async ({ page }, testInfo) => {
  const f = await preparePersonCard(page);
  f.seed.people[0].primaryLocationId = 'missing-location'; f.seed.people[0].supportedLocationIds = ['loc-2'];
  f.seed.locations[0].districtManagerId = 'other';
  f.seed.locations[1] = { ...f.seed.locations[1], recordStatus: 'Retired', districtId: 'vacant', districtManagerId: 'person-profile' };
  f.seed.districts.push({ id: 'vacant', name: 'Vacant District', regionId: 'west', status: 'Active', districtManagerId: null });
  f.seed.districts.push({ id: 'zero', name: 'Zero Store District', regionId: 'west', status: 'Active', districtManagerId: 'person-profile' });
  f.seed.users[0].status = 'Revoked';
  f.seed.requests = [{ id: 'pending-person-review', status: 'Pending', targetType: 'Person', targetId: 'person-profile', targetName: 'Synthetic Profile Manager', changeType: 'Phone Number Correction', requestedChanges: {}, currentSnapshot: {}, reason: 'Private request note not copied' }, { id: 'pending-proposal', status: 'Pending', targetType: 'Location', targetId: 'loc-2', changeType: 'Store Manager Change', requestedChanges: { storeManagerId: 'person-profile' }, currentSnapshot: { districtManagerId: 'person-profile' } }];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByText('Review promotion / offboarding', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Promotion and offboarding dependency review', exact: true });
  await expect(panel).toContainText('not a complete inventory');
  await expect(panel).toContainText('Zero Store District');
  await expect(panel).toContainText('Inherited District stores: 1');
  await expect(panel).toContainText('Historical DM copy differs');
  await expect(panel).toContainText('Unavailable Location missing-location');
  await expect(panel).toContainText('Revoked');
  await expect(panel).toContainText('pending-person-review');
  await expect(panel).toContainText('Proposed leadership references this Person ID');
  await expect(panel).not.toContainText('Private request note');
  await expect(panel.getByRole('link', { name: 'Review Directory accounts separately', exact: true })).toHaveAttribute('href', '/admin?tab=rbac');
  await expect(panel.getByRole('link', { name: 'Review change requests separately', exact: true })).toHaveAttribute('target', '_blank');
  await expect(panel.getByRole('button', { name: 'Refresh from server', exact: true })).toBeVisible();
  expect(await panel.getByRole('button').count()).toBe(1);
  await panel.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('transition-preflight-mobile.png'), fullPage: true });
  expect(f.commits).toHaveLength(0);
});

test('Transition preflight empty loaded data never claims offboarding clearance and does not enter an editor', async ({ page }) => {
  const f = await preparePersonCard(page);
  f.seed.locations = []; f.seed.districts = []; f.seed.users = []; f.seed.requests = [];
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByText('Review promotion / offboarding', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Promotion and offboarding dependency review', exact: true });
  await expect(panel).toContainText('No current management references found in loaded records');
  await expect(panel).toContainText('external access remains unverified');
  await expect(panel).toContainText('server permissions, versions and lifecycle guards still decide');
  await expect(page.getByRole('button', { name: 'Save Person', exact: true })).not.toBeVisible();
  await page.getByText('Review promotion / offboarding', { exact: true }).click();
  await expect(panel).not.toBeVisible(); expect(f.commits).toHaveLength(0);
});

for (const role of ['Viewer', 'Editor']) test('Transition preflight is not exposed to ' + role, async ({ page }) => {
  const f = await preparePersonCard(page, 'normal', role);
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await expect(page.getByRole('button', { name: 'Close Synthetic Profile Manager', exact: true })).toBeVisible();
  await expect(page.getByText('Review promotion / offboarding', { exact: true })).not.toBeVisible();
  expect(f.commits).toHaveLength(0);
});

const serverTransitionFixture = () => ({ schemaVersion: 1, personId: 'person-profile', personVersion: 3, evaluatedAt: '2026-10-22T18:00:00.000Z', expiresAt: '2026-10-22T18:05:00.000Z', digest: 'a'.repeat(64), completeWithinScope: true, scanned: { locations: 2, people: 1, users: 1, districts: 1, regions: 1, requests: 1 }, review: { responsibilities: [{ key: 'district:fresh', label: 'Server-only District', source: 'District-owned DM' }], issues: [], workplaces: [{ locationId: 'missing', labels: ['Supports'], unavailable: true }], inheritedStores: [], historicalCopies: [], accounts: [{ id: 'server-linked', role: 'Viewer', status: 'Suspended' }], pendingRequests: [{ id: 'server-pending', changeType: 'Leadership', reasons: ['Targets this Person'] }] } });

test('Server transition snapshot is explicit, separate, read-only and expires without claiming clearance', async ({ page }, testInfo) => {
  const f = await preparePersonCard(page); let reads = 0;
  await page.route('**/api/directory/people/person-profile/transition-preview', route => { reads++; expect(route.request().method()).toBe('GET'); expect(route.request().headers().authorization).toMatch(/^Bearer /); return route.fulfill({ json: serverTransitionFixture() }); });
  await page.clock.install(); await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByText('Review promotion / offboarding', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Server dependency snapshot', exact: true });
  expect(reads).toBe(0); await panel.getByRole('button', { name: 'Refresh from server', exact: true }).click();
  await expect(panel).toContainText('Snapshot read completed'); await expect(panel).toContainText('loaded Person card differs');
  await panel.getByText('View snapshot dependencies', { exact: true }).click();
  await expect(panel).toContainText('Server-only District'); await expect(panel).toContainText('server-linked'); await expect(panel).toContainText('server-pending');
  await expect(panel).toContainText('Unavailable / retired'); await expect(panel).toContainText('not a lock');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('server-transition-mobile.png'), fullPage: true });
  await page.clock.fastForward(301_000); await expect(panel).toContainText('Snapshot expired');
  expect(reads).toBe(1); expect(f.commits).toHaveLength(0);
});

for (const failure of ['denied', 'unavailable', 'malformed']) test('Server transition ' + failure + ' clears previous snapshot and permits read retry', async ({ page }) => {
  const f = await preparePersonCard(page); let reads = 0;
  await page.route('**/api/directory/people/person-profile/transition-preview', route => {
    reads++; if (reads === 2) return route.fulfill(failure === 'malformed' ? { json: { ...serverTransitionFixture(), personId: 'wrong-person' } } : { status: failure === 'denied' ? 403 : 503, json: { error: { code: 'unavailable' } } });
    return route.fulfill({ json: serverTransitionFixture() });
  });
  await page.goto(origin + '/people/person-profile'); await restore(page, true); await page.getByText('Review promotion / offboarding', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Server dependency snapshot', exact: true });
  const refresh = panel.getByRole('button', { name: 'Refresh from server', exact: true });
  await refresh.click(); await expect(panel).toContainText('Snapshot read completed');
  await refresh.click(); await expect(panel).toContainText('no changes were made');
  await expect(panel).not.toContainText('Snapshot read completed'); await expect(panel).not.toContainText('Review digest:');
  await refresh.click(); await expect(panel).toContainText('Snapshot read completed'); expect(f.commits).toHaveLength(0);
});

test('Server transition timeout offers read retry and cannot replace loaded data with a late response', async ({ page }) => {
  const f = await preparePersonCard(page); let release: () => void = () => {};
  let reached!: () => void; const routed = new Promise<void>(resolve => { reached = resolve; });
  await page.route('**/api/directory/people/person-profile/transition-preview', async route => { await new Promise<void>(resolve => { release = resolve; reached(); }); await route.fulfill({ json: serverTransitionFixture() }).catch(() => {}); });
  await page.clock.install(); await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByText('Review promotion / offboarding', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Server dependency snapshot', exact: true });
  await panel.getByRole('button', { name: 'Refresh from server', exact: true }).click();
  await expect(panel).toContainText('Reading current Directory'); await routed; await page.clock.fastForward(21_000);
  await expect(panel).toContainText('no changes were made'); release();
  await expect(panel).not.toContainText('Snapshot read completed'); await expect(panel.getByRole('button', { name: 'Refresh from server', exact: true })).toBeEnabled();
  expect(f.commits).toHaveLength(0);
});

test('Legacy email mapping requires preview opt-in and Save, preserving the alias and all unrelated fields', async ({ page }, testInfo) => {
  const f = await preparePersonCard(page);
  delete f.seed.people[0].workEmail;
  f.seed.people[0].email = ' Individual@SHIEKHSHOES.COM ';
  const before = structuredClone(f.seed.people[0]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await page.getByRole('button', { name: 'Use as individual work email', exact: true }).click();
  const preview = page.getByRole('alertdialog', { name: 'Review individual email mapping', exact: true });
  await expect(preview).toContainText('Individual@shiekhshoes.com');
  await expect(preview).toContainText('Source: historical email (retained)');
  await preview.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(preview).not.toBeVisible();
  expect(f.commits).toHaveLength(0);
  await page.getByRole('button', { name: 'Use as individual work email', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(preview).not.toBeVisible();
  await expect(page.getByLabel('Individual work email (optional)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use as individual work email', exact: true }).click();
  await expect(preview.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('legacy-email-mapping-mobile.png'), fullPage: true });
  await preview.getByRole('button', { name: 'Stage email mapping', exact: true }).click();
  await expect(page.getByText(/Email mapping staged, not saved/)).toBeVisible();
  expect(f.commits).toHaveLength(0);
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes).toHaveLength(1);
  const write = f.commits[0].writes[0];
  expect(write.collection).toBe('people'); expect(write.id).toBe(before.id); expect(write.expectedVersion).toBe(2);
  const { workEmail, ...saved } = write.data;
  expect(workEmail).toBe('Individual@shiekhshoes.com');
  // Context saves the full previous record; no alias/assignment/account rewriting is allowed.
  expect(saved).toEqual(before);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use as individual work email', exact: true })).not.toBeVisible();
});

test('Legacy email mapping undo and later email edits cancel the opt-in without automatic promotion', async ({ page }) => {
  const f = await preparePersonCard(page);
  delete f.seed.people[0].workEmail; f.seed.people[0].email = 'individual@shiekhshoes.com';
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  const stage = async () => {
    await page.getByRole('button', { name: 'Use as individual work email', exact: true }).click();
    await page.getByRole('button', { name: 'Stage email mapping', exact: true }).click();
  };
  await stage(); await page.getByRole('button', { name: 'Undo email mapping', exact: true }).click();
  await stage();
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('temporary@shiekhshoes.com');
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('individual@shiekhshoes.com');
  await expect(page.getByText(/Email mapping staged, not saved/)).not.toBeVisible();
  await page.getByLabel('Department', { exact: true }).fill('Unrelated change');
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes[0].data).not.toHaveProperty('workEmail');
  expect(f.commits[0].writes[0].data.email).toBe('individual@shiekhshoes.com');
});

test('Legacy email mapping is absent for shared invalid or already canonical contacts including intentional clears', async ({ page }) => {
  const f = await preparePersonCard(page);
  const person = f.seed.people[0]; f.seed.locations[0].locationInboxEmail = 'team@example.test';
  for (const fields of [{ email: 'store007@shiekhshoes.com' }, { email: 'TEAM@EXAMPLE.test' }, { email: 'invalid' }, { email: 'individual@shiekhshoes.com', workEmail: '' }, { email: 'individual@shiekhshoes.com', workEmail: null }, { email: 'individual@shiekhshoes.com', workEmail: 'existing@shiekhshoes.com' }]) {
    delete person.workEmail; Object.assign(person, fields);
    await page.goto(origin + '/people/person-profile'); await restore(page, true);
    await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Use as individual work email', exact: true })).not.toBeVisible();
  }
  expect(f.commits).toHaveLength(0);
});

for (const mode of ['unknown', 'empty', 'reject', 'denied'] as const) test('Legacy email mapping preserves draft and existing recovery contract on ' + mode, async ({ page }) => {
  const f = await preparePersonCard(page, mode);
  delete f.seed.people[0].workEmail; f.seed.people[0].email = 'individual@shiekhshoes.com';
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await page.getByRole('button', { name: 'Use as individual work email', exact: true }).click();
  await page.getByRole('button', { name: 'Stage email mapping', exact: true }).click();
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(mode === 'unknown' || mode === 'empty' ? 'Outcome unknown' : 'draft is retained');
  await expect(page.getByText(/Email mapping staged, not saved/)).toBeVisible();
  expect(f.commits).toHaveLength(1);
  if (mode === 'unknown' || mode === 'empty') await expect(page.getByRole('button', { name: 'Save Person', exact: true })).toBeDisabled();
  else await expect(page.getByRole('button', { name: 'Save Person', exact: true })).toBeEnabled();
});

test('Legacy email mapping keeps close and duplicate-save locks while confirmation is in flight', async ({ page }) => {
  const f = await preparePersonCard(page, 'hold');
  delete f.seed.people[0].workEmail; f.seed.people[0].email = 'individual@shiekhshoes.com';
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await page.getByRole('button', { name: 'Use as individual work email', exact: true }).click();
  await page.getByRole('button', { name: 'Stage email mapping', exact: true }).click();
  await page.getByRole('button', { name: 'Save Person', exact: true }).dblclick();
  await expect.poll(() => f.commits.length).toBe(1);
  await expect(page.getByLabel('Individual work email (optional)', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Person', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close Synthetic Profile Manager', exact: true }).click();
  await expect(page.getByLabel('Individual work email (optional)', { exact: true })).toBeVisible();
  f.release(); await expect(page.getByRole('button', { name: 'Edit Person', exact: true })).toBeVisible();
  expect(f.commits).toHaveLength(1);
});

test('Person inbox responsibilities show canonical SM and AM roles with optional individual contact on mobile', async ({ page }, testInfo) => {
  const f = await preparePersonCard(page);
  f.seed.people[0].workEmail = 'individual@shiekhshoes.com';
  f.seed.locations[0].locationInboxEmail = 'store1@shiekhshoes.com';
  f.seed.locations[1].assistantStoreManagerIds = ['person-profile'];
  f.seed.locations[1].locationInboxEmail = 'store2@shiekhshoes.com';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  const responsibilities = page.getByRole('region', { name: 'Shared store inbox responsibilities', exact: true });
  await expect(responsibilities).toContainText('Store Manager');
  await expect(responsibilities).toContainText('Assistant Manager');
  await expect(responsibilities).toContainText('store1@shiekhshoes.com');
  await expect(responsibilities).toContainText('store2@shiekhshoes.com');
  await expect(responsibilities.getByRole('link', { name: '#001 · Bootstrap Store 1', exact: true })).toHaveAttribute('href', '/locations/loc-1');
  await expect(page.getByRole('dialog').getByText('individual@shiekhshoes.com', { exact: true })).toBeVisible();
  await responsibilities.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('person-inbox-responsibilities-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await expect(page.getByLabel('Individual work email (optional)', { exact: true })).toHaveValue('individual@shiekhshoes.com');
  const editorInboxes = page.getByRole('region', { name: 'Shared store inbox responsibilities', exact: true });
  await editorInboxes.getByText('About these contacts', { exact: true }).click();
  await expect(editorInboxes.getByText('From SM/AM assignments. Mailbox access is not verified.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(f.commits).toHaveLength(0);
});

test('Person editor preserves legacy shared contact on unrelated save and blocks new shared contact then permits individual or blank', async ({ page }) => {
  const f = await preparePersonCard(page);
  f.seed.people[0].workEmail = 'store1@shiekhshoes.com';
  f.seed.people[0].email = 'store1@shiekhshoes.com';
  f.seed.locations[1].locationInboxEmail = 'team@example.test';
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await expect(page.getByText('Saved shared contact', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('temporary@shiekhshoes.com');
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('store1@shiekhshoes.com');
  await page.getByLabel('Department', { exact: true }).fill('Synthetic changed department');
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes).toHaveLength(1);
  expect(f.commits[0].writes[0].collection).toBe('people');
  expect(f.commits[0].writes[0].data.workEmail).toBe('store1@shiekhshoes.com');
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  for (const email of ['STORE007@SHIEKHSHOES.COM', 'Team@EXAMPLE.test']) {
    await page.getByLabel('Individual work email (optional)', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Save Person', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('shared store inbox');
    expect(f.commits).toHaveLength(1);
  }
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('individual@shiekhshoes.com');
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(2);
  expect(f.commits[1].writes[0].data.workEmail).toBe('individual@shiekhshoes.com');
  expect(f.commits[1].writes[0].data.email).toBe('store1@shiekhshoes.com');
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(3);
  expect(f.commits[2].writes[0].data.workEmail).toBe('');
  await expect(page.getByRole('dialog').getByText('Not assigned', { exact: true })).toBeVisible();
  expect(f.commits.every(c => c.writes.every((w: any) => w.collection === 'people'))).toBe(true);
});

test('Person editor undo of a legacy-only shared contact preserves its source and does not create workEmail', async ({ page }) => {
  const f = await preparePersonCard(page);
  delete f.seed.people[0].workEmail;
  f.seed.people[0].email = 'store1@shiekhshoes.com';
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person', exact: true }).click();
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill('temporary@shiekhshoes.com');
  await page.getByLabel('Individual work email (optional)', { exact: true }).fill(' STORE1@SHIEKHSHOES.COM ');
  await page.getByLabel('Department', { exact: true }).fill('Unrelated safe update');
  await page.getByRole('button', { name: 'Save Person', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes[0].data).not.toHaveProperty('workEmail');
  expect(f.commits[0].writes[0].data.email).toBe('store1@shiekhshoes.com');
});

test('Person card links concurrent positions only after review and preserves titles assignments and account access', async ({ page }) => {
  const f = await preparePersonCard(page);
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByRole('checkbox', { name: 'District Manager', exact: true }).check();
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect(page.getByRole('alert')).toContainText('Review and acknowledge');
  await expect(page.getByRole('alert')).toBeFocused();
  expect(f.commits).toHaveLength(0);
  await page.getByRole('checkbox', { name: /I reviewed the responsibilities/ }).check();
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes.map((w: any) => w.collection)).toEqual(['people']);
  const saved = f.commits[0].writes[0].data;
  expect(saved.positionIds).toEqual(['store-manager', 'district-manager']);
  expect(saved.jobTitle).toBe(' SM '); expect(saved.role).toBe('Historical separate alias');
  expect(saved.department).toBe('  Historic department  '); expect(saved.district).toBe('Legacy territory note');
});

test('Person card blocks silent loss of SM responsibility and zero-store District inactivation', async ({ page }) => {
  const f = await preparePersonCard(page);
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByRole('checkbox', { name: 'Store Manager', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'District Manager', exact: true }).check();
  await expect(page.getByText(/Retain Store Manager or reassign\/vacate/)).toBeVisible();
  await page.getByRole('button', { name: 'Save Person' }).click();
  expect(f.commits).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Leave draft' }).click();
  f.seed.locations = []; f.seed.users = [];
  await page.reload(); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByText(/Current management assignments/).click();
  await expect(page.getByRole('link', { name: /North District.*0 linked stores/ })).toBeVisible();
  await page.getByLabel('Active Status', { exact: true }).selectOption('Inactive');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect(page.getByRole('alert')).toContainText('Reassign/vacate management responsibilities');
  expect(f.commits).toHaveLength(0);
});

test('Person card requires resolved Active lifecycle before mapping existing responsibilities', async ({ page }) => {
  const f = await preparePersonCard(page);
  f.seed.people[0].activeStatus = false;
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByRole('checkbox', { name: 'District Manager', exact: true }).check();
  await page.getByRole('checkbox', { name: /I reviewed the responsibilities/ }).check();
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect(page.getByRole('alert')).toContainText('Resolve Active Status');
  await expect(page.getByRole('alert')).toBeFocused();
  expect(f.commits).toHaveLength(0);
});

test('Person card keeps legacy aliases untouched on unrelated edit and title edits do not rewrite role', async ({ page }) => {
  const f = await preparePersonCard(page);
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByLabel('Department', { exact: true }).fill('New descriptive department');
  await page.getByLabel('Display title (optional)', { exact: true }).fill('Descriptive operations title');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  const saved = f.commits[0].writes[0].data;
  expect(saved.jobTitle).toBe('Descriptive operations title'); expect(saved.role).toBe('Historical separate alias');
  expect(saved).not.toHaveProperty('positionIds'); expect(saved.district).toBe('Legacy territory note');
  expect(f.commits[0].writes).toHaveLength(1);
});

test('Person card preserves draft on close and locks closing and duplicate submissions during save', async ({ page }) => {
  const f = await preparePersonCard(page, 'hold');
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByLabel('Department', { exact: true }).fill('Retained draft');
  await page.getByRole('button', { name: 'Close Synthetic Profile Manager' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Leave this Person draft?' })).toBeVisible();
  await page.getByRole('alertdialog', { name: 'Leave this Person draft?' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Department', { exact: true })).toHaveValue('Retained draft');
  await page.getByRole('button', { name: 'Save Person' }).dblclick();
  await expect.poll(() => f.commits.length).toBe(1);
  await page.getByRole('button', { name: 'Close Synthetic Profile Manager' }).click();
  await expect(page.getByLabel('Department', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Person' })).toBeDisabled();
  f.release();
  await expect(page.getByRole('button', { name: 'Edit Person' })).toBeVisible();
  expect(f.commits).toHaveLength(1);
});

for (const mode of ['unknown', 'empty', 'reject'] as const) test('Person card retains failed draft with ' + mode + ' save semantics', async ({ page }) => {
  const f = await preparePersonCard(page, mode);
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByLabel('Department', { exact: true }).fill('Retained after failure');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(mode !== 'reject' ? 'Outcome unknown' : 'draft is retained');
  await expect(page.getByLabel('Department', { exact: true })).toHaveValue('Retained after failure');
  if (mode !== 'reject') await expect(page.getByRole('button', { name: 'Save Person' })).toBeDisabled();
  else await expect(page.getByRole('button', { name: 'Save Person' })).toBeEnabled();
  expect(f.commits).toHaveLength(1);
});

test('Person card is readable on mobile and support search preserves selected locations', async ({ page }, testInfo) => {
  const f = await preparePersonCard(page);
  f.seed.people[0].supportedLocationIds = ['loc-2'];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + '/people/person-profile'); await restore(page, true);
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await expect(page.getByRole('textbox', { name: 'Full Name', exact: true })).toBeVisible();
  for (const name of ['Display title (optional)', 'Work Phone', 'Extension', 'Individual work email (optional)', 'Phone visibility', 'Works at', 'Active Status']) await expect(page.getByLabel(name, { exact: true })).toBeVisible();
  await page.getByText('Choose support locations', { exact: true }).click();
  await page.getByLabel('Find support locations', { exact: true }).fill('nothing matches');
  await expect(page.getByRole('button', { name: /Remove support/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'Profile & positions' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('person-card-mobile.png'), fullPage: true });
  await page.getByRole('checkbox', { name: 'District Manager', exact: true }).check();
  await page.getByRole('heading', { name: 'Management responsibilities', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('person-card-management-mobile.png'), fullPage: true });
  expect(f.commits).toHaveLength(0);
});

test('Person card creates one versioned canonical record without creating an account', async ({ page }) => {
  const f = await preparePersonCard(page);
  await page.goto(origin + '/people'); await restore(page, true);
  await page.getByRole('button', { name: 'Add Person', exact: true }).click();
  await page.getByRole('textbox', { name: 'Full Name', exact: true }).fill('Synthetic New Corporate Person');
  await page.getByRole('checkbox', { name: 'Other / corporate position', exact: true }).check();
  await page.getByRole('checkbox', { name: /I reviewed the responsibilities/ }).check();
  await page.getByRole('button', { name: 'Save Record' }).click();
  await expect(page.getByRole('dialog', { name: 'Add Person', exact: true })).toHaveCount(0);
  expect(f.commits).toHaveLength(1);
  expect(f.commits[0].writes).toHaveLength(1);
  const write = f.commits[0].writes[0];
  expect(write.id).toMatch(/^per-[0-9a-f-]{36}$/); expect(write.expectedVersion).toBeNull();
  expect(write.data.positionIds).toEqual(['other']); expect(write.collection).toBe('people');
  expect(write.data.phonePrivacy).toBe('Internal'); expect(write.data).not.toHaveProperty('role');
});

test('Person card Organization link opens the actual hierarchy tab without a write', async ({ page }) => {
  const f = await preparePersonCard(page);
  await page.goto(origin + '/admin?tab=hierarchy-registry'); await restore(page, true);
  await expect(page.getByRole('region', { name: 'Region and District registry', exact: true })).toBeVisible();
  expect(f.commits).toHaveLength(0);
});

test('Person and store read displays use controlled positions and District ownership without writes', async ({ page }) => {
  const f = await preparePersonCard(page);
  f.seed.people[0].positionIds = ['store-manager', 'district-manager'];
  f.seed.people.push({ id: 'old-dm', fullName: 'Historical Copied DM', status: 'Active' });
  f.seed.locations[0].districtManagerId = 'old-dm';
  await page.goto(origin + '/'); await restore(page, true);
  await expect(page.getByText('(DM: Synthetic Profile Manager)', { exact: true })).toBeVisible();
  await expect(page.getByText('(DM: Historical Copied DM)', { exact: true })).toHaveCount(0);
  await page.goto(origin + '/locations/loc-1'); await restore(page, true);
  await expect(page.getByText('Synthetic Profile Manager', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Historical Copied DM', { exact: true })).toHaveCount(0);
  await page.goto(origin + '/people'); await restore(page, true);
  await expect(page.getByRole('button', { name: /Synthetic Profile Manager/ })).toContainText('Store Manager · District Manager');
  f.seed.people[0].positionIds = ['invalid'];
  await page.reload(); await restore(page, true);
  await expect(page.getByRole('button', { name: /Synthetic Profile Manager/ })).toContainText('Positions need review');
  expect(f.commits).toHaveLength(0);
});

test('API documentation links are discoverable and keyboard-accessible without credential changes', async ({ page }, testInfo) => {
  await prepare(page, 'System Administrator');
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: string[] = [];
  await page.route('**/api/api-clients**', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { clients: [] } });
    writes.push(route.request().method()); return route.fulfill({ status: 403, json: { error: {} } });
  });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Directory API', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Directory API documentation' });
  const links = [
    ['Store API integration guide', 'https://github.com/twgallo13/Shiekh-Directory/blob/main/docs/app-blueprint-directory-api.md'],
    ['Response fields and schema', 'https://github.com/twgallo13/Shiekh-Directory/blob/main/docs/api-response-schema.md'],
    ['API reference and endpoints', 'https://github.com/twgallo13/Shiekh-Directory/blob/main/API.md'],
    ['Published staffing reference', '/api/personnel-guide'],
    ['Published staffing OpenAPI', '/api/openapi.json'],
  ];
  for (const [label, href] of links) {
    const link = navigation.getByRole('link', { name: new RegExp(label) });
    await expect(link).toHaveAttribute('href', href); await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  }
  const first = navigation.getByRole('link', { name: /Store API integration guide/ });
  await first.focus(); await expect(first).toBeFocused();
  expect(writes).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('complementary', { name: 'API documentation' }).screenshot({ path: testInfo.outputPath('api-documentation-mobile.png') });
});

async function prepareAddress(page: Page, uncertain = false) {
  await prepare(page, 'System Administrator');
  const seed = seedDirectory(2) as any;
  seed.locations[0] = { ...seed.locations[0], suite: 'Space 21', wayfindingDirections: 'Old entrance', version: 3 };
  const commits: any[] = [];
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', route => {
    const body = route.request().postDataJSON(); commits.push(body);
    if (uncertain && commits.length === 1) return route.fulfill({ status: 502, contentType: 'text/html', body: 'Lost reply' });
    return route.fulfill({ json: commitResponseFor(body) });
  });
  await page.route('**/api/directory/submissions/cancel', route => route.fulfill({ json: { cancelled: true, records: [] } }));
  return { seed, commits };
}

test('Address request submits meaningful approved-field changes and explicit optional clears without identity changes', async ({ page }) => {
  const f = await prepareAddress(page);
  await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
  await page.getByLabel('Change Category').selectOption('Address Update');
  await expect(page.getByLabel('Street address', { exact: true })).toHaveValue('1 Local State Street');
  await page.getByLabel('Suite / space', { exact: true }).fill('');
  await page.getByLabel('Finding the store', { exact: true }).fill('Second floor, next to Macy’s.\nNorth entrance.');
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  const request = f.commits[0].writes[0].data;
  expect(request.changeType).toBe('Address Update');
  expect(request.requestedChanges).toEqual({ suite: null, wayfindingDirections: 'Second floor, next to Macy’s.\nNorth entrance.' });
  expect(request.currentSnapshot).toEqual({ suite: 'Space 21', wayfindingDirections: 'Old entrance' });
  expect(request.targetStoreNumber).toBe('001');
  expect(f.commits[0].writes).toHaveLength(1);
});

test('Address unknown submission recovers its original fields and restores an editable draft after confirmed cancellation', async ({ page }) => {
  const f = await prepareAddress(page, true);
  await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
  await page.getByLabel('Change Category').selectOption('Address Update');
  await page.getByLabel('Suite / space', { exact: true }).fill('');
  await page.getByLabel('Finding the store', { exact: true }).fill('Second floor');
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(page.getByRole('button', { name: 'Recover saved submission' })).toBeVisible();
  await page.reload(); await restore(page, true);
  await page.getByRole('button', { name: 'Check saved state / cancel if not saved' }).click();
  await expect(page.getByLabel('Finding the store', { exact: true })).toHaveValue('Second floor');
  await expect(page.getByLabel('Suite / space', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect.poll(() => f.commits.length).toBe(2);
  expect(f.commits[1].writes[0].id).not.toBe(f.commits[0].writes[0].id);
  expect(f.commits[1].writes[0].data.requestedChanges).toEqual(f.commits[0].writes[0].data.requestedChanges);
});

for (const legacy of [{ state: 'ca' }, { address: '  Legacy street  ' }, { city: 'x'.repeat(101) }, { mallOrCenterName: null }]) {
  test(`Address request preserves untouched legacy ${Object.keys(legacy)[0]} while changing directions`, async ({ page }) => {
    const f = await prepareAddress(page);
    Object.assign(f.seed.locations[0], legacy);
    await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
    await page.getByLabel('Change Category').selectOption('Address Update');
    await page.getByLabel('Finding the store', { exact: true }).fill('  Use the east entrance  ');
    await page.getByRole('button', { name: 'Submit for Approval' }).click();
    await expect.poll(() => f.commits.length).toBe(1);
    const request = f.commits[0].writes[0].data;
    expect(request.requestedChanges).toEqual({ wayfindingDirections: 'Use the east entrance' });
    expect(request.currentSnapshot).toEqual({ wayfindingDirections: 'Old entrance' });
  });
}

test('Address editor exposes separate customer directions; detail and mobile request show readable text', async ({ page }, testInfo) => {
  const f = await prepareAddress(page);
  await page.goto(`${origin}/locations/loc-1/edit`); await restore(page, true);
  await page.getByLabel('Finding the store', { exact: true }).fill('Second floor near Macy’s');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes[0].data.wayfindingDirections).toBe('Second floor near Macy’s');
  expect(f.commits[0].writes[0].data.suite).toBe('Space 21');
  await page.goto(`${origin}/locations/loc-1`); await restore(page, true);
  await expect(page.getByText('Old entrance', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
  await page.getByLabel('Change Category').selectOption('Address Update');
  await expect(page.getByLabel('Finding the store', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('address-request-mobile.png'), fullPage: true });
});

test('Address form detects a concurrent address refresh rather than silently rebasing its draft', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-22T18:00:00Z') });
  const f = await prepareAddress(page);
  let reads = 0;
  await page.route('**/api/directory/operating/directory', route => { reads++; return route.fulfill({ json: f.seed }); });
  await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
  await page.getByLabel('Change Category').selectOption('Address Update');
  await page.getByLabel('Finding the store', { exact: true }).fill('Draft directions');
  f.seed.locations[0] = { ...f.seed.locations[0], address: 'Concurrent saved street', version: 4 };
  await page.clock.fastForward(30000);
  await expect.poll(() => reads).toBe(1);
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('address changed while drafting');
  expect(f.commits).toHaveLength(0);
});

async function prepareOperating(page: Page, uncertain = false) {
  await page.clock.install({ time: new Date('2026-10-22T18:00:00Z') });
  await prepare(page, 'System Administrator');
  const seed = seedDirectory(1) as any;
  seed.serverNow = '2026-10-22T18:00:00Z';
  seed.locations[0].version = 3;
  const calls: any[] = [], mail: any[] = [];
  let previews = 0;
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: { ...seed, serverNow: new Date('2026-10-22T18:00:00Z').toISOString() } }));
  await page.route('**/api/directory/operating/preview', route => {
    previews++;
    return route.fulfill({ json: { locationId: 'loc-1', locationName: seed.locations[0].name, storeNumber: '001', timeZone: 'America/Los_Angeles', action: route.request().postDataJSON().action, expectedVersion: seed.locations[0].version, expectedClosureId: seed.locations[0].temporaryClosure?.id ?? null, expectedExpiresAt: '2026-10-23T07:00:00Z', evaluatedAt: '2026-10-22T18:00:00Z', state: { state: 'Open' } } });
  });
  await page.route('**/api/directory/operating/commit', route => {
    const command = route.request().postDataJSON(); calls.push(command);
    if (uncertain && calls.length === 1) return route.fulfill({ status: 502, contentType: 'text/html', body: 'Lost reply' });
    seed.locations[0] = { ...seed.locations[0], version: 4, temporaryClosure: { id: command.operationId, reason: command.reason, startsAt: '2026-10-22T18:00:00Z', expiresAt: command.expectedExpiresAt, timeZone: 'America/Los_Angeles' } };
    return route.fulfill({ json: { operationId: command.operationId, replayed: uncertain && calls.length > 1, records: [{ collection: 'locations', operation: 'set', id: 'loc-1', data: seed.locations[0] }], state: { state: 'Closed', reason: command.reason, evaluatedAt: '2026-10-22T18:00:00Z' } } });
  });
  await page.route('**/api/mail/event', route => { mail.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, status: 'accepted' } }); });
  await page.goto(`${origin}/locations/loc-1`); await restore(page, true);
  await page.getByRole('button', { name: 'Hours & status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Report temporary closure' })).toBeVisible();
  return { seed, calls, mail, previews: () => previews };
}

test('Operating closure previews without writes, confirms immediately and publishes its exact expiry', async ({ page }) => {
  const f = await prepareOperating(page);
  await page.getByRole('button', { name: 'Report temporary closure' }).click();
  const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Reason for operating update') });
  await expect(dialog).toContainText('Store #001');
  await expect(dialog.getByRole('button', { name: 'Confirm closure', exact: true })).toBeDisabled();
  expect(f.calls).toHaveLength(0); expect(f.mail).toHaveLength(0);
  await dialog.getByLabel('Reason for operating update').fill('Power outage');
  await dialog.getByRole('button', { name: 'Confirm closure', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Current operating state' })).toContainText('Temporary closure automatically ends');
  expect(f.calls).toHaveLength(1); expect(f.calls[0].expectedExpiresAt).toBe('2026-10-23T07:00:00Z');
  await expect.poll(() => f.mail.length).toBe(1);
  await expect(page.getByRole('button', { name: 'End temporary closure' })).toBeVisible();
  expect(f.calls[0]).not.toHaveProperty('actorId');
  await page.getByRole('button', { name: 'Check / recover steward alert' }).click();
  await expect(page.getByRole('region', { name: 'Current operating state' })).toContainText('Inbox delivery is not confirmed');
  expect(f.calls).toHaveLength(1); expect(f.mail).toHaveLength(2);
  expect(f.mail[1].entityId).toBe(f.calls[0].operationId);
});

test('Operating uncertain save survives reload and retries only the same immutable command', async ({ page }) => {
  const f = await prepareOperating(page, true);
  await page.getByRole('button', { name: 'Report temporary closure' }).click();
  await page.getByLabel('Reason for operating update').fill('Power outage');
  await page.getByRole('button', { name: 'Confirm closure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Recover operating update' })).toBeVisible();
  expect(f.mail).toHaveLength(0);
  await page.reload(); await restore(page, true);
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Recover operating update' }).click();
  await page.getByRole('button', { name: 'Hours & status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End temporary closure' })).toBeVisible();
  expect(f.calls).toHaveLength(2); expect(f.calls[1]).toEqual(f.calls[0]);
  await expect.poll(() => f.mail.length).toBe(1);
});

test('Operating expiry returns to schedule on the store clock without requiring a cleanup write', async ({ page }) => {
  const f = await prepareOperating(page);
  f.seed.locations[0].temporaryClosure = { id: 'event', reason: 'Power outage', startsAt: '2026-10-22T17:00:00Z', expiresAt: '2026-10-23T07:00:00Z', timeZone: 'America/Los_Angeles' };
  await page.reload(); await restore(page, true);
  await expect(page.getByText('Power outage', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hours & status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End temporary closure' })).toBeVisible();
  // An offline screen still expires its locally retained closure; no stale fixture clock reset.
  await page.route('**/api/auth/bootstrap', route => route.abort());
  await page.clock.fastForward(14 * 3600000);
  await expect(page.getByRole('button', { name: 'Confirm closure for today' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Current operating state' })).toContainText('Outside scheduled hours');
  expect(f.calls).toHaveLength(0); expect(f.previews()).toBe(0); expect(f.mail).toHaveLength(0);
});

test('Operating periodic refresh uses one bounded read, updates closures and retains state on outage', async ({ page }) => {
  const f = await prepareOperating(page);
  let refreshes = 0, bootstraps = 0, fail = false;
  page.on('request', request => { if (request.url().endsWith('/api/auth/bootstrap')) bootstraps++; });
  await page.route('**/api/directory/operating/directory', route => {
    refreshes++;
    return fail ? route.fulfill({ status: 503, json: { error: {} } }) : route.fulfill({ json: f.seed });
  });
  f.seed.locations[0].temporaryClosure = { id: '12345678-1234-1234-1234-123456789abc', reason: 'New outage', startsAt: '2026-10-22T17:00:00Z', expiresAt: '2026-10-23T07:00:00Z', timeZone: 'America/Los_Angeles' };
  await page.clock.fastForward(30000);
  await expect(page.getByRole('button', { name: 'End temporary closure' })).toBeVisible();
  expect(refreshes).toBe(1); expect(bootstraps).toBe(0);
  fail = true;
  await page.clock.fastForward(30000);
  await expect(page.getByRole('region', { name: 'Current operating state' })).toContainText('Status refresh is unavailable');
  await expect(page.getByRole('button', { name: 'End temporary closure' })).toBeVisible();
  expect(f.calls).toHaveLength(0);
});

for (const fail of [false, true]) test(`Operating bulk dated closures await confirmation and preserve lifecycle: ${fail ? 'uncertain' : 'saved'}`, async ({ page }) => {
  await prepare(page, 'System Administrator');
  const seed = seedDirectory(2), commits: any[] = [];
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); commits.push(body);
    await held;
    return fail ? route.fulfill({ status: 502, contentType: 'text/html', body: 'Lost reply' }) : route.fulfill({ json: commitResponseFor(body) });
  });
  await page.goto(`${origin}/locations`); await restore(page, true);
  await page.getByRole('checkbox', { name: /Select All/ }).check();
  await page.getByRole('button', { name: 'Configure Bulk Hours & Holiday Exception' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bulk Update Fleet Locations' });
  await expect(dialog.getByRole('option', { name: 'Temporarily Closed — Emergency' })).toHaveCount(0);
  await dialog.getByPlaceholder('e.g., Thanksgiving, Christmas Eve, Special Inventory').fill('Synthetic holiday');
  await dialog.getByLabel('Exception start date').fill('2026-12-24');
  await dialog.getByLabel('Exception end date').fill('2026-12-25');
  const apply = dialog.getByRole('button', { name: 'Apply Updates to 2 Stores' });
  await apply.click();
  await expect.poll(() => commits.length).toBe(1);
  await expect(apply).toBeDisabled();
  await expect(page.getByText('Successfully updated 2 locations', { exact: true })).toHaveCount(0);
  release();
  if (fail) {
    await expect(dialog.getByRole('alert')).toContainText('0 Location update(s) confirmed');
    await expect(apply).toBeDisabled(); expect(commits).toHaveLength(1);
    await expect(dialog.getByRole('button', { name: 'Reload saved directory state' })).toBeVisible();
  } else {
    await expect(page.getByText('Successfully updated 2 locations', { exact: true })).toBeVisible();
    expect(commits).toHaveLength(2);
  }
  expect(commits[0].writes[0].data.operationalStatus).toBe('Open — Normal Operations');
  expect(commits[0].writes[0].data.holidayHours.map((h: any) => h.date)).toEqual(['2026-12-24', '2026-12-25']);
  expect(commits[0].writes[0].data.holidayHours.every((h: any) => h.hours.isClosed)).toBe(true);
});

for (const special of [false, true]) test(`Operating bulk schedule preflight checks every store before any write: ${special ? 'special range' : 'other holiday'}`, async ({ page }) => {
  await prepare(page, 'System Administrator');
  const seed = seedDirectory(2) as any, commits: any[] = [];
  if (special) seed.locations[1].specialHours = [{ id: 'special', startDate: '2026-12-24', endDate: '2026-12-26', hours: { open: '08:00', close: '12:00', isClosed: false } }];
  else seed.locations[1].holidayHours = [{ id: 'holiday', holidayName: 'Existing holiday', date: '2026-12-24', hours: { open: '08:00', close: '12:00', isClosed: false } }];
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', route => { commits.push(route.request().postDataJSON()); return route.fulfill({ json: commitResponseFor(commits.at(-1)) }); });
  await page.goto(`${origin}/locations`); await restore(page, true);
  await page.getByRole('checkbox', { name: /Select All/ }).check();
  await page.getByRole('button', { name: 'Configure Bulk Hours & Holiday Exception' }).click();
  const dialog = page.getByRole('dialog', { name: 'Bulk Update Fleet Locations' });
  await dialog.getByPlaceholder('e.g., Thanksgiving, Christmas Eve, Special Inventory').fill('New holiday');
  await dialog.getByLabel('Exception start date').fill('2026-12-24');
  await dialog.getByRole('button', { name: 'Apply Updates to 2 Stores' }).click();
  await expect(dialog.getByRole('alert')).toContainText('#002');
  await expect(dialog.getByRole('alert')).toContainText('Nothing was saved');
  expect(commits).toHaveLength(0);
});

async function prepareHoursCorrection(page: Page, options: { role?: string; request?: 'changed' | 'noop' | 'stale' | 'missing'; conflict?: boolean } = {}) {
  await prepare(page, options.role || 'Directory Data Steward');
  const locations: LocationRecord[] = seedDirectory(3).locations.map((loc, index) => ({
    ...loc, type: 'Other Company Location', hierarchyApplicability: 'Not Applicable', recordStatus: 'Active', operationalStatus: 'Open — Normal Operations',
    version: 4, standardHours: { ...structuredClone(DEFAULT_WEEKLY_HOURS), monday: { ...DEFAULT_WEEKLY_HOURS.monday, open: index === 0 ? '08:00' : '11:00' } },
    hoursMode: 'template', hoursTemplateId: 'synthetic-template', storeManagerId: 'missing-person',
    regionalManagerId: 'missing-rm', keyHolderIds: ['missing-key'],
  }));
  delete locations[2].standardHours;
  const current = locations[0].standardHours!;
  const proposed = { ...current, monday: { ...current.monday, open: '09:00' } };
  const requests: UpdateRequest[] = options.request ? [{
    id: 'req-hours', version: 3, targetType: 'Location', targetId: options.request === 'missing' ? 'missing-location' : locations[0].id,
    targetName: 'Synthetic Hours Store', targetStoreNumber: '001', changeType: 'Standard Hours Adjustment',
    requestedBy: { id: 'synthetic-user', name: 'Synthetic Requester', email: 'requester@example.test', role: 'Viewer' },
    requestedAt: '2026-10-04T12:00:00.000Z', status: 'Pending',
    currentSnapshot: { standardHours: options.request === 'noop' || options.request === 'stale' ? { ...current, monday: { ...current.monday, open: '07:00' } } : current, hoursMode: locations[0].hoursMode ?? null, hoursTemplateId: locations[0].hoursTemplateId ?? null },
    requestedChanges: { standardHours: options.request === 'noop' ? Object.fromEntries(Object.entries(current).reverse()) as LocationRecord['standardHours'] : proposed },
  }] : [];
  const seed = { ...seedDirectory(0), locations, requests, hoursTemplates: [{ id: 'synthetic-template', name: 'Synthetic template', description: '', schedule: current }] };
  const commits: { writes: { collection: string; id: string; data: Record<string, unknown>; expectedVersion?: number }[] }[] = [];
  let mailEvents = 0;
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/mail/event', route => { mailEvents++; return route.fulfill({ json: { success: true } }); });
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); commits.push(body);
    if (options.conflict) return route.fulfill({ status: 409, json: { error: { code: 'directory_conflict', message: 'Hours changed since submission. Reload and submit a replacement.' } } });
    return route.fulfill({ json: commitResponseFor(body) });
  });
  return { commits, locations, requests, mailEvents: () => mailEvents };
}

/** Open a leadership request using synthetic auth, records and save outcomes only. */
async function prepareLeadershipRequest(page: Page, fail = false) {
  await prepare(page, 'Viewer');
  const seed = seedDirectory(2);
  const people = [
    { id: 'person-new', fullName: 'Synthetic New Manager', jobTitle: ' SM ', positionIds: ['store-manager'], status: 'Active', activeStatus: true, workPhone: '+12135550102' },
    { id: 'person-inactive', fullName: 'Synthetic Inactive Manager', jobTitle: 'Store Manager', status: 'Inactive', activeStatus: false },
    { id: 'person-dm', fullName: 'Synthetic District Lead', jobTitle: 'District Manager', status: 'Active', activeStatus: true },
  ];
  const commits: any[] = [];
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: { ...seed, people } }));
  await page.route('**/api/directory/commit', route => {
    const body = route.request().postDataJSON(); commits.push(body);
    if (fail) return route.fulfill({ status: 409, json: { error: { code: 'directory_conflict', message: 'The selected manager changed. Review your draft.' } } });
    return route.fulfill({ json: commitResponseFor(body) });
  });
  await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
  await page.getByLabel('Change Category').selectOption('Store Manager Change');
  return { commits };
}

test('Leadership request displays and submits the chosen manager using the keyboard', async ({ page }) => {
  const f = await prepareLeadershipRequest(page);
  const selector = page.getByRole('button', { name: 'New Store Manager' });
  await selector.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: /Synthetic Inactive Manager/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Synthetic District Lead/ })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Show all active people' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Synthetic District Lead/ })).toHaveCount(0);
  const option = page.getByRole('button', { name: /Synthetic New Manager/ });
  await option.focus(); await option.press('Enter');
  await expect(page.getByRole('dialog').getByText('Synthetic New Manager', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear New Store Manager' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('dialog').locator('textarea')).toBeFocused();
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes[0].data.requestedChanges.storeManagerId).toBe('person-new');
  expect(f.commits[0].writes[0].data.currentSnapshot).toMatchObject({ storeManagerId: null, storeManagerName: null, storeManagerPhone: null });
});

test('Leadership request cannot submit without a manager and resets selection when changing stores', async ({ page }) => {
  const f = await prepareLeadershipRequest(page);
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Choose an active Store Manager');
  expect(f.commits).toHaveLength(0);
  await page.getByRole('button', { name: 'New Store Manager' }).click();
  await page.getByRole('button', { name: /Synthetic New Manager/ }).click();
  await page.getByLabel('Target Location').selectOption('loc-2');
  await expect(page.getByRole('button', { name: 'New Store Manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear New Store Manager' })).toHaveCount(0);
});

test('Leadership request retains its selected manager after a failed save and allows explicit clearing', async ({ page }) => {
  const f = await prepareLeadershipRequest(page, true);
  await page.getByRole('button', { name: 'New Store Manager' }).click();
  await page.getByRole('button', { name: /Synthetic New Manager/ }).click();
  await page.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('The selected manager changed');
  await expect(page.getByRole('dialog').getByText('Synthetic New Manager', { exact: true })).toBeVisible();
  expect(f.commits).toHaveLength(1);
  const clearSelection = page.getByRole('button', { name: 'Clear New Store Manager' });
  await clearSelection.focus(); await clearSelection.press('Enter');
  await expect(page.getByRole('button', { name: 'New Store Manager' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'New Store Manager' })).toBeFocused();
});
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
  await page.route('**/api/directory/operating/directory', route => route.fulfill({ status: 503, json: { error: { code: 'synthetic_refresh_offline' } } }));
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
    serverNow: new Date().toISOString(),
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
    people: [], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], customFieldDefinitions: [], regions: [], districts: [],
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

for (const fail of [false, true]) {
  test(`District leadership requires a reviewed confirmation and handles ${fail ? 'a stale failure without retry' : 'atomic success and inherited editor'}`, async ({ page }) => {
    const f = await prepareHierarchyBrowser(page);
    f.seed.locations = f.seed.locations.filter((l: any) => l.id !== 'loc-unclassified');
    f.seed.locations.push({ ...f.seed.locations[0], id: 'loc-retired', storeNumber: '099', name: 'Synthetic Retired Store', recordStatus: 'Retired' });
    f.seed.people.push({ id: 'person-next', fullName: 'Synthetic Next DM', jobTitle: 'DM', positionIds: ['district-manager'], status: 'Active', activeStatus: true });
    if (fail) await page.route('**/api/directory/commit', route => { f.commits.push(route.request().postDataJSON()); return route.fulfill({ status: 409, json: { error: { message: 'District membership changed. Refresh the preview.' } } }); });
    await page.goto(`${origin}/admin`); await restore(page, true);
    await page.getByRole('button', { name: 'Region & Districts', exact: true }).click();
    await page.getByRole('group', { name: 'District Renamed North', exact: true }).getByRole('button', { name: 'Set up District Manager' }).click();
    const panel = page.getByRole('region', { name: 'District leadership handover' });
    await panel.getByLabel('New District Manager', { exact: true }).selectOption('person-next');
    await panel.getByLabel('Reason for District handover').fill('Synthetic coverage handover');
    await panel.getByRole('button', { name: 'Preview district-wide change' }).click();
    await expect(panel.getByText(/2 retail stores will share/)).toBeVisible();
    const confirm = panel.getByRole('button', { name: 'Confirm District DM assignment' });
    await expect(confirm).toBeDisabled(); expect(f.commits).toHaveLength(0);
    await panel.getByRole('checkbox', { name: /I reviewed every affected store/ }).check();
    await confirm.click(); await expect.poll(() => f.commits.length).toBe(1);
    if (fail) {
      await expect(panel.getByRole('status')).toContainText('Do not assume it failed or retry blindly');
      await expect(confirm).toHaveCount(0); expect(f.commits).toHaveLength(1);
    } else {
      await expect(panel.getByRole('status')).toContainText('Saved: Synthetic Next DM');
      expect(f.commits[0].writes).toHaveLength(3);
      expect(f.commits[0].writes[0].districtLeadershipMembers).toHaveLength(2);
      expect(f.commits[0].writes.every((w: any) => w.data.districtManagerId === 'person-next')).toBe(true);
      // Keep the same provider state: navigation opens a read-only inherited store picker.
      await page.getByRole('button', { name: /Store Locations/ }).click();
      await page.getByRole('cell', { name: /101.*Retail Store/ }).click();
      await page.getByRole('button', { name: 'Edit Store Record' }).click();
      await expect(page.getByRole('combobox', { name: 'District Manager', exact: true })).toBeDisabled();
      await expect(page.getByRole('combobox', { name: 'District Manager', exact: true })).toHaveValue('person-next');
      expect(f.commits).toHaveLength(1);
    }
  });
}

test('Registry refresh cannot overlap a pending District manager save', async ({ page }) => {
  const f = await prepareHierarchyBrowser(page);
  f.seed.locations = f.seed.locations.filter((location: any) => location.id !== 'loc-unclassified');
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); f.commits.push(body);
    if (f.commits.length === 1) return route.fulfill({ status: 409, json: { error: { code: 'directory_conflict', message: 'Registry changed. Refresh saved values.' } } });
    await gate;
    return route.fulfill({ json: commitResponseFor(body) });
  });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Region & Districts', exact: true }).click();
  const district = page.getByRole('group', { name: 'District Renamed North', exact: true });
  await district.getByRole('button', { name: 'Retire', exact: true }).click();
  const refresh = page.getByRole('button', { name: 'Refresh saved values and review' });
  await expect(refresh).toBeEnabled();
  await district.getByRole('button', { name: 'Set up District Manager' }).click();
  const panel = district.getByRole('region', { name: 'District leadership handover' });
  await panel.getByLabel('New District Manager', { exact: true }).selectOption('person-dm');
  await panel.getByLabel('Reason for District handover').fill('Synthetic reviewed District setup');
  await panel.getByRole('button', { name: 'Preview district-wide change' }).click();
  await panel.getByRole('checkbox', { name: /I reviewed every affected store/ }).check();
  await panel.getByRole('button', { name: 'Confirm District DM assignment' }).click();
  try {
    await expect.poll(() => f.commits.length).toBe(2);
    await expect(refresh).toBeDisabled();
    await expect(district.getByRole('button', { name: 'Close manager settings' })).toBeDisabled();
  } finally { release(); }
  await expect(panel.getByRole('status')).toContainText('Saved: District Manager');
  await expect(refresh).toBeEnabled();
  await expect(district.getByText('Inherited by stores', { exact: false })).toBeVisible();
});

test('Registry is browse-first, filters Districts by Region and opens leadership in its District', async ({ page }) => {
  const f = await prepareHierarchyBrowser(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Region & Districts', exact: true }).click();
  const registry = page.getByRole('region', { name: 'Region and District registry', exact: true });
  await expect(registry.getByLabel('Region ID')).not.toBeVisible();
  await expect(registry.getByRole('region', { name: 'District leadership handover' })).toHaveCount(0);
  await registry.getByLabel('Filter by Region').selectOption('reg-west');
  const district = registry.getByRole('group', { name: 'District Renamed North', exact: true });
  await expect(district).toBeVisible();
  await expect(registry.getByRole('group', { name: 'District East District', exact: true })).toHaveCount(0);
  await district.getByRole('button', { name: 'Set up District Manager' }).click();
  await expect(district.getByRole('region', { name: 'District leadership handover' })).toBeVisible();
  await expect(registry.getByLabel('Filter by Region')).toBeDisabled();
  await district.getByRole('button', { name: 'Close manager settings' }).click();
  await expect(registry.getByLabel('Filter by Region')).toBeEnabled();
  await registry.screenshot({ path: 'test-results/registry-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await registry.screenshot({ path: 'test-results/registry-desktop.png' });
  expect(f.commits).toHaveLength(0);
});

test('Store hierarchy filters Districts and inherits their DM without a store-level override', async ({ page }) => {
  const f = await prepareHierarchyBrowser(page);
  delete f.seed.locations[0].districtManagerId;
  f.seed.locations[0].districtManagerName = 'Synthetic legacy DM';
  Object.assign(f.seed.districts[1], { districtManagerId: null });
  await page.goto(`${origin}/locations/loc-retail/edit`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  const dm = dialog.getByRole('combobox', { name: 'District Manager', exact: true });
  await expect(dm).toBeDisabled();
  await expect(dm.locator('option:checked')).toHaveText('Synthetic legacy DM (Unresolved legacy assignment — needs review)');
  await expect(dialog.getByText(/District Manager setup is required/)).toBeVisible();
  await dialog.getByLabel('Region Name', { exact: true }).selectOption('reg-east');
  const districts = dialog.getByLabel('District Name', { exact: true });
  await expect(districts.locator('option[value="01"]')).toHaveCount(0);
  await districts.selectOption('02');
  await expect(dm).toBeDisabled(); await expect(dm).toHaveValue('');
  await expect(dm.locator('option:checked')).toHaveText('-- Unassigned / Vacant --');
  await expect(dialog.getByText(/Inherited from District settings/)).toBeVisible();
  expect(f.commits).toHaveLength(0);
});

test('Leadership pickers require explicit positions and preserve unmatched current assignments', async ({ page }) => {
  const f = await prepareHierarchyBrowser(page);
  Object.assign(f.seed.people[0], { positionIds: ['district-manager'] });
  f.seed.people.push(
    { id: 'person-sm', fullName: 'Synthetic Store Lead', jobTitle: 'SM', positionIds: ['store-manager'], status: 'Active', activeStatus: true },
    { id: 'person-rm', fullName: 'Synthetic Regional Lead', jobTitle: 'Regional Manager', positionIds: ['regional-manager'], status: 'Active', activeStatus: true },
    { id: 'person-am', fullName: 'Synthetic Assistant Lead', jobTitle: 'Assistant Manager', positionIds: ['assistant-store-manager'], status: 'Active', activeStatus: true },
    { id: 'person-kh', fullName: 'Synthetic Key Lead', jobTitle: 'Keyholder', positionIds: ['key-holder'], status: 'Active', activeStatus: true },
    { id: 'person-other', fullName: 'Synthetic Operations Lead', jobTitle: 'Operations Lead', status: 'Active', activeStatus: true },
    { id: 'person-inactive', fullName: 'Synthetic Inactive Lead', jobTitle: 'District Manager', status: 'Inactive', activeStatus: false },
  );
  Object.assign(f.seed.locations[0], { storeManagerId: 'person-other', storeManagerName: 'Synthetic Operations Lead', assistantStoreManagerIds: ['person-am'], keyHolderIds: ['missing-key'], keyHolderNames: ['Historical Key Lead'] });
  await page.goto(`${origin}/locations/loc-retail/edit`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  const dm = dialog.getByRole('combobox', { name: 'District Manager', exact: true });
  await expect(dm.locator('option')).toHaveText(['-- Unassigned / Vacant --', 'District Manager (District Manager)']);
  await expect(dialog.getByRole('combobox', { name: 'Regional Manager', exact: true }).locator('option')).toHaveText(['-- Unassigned / Vacant --', 'Synthetic Regional Lead (Regional Manager)']);
  const sm = dialog.getByRole('combobox', { name: 'Store Manager', exact: true });
  await expect(sm).toHaveValue('person-other');
  await expect(sm.locator('option:checked')).toContainText('Current assignment');
  await expect(dialog.getByRole('combobox', { name: 'Assistant Manager 1', exact: true }).locator('option')).toHaveText(['Select a person from the directory...', 'Synthetic Assistant Lead (Assistant Store Manager)']);
  const kh = dialog.getByRole('combobox', { name: 'Key Holder 1', exact: true });
  await expect(kh).toHaveValue('missing-key');
  await expect(kh.locator('option:checked')).toContainText('Historical Key Lead (Current assignment');
  await expect(dialog.getByRole('checkbox', { name: 'Show all active people' })).toHaveCount(0);
  await expect(dm.locator('option[value="person-inactive"]')).toHaveCount(0);
  await expect(dm.locator('option[value="person-other"]')).toHaveCount(0);
  expect(f.commits).toHaveLength(0);
});

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

for (const width of [320, 390]) {
  test(`Location inbox edit, clear, and tab persistence at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const fixture = await prepareCustomFields(page);
    fixture.seed.locations[0].locationInboxEmail = 'old@example.test';
    await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);

    const inbox = page.getByLabel('Location / Store Inbox (Optional)');
    await expect(inbox).toHaveValue('old@example.test');
    await inbox.fill('Long.Store.Team+contact@example.test');
    await page.getByRole('button', { name: 'Hours', exact: true }).click();
    await page.getByRole('button', { name: 'Store', exact: true }).click();
    await expect(inbox).toHaveValue('Long.Store.Team+contact@example.test');
    await page.getByRole('button', { name: /Save.*Record/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(fixture.commits[0].writes[0].data.locationInboxEmail).toBe('Long.Store.Team+contact@example.test');
    expect(fixture.commits[0].writes[0].expectedVersion).toBe(0);

    await page.goto(`${origin}/locations/loc-custom`); await restore(page, true);
    await expect(page.getByText('Long.Store.Team+contact@example.test', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy location inbox' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Email location inbox' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Email location inbox' })).toHaveAttribute('href', 'mailto:Long.Store.Team%2Bcontact%40example.test');
    await expect(page.getByText('Phone privacy', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
    await page.getByRole('button', { name: 'Clear inbox' }).click();
    await expect(page.getByText('Removal is pending until you save.')).toBeVisible();
    await page.getByRole('button', { name: /Save.*Record/ }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(fixture.commits[1].writes[0].data.locationInboxEmail).toBeNull();
    expect(fixture.commits[1].writes[0].expectedVersion).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('Location inbox correction blocks empty clears and normalized unchanged addresses', async ({ page }) => {
  const fixture = await prepareCustomFields(page);
  await page.goto(`${origin}/requests/new?locationId=loc-custom`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').nth(1).selectOption('Other Store Info Update');
  await dialog.getByRole('button', { name: 'Clear inbox', exact: true }).click();
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('would not change the location');
  expect(fixture.commits).toHaveLength(0);
  fixture.seed.locations[0].locationInboxEmail = 'Store@EXAMPLE.test';
  await page.reload(); await restore(page, true);
  await dialog.getByRole('combobox').nth(1).selectOption('Other Store Info Update');
  await dialog.getByPlaceholder('store@example.com').fill('Store@example.test');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('would not change the location');
  expect(fixture.commits).toHaveLength(0);
  await dialog.getByPlaceholder('store@example.com').fill('changed@example.test');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog).toHaveCount(0);
  expect(fixture.commits[0].writes.find((write: any) => write.collection === 'requests').data.requestedChanges.locationInboxEmail).toBe('changed@example.test');
});

test('Location inbox CSV deselection removes the reviewed acknowledgment before revalidation', async ({ page }) => {
  const fixture = await prepareCustomFields(page);
  fixture.seed.locations.push({ ...fixture.seed.locations[0], id: 'loc-other', storeNumber: '08', name: 'Other Store', locationInboxEmail: 'shared@example.test' });
  const requests: any[] = [];
  await page.route('**/api/imports/locations/preview', async route => {
    const body = route.request().postDataJSON(); requests.push(body);
    const snapshot = { ...fixture.seed, regions: [], districts: [] };
    const plan = buildLocationImportPlan(body.csv, snapshot, '2026-10-04T00:00:00Z', () => 'unused', body);
    await route.fulfill({ json: { ...plan.preview, mode: body.mode, selectedRowNumbers: body.selectedRowNumbers ?? [2, 3] } });
  });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: /CSV/ }).first().click();
  await page.getByLabel('Upload Location CSV').setInputFiles({ name: 'inbox.csv', mimeType: 'text/csv', buffer: Buffer.from('LocationId,StoreName,LocationInboxEmail,LocationInboxEmailAction\nloc-custom,,shared@example.test,set\nloc-other,Renamed Store,,keep\n') });
  await page.getByRole('checkbox', { name: /I reviewed every heading/ }).check();
  await page.getByRole('button', { name: 'Validate and Preview' }).click();
  const acknowledgment = page.getByRole('checkbox', { name: /I reviewed the shared inbox conflict for this row/ }).first();
  await acknowledgment.check();
  await page.getByRole('checkbox', { name: 'Select CSV row 2', exact: true }).uncheck();
  await expect(acknowledgment).not.toBeChecked();
  await expect(acknowledgment).toBeDisabled();
  await page.getByRole('button', { name: 'Revalidate selection' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].selectedRowNumbers).toEqual([3]);
  expect(requests[1].inboxAcknowledgedRowNumbers).toEqual([]);
  expect(requests[1].inboxAcknowledgmentDigests).toEqual({});
});

test('Location inbox draft remains visible after a stale-save conflict', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const fixture = await prepareCustomFields(page);
  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
  const inbox = page.getByLabel('Location / Store Inbox (Optional)');
  await inbox.fill('draft@example.test');
  fixture.failWrites();
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Custom metadata changed. Reload the directory before saving.');
  await expect(inbox).toHaveValue('draft@example.test');
  expect(fixture.commits[0].writes[0].expectedVersion).toBe(0);
});

test('Location inbox preserves an unchanged malformed historical value while editing other fields', async ({ page }) => {
  const fixture = await prepareCustomFields(page);
  fixture.seed.locations[0].locationInboxEmail = 'invalid historical address';
  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
  await page.getByLabel('Capacity', { exact: true }).fill('4');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(fixture.commits[0].writes[0].data.locationInboxEmail).toBe('invalid historical address');
  expect(fixture.commits[0].writes[0].data.customMetadata.capacity).toBe(4);
  await page.goto(`${origin}/locations/loc-custom`); await restore(page, true);
  await expect(page.getByText('Historical inbox needs review: invalid historical address')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Email location inbox' })).toHaveCount(0);
});

test('Location inbox requires explicit duplicate review and invalidates it when the draft address changes', async ({ page }) => {
  const fixture = await prepareCustomFields(page);
  fixture.seed.locations.push({ ...fixture.seed.locations[0], id: 'loc-other', storeNumber: '08', name: 'Other Store', version: 3, locationInboxEmail: 'shared@example.test' });
  await page.goto(`${origin}/locations/loc-custom/edit`); await restore(page, true);
  const inbox = page.getByLabel('Location / Store Inbox (Optional)');
  await inbox.fill('shared@example.test');
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('alert')).toContainText('Acknowledge the shared inbox');
  expect(fixture.commits).toHaveLength(0);
  const acknowledgment = page.getByRole('checkbox', { name: 'I reviewed these locations and confirm this inbox may be shared.' });
  await acknowledgment.check();
  await inbox.fill('SHARED@example.test');
  await expect(acknowledgment).not.toBeChecked();
  await acknowledgment.check();
  await page.getByRole('button', { name: /Save.*Record/ }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const savedAcknowledgment = fixture.commits[0].writes[0].locationInboxAcknowledgment;
  expect(savedAcknowledgment.normalizedEmail).toBe('shared@example.test');
  expect(JSON.parse(savedAcknowledgment.conflictDigest).members).toEqual([
    { id: 'loc-custom', storeNumber: '07', version: 1 },
    { id: 'loc-other', storeNumber: '08', version: 3 },
  ]);
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
  await quickRegion.selectOption('');
  await quickType.selectOption('Warehouse / Distribution Center');
  const quickApplicability = quickAdd.getByText('Retail hierarchy', { exact: true }).locator('..').locator('select');
  const notApplicableOption = quickApplicability.locator('option[value="Not Applicable"]');
  await expect(notApplicableOption).toBeEnabled();
  await quickApplicability.selectOption('Not Applicable');
  await quickRegion.selectOption('reg-west');
  await expect(quickApplicability).toHaveValue('Applicable');
  await expect(notApplicableOption).toBeDisabled();
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

test('Person legacy territory is reference-only and unrelated edits preserve linked Location District', async ({ page }) => {
  const fixture = await prepareHierarchyBrowser(page);
  await page.goto(`${origin}/people`); await restore(page, true);
  await page.getByRole('button', { name: /District Manager/ }).click();
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByText('Historical territory note', { exact: true }).click();
  await expect(page.getByText(/Legacy territory\/district text \(reference only\)/)).toBeVisible();
  await expect(page.getByLabel('Assigned Territory / District (Compatibility)')).toHaveCount(0);
  await page.getByLabel('Department', { exact: true }).fill('Synthetic department');
  await page.getByRole('button', { name: 'Save Person' }).click();
  expect(fixture.commits).toHaveLength(1);
  expect(fixture.commits[0].writes.map((write: { collection: string }) => write.collection)).toEqual(['people']);
  expect(fixture.seed.locations[0].district).toBe('Legacy Location District');
});

async function prepareStaffingParity(page: Page) {
  await prepare(page, 'System Administrator');
  const seed = {
    ...seedDirectory(1),
    locations: [{
      ...seedDirectory(1).locations[0], phone: '+12135550107', version: 1,
      storeManagerId: 'missing-person', storeManagerName: 'Legacy Manager',
      districtManagerName: 'Legacy District Manager',
      regionalManagerId: 'regional-person', regionalManagerName: 'Stale Regional Name',
      assistantStoreManagerIds: ['missing-assistant'], assistantStoreManagerNames: ['Legacy Assistant'],
      keyHolderNames: ['Legacy Key Holder'],
    }],
    people: [
      { id: 'regional-person', fullName: 'Canonical Regional Person', status: 'Active', activeStatus: true, version: 1 },
      { id: 'ambiguous-person', fullName: 'Ambiguous Lifecycle Person', status: 'Active', activeStatus: false, version: 1 },
    ],
  };
  const commits: Array<{ writes: Array<{ collection: string; id: string; operation: string; data?: Record<string, unknown> }> }> = [];
  await page.route('**/api/auth/bootstrap', route => route.fulfill({ json: seed }));
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON();
    commits.push(body);
    await route.fulfill({ json: commitResponseFor(body) });
  });
  return { seed, commits };
}

for (const width of [1280, 390, 320]) {
  test(`Staffing parity preserves persisted IDs on load and unrelated save at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const fixture = await prepareStaffingParity(page);
    await page.goto(`${origin}/locations/loc-1`); await restore(page, true);
    await expect(page.getByText('Canonical Regional Person', { exact: true })).toBeVisible();
    await page.getByText(/Saved staffing needs review/).click();
    await expect(page.getByText(/Canonical IDs are preserved/)).toBeVisible();
    expect(fixture.commits).toHaveLength(0);
    await page.goto(`${origin}/people`); await restore(page, true);
    await expect(page.getByRole('button', { name: /Legacy Assistant|Legacy Key Holder/ })).toHaveCount(0);
    await page.goto(`${origin}/locations/loc-1/edit`); await restore(page, true);
    const dialog = page.getByRole('dialog');
    const name = dialog.getByPlaceholder('e.g. Glendale Galleria, Shiekh Shoes', { exact: true });
    await name.fill('Unrelated Store Rename');
    await page.getByRole('button', { name: /Save.*Record/ }).click();
    await expect.poll(() => fixture.commits.length).toBe(1);
    const saved = fixture.commits[0].writes[0].data!;
    expect(saved.storeManagerId).toBe('missing-person');
    expect(saved.storeManagerName).toBe('Legacy Manager');
    expect(saved.assistantStoreManagerIds).toEqual(['missing-assistant']);
    expect(saved.keyHolderNames).toEqual(['Legacy Key Holder']);
    expect(Object.hasOwn(saved, 'keyHolderIds')).toBe(false);
    expect(saved.regionalManagerName).toBe('Stale Regional Name');
    expect(saved.name).toBe('Unrelated Store Rename');
  });
}

test('Staffing parity regional Person rename updates only saved regional copy and keeps missing-role history', async ({ page }) => {
  const fixture = await prepareStaffingParity(page);
  await page.goto(`${origin}/people`); await restore(page, true);
  await page.getByRole('button', { name: /Canonical Regional Person/ }).click();
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Full Name', exact: true }).fill('Renamed Regional Person');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect.poll(() => fixture.commits.length).toBe(1);
  const saved = fixture.commits[0].writes.find(write => write.collection === 'locations')!.data!;
  expect(saved.regionalManagerId).toBe('regional-person');
  expect(saved.regionalManagerName).toBe('Renamed Regional Person');
  expect(saved.storeManagerId).toBe('missing-person');
  expect(saved.assistantStoreManagerNames).toEqual(['Legacy Assistant']);
  expect(saved.keyHolderNames).toEqual(['Legacy Key Holder']);
});

test('Staffing parity ambiguous lifecycle is visible and unrelated Person save preserves both aliases', async ({ page }) => {
  const fixture = await prepareStaffingParity(page);
  await page.goto(`${origin}/people`); await restore(page, true);
  await page.getByRole('button', { name: /Ambiguous Lifecycle Person/ }).click();
  await expect(page.getByText('Needs lifecycle review', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Person' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Active Status', { exact: true })).toHaveValue('Unknown');
  await dialog.getByLabel('Department', { exact: true }).fill('Synthetic Department');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect.poll(() => fixture.commits.length).toBe(1);
  const saved = fixture.commits[0].writes[0].data!;
  expect(saved.status).toBe('Active');
  expect(saved.activeStatus).toBe(false);
});

test('Staffing parity unrelated Regional Person save does not refresh stale Location copies', async ({ page }) => {
  const fixture = await prepareStaffingParity(page);
  await page.goto(`${origin}/people`); await restore(page, true);
  await page.getByRole('button', { name: /Canonical Regional Person/ }).click();
  await page.getByRole('button', { name: 'Edit Person' }).click();
  await page.getByRole('dialog').getByLabel('Department', { exact: true }).fill('Synthetic Department');
  await page.getByRole('button', { name: 'Save Person' }).click();
  await expect.poll(() => fixture.commits.length).toBe(1);
  expect(fixture.commits[0].writes.map(write => write.collection)).toEqual(['people']);
  expect(fixture.seed.locations[0].regionalManagerName).toBe('Stale Regional Name');
});

test('Personnel scopes UI preserves location-only default and requires explicit reviewed grant change', async ({ page }) => {
  await prepare(page, 'System Administrator');
  await page.setViewportSize({ width: 390, height: 850 });
  const client = { id: 'synthetic-client', name: 'Synthetic Consumer', status: 'Active', scopes: ['locations:read'], tokenVersions: [], createdAt: '2026-10-04T11:00:00.000Z', updatedAt: '2026-10-04T11:00:00.000Z' };
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/api-clients**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { clients: [client] } });
    const body = route.request().postDataJSON(); requests.push(body);
    expect(new URL(route.request().url()).pathname).toBe('/api/api-clients/synthetic-client/scopes');
    return route.fulfill({ json: { ...client, scopes: body.scopes } });
  });
  await page.goto(`${origin}/admin`); await restore(page, true);
  await page.getByRole('button', { name: 'Directory API', exact: true }).click();
  const newGrants = page.getByRole('group', { name: 'New client grants' });
  await expect(newGrants.getByLabel('locations:read')).toBeChecked();
  await expect(newGrants.getByLabel('personnel:read')).not.toBeChecked();
  await expect(newGrants.getByLabel('staffing:read')).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'Shareable OpenAPI' })).toHaveAttribute('href', '/api/openapi.json');
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Edit grants' }).click();
  const edits = page.getByRole('group', { name: 'Grants for Synthetic Consumer' });
  await edits.getByLabel('personnel:read').check();
  await edits.getByLabel('staffing:read').check();
  await page.getByRole('button', { name: 'Review grant change' }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm explicit grants' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ scopes: ['locations:read', 'personnel:read', 'staffing:read'], expectedScopes: ['locations:read'] });
});

test('District leadership grants stay opt-in and work-email dependency requires explicit review without token rotation', async ({ page }, testInfo) => {
  await prepare(page, 'System Administrator');
  await page.setViewportSize({ width: 390, height: 850 });
  const client = { id: 'synthetic-leadership-client', name: 'Synthetic Leadership Consumer', status: 'Active', scopes: ['locations:read'], tokenVersions: [], createdAt: '2026-10-22T15:00:00.000Z', updatedAt: '2026-10-22T15:00:00.000Z' };
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/api-clients**', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { clients: [client] } });
    expect(new URL(route.request().url()).pathname).toBe('/api/api-clients/synthetic-leadership-client/scopes');
    const body = route.request().postDataJSON(); requests.push(body);
    return route.fulfill({ json: { ...client, scopes: body.scopes } });
  });
  await page.goto(origin + '/admin'); await restore(page, true);
  await page.getByRole('button', { name: 'Directory API', exact: true }).click();
  const fresh = page.getByRole('group', { name: 'New client grants' });
  await expect(page.getByText('Client ID: synthetic-leadership-client', { exact: true })).toBeVisible();
  await expect(fresh.getByLabel('district-leadership:read', { exact: true })).not.toBeChecked();
  await expect(fresh.getByLabel('district-leadership:contacts:read', { exact: true })).not.toBeChecked();
  await expect(page.getByRole('link', { name: 'District leadership guide', exact: true })).toHaveAttribute('href', '/api/leadership-guide');
  await expect(page.getByRole('link', { name: 'V3 OpenAPI', exact: true })).toHaveAttribute('href', '/api/leadership-openapi.json');
  await page.getByRole('button', { name: 'Edit grants', exact: true }).click();
  const edits = page.getByRole('group', { name: 'Grants for Synthetic Leadership Consumer' });
  await edits.getByLabel('district-leadership:contacts:read', { exact: true }).check();
  await expect(edits.getByRole('alert')).toContainText('Select both grants');
  await expect(page.getByRole('button', { name: 'Review grant change' })).toBeDisabled();
  expect(requests).toHaveLength(0);
  await edits.getByLabel('district-leadership:read', { exact: true }).check();
  await page.getByRole('button', { name: 'Review grant change' }).click();
  await expect(page.getByRole('alertdialog')).toContainText('district-leadership:contacts:read');
  await expect(page.getByRole('alertdialog')).toContainText('Client synthetic-leadership-client');
  await expect(page.getByRole('alertdialog')).toContainText('tokens are not rotated');
  expect(requests).toHaveLength(0);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm explicit grants' }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ scopes: ['locations:read', 'district-leadership:read', 'district-leadership:contacts:read'], expectedScopes: ['locations:read'] });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('heading', { name: 'API Clients', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('leadership-settings-mobile.png'), fullPage: true });
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

test('Hours correction selected-store initialization/reset prevents unchanged submission and submits real baseline', async ({ page }) => {
  const f = await prepareHoursCorrection(page, { role: 'Viewer' });
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Change Category').selectOption('Standard Hours Adjustment');
  const mondayOpen = dialog.locator('input[type=time]').first();
  await expect(mondayOpen).toHaveValue('08:00');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('would not change');
  expect(f.commits).toHaveLength(0);
  await mondayOpen.fill('09:30');
  await dialog.getByLabel('Target Location').selectOption('loc-2');
  await expect(mondayOpen).toHaveValue('11:00');
  await dialog.getByLabel('Target Location').selectOption('loc-3');
  await expect(mondayOpen).toHaveValue('10:00');
  await dialog.getByLabel('Target Location').selectOption('loc-1');
  await expect(mondayOpen).toHaveValue('08:00');
  await mondayOpen.fill('09:00');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog).toHaveCount(0);
  expect(f.commits).toHaveLength(1);
  const data = f.commits[0].writes[0].data;
  expect(data.targetId).toBe('loc-1');
  expect(data.currentSnapshot).toEqual({ standardHours: f.locations[0].standardHours, hoursMode: f.locations[0].hoursMode, hoursTemplateId: f.locations[0].hoursTemplateId });
  expect(data.requestedChanges).toEqual({ standardHours: { ...f.locations[0].standardHours, monday: { ...f.locations[0].standardHours!.monday, open: '09:00' } } });
});

test('Hours correction initializes from explicitly selected store instead of the first store', async ({ page }) => {
  const f = await prepareHoursCorrection(page);
  await page.goto(`${origin}/requests/new?locationId=loc-2`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Change Category').selectOption('Standard Hours Adjustment');
  await expect(dialog.getByLabel('Target Location')).toHaveValue('loc-2');
  await expect(dialog.locator('input[type=time]').first()).toHaveValue('11:00');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('would not change');
  expect(f.commits).toHaveLength(0);
});

test('Hours correction historical no-op has distinct live/baseline labels and cannot approve but can reject', async ({ page }) => {
  const f = await prepareHoursCorrection(page, { request: 'noop' });
  await page.goto(`${origin}/requests`); await restore(page, true);
  await expect(page.getByText('SUBMISSION BASELINE (HISTORICAL)', { exact: true })).toBeVisible();
  await expect(page.getByText('CURRENT AUTHORITATIVE VALUE (LOADED RECORD)', { exact: true })).toBeVisible();
  await expect(page.getByText(/No change to apply:/)).toBeVisible();
  await expect(page.getByText('07:00 - 20:00', { exact: true })).toBeVisible();
  await expect(page.getByText('08:00 - 20:00', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Approve & Apply' })).toBeDisabled();
  expect(f.commits).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Submit New Request' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect.poll(() => f.commits.length).toBe(1);
  expect(f.commits[0].writes).toHaveLength(1);
  expect(f.commits[0].writes[0].data.status).toBe('Rejected');
});

for (const action of ['Approve & Apply', 'Reject'] as const) {
  test(`Request review ${action} waits for commit, locks duplicate actions and retains notes`, async ({ page }) => {
    const f = await prepareHoursCorrection(page, { request: 'changed' });
    if (action === 'Approve & Apply') await page.setViewportSize({ width: 390, height: 844 });
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/directory/commit', async route => {
      const body = route.request().postDataJSON(); f.commits.push(body);
      await gate; return route.fulfill({ json: commitResponseFor(body) });
    });
    await page.goto(`${origin}/requests`); await restore(page, true);
    const notes = page.getByPlaceholder('Optional reviewer notes...');
    await notes.fill('Synthetic reviewer context');
    await page.getByRole('button', { name: action, exact: true }).dblclick();
    try {
      await expect.poll(() => f.commits.length).toBe(1);
      await expect(page.getByText('Pending Review', { exact: true })).toBeVisible();
      for (const name of ['Approve & Apply', 'Reject']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
      await expect(notes).toHaveValue('Synthetic reviewer context'); await expect(notes).toBeDisabled();
      expect(f.mailEvents()).toBe(0);
      await expect(page.getByText('08:00 - 20:00', { exact: true })).toHaveCount(2);
      if (action === 'Approve & Apply') await page.screenshot({ path: 'test-results/request-review-mobile.png', fullPage: true });
    } finally { release(); }
    await expect(page.getByRole('button', { name: 'Approve & Apply' })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: /saved for/ }).first()).toBeVisible();
    expect(f.commits).toHaveLength(1);
    await expect.poll(() => f.mailEvents()).toBe(1);
  });
}

test('Request review lost response requires reload and reconciles the saved request without retry', async ({ page }) => {
  const f = await prepareHoursCorrection(page, { request: 'changed' });
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); f.commits.push(body);
    Object.assign(f.requests[0], body.writes.find((write: any) => write.collection === 'requests').data, { version: 4 });
    Object.assign(f.locations[0], body.writes.find((write: any) => write.collection === 'locations').data, { version: 5 });
    return route.abort('failed');
  });
  await page.goto(`${origin}/requests`); await restore(page, true);
  await page.getByPlaceholder('Optional reviewer notes...').fill('Preserved until explicit reload');
  await page.getByRole('button', { name: 'Approve & Apply' }).click();
  await expect(page.getByRole('alert')).toContainText('do not retry blindly');
  await expect(page.getByPlaceholder('Optional reviewer notes...')).toHaveValue('Preserved until explicit reload');
  await expect(page.getByRole('button', { name: 'Approve & Apply' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
  expect(f.commits).toHaveLength(1); expect(f.mailEvents()).toBe(0);
  await page.getByRole('button', { name: 'Reload saved requests' }).click(); await restore(page, true);
  await expect(page.locator('span').filter({ hasText: /^\s*Approved\s*$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve & Apply' })).toHaveCount(0);
  expect(f.commits).toHaveLength(1);
});

test('Request submission recovery survives reload and reconciles an already reviewed record without duplicate side effects', async ({ page }) => {
  const f = await prepareHoursCorrection(page);
  let original: any;
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); f.commits.push(body);
    if (!original) { original = body; f.requests.push({ ...body.writes[0].data, status: 'Rejected', version: 2 }); return route.abort('failed'); }
    expect(body).toEqual(original);
    return route.fulfill({ json: { replayed: true, records: [{ collection: 'requests', id: original.writes[0].id, operation: 'set', data: f.requests[0] }] } });
  });
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  let dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill('2135550102');
  await dialog.locator('textarea').fill('Preserve this original note');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Recover this exact submission');
  await expect(dialog.getByLabel('Target Location')).toBeDisabled();
  await page.reload(); await restore(page, true); dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Preserve this original note');
  await page.screenshot({ path: 'test-results/request-submission-recovery.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/request-submission-recovery-mobile.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Close Submit Store Correction Request' }).click();
  await page.getByRole('button', { name: 'Submit New Request' }).click();
  await expect(page.getByRole('dialog')).toContainText('Preserve this original note');
  await dialog.getByRole('button', { name: 'Recover saved submission' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('span').filter({ hasText: /^\s*Rejected\s*$/ })).toBeVisible();
  expect(f.commits).toHaveLength(2); expect(f.mailEvents()).toBe(0);
  await page.getByRole('button', { name: 'Submit New Request' }).click();
  await expect(page.getByRole('button', { name: 'Recover saved submission' })).toHaveCount(0);
});

test('Request submission safe cancellation restores the draft before a replacement gets a new identity', async ({ page }) => {
  const f = await prepareHoursCorrection(page); let sealed: any;
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); f.commits.push(body);
    return f.commits.length === 1 ? route.abort('failed') : route.fulfill({ json: commitResponseFor(body) });
  });
  await page.route('**/api/directory/submissions/cancel', route => { sealed = route.request().postDataJSON().write; return route.fulfill({ json: { records: [], cancelled: true } }); });
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill('2135550102 ext. 23'); await dialog.locator('textarea').fill('Keep this draft');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Recover this exact submission');
  await dialog.getByRole('button', { name: 'Check saved state / cancel if not saved' }).click();
  await expect(dialog.getByRole('alert')).toContainText('safely cancelled');
  expect(sealed).toEqual(f.commits[0].writes[0]);
  await expect(dialog.getByLabel('Target Location')).toBeEnabled();
  await expect(dialog.locator('textarea')).toHaveValue('Keep this draft');
  await expect(dialog.getByPlaceholder('(555) 000-0000')).toHaveValue('(213) 555-0102 ext. 23');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click(); await expect(dialog).toHaveCount(0);
  expect(f.commits[1].writes[0].id).not.toBe(f.commits[0].writes[0].id);
  expect(f.commits[1].writes[0].data.requestedChanges).toEqual(f.commits[0].writes[0].data.requestedChanges);
});

test('Request submission validates normalized phone no-ops before sending', async ({ page }) => {
  const f = await prepareHoursCorrection(page);
  f.locations[0].phone = '+12135550101';
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill(f.locations[0].phone);
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No change'); expect(f.commits).toHaveLength(0);
});

test('Request submission blocked storage keeps the editable draft and sends nothing', async ({ page }) => {
  const f = await prepareHoursCorrection(page);
  await page.addInitScript(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('directory-request-submission:')) throw new Error('Synthetic quota failure'); return original.call(this, key, value); }; });
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill('2135550102'); await dialog.locator('textarea').fill('Keep despite storage failure');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No new request was sent');
  await expect(dialog.getByLabel('Target Location')).toBeEnabled();
  await expect(dialog.locator('textarea')).toHaveValue('Keep despite storage failure');
  await expect(dialog.getByRole('button', { name: 'Recover saved submission' })).toHaveCount(0);
  expect(f.commits).toHaveLength(0);
});

test('Request submission confirmed cancellation restores the draft even when browser cleanup fails', async ({ page }) => {
  await prepareHoursCorrection(page);
  await page.addInitScript(() => { const original = Storage.prototype.removeItem; Storage.prototype.removeItem = function(key) { if (key.startsWith('directory-request-submission:')) throw new Error('Synthetic removal failure'); return original.call(this, key); }; });
  await page.route('**/api/directory/commit', route => route.abort('failed'));
  await page.route('**/api/directory/submissions/cancel', route => route.fulfill({ json: { records: [], cancelled: true } }));
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill('2135550102'); await dialog.locator('textarea').fill('Keep despite cleanup failure');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Recover this exact submission');
  await dialog.getByRole('button', { name: 'Check saved state / cancel if not saved' }).click();
  await expect(dialog.getByRole('alert')).toContainText('safely cancelled');
  await expect(dialog.getByLabel('Target Location')).toBeEnabled();
  await expect(dialog.locator('textarea')).toHaveValue('Keep despite cleanup failure');
});

test('Request submission holds its draft and close controls until persistence finishes', async ({ page }) => {
  const f = await prepareHoursCorrection(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/directory/commit', async route => {
    const body = route.request().postDataJSON(); f.commits.push(body);
    await gate; return route.fulfill({ json: commitResponseFor(body) });
  });
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill('2135550102');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  try {
    await expect.poll(() => f.commits.length).toBe(1);
    await expect(dialog.getByLabel('Target Location')).toBeDisabled();
    await expect(dialog.getByLabel('Change Category')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
    expect(f.mailEvents()).toBe(0);
  } finally { release(); }
  await expect(dialog).toHaveCount(0); expect(f.commits).toHaveLength(1);
});

test('Request proposals reset all fields and notes when the target or category changes', async ({ page }) => {
  await prepareHoursCorrection(page);
  await page.goto(`${origin}/requests/new`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('(555) 000-0000').fill('2135550102');
  await dialog.locator('textarea').fill('Notes for the first store only');
  await dialog.getByLabel('Target Location').selectOption('loc-2');
  await expect(dialog.getByPlaceholder('(555) 000-0000')).toHaveValue('');
  await expect(dialog.locator('textarea')).toHaveValue('');
  await dialog.getByLabel('Change Category').selectOption('Other Store Info Update');
  await dialog.getByRole('button', { name: 'Clear inbox', exact: true }).click();
  await dialog.locator('textarea').fill('Inbox-specific note');
  await dialog.getByLabel('Change Category').selectOption('Phone Number Correction');
  await dialog.getByLabel('Change Category').selectOption('Other Store Info Update');
  await expect(dialog.getByRole('button', { name: 'Undo clear' })).toHaveCount(0);
  await expect(dialog.locator('input[type=email]')).toHaveValue('');
  await expect(dialog.locator('textarea')).toHaveValue('');
});

test('Hours correction changed-hours approval uses custom mode and retains staffing IDs and versions', async ({ page }) => {
  const f = await prepareHoursCorrection(page, { request: 'changed' });
  await page.goto(`${origin}/requests`); await restore(page, true);
  await page.getByRole('button', { name: 'Approve & Apply' }).click();
  await expect(page.getByRole('button', { name: 'Approve & Apply' })).toHaveCount(0);
  expect(f.commits).toHaveLength(1);
  const location = f.commits[0].writes.find(w => w.collection === 'locations')!;
  expect(location.expectedVersion).toBe(4);
  expect(f.commits[0].writes.find(w => w.collection === 'requests')!.expectedVersion).toBe(3);
  expect(location.data.standardHours).toEqual(f.requests[0].requestedChanges.standardHours);
  expect(location.data.hoursMode).toBe('custom');
  expect(Object.hasOwn(location.data, 'hoursTemplateId')).toBe(false);
  for (const field of ['storeManagerId', 'regionalManagerId', 'keyHolderIds']) expect(location.data[field]).toEqual(Reflect.get(f.locations[0], field));
});

for (const request of ['stale', 'missing'] as const) {
  test(`Hours correction ${request} request cannot approve and retains reject/replacement`, async ({ page }) => {
    const f = await prepareHoursCorrection(page, { request });
    await page.goto(`${origin}/requests`); await restore(page, true);
    await expect(page.getByRole('button', { name: 'Approve & Apply' })).toBeDisabled();
    await expect(page.getByText(request === 'stale' ? /changed since submission/ : /target is missing/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Submit New Request' })).toBeEnabled();
    expect(f.commits).toHaveLength(0);
  });
}

test('Hours correction concurrent server conflict rolls back approval without notification', async ({ page }) => {
  const f = await prepareHoursCorrection(page, { request: 'changed', conflict: true });
  await page.goto(`${origin}/requests`); await restore(page, true);
  await page.getByRole('button', { name: 'Approve & Apply' }).click();
  await expect(page.getByRole('alert')).toContainText('Hours changed since submission. Reload and submit a replacement.');
  await expect(page.getByRole('button', { name: 'Approve & Apply' })).toBeVisible();
  await expect(page.getByText('08:00 - 20:00', { exact: true })).toHaveCount(2);
  expect(f.commits).toHaveLength(1);
  expect(f.mailEvents()).toBe(0);
});

test('Hours correction failed submission stays open with draft/error and no phantom request', async ({ page }) => {
  const f = await prepareHoursCorrection(page, { role: 'Viewer', conflict: true });
  await page.goto(`${origin}/requests/new?locationId=loc-1`); await restore(page, true);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Change Category').selectOption('Standard Hours Adjustment');
  await dialog.locator('input[type=time]').first().fill('09:00');
  await dialog.getByRole('button', { name: 'Submit for Approval' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Hours changed since submission');
  await expect(dialog.locator('input[type=time]').first()).toHaveValue('09:00');
  expect(f.mailEvents()).toBe(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Discard request', exact: true }).click();
  await expect(page.getByText('No matching change requests')).toBeVisible();
});

for (const role of ['Viewer', 'Editor']) {
  test(`Hours correction ${role} cannot approve or reject`, async ({ page }) => {
    const f = await prepareHoursCorrection(page, { role, request: 'changed' });
    await page.goto(`${origin}/requests`); await restore(page, true);
    await expect(page.getByText('SUBMISSION BASELINE (HISTORICAL)', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve & Apply' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toHaveCount(0);
    expect(f.commits).toHaveLength(0);
  });
}

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
