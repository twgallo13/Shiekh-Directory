import { leadershipFixture, leadershipNow } from './organizationLeadershipFixture';
import type { OrganizationMoveIntent } from '../../server/organizationMovePlanner';

export function moveFixture() {
  const f = leadershipFixture();
  Object.assign(f.records.get('regions/01'), { leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: null });
  f.records.set('regions/02', { name: 'East', status: 'Active', version: 1, leadershipModelVersion: 1, leadershipVersion: 1, regionalManagerId: 'new-hire' });
  f.records.set('districts/02', { name: 'North', regionId: '02', status: 'Active', version: 1, leadershipModelVersion: 1, leadershipVersion: 1, districtManagerId: 'new-hire' });
  for (const type of ['region', 'district']) f.records.set(`leadership_assignments/${type}-02`, { unitType: type, unitId: '02', personId: 'new-hire', status: 'active', startedAt: leadershipNow, endedAt: null, version: 1 });
  const intent: OrganizationMoveIntent = { schemaVersion: 1, operationId: 'move-1', kind: 'store', id: '007', expectedVersion: 4, targetId: '02', expectedTargetVersion: 1, reason: 'Explicit synthetic membership move' };
  return { ...f, intent };
}
