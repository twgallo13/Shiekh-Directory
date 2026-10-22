import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp, type Firestore } from '@google-cloud/firestore';
import { FirestoreLeadershipRepository, DISTRICT_LEADERSHIP_FIELDS, LOCATION_DISTRICT_FIELDS, MAX_SHARED_INBOX_SCAN } from '../server/firestoreLeadership';
import { projectDistrictLeadership } from '../server/leadershipProjection';

function fixture() {
  const pinned = new Date('2026-10-22T15:00:00.000Z');
  let changed = false, large = false;
  const queries: { collection: string; fields: string[]; ids?: string[]; max?: number }[] = [];
  const transactions: { readOnly: boolean; readTime: Timestamp }[] = [];
  class Query {
    fields: string[] = []; max = Infinity; after = '';
    constructor(public collection: string, public id?: string) {}
    orderBy() { return this; } select(...fields: string[]) { this.fields = fields; return this; }
    limit(max: number) { this.max = max; return this; } startAfter(after: string) { this.after = after; return this; }
    doc(id: string) { return new Query(this.collection, id); }
  }
  const source = (collection: string, time: Date): { id: string; data: Record<string, unknown> }[] => {
    const future = changed && time > pinned;
    if (collection === 'districts') return [
      { id: 'd-1', data: { name: 'Zero-store District', status: 'Active', regionId: 'r', districtManagerId: future ? 'new' : 'old', private: 'excluded' } },
      { id: 'd-2', data: { name: 'Other District', status: 'Retired', regionId: 'r', districtManagerId: null } },
    ];
    if (collection === 'people') return [
      { id: 'old', data: { fullName: future ? 'Changed Person' : 'Original DM', status: 'Active', activeStatus: true, workEmail: 'Shared@shiekhshoes.org', email: 'personal@excluded.test', phone: 'private', firebaseUid: 'excluded', customMetadata: 'excluded' } },
      { id: 'new', data: { fullName: 'New DM', status: 'Active', workEmail: 'new@shiekhshoes.org' } },
    ];
    if (collection === 'regions') return [{ id: 'r', data: { name: future ? 'Renamed Region' : 'Original Region', status: 'Active' } }];
    if (collection === 'locations') return large
      ? Array.from({ length: MAX_SHARED_INBOX_SCAN + 1 }, (_, index) => ({ id: 'loc-' + index, data: { locationInboxEmail: 'inbox@shiekhshoes.org' } }))
      : [{ id: 'loc-1', data: { storeNumber: '007', type: 'Enclosed Mall', recordStatus: 'Retired', regionId: 'r', districtId: 'd-2', districtManagerId: 'stale', locationInboxEmail: 'sHaReD@SHIEKHSHOES.ORG', phone: 'excluded', customMetadata: 'excluded' } }];
    throw Error('Unexpected collection');
  };
  const firestore = {
    collection(name: string) { return new Query(name); },
    async runTransaction(callback: (transaction: unknown) => unknown, options: { readOnly: boolean; readTime: Timestamp }) {
      transactions.push(options);
      const document = (item: { id: string; data: Record<string, unknown> }, fields: string[]) => ({ id: item.id, exists: true,
        data: () => Object.fromEntries(Object.entries(item.data).filter(([k]) => fields.includes(k))) });
      return callback({
        get: async (query: Query) => {
          assert(query.fields.length); assert(query.max <= (query.fields.includes('locationInboxEmail') ? 1001 : 101));
          queries.push({ collection: query.collection, fields: query.fields, max: query.max });
          return { docs: source(query.collection, options.readTime.toDate()).filter(r => r.id > query.after).slice(0, query.max).map(r => document(r, query.fields)) };
        },
        getAll: async (...args: (Query | { fieldMask: string[] })[]) => {
          const mask = args.at(-1); assert(mask && 'fieldMask' in mask && mask.fieldMask.length);
          assert(args.length <= 101);
          return args.slice(0, -1).map(ref => {
            assert(ref instanceof Query && ref.id);
            queries.push({ collection: ref.collection, fields: mask.fieldMask, ids: [ref.id] });
            const row = source(ref.collection, options.readTime.toDate()).find(r => r.id === ref.id);
            return row ? document(row, mask.fieldMask) : { id: ref.id, exists: false };
          });
        },
      });
    },
  };
  return { pinned, queries, transactions, repository: new FirestoreLeadershipRepository(firestore as unknown as Firestore),
    mutate() { changed = true; }, oversized() { large = true; } };
}

