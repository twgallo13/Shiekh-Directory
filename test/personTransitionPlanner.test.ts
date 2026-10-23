import test from 'node:test';
import assert from 'node:assert/strict';
import { planPersonTransition, type TransitionPlannerSnapshot, type TransitionSourceDocument } from '../server/personTransitionPlanner';
import { normalizePersonTransitionIntent, type PersonTransitionIntent } from '../server/personTransitionIntent';

const doc = (id: string, data: Record<string, any> | null): TransitionSourceDocument => ({ id, data, updateTime: data === null ? null : { seconds: '100', nanoseconds: 12 } });
function fixture() {
  const snapshot: TransitionPlannerSnapshot = {
    complete: true, coherentReadId: 'synthetic-only',
    people: [doc('subject', { fullName: 'Synthetic Subject', status: 'Active', positionIds: ['store-manager'], workPhone: '+19095550100', phonePrivacy: 'Internal', workEmail: 'PRIVATE_CONTACT' }),
      doc('replacement', { fullName: 'Synthetic Replacement', status: 'Active', positionIds: ['store-manager', 'district-manager', 'key-holder'], phone: '+19095550101', phonePrivacy: 'Restricted' })],
    locations: [doc('store', { name: 'Synthetic Store', storeNumber: '007', type: 'Enclosed Mall', recordStatus: 'Active', districtId: 'district', regionId: 'region', storeManagerId: 'subject', storeManagerName: 'Synthetic Subject', storeManagerPhone: '+19095550100', storeManagerPhonePrivacy: 'Internal', districtManagerId: '', address: 'PRESERVE_ADDRESS', temporaryClosure: { reason: 'PRESERVE_CLOSURE' } })],
    districts: [doc('district', { name: 'Synthetic District', regionId: 'region', status: 'Active', districtManagerId: null })],
    regions: [doc('region', { name: 'Synthetic Region', status: 'Active' })], users: [], requests: [],
  };
  const intent: PersonTransitionIntent = { schemaVersion: 1, personId: 'subject', positionIds: ['store-manager', 'district-manager'], lifecycle: 'keep', reason: 'Synthetic test only',
    responsibilities: [{ owner: 'locations', id: 'store', field: 'storeManagerId', action: 'retain' }], primaryWorkplace: { action: 'retain' }, supports: { action: 'retain' }, acknowledgedRequestIds: [] };
  return { snapshot, intent };
}
const row = (s: TransitionPlannerSnapshot, c: keyof Pick<TransitionPlannerSnapshot, 'people' | 'locations' | 'districts' | 'regions'>, id: string) => s[c].find(d => d.id === id)!.data!;
const freeze = (v: any) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };
const blocked = (f: ReturnType<typeof fixture>, text: RegExp) => { const r = planPersonTransition(f.intent, f.snapshot); assert.equal(r.ready, false); assert.equal(r.internal, null); assert.match(r.review.blockers.join(' '), text); return r; };

