import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Firestore } from '@google-cloud/firestore';
import express from 'express';
import { once } from 'node:events';
import { FirestoreDirectoryStore, type DirectoryWrite } from '../server/firestoreDirectory';
import { createDirectoryDataRouter } from '../server/directoryDataApi';
import type { Account } from '../server/authAuthority';
import { districtLeadershipWrites, hasDistrictLeadership, inheritDistrictLeader, previewDistrictLeadership } from '../src/lib/districtLeadership';
import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../src/types';
import { DEFAULT_WEEKLY_HOURS } from '../src/lib/defaultHours';
import { previewLocationImport } from '../src/lib/locationImportPreview';
import type { LocationImportManifest } from '../server/locationImportConfirmation';

/** Detached synthetic storage commits only after the entire callback succeeds. */
function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const snapshot = (path: string) => ({ id: path.split('/')[1], exists: records.has(path), data: () => structuredClone(records.get(path)) });
  class Query {
    field?: string; value?: unknown; max = Infinity;
    constructor(readonly name: string) {}
    doc(id: string) { return { path: `${this.name}/${id}` }; }
    limit(max: number) { this.max = max; return this; }
    where(field: string, _op: string, value: unknown) { this.field = field; this.value = value; return this; }
    async get() { return { docs: [...records].filter(([path, data]) => path.startsWith(`${this.name}/`) && (!this.field || data[this.field] === this.value)).slice(0, this.max).map(([path]) => snapshot(path)) }; }
  }
  const db = { collection: (name: string) => new Query(name), async runTransaction(fn: (t: unknown) => Promise<unknown>) {
    const pending: (() => void)[] = [];
    const result = await fn({ get: async (target: Query | { path: string }) => { assert.equal(pending.length, 0); return target instanceof Query ? target.get() : snapshot(target.path); },
      set: (target: { path: string }, data: Record<string, unknown>) => pending.push(() => records.set(target.path, structuredClone(data))),
      delete: (target: { path: string }) => pending.push(() => records.delete(target.path)) });
    pending.forEach(f => f()); return result;
  } };
  const actor: Account = { uid: 'synthetic-admin', name: 'Synthetic Admin', email: 'admin@example.test', emailVerified: true, role: 'System Administrator', status: 'Active', accessScope: 'Company-wide', personId: null, authenticationMethod: 'password' };
  const district: DistrictRecord = { id: 'd-1', name: 'Synthetic District', regionId: 'r-1', status: 'Active', version: 2 };
  const regions: RegionRecord[] = [{ id: 'r-1', name: 'Synthetic Region', status: 'Active' }];
  const people = [{ id: 'p-old', fullName: 'Previous DM', jobTitle: 'District Manager', status: 'Active', activeStatus: true }, { id: 'p-new', fullName: 'Next DM', jobTitle: 'DM', status: 'Active', activeStatus: true }] as Person[];
  const locations = [1, 2].map((n): LocationRecord => ({ id: `loc-${n}`, storeNumber: `00${n}`, name: `Synthetic Store ${n}`, type: 'Enclosed Mall', districtId: district.id, regionId: district.regionId,
    hierarchyApplicability: 'Applicable', version: n, recordStatus: n === 2 ? 'Retired' : 'Active', districtManagerId: 'p-old', districtManagerName: 'Previous DM', operationalStatus: 'Open — Normal Operations', standardHours: structuredClone(DEFAULT_WEEKLY_HOURS), phone: '+12135550100', address: 'Synthetic address', city: 'Test', state: 'CA', zipCode: '90000', timeZone: 'America/Los_Angeles' }));
  const center = { ...locations[0], id: 'center', storeNumber: '000', type: 'Corporate Office' as const };
  const all = [...locations, center];
  for (const r of regions) records.set(`regions/${r.id}`, { ...r });
  records.set(`districts/${district.id}`, { ...district });
  people.forEach(p => records.set(`people/${p.id}`, { ...p }));
  all.forEach(l => records.set(`locations/${l.id}`, { ...l }));
  const store = new FirestoreDirectoryStore(db as unknown as Firestore);
  const preview = (id: string | null = 'p-new') => previewDistrictLeadership(district, id, 'Synthetic handover test', all, people, regions);
  const audit = { action: 'District Leadership Changed', entityType: 'Setting', entityId: district.id, entityName: district.name, details: 'Synthetic handover test' };
  const commit = (writes = districtLeadershipWrites(preview()), account = actor) => store.commit(writes as DirectoryWrite[], audit, account);
  return { records, actor, district, regions, people, locations, all, store, audit, preview, commit };
}

