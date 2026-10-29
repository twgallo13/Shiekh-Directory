import assert from 'node:assert/strict';
import type { Firestore, Transaction } from '@google-cloud/firestore';
import type { Account } from '../../server/authAuthority';
import type { OrganizationLeadershipIntent } from '../../server/organizationLeadershipPlanner';

export const leadershipNow = '2026-10-28T12:00:00.000Z';
export const leadershipActor = { uid: 'synthetic-admin', name: 'Synthetic Administrator', role: 'System Administrator', status: 'Active', accessScope: 'Company-wide' } as Account;
/** Synthetic adapter: validates masks, bounds, native checks and atomic rollback, not SDK concurrency. */
export function leadershipFixture() {
  const records = new Map<string, any>([
    ['users/admin', { firebaseUid: leadershipActor.uid, role: leadershipActor.role, status: 'Active', accessScope: leadershipActor.accessScope, email: 'PRIVATE_ACCOUNT' }],
    ['regions/01', { name: 'West', status: 'Active', version: 1 }],
    ['districts/01', { name: 'Central', regionId: '01', status: 'Active', version: 3, leadershipModelVersion: 1, leadershipVersion: 2, districtManagerId: 'incumbent' }],
    ['people/incumbent', { fullName: 'Current Manager', status: 'Active', positionIds: ['district-manager'], version: 1, workEmail: 'PRIVATE_CONTACT' }],
    ['people/new-hire', { fullName: 'New Manager', status: 'Active', positionIds: ['district-manager', 'regional-manager'], version: 1, workEmail: 'PRIVATE_CONTACT', primaryLocationId: 'corporate' }],
    ['leadership_assignments/existing', { unitType: 'district', unitId: '01', personId: 'incumbent', status: 'active', startedAt: '2026-10-01T00:00:00.000Z', endedAt: null, version: 1 }],
    ['locations/007', { storeNumber: '007', name: 'Store', type: 'Enclosed Mall', recordStatus: 'Active', districtId: '01', regionId: '01', districtManagerId: 'incumbent', districtManagerName: 'Current Manager', version: 4, address: 'PRIVATE_ADDRESS' }],
    ['locations/corporate', { name: 'Corporate', type: 'Corporate Office', recordStatus: 'Active', version: 1 }],
  ]);
  const reads: { collection: string; fields: string[]; paths?: string[]; maximum?: number }[] = [];
  const state: { fail?: string; missingTime?: string; badPath?: string; duplicate?: string; truncatePeople?: boolean; wrongPerson?: boolean; omitFilter?: boolean; failWrite?: boolean } = {};
  class Query {
    fields: string[] = []; filters: [string, unknown][] = []; maximum = Infinity;
    constructor(public name: string) {}
    select(...fields: string[]) { this.fields = fields; return this; }
    where(field: string, op: string, value: unknown) { assert.equal(op, '=='); this.filters.push([field, value]); return this; }
    limit(max: number) { this.maximum = max; return this; }
    doc(id: string) { return { id, path: `${this.name}/${id}` }; }
  }
  const document = (path: string, fields: string[], source: Map<string, any>) => {
    const data = source.get(path), selected = data && (fields.length ? fields.reduce((result,field)=>{
      const [parent,child]=field.split('.');
      if(!child){if(Object.hasOwn(data,parent))result[parent]=data[parent];}
      else if(Object.hasOwn(data,parent)){
        if(data[parent]===null||typeof data[parent]!=='object')result[parent]=data[parent];
        else if(Object.hasOwn(data[parent],child)){result[parent]??={};result[parent][child]=data[parent][child];}
      }
      return result;
    },{} as Record<string,any>) : data);
    return { id: path.split('/')[1], ref: { path: state.badPath === path ? `other/${path.split('/')[1]}` : path }, exists: source.has(path),
      updateTime: source.has(path) && state.missingTime !== path ? { seconds: 100, nanoseconds: 1 } : undefined,
      data: () => selected && structuredClone(selected) };
  };
  const transaction = (source: Map<string, any>) => {
    const pending: (() => void)[] = []; let writing = false;
    return {
      get: async (query: Query | { path: string }) => {
        assert.equal(writing, false, 'All reads precede writes');
        if ('path' in query) return document(query.path, [], source);
        if (state.fail === query.name) throw new Error('Synthetic unavailable source');
        assert(query.fields.length); assert(Number.isFinite(query.maximum));
        reads.push({ collection: query.name, fields: query.fields, maximum: query.maximum });
        const docs = [...source].filter(([path, data]) => path.startsWith(query.name + '/') && (state.omitFilter || query.filters.every(([f, value]) => data[f] === value)))
          .slice(0, query.maximum).map(([path]) => document(path, query.fields, source));
        if (state.duplicate === query.name && docs.length) docs.push(docs[0]);
        return { size: docs.length, docs };
      },
      getAll: async (...args: any[]) => {
        assert.equal(writing, false, 'All reads precede writes');
        const fields = args.at(-1)?.fieldMask ?? [];
        if (args.at(-1)?.fieldMask) args.pop();
        const paths = args.map(ref => ref.path);
        reads.push({ collection: paths[0].split('/')[0], fields, paths });
        if (state.truncatePeople && paths.some(path => path.startsWith('people/'))) return [];
        if (state.wrongPerson && paths.some(path => path.startsWith('people/'))) paths[0] = 'people/unrequested';
        return paths.map(path => document(path, fields, source)).reverse();
      },
      create: (ref: { path: string }, data: any) => {
        writing = true;
        pending.push(() => { if (source.has(ref.path)) throw new Error('Already exists'); source.set(ref.path, structuredClone(data)); });
      },
      update: (ref: { path: string }, data: any, precondition?: any) => {
        writing = true;
        if (precondition) assert.deepEqual(precondition, { lastUpdateTime: { seconds: 100, nanoseconds: 1 } });
        pending.push(() => { assert(source.has(ref.path)); source.set(ref.path, { ...source.get(ref.path), ...structuredClone(data) }); });
      },
      flush: () => { for (const write of pending) write(); if (state.failWrite) throw new Error('Synthetic commit failure'); },
    };
  };
  const firestore = { collection: (name: string) => new Query(name), runTransaction: async (callback: any, options?: any) => {
    const copy = structuredClone(records), tx = transaction(copy);
    const result = await callback(tx);
    if (options?.readOnly) assert.deepEqual([...copy], [...records]);
    tx.flush(); records.clear(); for (const [key, value] of copy) records.set(key, value);
    return result;
  } } as unknown as Firestore;
  const intent: OrganizationLeadershipIntent = { operationId: 'operation-1', units: [{ unitType: 'district', unitId: '01', expectedVersion: 3, expectedLeadershipVersion: 2, activateLegacy: false, memberPersonIds: ['incumbent', 'new-hire'], primaryPersonId: 'incumbent', reason: '' }] };
  return { records, reads, state, firestore, transaction: transaction(records) as unknown as Transaction, intent };
}