test('frozen inputs: retain SM and add DM changes only explicit positions, not District/access/contact', () => {
  const f = fixture(); const before = JSON.stringify(f); freeze(f);
  const r = planPersonTransition(f.intent, f.snapshot);
  assert.equal(r.ready, true); assert.equal(JSON.stringify(f), before);
  assert.deepEqual(r.internal!.patches, [{ collection: 'people', id: 'subject', set: { positionIds: ['district-manager', 'store-manager'] } }]);
  assert.doesNotMatch(JSON.stringify(r.review), /PRIVATE_CONTACT|19095550100|PRESERVE_ADDRESS|PRESERVE_CLOSURE/);
  r.internal!.patches[0].set.positionIds.push('other'); assert.equal(JSON.stringify(f), before);
  r.review.positions.before.ids.push('other'); assert.equal(JSON.stringify(f), before, 'public review is detached too');
});
test('intent normalization rejects unknown fields, coerced fields, duplicate owners/IDs and unsupported actions', () => {
  const { intent } = fixture();
  const variants = [ { ...intent, writes: [] }, { ...intent, actorId: 'admin' }, { ...intent, reason: ' ' }, { ...intent, positionIds: ['store-manager', 'store-manager'] },
    { ...intent, positionIds: ['DM'] }, { ...intent, lifecycle: 'delete' }, { ...intent, personId: '../subject' }, { ...intent, reason: 'a'.repeat(1001) },
    { ...intent, primaryWorkplace: { action: 'retain', ids: [] } }, { ...intent, supports: { action: 'replace', ids: [] } }, { ...intent, acknowledgedRequestIds: ['r', 'r'] },
    ...[{ field: ['storeManagerId'] }, { replacementId: 'replacement' }, { action: 'promote' }, { owner: 'users' }, { field: '__proto__' }].map(change => ({ ...intent, responsibilities: [{ ...intent.responsibilities[0], ...change }] })),
    { ...intent, responsibilities: [...intent.responsibilities, ...intent.responsibilities] }, { ...intent, reason: 'x'.repeat(132000) } ];
  for (const variant of variants) assert.throws(() => normalizePersonTransitionIntent(variant));
  const normalized = normalizePersonTransitionIntent({ ...intent, reason: '  test  ' }); assert.equal(normalized.reason, 'test');
});
test('vacant managed District assignment derives retail copies, including retired stores; no store-level override', () => {
  const f = fixture(); row(f.snapshot, 'locations', 'store').recordStatus = 'Retired';
  f.intent.responsibilities.push({ owner: 'districts', id: 'district', field: 'districtManagerId', action: 'assign' });
  const r = planPersonTransition(f.intent, f.snapshot); assert.equal(r.ready, true);
  assert.equal(r.internal!.patches.length, 3); assert.equal(r.review.inheritedCopies.length, 1);
  assert.deepEqual(r.internal!.patches.find(p => p.collection === 'locations')!.set, { districtManagerId: 'subject', districtManagerName: 'Synthetic Subject' });
  f.intent.responsibilities.push({ owner: 'locations', id: 'store', field: 'districtManagerId', action: 'assign' }); blocked(f, /District-owned/);
});
test('new grants reject legacy ownership, invalid parent, retired territory, inactive/unmapped/missing counterpart', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { delete row(f.snapshot, 'districts', 'district').districtManagerId; },
    (f: ReturnType<typeof fixture>) => { row(f.snapshot, 'districts', 'district').status = 'Retired'; },
    (f: ReturnType<typeof fixture>) => { row(f.snapshot, 'regions', 'region').status = 'Retired'; },
    (f: ReturnType<typeof fixture>) => { f.snapshot.regions = []; },
  ]) { const f = fixture(); f.intent.responsibilities.push({ owner: 'districts', id: 'district', field: 'districtManagerId', action: 'assign' }); mutate(f); blocked(f, /vacant|Active District/); }
  for (const mutate of [
    (r: any) => { r.status = 'Inactive'; }, (r: any) => { delete r.positionIds; r.jobTitle = 'Store Manager'; }, (r: any) => { r.positionIds = []; },
  ]) { const f = fixture(); f.intent.responsibilities[0] = { ...f.intent.responsibilities[0], action: 'replace', replacementId: 'replacement' }; mutate(row(f.snapshot, 'people', 'replacement')); blocked(f, /Active controlled/); }
  const f = fixture(); f.intent.responsibilities[0] = { ...f.intent.responsibilities[0], action: 'replace', replacementId: 'missing' }; blocked(f, /Exact Person read/);
  f.snapshot.people.push(doc('missing', null)); blocked(f, /Active controlled/);
});
test('every authoritative slot is explicit; final eligibility and inactive leadership fail closed', () => {
  const f = fixture(); f.intent.responsibilities = []; blocked(f, /Explicit responsibility/);
  f.intent.responsibilities = [{ owner: 'locations', id: 'store', field: 'storeManagerId', action: 'retain' }];
  f.intent.positionIds = ['district-manager']; blocked(f, /Retained responsibility/);
  f.intent.lifecycle = 'inactive'; blocked(f, /Retained responsibility/);
  f.intent.responsibilities[0].action = 'vacate'; assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
});
test('all linked User states block inactivation, but do not block position-only changes', () => {
  for (const status of ['Active', 'Suspended', 'Revoked', 'unknown', undefined]) {
    const f = fixture(); f.snapshot.users.push(doc('account', { personId: 'subject', role: 'Store Manager', ...(status ? { status } : {}), email: 'PRIVATE_ACCOUNT', firebaseUid: 'PRIVATE_UID' }));
    assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
    f.intent.lifecycle = 'inactive'; f.intent.responsibilities[0].action = 'vacate';
    const r = blocked(f, /All linked User/); assert.doesNotMatch(JSON.stringify(r.review), /PRIVATE_ACCOUNT|PRIVATE_UID/);
  }
});
test('multi-District departure includes retired/zero-store owners; removal does not repair missing parents', () => {
  const f = fixture(); f.intent.lifecycle = 'inactive'; f.intent.responsibilities[0].action = 'vacate';
  row(f.snapshot, 'districts', 'district').districtManagerId = 'subject';
  f.snapshot.districts.push(doc('retired', { name: 'Retired', regionId: 'missing', status: 'Retired', districtManagerId: 'subject' }));
  f.intent.responsibilities.push(...['district', 'retired'].map(id => ({ owner: 'districts' as const, id, field: 'districtManagerId' as const, action: 'vacate' as const })));
  const r = planPersonTransition(f.intent, f.snapshot); assert.equal(r.ready, true);
  assert.equal(r.internal!.patches.filter(p => p.collection === 'locations').length, 1, 'shared Location patched once');
  assert.deepEqual(r.internal!.patches.find(p => p.id === 'retired')!.set, { districtManagerId: null });
});
test('array replacement preserves unrelated IDs/names/order, rejects duplicates and ambiguous copies', () => {
  const f = fixture(); const l = row(f.snapshot, 'locations', 'store');
  l.keyHolderIds = ['other-a', 'subject', 'other-b']; l.keyHolderNames = ['Keep A', 'Synthetic Subject', 'Keep B'];
  f.intent.responsibilities.push({ owner: 'locations', id: 'store', field: 'keyHolderIds', action: 'replace', replacementId: 'replacement' });
  const r = planPersonTransition(f.intent, f.snapshot); assert.equal(r.ready, true);
  assert.deepEqual(r.internal!.patches.find(p => p.collection === 'locations')!.set, { keyHolderIds: ['other-a', 'replacement', 'other-b'], keyHolderNames: ['Keep A', 'Synthetic Replacement', 'Keep B'] });
  l.keyHolderIds[2] = 'replacement'; blocked(f, /Duplicate resulting/);
  l.keyHolderIds[2] = 'other-b'; l.keyHolderNames = []; blocked(f, /ambiguous/);
});
test('SM replacement uses replacement phone/privacy and vacancy clears copies; no outgoing contact leakage', () => {
  const f = fixture(); f.intent.responsibilities[0] = { ...f.intent.responsibilities[0], action: 'replace', replacementId: 'replacement' };
  let r = planPersonTransition(f.intent, f.snapshot); const set = r.internal!.patches.find(p => p.collection === 'locations')!.set;
  assert.equal(set.storeManagerPhone, '(909) 555-0101'); assert.equal(set.storeManagerPhonePrivacy, 'Restricted');
  assert.doesNotMatch(JSON.stringify(r.review), /50100|50101/);
  f.intent.responsibilities[0] = { owner: 'locations', id: 'store', field: 'storeManagerId', action: 'vacate' };
  r = planPersonTransition(f.intent, f.snapshot);
  assert.deepEqual(r.internal!.patches.find(p => p.collection === 'locations')!.set, { storeManagerId: '', storeManagerName: '', storeManagerPhone: '', storeManagerPhonePrivacy: 'Restricted' });
});
test('historical copied DM warns, is not independently edited, and Pending review uses IDs not prose', () => {
  const f = fixture(); const l = row(f.snapshot, 'locations', 'store'); delete l.storeManagerId; l.districtManagerId = 'subject'; f.intent.responsibilities = [];
  f.snapshot.requests.push(doc('request', { status: 'Pending', targetType: 'Location', targetId: 'store', changeType: 'Leadership', requestedChanges: {}, currentSnapshot: { districtManagerId: 'subject' }, reason: 'PRIVATE_PROSE' }));
  let r = blocked(f, /Pending/); assert.match(r.review.warnings.join(), /Historical/);
  f.intent.acknowledgedRequestIds = ['request']; r = planPersonTransition(f.intent, f.snapshot); assert.equal(r.ready, true);
  assert.equal(r.internal!.patches.length, 1); assert.doesNotMatch(JSON.stringify(r.review), /PRIVATE_PROSE/);
});
test('workplace links remain distinct; legacy retention allowed, new missing/retired/overlap rejected', () => {
  const f = fixture(); const p = row(f.snapshot, 'people', 'subject'); p.primaryLocationId = 'missing'; p.supportedLocationIds = ['old'];
  assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
  f.intent.primaryWorkplace = { action: 'replace', ids: ['another-missing'] }; blocked(f, /must exist/);
  f.intent.primaryWorkplace = { action: 'replace', ids: ['store'] }; row(f.snapshot, 'locations', 'store').recordStatus = 'Retired'; blocked(f, /not be retired/);
  row(f.snapshot, 'locations', 'store').recordStatus = 'Active'; f.intent.supports = { action: 'replace', ids: ['store'] }; blocked(f, /Primary workplace/);
  f.intent.supports = { action: 'clear' }; assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
});
test('hash binds presence-aware versions, native update times, names, inserted account/member/request and exact absence', () => {
  const base = fixture(); const original = planPersonTransition(base.intent, base.snapshot);
  const hashes = new Set([original.planHash]);
  for (const mutate of [
    (s: TransitionPlannerSnapshot) => { row(s, 'people', 'subject').version = null; },
    (s: TransitionPlannerSnapshot) => { row(s, 'people', 'subject').version = 0; },
    (s: TransitionPlannerSnapshot) => { s.people[0].updateTime!.nanoseconds++; },
    (s: TransitionPlannerSnapshot) => { row(s, 'people', 'subject').fullName = 'Changed'; },
    (s: TransitionPlannerSnapshot) => { s.users.push(doc('new', { role: 'Test', personId: 'subject' })); },
    (s: TransitionPlannerSnapshot) => { s.locations.push(doc('new', { ...row(s, 'locations', 'store'), id: 'new' })); },
    (s: TransitionPlannerSnapshot) => { s.requests.push(doc('new', { status: 'Pending', targetType: 'Person', targetId: 'other', changeType: 'Info' })); },
    (s: TransitionPlannerSnapshot) => { s.people.push(doc('absent', null)); },
  ]) { const f = fixture(); mutate(f.snapshot); const r = planPersonTransition(f.intent, f.snapshot); assert.notEqual(r.planHash, original.planHash); hashes.add(r.planHash); }
  assert.equal(hashes.size, 9);
  const f = fixture(); f.snapshot.people.reverse(); f.snapshot.coherentReadId = 'another-read-same-state'; f.intent.positionIds.reverse();
  assert.equal(planPersonTransition(f.intent, f.snapshot).planHash, original.planHash);
});
test('malformed or incomplete snapshots fail before a plan, not a misleading partial success', () => {
  for (const mutate of [
    (s: any) => { s.complete = false; }, (s: any) => { s.people.push(s.people[0]); },
    (s: any) => { s.people[0].updateTime = null; }, (s: any) => { s.people[0].updateTime.seconds = 100; },
    (s: any) => { row(s, 'locations', 'store').type = 'Invented type'; }, (s: any) => { row(s, 'people', 'subject').supportedLocationIds = 'store'; },
    (s: any) => { row(s, 'locations', 'store').keyHolderIds = ['subject', 'subject']; },
    (s: any) => { row(s, 'people', 'subject').positionIds = ['unknown']; }, (s: any) => { row(s, 'people', 'subject').version = -1; },
    (s: any) => { row(s, 'districts', 'district').districtManagerId = ''; },
  ]) { const f = fixture(); mutate(f.snapshot); assert.throws(() => planPersonTransition(f.intent, f.snapshot)); }
});
test('semantic position no-op is not accepted; capacity overflow returns no actionable partial plan', () => {
  const f = fixture(); row(f.snapshot, 'people', 'subject').positionIds = ['store-manager', 'district-manager']; blocked(f, /no business change/);
  const large = fixture(); large.intent.responsibilities[0].action = 'vacate';
  for (let i = 0; i < 90; i++) { const id = `store-${i}`; large.snapshot.locations.push(doc(id, { ...row(large.snapshot, 'locations', 'store'), id })); large.intent.responsibilities.push({ owner: 'locations', id, field: 'storeManagerId', action: 'vacate' }); }
  blocked(large, /capacity/);
});