test('District handover preview is detached, covers retired retail stores and explicitly excludes centers', () => {
  const f = fixture(); const before = structuredClone(f.all); const p = f.preview();
  assert.deepEqual(p.locations.map(l => l.storeNumber), ['001', '002']); assert.equal(p.excluded[0].id, 'center');
  p.locations[0].name = 'draft'; assert.deepEqual(f.all, before);
  assert.equal(hasDistrictLeadership(f.district), false); assert.equal(hasDistrictLeadership({ districtManagerId: null }), true);
});

test('District handover atomically persists owner and compatible store copies with audit and no other changes', async () => {
  const f = fixture(); const center = structuredClone(f.records.get('locations/center'));
  const result = await f.commit(); assert.equal(result.records.length, 3);
  assert.equal(f.records.get('districts/d-1')?.districtManagerId, 'p-new');
  for (const l of f.locations) { const saved = f.records.get(`locations/${l.id}`)!; assert.equal(saved.districtManagerId, 'p-new'); assert.equal(saved.version, l.version! + 1); assert.equal(saved.storeNumber, l.storeNumber); assert.deepEqual(saved.standardHours, l.standardHours); }
  assert.deepEqual(f.records.get('locations/center'), center);
  const audits = [...f.records].filter(([key]) => key.startsWith('audit_logs/')); assert.equal(audits.length, 1);
  assert.equal((audits[0][1].previousStates as unknown[]).length, 3);
  assert.equal(f.records.get('people/p-old')?.status, 'Active');
});

test('Explicit District vacancy clears all store DMs and does not disable a Person', async () => {
  const f = fixture(); await f.commit(districtLeadershipWrites(f.preview(null)));
  assert.equal(f.records.get('districts/d-1')?.districtManagerId, null);
  assert.equal(f.records.get('locations/loc-1')?.districtManagerId, undefined);
  assert.equal(f.records.get('locations/loc-1')?.districtManagerName, '');
  assert.equal(f.records.get('people/p-old')?.activeStatus, true);
});

for (const scenario of ['new-member', 'removed-member', 'stale-location', 'stale-district', 'missing-write', 'extra-write', 'unrelated-field', 'unrelated-district-field', 'spoofed-name', 'inactive', 'unknown-lifecycle', 'parent-conflict', 'classification-conflict'] as const) {
  test(`District handover rejects ${scenario} with zero partial writes`, async () => {
    const f = fixture(); const writes = districtLeadershipWrites(f.preview());
    if (scenario === 'new-member') f.records.set('locations/loc-extra', { ...f.locations[0], id: 'loc-extra', storeNumber: '003' });
    if (scenario === 'removed-member') f.records.delete('locations/loc-2');
    if (scenario === 'stale-location') f.records.get('locations/loc-1')!.version = 9;
    if (scenario === 'stale-district') f.records.get('districts/d-1')!.version = 9;
    if (scenario === 'missing-write') writes.pop();
    if (scenario === 'extra-write') writes.push({ collection: 'people', id: 'p-old', operation: 'set', expectedVersion: 0, data: { ...f.people[0] } });
    if (scenario === 'unrelated-field') writes[1].data!.name = 'Unrelated rename';
    if (scenario === 'unrelated-district-field') writes[0].data!.name = 'Unrelated District rename';
    if (scenario === 'spoofed-name') writes[1].data!.districtManagerName = 'Wrong copied identity';
    if (scenario === 'inactive') f.records.get('people/p-new')!.status = 'Inactive';
    if (scenario === 'unknown-lifecycle') { delete f.records.get('people/p-new')!.status; delete f.records.get('people/p-new')!.activeStatus; }
    if (scenario === 'parent-conflict') f.records.get('locations/loc-1')!.regionId = 'wrong-region';
    if (scenario === 'classification-conflict') f.records.get('locations/center')!.type = 'Unknown Kind';
    const before = structuredClone([...f.records]);
    await assert.rejects(f.commit(writes)); assert.deepEqual([...f.records], before);
  });
}

test('An opted-in District prevents store-level override, including a legacy import-shaped write', async () => {
  const f = fixture(); await f.commit(); const saved = f.records.get('locations/loc-1')!;
  await assert.rejects(f.commit([{ collection: 'locations', id: 'loc-1', operation: 'set', expectedVersion: Number(saved.version), data: { ...saved, districtManagerId: 'p-old' } }]), /District-owned DM cannot be overridden/);
  await f.commit([{ collection: 'locations', id: 'loc-1', operation: 'set', expectedVersion: Number(saved.version), data: { ...saved, name: 'Safe unrelated edit' } }]);
});

test('District-owned leader is protected from deletion/inactivation even with zero retail stores', async () => {
  const f = fixture(); f.records.set('districts/d-1', { ...f.district, districtManagerId: 'p-new' });
  for (const l of f.all) f.records.delete(`locations/${l.id}`);
  await assert.rejects(f.commit([{ collection: 'people', id: 'p-new', operation: 'set', expectedVersion: 0, data: { ...f.people[1], status: 'Inactive', activeStatus: false } }]), /Reassign or explicitly vacate District/);
});

