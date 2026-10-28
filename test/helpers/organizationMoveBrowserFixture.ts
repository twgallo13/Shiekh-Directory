import type { OrganizationCatalog } from '../../src/lib/organizationLeadershipContract';
import type { LocationRecord } from '../../src/types';
import type { OrganizationMoveIntent, OrganizationMovePreparation, OrganizationMoveHierarchy } from '../../src/lib/organizationMoveContract';
export function moveBrowserFixture() {
  const catalog: OrganizationCatalog = { schemaVersion: 1, complete: true, evaluatedAt: new Date().toISOString(), issues: [], people: [], units: [] };
  for (const [type, id, name, regionId, manager] of [['region','01','West',null,null], ['region','02','East',null,'New Manager'], ['district','01','Central','01','Current Manager'], ['district','02','North','02','New Manager']] as const) {
    const personId = manager === 'Current Manager' ? 'incumbent' : manager ? 'new-hire' : null;
    catalog.units.push({ unitType: type, id, name, regionId, status: 'Active', version: id === '01' && type === 'district' ? 3 : 1, leadershipVersion: 1, ownership: 'managed', assignmentState: manager ? 'assigned' : 'vacant', primaryPersonId: personId,
      members: personId ? [{ personId, fullName: manager!, isPrimary: true, eligible: true, issues: [] }] : [], storeCount: type === 'district' && id === '02' ? 0 : 1, issues: [] });
  }
  catalog.people = [{ id: 'incumbent', fullName: 'Current Manager', eligibleUnitTypes: ['district'] }, { id: 'new-hire', fullName: 'New Manager', eligibleUnitTypes: ['district','region'] }];
  const locations = [{ id: '007', storeNumber: '007', name: 'Southland Mall', version: 4, type: 'Enclosed Mall', recordStatus: 'Active', districtId: '01', regionId: '01', districtManagerId: 'incumbent', districtManagerName: 'Current Manager', regionalManagerId: null, regionalManagerName: '', storeManagerId: 'store-manager', storeManagerName: 'Store Manager' }] as unknown as LocationRecord[];
  return { catalog, locations };
}
export function moveBrowserPreparation(intent: OrganizationMoveIntent, catalog: OrganizationCatalog, locations: LocationRecord[]): OrganizationMovePreparation {
  const source = intent.kind === 'store' ? locations.find(l => l.id === intent.id)! : catalog.units.find(u => u.unitType === 'district' && u.id === intent.id)!;
  const hierarchy = (districtId: string, regionId?: string): OrganizationMoveHierarchy => {
    const d = catalog.units.find(u => u.unitType === 'district' && u.id === districtId)!, r = catalog.units.find(u => u.unitType === 'region' && u.id === (regionId ?? d.regionId))!;
    return { districtId: d.id, districtName: d.name, regionId: r.id, regionName: r.name, districtManager: { id: d.primaryPersonId, name: d.members.find(m => m.isPrimary)?.fullName ?? '' }, regionalManager: { id: r.primaryPersonId, name: r.members.find(m => m.isPrimary)?.fullName ?? '' } };
  };
  const stores = (intent.kind === 'store' ? [source as LocationRecord] : locations.filter(l => l.districtId === source.id)).map(l => ({ id: l.id, storeNumber: l.storeNumber, name: l.name, recordStatus: l.recordStatus }));
  const before = hierarchy(intent.kind === 'store' ? (source as LocationRecord).districtId! : source.id);
  return { schemaVersion: 1, operationId: intent.operationId, state: 'prepared', updatedAt: catalog.evaluatedAt, expiresAt: new Date(Date.parse(catalog.evaluatedAt) + 600000).toISOString(), reviewHash: 'a'.repeat(64),
    review: { kind: intent.kind, id: source.id, name: source.name, reason: intent.reason.trim(), before, after: intent.kind === 'store' ? hierarchy(intent.targetId) : hierarchy(source.id, intent.targetId), stores, excludedNonRetail: 0, businessDocuments: stores.length + (intent.kind === 'district' ? 1 : 0) } };
}