test('District queries include zero-store records and mask contacts unless separately granted; all joins stay pinned through handover', async () => {
  const f = fixture();
  const base = { dataset: 'district-leadership' as const, snapshotAt: f.pinned, limit: 1, includeWorkEmail: false };
  const first = await f.repository.read(base);
  assert.equal(first.records[0].id, 'd-1'); assert.equal(first.nextId, 'd-1');
  assert.equal(first.people[0].data.fullName, 'Original DM');
  assert(f.queries.every(q => !q.fields.some(k => /email|phone|firebase|custom/i.test(k))));
  assert(f.queries.some(q => JSON.stringify(q.fields) === JSON.stringify(DISTRICT_LEADERSHIP_FIELDS)));
  const beforeContact = f.queries.length;
  const contact = await f.repository.read({ ...base, includeWorkEmail: true });
  assert(contact.sharedInboxKeys.has('shared@shiekhshoes.org'));
  assert.equal(projectDistrictLeadership(contact.records[0], contact.people, contact.regions, { granted: true, sharedInboxKeys: contact.sharedInboxKeys }).districtManager?.workEmailStatus, 'shared_location_inbox');
  const newQueries = f.queries.slice(beforeContact);
  assert(newQueries.filter(q => q.fields.some(k => /email/i.test(k))).every(q => q.fields.includes('workEmail') || JSON.stringify(q.fields) === '["locationInboxEmail"]'));
  assert(newQueries.every(q => !q.fields.some(k => /phone|firebase|custom|^email$/i.test(k))));
  f.mutate();
  const detail = await f.repository.read({ ...base, id: 'd-1', includeWorkEmail: true });
  assert.equal(detail.people[0].data.fullName, 'Original DM'); assert.equal(detail.regions[0].data.name, 'Original Region');
  const next = await f.repository.read({ ...base, afterId: first.nextId! });
  assert.equal(next.records[0].id, 'd-2'); assert.equal(next.nextId, null);
  assert(f.transactions.every(o => o.readOnly && o.readTime.toMillis() === f.pinned.getTime()));
  const fresh = await f.repository.read({ ...base, snapshotAt: new Date(f.pinned.getTime() + 60_000) });
  assert.equal(fresh.people[0].id, 'new');
});

test('membership snapshot shares pin and includes retired store IDs without reading people, contacts or copied DM fields', async () => {
  const f = fixture(); const page = await f.repository.read({ dataset: 'location-districts', snapshotAt: f.pinned, limit: 100, includeWorkEmail: true });
  assert.equal(page.records[0].data.storeNumber, '007'); assert.equal(page.records[0].data.recordStatus, 'Retired');
  assert.equal(page.people.length, 0); assert.equal(page.sharedInboxKeys.size, 0);
  assert(f.queries.some(q => JSON.stringify(q.fields) === JSON.stringify(LOCATION_DISTRICT_FIELDS)));
  assert(f.queries.every(q => q.collection !== 'people' && !q.fields.some(k => /email|phone|districtManager|custom/i.test(k))));
});

test('bounds and source failure are errors, never incomplete shared-inbox verification', async () => {
  const f = fixture();
  await assert.rejects(f.repository.read({ dataset: 'district-leadership', snapshotAt: f.pinned, limit: 0, includeWorkEmail: true }), /Invalid snapshot/);
  await assert.rejects(f.repository.read({ dataset: 'district-leadership', snapshotAt: new Date(NaN), limit: 1, includeWorkEmail: true }), /Invalid snapshot/);
  f.oversized();
  await assert.rejects(f.repository.read({ dataset: 'district-leadership', snapshotAt: f.pinned, limit: 100, includeWorkEmail: true }), /Contact safety scan bound/);
  const safeBase = await f.repository.read({ dataset: 'district-leadership', snapshotAt: f.pinned, limit: 100, includeWorkEmail: false });
  assert.equal(safeBase.records.length, 2);
});