test('non-retail DM remains Location-owned; unrelated occupied new slot and contradictory lifecycle are blocked', () => {
  const f = fixture(); const l = row(f.snapshot, 'locations', 'store'); l.type = 'Corporate Office'; l.districtManagerId = 'subject';
  f.intent.responsibilities.push({ owner: 'locations', id: 'store', field: 'districtManagerId', action: 'retain' });
  assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
  l.regionalManagerId = 'replacement'; f.intent.responsibilities.push({ owner: 'locations', id: 'store', field: 'regionalManagerId', action: 'assign' }); blocked(f, /vacant/);
  f.intent.responsibilities.pop(); row(f.snapshot, 'people', 'subject').activeStatus = false; blocked(f, /lifecycle/);
});
test('new District membership is reviewed for exact-ID Pending requests and private request prose is excluded', () => {
  const f = fixture(); delete row(f.snapshot, 'locations', 'store').storeManagerId; f.intent.responsibilities = [{ owner: 'districts', id: 'district', field: 'districtManagerId', action: 'assign' }];
  f.snapshot.requests.push(doc('pending-new', { status: 'Pending', targetType: 'Location', targetId: 'store', changeType: 'Phone', requestedChanges: {}, currentSnapshot: {}, reason: 'PRIVATE_NEW_REQUEST' }));
  blocked(f, /Pending/); f.intent.acknowledgedRequestIds = ['pending-new'];
  const r = planPersonTransition(f.intent, f.snapshot); assert.equal(r.ready, true); assert.doesNotMatch(JSON.stringify(r.review), /PRIVATE_NEW_REQUEST/);
});
test('byte capacity estimates and every inventory limit fail closed without partial mutations', () => {
  const f = fixture(); row(f.snapshot, 'people', 'subject').unrelated = 'x'.repeat(500000); blocked(f, /capacity/);
  for (const [collection, maximum] of Object.entries({ people: 5000, locations: 1000, districts: 500, regions: 100, users: 5000, requests: 1000 })) {
    const f = fixture(); (f.snapshot as any)[collection] = Array(maximum + 1).fill(doc('overflow', {}));
    assert.throws(() => planPersonTransition(f.intent, f.snapshot), /capacity/);
  }
});