test('Ordinary District rename preserves ownership even if an older client omits the owner field', async () => {
  const f = fixture(); await f.commit(); const d = f.records.get('districts/d-1')!;
  const data: Record<string, unknown> = { ...d, name: 'Renamed' }; delete data.districtManagerId;
  await f.commit([{ collection: 'districts', id: 'd-1', operation: 'set', expectedVersion: Number(d.version), data }]);
  assert.equal(f.records.get('districts/d-1')!.districtManagerId, 'p-new');
});

test('Editor inheritance handles new stores, moves, explicit vacancy and leaves non-retail/legacy alone', () => {
  const f = fixture(); const managed = { ...f.district, districtManagerId: 'p-new' };
  assert.equal(inheritDistrictLeader(f.locations[0], [managed], f.people).districtManagerId, 'p-new');
  assert.equal(inheritDistrictLeader(f.locations[0], [{ ...managed, districtManagerId: null }], f.people).districtManagerId, undefined);
  assert.equal(inheritDistrictLeader(f.all[2], [managed], f.people), f.all[2]);
  assert.equal(inheritDistrictLeader(f.locations[0], [f.district], f.people), f.locations[0]);
});

test('CSV preview blocks District override and signed-import confirmation independently rechecks current District ownership', async () => {
  const f = fixture(); await f.commit();
  const loc = f.records.get('locations/loc-1')!;
  const snapshot = { locations: [loc] as unknown as LocationRecord[], people: f.people, regions: f.regions, districts: [{ ...f.district, districtManagerId: 'p-new' }] };
  const preview = previewLocationImport('SchemaVersion,LocationId,DistrictManagerId\r\nlocations-v1,loc-1,p-old\r\n', snapshot);
  assert(preview.rows[0].issues.some(i => i.severity === 'error' && i.code === 'invalid_hierarchy' && i.reason.includes('inherits')));
  const manifest: LocationImportManifest = { version: 1, schema: 'locations-v1', actorDigest: 'synthetic', sourceDigest: 'synthetic', operationId: 'op-managed', batchId: 'batch-managed', issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), warningCount: 0,
    summary: { totalRows: 1, additions: 0, updates: 1, unchanged: 0, blocked: 0, warnings: 0 }, unchanged: [],
    writes: [{ rowNumber: 2, action: 'update', id: 'loc-1', expectedVersion: Number(loc.version), data: { ...loc, districtManagerId: 'p-old' } }] };
  const before = structuredClone([...f.records]);
  await assert.rejects(f.store.confirmLocationImport(manifest, f.actor), /District-owned DM cannot be overridden/);
  assert.deepEqual([...f.records], before);
});

test('Authenticated HTTP handover passes versioned membership to storage; other roles and malformed manifests are denied', async () => {
  const f = fixture(); let role = f.actor.role;
  const app = express(); app.use(express.json()); app.use('/api/directory', createDirectoryDataRouter(async () => ({ ...f.actor, role }), f.store));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const send = (writes: unknown) => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/directory/commit`, { method: 'POST', headers: { authorization: 'Bearer synthetic', 'Content-Type': 'application/json' }, body: JSON.stringify({ writes, audit: f.audit }) });
  try {
    const writes = districtLeadershipWrites(f.preview()); role = 'Editor'; assert.equal((await send(writes)).status, 403);
    role = 'System Administrator'; const bad = structuredClone(writes); bad[0].districtLeadershipMembers![0].version = -1; assert.equal((await send(bad)).status, 403);
    assert.equal((await send(writes)).status, 200);
  } finally { server.close(); await once(server, 'close'); }
});

test('Preview blocks ambiguous scope, absent/unknown people, no-op and oversized districts', () => {
  const f = fixture();
  assert.throws(() => previewDistrictLeadership(f.district, 'missing', 'test reason', f.all, f.people, f.regions));
  assert.throws(() => previewDistrictLeadership(f.district, 'p-new', 'x', f.all, f.people, f.regions));
  assert.throws(() => previewDistrictLeadership({ ...f.district, districtManagerId: 'p-old' }, 'p-old', 'test reason', f.all, f.people, f.regions), /already/);
  assert.throws(() => previewDistrictLeadership(f.district, 'p-new', 'test reason', [...f.all, { ...f.locations[0], id: 'unknown', type: '' } as unknown as LocationRecord], f.people, f.regions), /unknown type/);
  assert.throws(() => previewDistrictLeadership(f.district, 'p-new', 'test reason', Array.from({ length: 100 }, (_, n) => ({ ...f.locations[0], id: `many-${n}` })), f.people, f.regions), /99-store/);
});
