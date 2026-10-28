import type { OrganizationCatalog, OrganizationLeadershipIntent, OrganizationPreparation } from '../../src/lib/organizationLeadershipContract';
export function organizationCatalogFixture(): OrganizationCatalog {
  return { schemaVersion: 1, complete: true, evaluatedAt: '2026-10-28T12:00:00.000Z', issues: [], units: [
    { unitType: 'region', id: '01', name: 'West', status: 'Active', regionId: null, version: 1, leadershipVersion: 0, ownership: 'legacy', assignmentState: 'unmanaged', primaryPersonId: null, members: [], storeCount: 1, issues: [] },
    { unitType: 'district', id: '01', name: 'Central', status: 'Active', regionId: '01', version: 3, leadershipVersion: 2, ownership: 'managed', assignmentState: 'assigned', primaryPersonId: 'incumbent',
      members: [{ personId: 'incumbent', fullName: 'Current Manager', isPrimary: true, eligible: true, issues: [] }], storeCount: 1, issues: [] },
  ], people: [
    { id: 'incumbent', fullName: 'Current Manager', eligibleUnitTypes: ['district'] },
    { id: 'new-hire', fullName: 'New Manager', eligibleUnitTypes: ['district', 'region'] },
  ] };
}
export function organizationPreparedFixture(intent: OrganizationLeadershipIntent, catalog = organizationCatalogFixture()): OrganizationPreparation {
  return { schemaVersion: 1, operationId: intent.operationId, state: 'prepared', updatedAt: catalog.evaluatedAt, expiresAt: new Date(Date.parse(catalog.evaluatedAt) + 600_000).toISOString(), reviewHash: 'a'.repeat(64),
    review: intent.units.map(u => {
      const before = catalog.units.find(unit => unit.unitType === u.unitType && unit.id === u.unitId)!;
      return { unitType: u.unitType, unitId: u.unitId, name: before.name, reason: u.reason.trim(), activating: u.activateLegacy, beforePrimaryPersonId: before.primaryPersonId, primaryPersonId: u.primaryPersonId,
        added: u.memberPersonIds.filter(id => !before.members.some(m => m.personId === id)), ended: before.members.filter(m => !u.memberPersonIds.includes(m.personId)).map(m => m.personId),
        members: u.memberPersonIds.map(id => ({ personId: id, fullName: catalog.people.find(p => p.id === id)!.fullName, isPrimary: id === u.primaryPersonId })), compatibilityStores: before.primaryPersonId === u.primaryPersonId ? 0 : 1 };
    }) };
}