test('new primary/support workplace targets require exact Pending acknowledgment', () => {
  for (const field of ['primaryWorkplace', 'supports'] as const) {
    const f = fixture(); f.snapshot.locations.push(doc('new-workplace', { name: 'New context', storeNumber: '009', type: 'Corporate Office', recordStatus: 'Active' }));
    f.snapshot.requests.push(doc('new-context-request', { status: 'Pending', targetType: 'Location', targetId: 'new-workplace', changeType: 'Phone', requestedChanges: {}, currentSnapshot: {} }));
    f.intent[field] = { action: 'replace', ids: ['new-workplace'] };
    blocked(f, /Pending/); f.intent.acknowledgedRequestIds = ['new-context-request'];
    assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
  }
});
test('responsibility normalization uses code-unit order for stable cross-runtime hashes', () => {
  const f = fixture(); const ids = ['a_', 'a-', 'a.', 'a', 'A'];
  f.intent.responsibilities = ids.map(id => ({ owner: 'locations', id, field: 'storeManagerId', action: 'retain' }));
  // Sorts full owner/id/field keys, so the slash after "a" follows '-' and '.'.
  assert.deepEqual(normalizePersonTransitionIntent(f.intent).responsibilities.map(d => d.id), ['A', 'a-', 'a.', 'a', 'a_']);
});

