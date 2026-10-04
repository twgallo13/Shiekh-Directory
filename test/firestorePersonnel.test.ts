import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Timestamp, type Firestore } from '@google-cloud/firestore';
import { FirestorePersonnelRepository, PERSONNEL_SOURCE_FIELDS, STAFFING_SOURCE_FIELDS } from '../server/firestorePersonnel';
import { projectPerson, projectStaffing } from '../server/personnelProjection';

test('every dependency and page/detail read is pinned in one read-only transaction, including concurrent Person/hierarchy edits', async () => {
  const pinned = new Date('2026-10-04T11:00:00.000Z');
  let mutated = false;
  const queries: Array<{ name: string; fields: string[]; ids?: string[] }> = [];
  const reads: { readOnly: boolean; readTime: Timestamp }[] = [];
  class Query {
    fields: string[] = [];
    max = Infinity;
    after = '';
    constructor(public name: string, public id?: string) {}
    orderBy() { return this; }
    select(...fields: string[]) { this.fields = fields; return this; }
    limit(max: number) { this.max = max; return this; }
    startAfter(after: string) { this.after = after; return this; }
    doc(id: string) { return new Query(this.name, id); }
  }
  const values = (name: string, time: Date) => {
    const future = mutated && time > pinned;
    switch (name) {
      case 'people': return [{ id: 'p-1', data: { fullName: future ? 'Renamed Person' : 'Original Person', status: 'Active', email: 'excluded@example.test' } }, { id: 'p-2', data: { fullName: 'Inactive Person', status: 'Inactive' } }];
      case 'locations': return [{ id: 'loc-1', data: { storeNumber: '07', recordStatus: 'Active', regionalManagerId: 'p-1', regionId: 'r', districtId: 'd' } }, { id: 'loc-2', data: { storeNumber: '7', recordStatus: 'Retired' } }];
      case 'regions': return [{ id: 'r', data: { name: future ? 'Renamed Region' : 'Original Region', status: 'Active' } }];
      case 'districts': return [{ id: 'd', data: { name: 'Original District', status: 'Active', regionId: 'r' } }];
      default: throw new Error('Unexpected source');
    }
  };
  const firestore = {
    collection(name: string) { return new Query(name); },
    async runTransaction(callback: (transaction: unknown) => unknown, options: { readOnly: boolean; readTime: Timestamp }) {
      reads.push(options);
      const document = (item: { id: string; data: Record<string, unknown> }, fields: string[]) => ({
        id: item.id, exists: true,
        data: () => Object.fromEntries(Object.entries(item.data).filter(([key]) => fields.includes(key))),
      });
      return callback({ get: async (query: Query) => {
        queries.push({ name: query.name, fields: query.fields });
        assert.ok(query.fields.length > 0);
        assert.ok(query.max <= 101);
        const records = values(query.name, options.readTime.toDate()).filter(item => query.id ? item.id === query.id : item.id > query.after).slice(0, query.max);
        const docs = records.map(item => document(item, query.fields));
        return query.id ? docs[0] || { exists: false } : { docs, size: docs.length };
      }, getAll: async (...args: Array<Query | { fieldMask: string[] }>) => {
        const mask = args.at(-1);
        assert.ok(mask && 'fieldMask' in mask && mask.fieldMask.length > 0);
        const references = args.slice(0, -1);
        assert.ok(references.length <= 100);
        return references.map(reference => {
          assert.ok(reference instanceof Query && reference.id);
          queries.push({ name: reference.name, fields: mask.fieldMask, ids: [reference.id] });
          const value = values(reference.name, options.readTime.toDate()).find(item => item.id === reference.id);
          return value ? document(value, mask.fieldMask) : { id: reference.id, exists: false };
        });
      } });
    },
  };
  const repository = new FirestorePersonnelRepository(firestore as unknown as Firestore);
  const first = await repository.read({ dataset: 'location-staffing', snapshotAt: pinned, limit: 1 });
  mutated = true;
  const second = await repository.read({ dataset: 'location-staffing', snapshotAt: pinned, limit: 1, afterId: first.nextId! });
  const detail = await repository.read({ dataset: 'location-staffing', snapshotAt: pinned, limit: 50, id: 'loc-1' });
  const personnel = await repository.read({ dataset: 'personnel', snapshotAt: pinned, limit: 1 });
  assert.equal(first.nextId, 'loc-1');
  assert.equal(second.records[0].id, 'loc-2');
  assert.equal(second.nextId, null);
  const staffing = projectStaffing(detail.records[0], detail.people, detail.regions, detail.districts);
  assert.equal(staffing.staffing.regionalManager?.fullName, 'Original Person');
  assert.equal(staffing.hierarchy.regionName, 'Original Region');
  assert.equal(projectPerson(personnel.records[0], personnel.locations).fullName, 'Original Person');
  assert.ok(reads.every(options => options.readOnly === true && options.readTime.toDate().getTime() === pinned.getTime()));
  for (const query of queries.filter(query => query.fields.length > 0)) assert.ok(!query.fields.some(field => /email|phone|custom|user/i.test(field)));
  assert.ok(queries.some(query => query.name === 'people' && JSON.stringify(query.fields) === JSON.stringify(PERSONNEL_SOURCE_FIELDS)));
  assert.ok(queries.some(query => query.name === 'locations' && JSON.stringify(query.fields) === JSON.stringify(STAFFING_SOURCE_FIELDS)));
  assert.ok(queries.filter(query => query.name === 'people' && query.ids).every(query => query.ids?.every(id => id === 'p-1')));
  assert.equal(second.people.length, 0);
  assert.equal(second.regions.length, 0);
  assert.equal(second.districts.length, 0);
});

test('oversized dependency sets fail explicitly before reading references, never return a partial success', async () => {
  let referenceReads = 0;
  const firestore = {
    collection() {
      const query = { orderBy() { return query; }, select() { return query; }, limit() { return query; } };
      return query;
    },
    async runTransaction(callback: (transaction: unknown) => unknown) {
      return callback({
        get: async () => ({ docs: [{ id: 'loc-oversized', exists: true, data: () => ({ assistantStoreManagerIds: Array.from({ length: 1001 }, (_, index) => `p-${index}`) }) }] }),
        getAll: async () => { referenceReads++; return []; },
      });
    },
  };
  const repository = new FirestorePersonnelRepository(firestore as unknown as Firestore);
  await assert.rejects(repository.read({ dataset: 'location-staffing', snapshotAt: new Date(), limit: 1 }), /dependency bound/);
  assert.equal(referenceReads, 0);
});
