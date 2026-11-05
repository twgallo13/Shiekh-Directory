/**
 * D1 / D3 / D4 (2026-11-04): role linking for password users, approved-list mode, admin sign-in links.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'crypto';
import { seedTestUsers, getTestDb } from './testHelpers';

const API = process.env.API_BASE || `http://localhost:${process.env.PORT || '3001'}`;
const rid = `d1-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const db = getTestDb();

function me(uid: string, email: string, provider: 'google' | 'password', verified = false) {
  const t = provider === 'google' ? `test-token-${uid}:${email}:google` : `test-token-${uid}:${email}:password${verified ? ':verified' : ''}`;
  return fetch(`${API}/api/app/users/me`, { headers: { Authorization: `Bearer ${t}` } });
}
async function seedPre(id: string, email: string, role: string, extra: Record<string, unknown> = {}) {
  await db.collection('users').doc(id).set({ id, email, displayName: `Pre ${role}`, role, status: 'active', createdAt: 'x', updatedAt: 'x', version: 3, ...extra });
}

describe('D1 role linking (/users/me)', () => {
  before(async () => { await seedTestUsers(); await db.collection('settings').doc('signIn').delete().catch(() => {}); });

  it('verified password user is linked to Admin-added record and keeps role + data', async () => {
    const email = `pw-ver-${rid}@shiekhshoes.org`; const pre = `user-pre1-${rid}`; const uid = `uid1-${rid}`;
    await seedPre(pre, email, 'Steward', { personId: 'p-123' });
    const res = await me(uid, email, 'password', true);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.data.role, 'Steward');
    const linked = (await db.collection('users').doc(uid).get()).data()!;
    assert.strictEqual(linked.personId, 'p-123');
    assert.strictEqual(linked.displayName, 'Pre Steward');
    assert.strictEqual(linked.linkedFromUserId, pre);
    assert.strictEqual((await db.collection('users').doc(pre).get()).exists, false, 'placeholder moved out of users');
    const arch = await db.collection('usersArchive').doc(pre).get();
    assert.ok(arch.exists, 'placeholder archived');
    assert.strictEqual(arch.data()!.linkedToUid, uid);
    // second call is stable
    const again = await me(uid, email, 'password', true);
    assert.strictEqual((await again.json()).data.role, 'Steward');
  });

  it('role change by Admin after linking is reflected', async () => {
    const email = `pw-chg-${rid}@shiekhshoes.org`; const uid = `uid2-${rid}`;
    await seedPre(`user-pre2-${rid}`, email, 'Steward');
    await me(uid, email, 'password', true);
    await db.collection('users').doc(uid).update({ role: 'Leader' });
    const res = await me(uid, email, 'password', true);
    assert.strictEqual((await res.json()).data.role, 'Leader');
  });

  it('unverified password user not on approved list is NOT linked and gets a clear error (not Viewer)', async () => {
    const email = `pw-unv-${rid}@shiekhshoes.org`; const pre = `user-pre3-${rid}`; const uid = `uid3-${rid}`;
    await seedPre(pre, email, 'Admin');
    const res = await me(uid, email, 'password', false);
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).error.code, 'email_not_verified');
    assert.ok((await db.collection('users').doc(pre).get()).exists, 'placeholder untouched');
    assert.strictEqual((await db.collection('users').doc(uid).get()).exists, false);
  });

  it('unverified password user on approved list is linked', async () => {
    const email = `pw-al-${rid}@shiekhshoes.org`; const uid = `uid4-${rid}`;
    await seedPre(`user-pre4-${rid}`, email, 'Leader');
    await db.collection('signInAllowList').doc(email).set({ email, addedBy: 't', addedByEmail: 't', addedAt: 'x' });
    const res = await me(uid, email, 'password', false);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).data.role, 'Leader');
  });

  it('email match is exact lowercase (mixed-case sign-in email still matches lowercase record)', async () => {
    const email = `pw-case-${rid}@shiekhshoes.org`; const uid = `uid5-${rid}`;
    await seedPre(`user-pre5-${rid}`, email, 'Steward');
    const res = await me(uid, email.toUpperCase().replace('@SHIEKHSHOES.ORG', '@shiekhshoes.org'), 'password', true);
    assert.strictEqual((await res.json()).data.role, 'Steward');
    const other = await me(`uid5b-${rid}`, `x${email}`, 'password', true);
    assert.strictEqual(other.status, 404, 'near-match email must not link');
  });

  it('password user with no record gets 404 user_not_found (no auto Viewer)', async () => {
    const res = await me(`uid6-${rid}`, `none-${rid}@shiekhshoes.org`, 'password', true);
    assert.strictEqual(res.status, 404);
    assert.strictEqual((await res.json()).error.code, 'user_not_found');
  });

  it('password user from a non-company domain is rejected', async () => {
    const res = await me(`uid7-${rid}`, `x-${rid}@gmail.com`, 'password', true);
    assert.strictEqual(res.status, 403);
  });

  it('existing password user with own record keeps working regardless of domain', async () => {
    const uid = `uid12-${rid}`; const email = `qa-${rid}@shiekh.test`;
    await db.collection('users').doc(uid).set({ id: uid, email, displayName: 'QA', role: 'Viewer', status: 'active', createdAt: 'x', updatedAt: 'x', version: 1 });
    const res = await me(uid, email, 'password', false);
    assert.strictEqual(res.status, 200);
    assert.strictEqual((await res.json()).data.role, 'Viewer');
  });

  it('Google user still links to Admin-added record and keeps role', async () => {
    const email = `g-${rid}@shiekhshoes.org`; const uid = `uid8-${rid}`;
    await seedPre(`user-pre8-${rid}`, email, 'Steward');
    const res = await me(uid, email, 'google');
    assert.strictEqual((await res.json()).data.role, 'Steward');
  });

  it('two records with the same email: refuse to link', async () => {
    const email = `dup-${rid}@shiekhshoes.org`;
    await seedPre(`user-pre9a-${rid}`, email, 'Viewer');
    await seedPre(`user-pre9b-${rid}`, email, 'Admin');
    const res = await me(`uid9-${rid}`, email, 'password', true);
    assert.strictEqual(res.status, 409);
  });
});

describe('D4 permanent approved list', () => {
  it('enabled with no end date restricts new unlisted Google users', async () => {
    await db.collection('settings').doc('signIn').set({ enabled: true, restrictedUntil: null });
    try {
      const res = await me(`uid10-${rid}`, `nolist-${rid}@shiekhshoes.org`, 'google');
      assert.strictEqual(res.status, 403);
      assert.strictEqual((await res.json()).error.code, 'signin_restricted');
      const email = `listed-${rid}@shiekhshoes.org`;
      await db.collection('signInAllowList').doc(email).set({ email, addedBy: 't', addedByEmail: 't', addedAt: 'x' });
      const ok = await me(`uid11-${rid}`, email, 'google');
      assert.strictEqual(ok.status, 200);
    } finally {
      await db.collection('settings').doc('signIn').delete();
    }
  });

  it('Admin Add User also adds the email to the approved list', async () => {
    const email = `added-${rid}@shiekhshoes.org`;
    const res = await fetch(`${API}/api/app/admin/users`, {
      method: 'POST', headers: { Authorization: 'Bearer test-token-admin', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, displayName: 'Added', role: 'Viewer' }),
    });
    assert.strictEqual(res.status, 201);
    assert.ok((await db.collection('signInAllowList').doc(email).get()).exists);
  });
});

describe('D3 admin sign-in link', () => {
  it('non-admin cannot create a link', async () => {
    const res = await fetch(`${API}/api/app/admin/users/viewer/signin-link`, { method: 'POST', headers: { Authorization: 'Bearer test-token-viewer' } });
    assert.strictEqual(res.status, 403);
  });

  it('admin gets a link; only its hash is stored, with expiry <= 24h, and it is audited', async () => {
    const id = `user-link-${rid}`; const email = `link-${rid}@shiekhshoes.org`;
    await seedPre(id, email, 'Viewer');
    const res = await fetch(`${API}/api/app/admin/users/${id}/signin-link`, { method: 'POST', headers: { Authorization: 'Bearer test-token-admin' } });
    assert.strictEqual(res.status, 201, await res.clone().text());
    const body = await res.json();
    assert.ok(typeof body.link === 'string' && body.link.length > 20);
    assert.ok(new Date(body.expiresAt).getTime() - Date.now() <= 24 * 3600 * 1000);
    const snap = await db.collection('adminSignInLinks').where('userId', '==', id).get();
    assert.strictEqual(snap.size, 1);
    const doc = snap.docs[0].data();
    assert.strictEqual(doc.linkHash, createHash('sha256').update(body.link).digest('hex'));
    assert.ok(!JSON.stringify(doc).includes(body.link), 'plaintext link must not be stored');
    const audit = await db.collection('auditLog').where('entityId', '==', id).get();
    assert.ok(audit.docs.some(d => JSON.stringify(d.data().changes).includes('signInLink')));
    assert.ok(!audit.docs.some(d => JSON.stringify(d.data()).includes(body.link)), 'link not in audit');
  });
});