test('unchanged support sets cannot create a business patch solely by reordering', () => {
  const f = fixture(); const p = row(f.snapshot, 'people', 'subject');
  p.positionIds = ['store-manager', 'district-manager']; p.supportedLocationIds = ['workplace', 'store'];
  f.snapshot.locations.push(doc('workplace', { name: 'Context', storeNumber: '009', type: 'Corporate Office', recordStatus: 'Active' }));
  f.intent.supports = { action: 'replace', ids: ['store', 'workplace'] };
  const before = JSON.stringify(f.snapshot); blocked(f, /Unchanged workplace decision/); assert.equal(JSON.stringify(f.snapshot), before);
});

test('non-retail new grants validate hierarchy; valid Not Applicable and valid explicit membership remain allowed', () => {
  for (const action of ['assign', 'replace'] as const) for (const invalid of ['Unknown', 'missing', 'retired', 'mismatch', 'region-only', 'not-applicable-with-refs']) {
    const f = fixture(); const l = row(f.snapshot, 'locations', 'store'); l.type = 'Corporate Office';
    l.hierarchyApplicability = invalid === 'Unknown' ? 'Unknown' : invalid === 'not-applicable-with-refs' ? 'Not Applicable' : 'Applicable';
    if (invalid === 'missing') l.districtId = 'missing';
    if (invalid === 'retired') row(f.snapshot, 'districts', 'district').status = 'Retired';
    if (invalid === 'mismatch') l.regionId = 'other';
    if (invalid === 'region-only') delete l.districtId;
    f.intent.responsibilities[0] = { owner: 'locations', id: 'store', field: 'storeManagerId', action, ...(action === 'replace' ? { replacementId: 'replacement' } : {}) };
    if (action === 'assign') delete l.storeManagerId;
    blocked(f, /hierarchy|District\/Region/);
    // Removal remains possible without granting responsibility or repairing source membership.
    if (action === 'replace') { f.intent.responsibilities[0] = { owner: 'locations', id: 'store', field: 'storeManagerId', action: 'vacate' }; assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true); }
  }
  for (const applicable of [true, false]) {
    const f = fixture(); const l = row(f.snapshot, 'locations', 'store'); l.type = 'Corporate Office'; l.hierarchyApplicability = applicable ? 'Applicable' : 'Not Applicable';
    if (!applicable) { delete l.regionId; delete l.districtId; }
    f.intent.responsibilities[0] = { ...f.intent.responsibilities[0], action: 'replace', replacementId: 'replacement' };
    assert.equal(planPersonTransition(f.intent, f.snapshot).ready, true);
  }
});
