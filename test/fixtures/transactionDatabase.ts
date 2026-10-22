import assert from 'node:assert/strict';
import type { Firestore } from '@google-cloud/firestore';

/** Serialized synthetic transactions with rollback, query reads and merge writes; no external services. */
export function transactionDatabase() {
  const records = new Map<string, Record<string, unknown>>();
  let queue = Promise.resolve();
  const snapshot = (path: string) => ({ id: path.split('/')[1], exists: records.has(path), data: () => records.has(path) ? structuredClone(records.get(path)) : undefined });
  class Query {
    field?: string; value?: unknown; maximum = Infinity;
    constructor(readonly collection: string) {}
    doc(id: string) { return { path: `${this.collection}/${id}` }; }
    limit(n: number) { this.maximum = n; return this; }
    where(field: string, operator: string, value: unknown) { assert.equal(operator, '=='); this.field = field; this.value = value; return this; }
    async get() { const docs = [...records].filter(([key, data]) => key.startsWith(`${this.collection}/`) && (!this.field || data[this.field] === this.value)).slice(0, this.maximum).map(([key]) => snapshot(key)); return { docs, size: docs.length, empty: !docs.length }; }
  }
  const firestore = {
    collection: (name: string) => new Query(name),
    async runTransaction(callback: (transaction: unknown) => Promise<unknown>) {
      const previous = queue; let release!: () => void; queue = new Promise<void>(resolve => { release = resolve; }); await previous;
      const pending: (() => void)[] = [];
      try {
        const result = await callback({
          get: async (target: Query | { path: string }) => { assert.equal(pending.length, 0, 'reads before writes'); return target instanceof Query ? target.get() : snapshot(target.path); },
          set: (target: { path: string }, data: Record<string, unknown>, options?: { merge?: boolean }) => pending.push(() => records.set(target.path, structuredClone(options?.merge ? { ...records.get(target.path), ...data } : data))),
          delete: (target: { path: string }) => pending.push(() => records.delete(target.path)),
        });
        pending.forEach(write => write()); return result;
      } finally { release(); }
    },
  } as unknown as Firestore;
  return { records, firestore };
}
