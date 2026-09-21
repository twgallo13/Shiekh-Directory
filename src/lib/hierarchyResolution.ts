import type { HierarchyRegistry } from './hierarchyAssignmentContract';

export type HierarchyResolutionStatus = 'unassigned' | 'resolved' | 'retired-reference' | 'unresolved-reference' | 'parent-mismatch';
export type EffectiveHierarchyApplicability = 'Applicable' | 'Not Applicable' | 'Unknown';

export interface ResolvedLocationHierarchy {
  regionId: string | null;
  regionName: string | null;
  regionStatus: 'Active' | 'Retired' | null;
  districtId: string | null;
  districtName: string | null;
  districtStatus: 'Active' | 'Retired' | null;
  hierarchyStatus: HierarchyResolutionStatus;
  hierarchyIssues: string[];
  hierarchyApplicability: EffectiveHierarchyApplicability;
  applicabilityIssues: string[];
}

export const RETAIL_HIERARCHY_TYPES = ['Enclosed Mall', 'Strip Center / Shopping Center', 'Street / Standalone Location'] as const;
const retailTypes = new Set<string>(RETAIL_HIERARCHY_TYPES);

export function isRetailHierarchyType(type: unknown): boolean {
  return retailTypes.has(String(type ?? ''));
}

export function canSelectNotApplicableHierarchy(type: unknown): boolean {
  return !isRetailHierarchyType(type);
}

export interface HierarchyResolutionInput {
  regionId?: unknown;
  districtId?: unknown;
  type?: unknown;
  hierarchyApplicability?: unknown;
}

export function resolveHierarchyApplicability(location: HierarchyResolutionInput): { value: EffectiveHierarchyApplicability; issues: string[] } {
  const saved = location.hierarchyApplicability;
  if (saved === 'Applicable' || saved === 'Not Applicable' || saved === 'Unknown') {
    const issues: string[] = [];
    if (retailTypes.has(String(location.type || '')) && saved === 'Not Applicable') issues.push('Retail location is marked Not Applicable.');
    if (saved === 'Not Applicable' && (referenceId(location.regionId) || referenceId(location.districtId))) issues.push('Not Applicable location retains canonical hierarchy references.');
    return { value: saved, issues };
  }
  if (saved !== undefined && saved !== null && saved !== '') return { value: 'Unknown', issues: [`Unsupported hierarchy applicability value: ${String(saved)}.`] };
  if (retailTypes.has(String(location.type || ''))) return { value: 'Applicable', issues: [] };
  return { value: referenceId(location.regionId) || referenceId(location.districtId) ? 'Applicable' : 'Not Applicable', issues: [] };
}

export function resolveLocationHierarchy(
  location: HierarchyResolutionInput,
  registry: HierarchyRegistry,
): ResolvedLocationHierarchy {
  const regionId = referenceId(location.regionId);
  const districtId = referenceId(location.districtId);
  const region = regionId ? registry.regions.find(item => item.id === regionId) : undefined;
  const district = districtId ? registry.districts.find(item => item.id === districtId) : undefined;
  const hierarchyIssues: string[] = [];
  const applicability = resolveHierarchyApplicability(location);

  if (regionId && !region) hierarchyIssues.push(`Region ${regionId} is missing from the hierarchy registry.`);
  if (districtId && !district) hierarchyIssues.push(`District ${districtId} is missing from the hierarchy registry.`);
  if (district && district.regionId !== regionId) {
    hierarchyIssues.push(`District ${district.id} belongs to Region ${district.regionId}, not ${regionId || 'an unassigned Region'}.`);
  }
  if (region?.status === 'Retired') hierarchyIssues.push(`Region ${region.id} is retired.`);
  if (district?.status === 'Retired') hierarchyIssues.push(`District ${district.id} is retired.`);

  let hierarchyStatus: HierarchyResolutionStatus = 'resolved';
  if (!regionId && !districtId) hierarchyStatus = 'unassigned';
  else if (district && district.regionId !== regionId) hierarchyStatus = 'parent-mismatch';
  else if ((regionId && !region) || (districtId && !district)) hierarchyStatus = 'unresolved-reference';
  else if (region?.status === 'Retired' || district?.status === 'Retired') hierarchyStatus = 'retired-reference';

  return {
    regionId,
    regionName: region?.name || null,
    regionStatus: region?.status || null,
    districtId,
    districtName: district?.name || null,
    districtStatus: district?.status || null,
    hierarchyStatus,
    hierarchyIssues,
    hierarchyApplicability: applicability.value,
    applicabilityIssues: applicability.issues,
  };
}

export function canonicalHierarchyState(registry: HierarchyRegistry): string {
  return JSON.stringify({
    regions: registry.regions
      .map(region => ({ id: region.id, name: region.name, status: region.status || 'Active' }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    districts: registry.districts
      .map(district => ({ id: district.id, name: district.name, regionId: district.regionId, status: district.status || 'Active' }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function hierarchyDistrictLabel(hierarchy: ResolvedLocationHierarchy | undefined): string {
  if (!hierarchy) return 'Unassigned District';
  const label = !hierarchy.districtId
    ? 'Unassigned District'
    : hierarchy.districtName
      ? `${hierarchy.districtName} (${hierarchy.districtId})`
      : `Unresolved District (${hierarchy.districtId})`;
  const issues = [...hierarchy.hierarchyIssues, ...hierarchy.applicabilityIssues];
  return issues.length > 0 ? `${label} - ${issues.join(' ')}` : label;
}

export type HierarchyGroupKind = 'district' | 'unassigned-retail' | 'operational-centers' | 'needs-review';

export interface HierarchyGroupKey {
  kind: HierarchyGroupKind;
  districtId?: string;
}

// Namespaced so a District ID can never collide with a non-District group key or a renamed label.
export function resolveHierarchyGroupKey(hierarchy: ResolvedLocationHierarchy | undefined): HierarchyGroupKey {
  if (hierarchy?.districtId) return { kind: 'district', districtId: hierarchy.districtId };
  if (hierarchy?.hierarchyApplicability === 'Not Applicable' && hierarchy.applicabilityIssues.length === 0) {
    return { kind: 'operational-centers' };
  }
  if (hierarchy?.hierarchyApplicability === 'Applicable') return { kind: 'unassigned-retail' };
  return { kind: 'needs-review' };
}

export function hierarchyGroupId(key: HierarchyGroupKey): string {
  return key.kind === 'district' ? `district:${key.districtId}` : key.kind;
}

export function hierarchyGroupLabel(key: HierarchyGroupKey, hierarchy: ResolvedLocationHierarchy | undefined): string {
  if (key.kind === 'district') {
    const base = hierarchy?.districtName ? `${hierarchy.districtName} (${key.districtId})` : `Unresolved District (${key.districtId})`;
    const issues = [...(hierarchy?.hierarchyIssues || []), ...(hierarchy?.applicabilityIssues || [])];
    return issues.length > 0 ? `${base} - ${issues.join(' ')}` : base;
  }
  if (key.kind === 'operational-centers') return 'Operational Centers / Non-retail Locations';
  if (key.kind === 'unassigned-retail') return 'Unassigned Retail Locations';
  return 'Needs Review';
}


function referenceId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}