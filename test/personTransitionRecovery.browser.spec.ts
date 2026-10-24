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

test('real browser controller survives a lost response and fresh-controller restart without duplicating the command', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const controllerPath = '/src/lib/personTransitionController.ts', intentPath = '/src/lib/personTransitionIntent.ts';
    const { createPersonTransitionController } = await import(controllerPath), { canonicalTransitionJSON, normalizePersonTransitionIntent } = await import(intentPath);
    const uid = 'synthetic-browser-admin', personId = 'synthetic-person', now = Date.now(), time = new Date(now).toISOString();
    const b64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const sha = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(v => v.toString(16).padStart(2, '0')).join('');
    const intent = normalizePersonTransitionIntent({ schemaVersion: 1, personId, positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'Synthetic browser review', responsibilities: [], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] });
    const claims = { actorUid: uid, personId, intentHash: await sha(canonicalTransitionJSON(intent)), stateHash: 'a'.repeat(64), planHash: 'b'.repeat(64), issuedAt: now, expiresAt: now + 300_000, schemaVersion: 1, audience: 'directory-person-transition-review-v1', keyId: 'synthetic' };
    const payload = b64(new TextEncoder().encode(JSON.stringify(claims)).buffer);
    const key = await crypto.subtle.importKey('raw', new Uint8Array(32).fill(0x76), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const envelope = `ptv1.${payload}.${b64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`directory-person-transition-review-v1.${payload}`)))}`;
    let stored: any = null, commits = 0, refreshes = 0;
    const base = (marker: any, state: string) => ({ ...marker, state, canCommit: false, createdAt: time, preparedAt: time, resolvedAt: state === 'committed' ? time : null, auditId: null, changes: [] });
    const port = {
      list: async () => ({ schemaVersion: 1, operations: stored?.state === 'prepared' ? [stored] : [], complete: true, canCommit: false }),
      status: async () => stored,
      prepare: async (body: any) => {
        const marker = JSON.parse(Object.values(localStorage).find((v: any) => JSON.parse(v).operationId === body.operationId) as string);
        stored = base(marker, 'prepared'); return stored;
      },
      commit: async () => { commits++; stored = { ...stored, state: 'committed', resolvedAt: time, auditId: 'aud-person-transition-' + await sha(JSON.stringify(['directory-person-transition-operation-v1', uid, stored.operationId])), changes: [{ collection: 'people', id: personId, version: 2 }] }; throw new Error('Synthetic lost response'); },
      cancel: async () => { throw new Error('Not expected'); },
    };
    const state = (window as any).recovery.state;
    const options = { personId, storage: localStorage, session: () => state, generation: () => state.generation, locks: navigator.locks, subtle: crypto.subtle, port, admissionEnabled: () => true, newOperationId: () => crypto.randomUUID(), refreshSavedDirectory: async () => { refreshes++; } };
    const original = await createPersonTransitionController(options); await original.recover(); await original.stageReviewed(intent, envelope); await original.prepare();
    try { await original.commit(); } catch { /* Outcome remains unknown until the receipt is reconciled. */ }
    const uncertain = original.snapshot().phase, secretStored = JSON.stringify(localStorage).includes('ptv1.'); original.dispose();
    const restored = await createPersonTransitionController(options); await restored.recover();
    return { uncertain, secretStored, phase: restored.snapshot().phase, commits, refreshes, markerCount: Object.keys(localStorage).filter(k => k.startsWith('shiekh_person_transition_v1:')).length };
  });
  expect(result).toEqual({ uncertain: 'outcome-unknown', secretStored: false, phase: 'saved', commits: 1, refreshes: 1, markerCount: 0 });
});
