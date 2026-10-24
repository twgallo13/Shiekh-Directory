import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshTransitionSavedState, parseTransitionDirectory } from '../src/lib/transitionSavedRefresh';
import { clearLegacyDirectoryCaches } from '../src/lib/personTransitionRecovery';
import { clearProtectedStorage } from '../src/lib/authSession';
const body = () => ({ serverNow: new Date().toISOString(), locations: [{ id: 'store', storeNumber: '007', name: 'Store' }], people: [{ id: 'subject', fullName: 'Subject', version: 1 }], users: [], requests: [], auditLogs: [], hoursTemplates: [], corporateHolidays: [], emailTemplates: [], notificationRules: [], outboxLogs: [], sopRunbooks: [], regions: [], districts: [] });
function fixture() {
  const session: any = { status: 'authorized', user: { uid: 'admin' }, account: { uid: 'admin', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide' } };
  const fence = { epoch: 1, pending: 0 }; let generation = 1, applied = 0, read: () => Promise<unknown> = async () => body();
  return { session, fence, generation: () => { generation++; }, applied: () => applied, read: (fn: typeof read) => { read = fn; }, options: { session: () => session, generation: () => generation, fence: () => fence, read: () => read(), apply: () => { applied++; } } };
}
test('strict saved refresh applies complete current state once and preserves zero-padded store identity', async () => { const f = fixture(); await refreshTransitionSavedState(f.options); assert.equal(f.applied(), 1); assert.equal(parseTransitionDirectory(body()).locations[0].storeNumber, '007'); });
test('failed/incomplete/duplicate/invalid-version refresh rejects without applying', async () => {
  for (const change of [(b: any) => { delete b.people; }, (b: any) => { b.people.push(b.people[0]); }, (b: any) => { b.people[0].version = -1; }, (b: any) => { b.serverNow = 'invalid'; }]) { const f = fixture(), b = body(); change(b); f.read(async () => b); await assert.rejects(refreshTransitionSavedState(f.options)); assert.equal(f.applied(), 0); }
  const f = fixture(); f.read(async () => { throw new Error('Synthetic outage'); }); await assert.rejects(refreshTransitionSavedState(f.options)); assert.equal(f.applied(), 0);
});
test('pending writes, changed epoch, permission loss and same-UID new session reject late application', async () => {
  for (const change of [(f: ReturnType<typeof fixture>) => f.fence.epoch++, (f: ReturnType<typeof fixture>) => f.fence.pending++, (f: ReturnType<typeof fixture>) => { f.session.account.role = 'Viewer'; }, (f: ReturnType<typeof fixture>) => f.generation()]) {
    const f = fixture(); f.read(async () => { change(f); return body(); }); await assert.rejects(refreshTransitionSavedState(f.options)); assert.equal(f.applied(), 0);
  }
  const busy = fixture(); busy.fence.pending = 1; await assert.rejects(refreshTransitionSavedState(busy.options)); assert.equal(busy.applied(), 0);
});
test('legacy-cache cleanup retains unresolved marker namespaces until explicit sign-out cleanup', () => {
  const storage: any = { shiekh_people_v3: 'obsolete', shiekh_theme_preference: 'dark', 'shiekh_person_transition_v1:actor:uuid': 'minimal marker', unrelated: 'preference' };
  Object.defineProperty(storage, 'removeItem', { value: (key: string) => { delete storage[key]; } });
  clearLegacyDirectoryCaches(storage); assert.deepEqual(Object.keys(storage), ['shiekh_theme_preference', 'shiekh_person_transition_v1:actor:uuid', 'unrelated']);
  clearProtectedStorage(storage); assert.deepEqual(Object.keys(storage), ['unrelated']);
});
