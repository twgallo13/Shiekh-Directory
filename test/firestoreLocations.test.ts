import assert from "node:assert/strict";
import { test } from "node:test";
import { FieldPath, Firestore, Timestamp } from "@google-cloud/firestore";
import { FirestoreLocationRepository } from "../server/firestoreLocations";
import { LocationConflictError } from "../server/directoryApi";

const snapshotAt = new Date("2026-09-08T12:00:00Z");

function fakeFirestore(duplicate = false) {
  const documents = ["a", "b", "c"].map((id, index) => ({
    id,
    data: () => ({ storeNumber: duplicate ? "07" : `0${index + 7}`, recordStatus: "Active" }),
    updateTime: Timestamp.fromDate(snapshotAt),
  }));
  const reads: { fields: string[]; limit?: number; afterId?: string }[] = [];
  let transactions = 0;

  class Query {
    fields: string[] = [];
    pageLimit?: number;
    afterId?: string;
    storeNumber?: string;
    select(...fields: string[]) { this.fields = fields; return this; }
    orderBy(field: FieldPath) { assert.ok(field.isEqual(FieldPath.documentId())); return this; }
    limit(limit: number) { this.pageLimit = limit; return this; }
    startAfter(afterId: string) { this.afterId = afterId; return this; }
    where(field: string, operator: string, value: string) {
      assert.equal(field, "storeNumber");
      assert.equal(operator, "==");
      this.storeNumber = value;
      return this;
    }
    async get() {
      reads.push({ fields: this.fields, limit: this.pageLimit, afterId: this.afterId });
      const matches = documents.filter((document) => (!this.afterId || document.id > this.afterId)
        && (!this.storeNumber || document.data().storeNumber === this.storeNumber));
      const docs = matches.slice(0, this.pageLimit ?? matches.length);
      return { docs, size: docs.length, empty: docs.length === 0 };
    }
  }

  const firestore = {
    collection(name: string) { assert.equal(name, "locations"); return new Query(); },
    async runTransaction(callback: (transaction: { get: (query: Query) => ReturnType<Query["get"]> }) => unknown,
      options: { readOnly: boolean; readTime: Timestamp }) {
      transactions++;
      assert.equal(options.readOnly, true);
      assert.equal(options.readTime.toDate().toISOString(), snapshotAt.toISOString());
      return callback({ get: (query) => query.get() });
    },
  };
  return { repository: new FirestoreLocationRepository(firestore as unknown as Firestore), reads, transactions: () => transactions };
}

test("Firestore pages use read-only fixed snapshots, one identity scan, startAfter and limit+1", async () => {
  const fake = fakeFirestore();
  const first = await fake.repository.readPage({ snapshotAt, limit: 1 });
  const second = await fake.repository.readPage({ snapshotAt, limit: 1, afterId: first.nextId! });
  assert.equal(first.records[0].id, "a");
  assert.equal(second.records[0].id, "b");
  assert.deepEqual(fake.reads[0].fields, ["storeNumber"]);
  assert.equal(fake.reads.length, 3);
  assert.equal(fake.reads[1].limit, 2);
  assert.equal(fake.reads[2].limit, 2);
  assert.equal(fake.reads[2].afterId, "a");
  assert.equal(fake.transactions(), 2);
  for (const read of fake.reads) assert.equal(read.fields.includes("storeManagerPhone"), false);
});

test("Firestore duplicate identities abort the first page before any public field read", async () => {
  const fake = fakeFirestore(true);
  await assert.rejects(fake.repository.readPage({ snapshotAt, limit: 1 }), LocationConflictError);
  assert.equal(fake.reads.length, 1);
  assert.deepEqual(fake.reads[0].fields, ["storeNumber"]);
});

test("Firestore detail requests use two-match detection rather than selecting a generation", async () => {
  const fake = fakeFirestore(true);
  await assert.rejects(fake.repository.findActiveByStoreNumber("07"), LocationConflictError);
  assert.equal(fake.reads[0].limit, 2);
});