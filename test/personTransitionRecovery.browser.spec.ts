import { test, expect, type Page } from '@playwright/test';

// Blank isolated same-origin pages: import only the unwired module, never the app/Firebase/data.
const origin = process.env.TRANSITION_RECOVERY_TEST_ORIGIN || 'http://127.0.0.1:3017';
const marker = { schemaVersion: 1, operationId: '11111111-1111-4111-8111-111111111111', personId: 'synthetic-person', commandDigest: 'a'.repeat(64) };
async function open(page: Page, uid = 'synthetic-browser-admin') {
  await page.route('**/__recovery_test__', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic recovery module test</title>' }));
  await page.goto(origin + '/__recovery_test__');
  await bind(page, uid);
}
async function bind(page: Page, uid: string) {
  await page.evaluate(async uid => {
    const modulePath = '/src/lib/personTransitionRecovery.ts';
    const module = await import(modulePath);
    const state: any = { status: 'authorized', user: { uid, getIdToken: async () => { throw new Error('No Firebase request is permitted'); } }, account: { uid, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide' }, error: '', generation: 0 };
    (window as any).recovery = { module, state, vault: await module.openTransitionRecoveryVault(localStorage, () => state, navigator.locks, crypto.subtle, () => state.generation) };
  }, uid);
}

test('real browser Web Locks preserve concurrent-tab markers and reload, then explicit sign-out cleanup clears both tabs', async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage(); await open(a); await open(b);
  const second = { ...marker, operationId: '22222222-2222-4222-8222-222222222222' };
  await Promise.all([a.evaluate(m => (window as any).recovery.vault.persist(m), marker), b.evaluate(m => (window as any).recovery.vault.persist(m), second)]);
  expect(await a.evaluate(() => (window as any).recovery.vault.read().length)).toBe(2);
  expect(await b.evaluate(() => (window as any).recovery.vault.read().length)).toBe(2);
  await a.reload(); await bind(a, 'synthetic-browser-admin');
  expect(await a.evaluate(() => (window as any).recovery.vault.read().length)).toBe(2);
  const raw = await a.evaluate(() => JSON.stringify(localStorage)); expect(raw).not.toMatch(/synthetic-browser-admin|ptv1\.|email|reason|idToken/);
  await a.evaluate(async () => {
    const modulePath = '/src/lib/authSession.ts'; const { clearProtectedStorage } = await import(modulePath);
    localStorage.setItem('app-theme', 'dark'); (window as any).recovery.state.status = 'signed-out'; clearProtectedStorage(localStorage);
  });
  expect(await b.evaluate(() => (window as any).recovery.vault.read())).toEqual([]);
  expect(await b.evaluate(() => localStorage.getItem('app-theme'))).toBe('dark');
});

test('real browser actor namespace and permission loss deny stale vault access without erasing unresolved markers', async ({ context }) => {
  const a = await context.newPage(), b = await context.newPage(); await open(a); await a.evaluate(m => (window as any).recovery.vault.persist(m), marker);
  await open(b, 'synthetic-other-admin'); expect(await b.evaluate(() => (window as any).recovery.vault.read())).toEqual([]);
  expect(await a.evaluate(() => { (window as any).recovery.state.status = 'denied'; try { (window as any).recovery.vault.read(); return false; } catch { return true; } })).toBe(true);
  await bind(a, 'synthetic-browser-admin'); expect(await a.evaluate(() => (window as any).recovery.vault.read())).toEqual([marker]);
  expect(await a.evaluate(() => { (window as any).recovery.state.generation++; try { (window as any).recovery.vault.read(); return false; } catch { return true; } })).toBe(true);
});
