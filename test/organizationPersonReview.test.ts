import test from 'node:test';
import assert from 'node:assert/strict';
import type { OrganizationCatalog, OrganizationUnitSummary } from '../src/lib/organizationLeadershipContract';
import { organizationPersonResponsibilities, organizationPositionConflicts, readOrganizationPersonReview } from '../src/lib/organizationPersonReview';

const unit = (type: 'region' | 'district', id: string, primary: boolean): OrganizationUnitSummary => ({ unitType: type, id, name: id, status: 'Active', regionId: null, version: 1, leadershipVersion: 1, ownership: 'managed', assignmentState: 'assigned', primaryPersonId: primary ? 'subject' : 'other', members: [{ personId: 'subject', fullName: 'Synthetic Person', isPrimary: primary, eligible: true, issues: [] }], storeCount: 0, issues: [] });
const catalog = (): OrganizationCatalog => ({ schemaVersion: 1, evaluatedAt: '2026-10-28T00:00:00.000Z', complete: true, issues: [], people: [], units: [unit('district', '01', false), unit('region', '01', true)] });

test('canonical responsibility review includes Additional and Region ownership with namespaced identities', () => {
  const result = organizationPersonResponsibilities(catalog(), 'subject');
  assert.equal(result.length, 2); assert.equal(result[0].members[0].isPrimary, false);
  assert.equal(organizationPersonResponsibilities(catalog(), 'absent').length, 0);
  assert.deepEqual(organizationPositionConflicts(result, ['district-manager']).map(u => u.unitType), ['region']);
  assert.equal(organizationPositionConflicts(result, ['regional-manager', 'district-manager', 'store-manager']).length, 0);
});
test('disabled catalog is explicit legacy mode without a catalog read', async () => {
  assert.deepEqual(await readOrganizationPersonReview({ capabilities: async () => ({ catalogEnabled: false }), catalog: async () => { throw new Error('must not read'); } }, 'subject'), { phase: 'legacy', units: [] });
});
test('failed, incomplete or invalid organization source never implies no assignments', async () => {
  const port = (value: OrganizationCatalog) => ({ capabilities: async () => ({ catalogEnabled: true }), catalog: async () => value });
  const ready = await readOrganizationPersonReview(port(catalog()), 'subject'); assert.equal(ready.phase, 'ready'); assert.equal(ready.units.length, 2);
  for (const fault of [(c: OrganizationCatalog) => c.issues.push('source issue'), (c: OrganizationCatalog) => c.units[0].ownership = 'unsupported', (c: OrganizationCatalog) => c.units[0].assignmentState = 'invalid']) {
    const c = catalog(); fault(c); await assert.rejects(readOrganizationPersonReview(port(c), 'absent'), /organization review/);
  }
  await assert.rejects(readOrganizationPersonReview({ capabilities: async () => { throw new Error('offline'); }, catalog: async () => catalog() }, 'subject'), /offline/);
  const incomplete = { ...catalog(), complete: false } as unknown as OrganizationCatalog;
  await assert.rejects(readOrganizationPersonReview(port(incomplete), 'absent'), /organization review/);
});
