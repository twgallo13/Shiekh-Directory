import type { LocationRecord } from '../types';
import type { OrganizationCatalog, OrganizationUnitSummary } from './organizationLeadershipContract';
import type { OrganizationMoveIntent } from './organizationMoveContract';
import { classifyHierarchyLocationType, resolveHierarchyApplicability } from './hierarchyResolution';

export interface OrganizationMoveSelection { kind: 'store' | 'district'; id: string; regionId: string; districtId: string; reason: string }
export const emptyMoveSelection = (): OrganizationMoveSelection => ({ kind: 'store', id: '', regionId: '', districtId: '', reason: '' });
const version = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) < Number.MAX_SAFE_INTEGER;
export function moveUnitReady(u: OrganizationUnitSummary) {
  return u.status === 'Active' && u.ownership === 'managed' && !u.issues.length && version(u.version) && version(u.leadershipVersion)
    && (u.assignmentState === 'assigned' || u.assignmentState === 'vacant');
}
export function moveStoreReady(l: LocationRecord) {
  const applicable = resolveHierarchyApplicability(l);
  return classifyHierarchyLocationType(l.type) === 'retail' && applicable.value === 'Applicable' && !applicable.issues.length
    && ['Active', 'Retired', 'Draft'].includes(l.recordStatus) && !!l.districtId && !!l.regionId && version(l.version);
}
/** UI convenience only. The server rereads every source, roster and membership dependency. */
export function buildOrganizationMoveDraft(catalog: OrganizationCatalog, locations: LocationRecord[], selection: OrganizationMoveSelection): Omit<OrganizationMoveIntent, 'operationId'> {
  if (catalog.issues.length) throw new Error('Organization records need review before moving stores or Districts.');
  const unit = (type: 'district' | 'region', id: string) => {
    const u = catalog.units.find(u => u.unitType === type && u.id === id);
    if (!u || !moveUnitReady(u)) throw new Error('Choose an active District or Region with completed manager setup.');
    return u;
  };
  if (!selection.id || !selection.regionId || selection.kind === 'store' && !selection.districtId) throw new Error('Choose the source and destination to continue.');
  let expectedVersion: number, targetId: string, expectedTargetVersion: number;
  const destinationRegion = unit('region', selection.regionId);
  if (selection.kind === 'store') {
    const store = locations.find(l => l.id === selection.id);
    if (!store || !moveStoreReady(store)) throw new Error('This store needs hierarchy review before it can move.');
    const oldDistrict = unit('district', store.districtId!), oldRegion = unit('region', store.regionId!);
    if (oldDistrict.regionId !== oldRegion.id) throw new Error('Resolve the current store hierarchy before moving.');
    const target = unit('district', selection.districtId);
    if (target.regionId !== destinationRegion.id) throw new Error('Choose a District within the selected Region.');
    if (oldDistrict.id === target.id) throw new Error('Choose a different District.');
    expectedVersion = store.version!; targetId = target.id; expectedTargetVersion = target.version!;
  } else {
    const source = unit('district', selection.id); unit('region', source.regionId!);
    if (source.regionId === destinationRegion.id) throw new Error('Choose a different Region.');
    expectedVersion = source.version!; targetId = destinationRegion.id; expectedTargetVersion = destinationRegion.version!;
  }
  const reason = selection.reason.replace(/\r\n?|\n|\t/g, ' ').replace(/ {2,}/g, ' ').trim();
  if (/[\u0000-\u001f\u007f]/.test(reason)) throw new Error('Remove unsupported characters from the reason before reviewing.');
  if (reason.length < 5 || reason.length > 500) throw new Error('Add a short reason between 5 and 500 characters.');
  return { schemaVersion: 1, kind: selection.kind, id: selection.id, expectedVersion, targetId, expectedTargetVersion, reason };
}
