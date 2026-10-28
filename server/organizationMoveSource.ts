import type { Firestore, Transaction } from '@google-cloud/firestore';
import { canonicalId } from './personnelProjection';
import { LeadershipPlanError, leadershipUnitKey, type OrganizationLeadershipSnapshot } from './organizationLeadershipPlanner';
import { normalizeOrganizationMoveIntent, planOrganizationMove, type OrganizationMoveIntent } from './organizationMovePlanner';
import { readOrganizationSnapshot } from './organizationLeadershipSource';

/** Derive exact namespaced roster queries from the transaction's complete hierarchy and membership.
 * No candidate, browser cache, workplace, name lookup or contact inventory supplies ownership.
 */
export function organizationMoveDependencies(snapshot: OrganizationLeadershipSnapshot, intent: OrganizationMoveIntent) {
  const result = new Map<string, { unitType: 'district' | 'region'; unitId: string }>();
  const add = (type: 'district' | 'region', id: unknown) => {
    if (!canonicalId(id)) throw new LeadershipPlanError('incomplete_source', 'Exact hierarchy dependency is missing.');
    const row = snapshot.units.find(u => u.unitType === type && u.id === id);
    if (!row) throw new LeadershipPlanError('incomplete_source', 'Exact hierarchy dependency is missing.');
    result.set(leadershipUnitKey(type, id), { unitType: type, unitId: id }); return row;
  };
  const sourceStore = intent.kind === 'store' ? snapshot.locations.find(l => l.id === intent.id) : undefined;
  if (intent.kind === 'store' && !sourceStore) throw new LeadershipPlanError('incomplete_source', 'Exact store source is missing.');
  const district = add('district', intent.kind === 'district' ? intent.id : sourceStore!.data.districtId);
  add('region', district.data.regionId);
  if (intent.kind === 'store') add('region', add('district', intent.targetId).data.regionId);
  else add('region', intent.targetId);
  return [...result.values()];
}

/** Internal read-only adapter. Caller must authenticate and recheck live administrator authority
 * in this same SDK transaction. Native metadata and query read-set are for a future reviewed writer;
 * this function itself has no prepare/receipt/commit/API/admission or permission capability.
 */
export async function readOrganizationMovePlan(firestore: Firestore, transaction: Transaction, raw: unknown, now: string) {
  const intent = normalizeOrganizationMoveIntent(raw);
  const { snapshot, native } = await readOrganizationSnapshot(firestore, transaction, source => organizationMoveDependencies(source, intent));
  return { intent, plan: planOrganizationMove(intent, snapshot, now), native };
}
