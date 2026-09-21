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

export function hierarchyDistrictLabel(hierarchy: ResolvedLocationHierarchy | undefined, isRetail = false): string {
  if (!hierarchy) return 'Unassigned District';
  if (hierarchy.districtId) {
    const base = hierarchy.districtName ? `${hierarchy.districtName} (${hierarchy.districtId})` : `Unresolved District (${hierarchy.districtId})`;
    const issues = [...hierarchy.hierarchyIssues, ...hierarchy.applicabilityIssues];
    return issues.length > 0 ? `${base} - ${issues.join(' ')}` : base;
  }
  const key = resolveHierarchyGroupKey(hierarchy, isRetail);
  if (key.kind === 'operational-centers') return 'No retail district';
  if (key.kind === 'unassigned-retail') return 'Unassigned District';
  return `Needs Review - ${needsReviewReason(hierarchy, isRetail)}`;
}

function needsReviewReason(hierarchy: ResolvedLocationHierarchy, isRetail: boolean): string {
  const issues = [...hierarchy.hierarchyIssues, ...hierarchy.applicabilityIssues];
  if (issues.length > 0) return issues.join(' ');
  if (hierarchy.hierarchyApplicability === 'Unknown') return 'Hierarchy applicability is Unknown.';
  if (!isRetail) return 'Applicable to hierarchy but missing its District assignment.';
  return 'Hierarchy applicability needs review.';
}

export type HierarchyGroupKind = 'district' | 'unassigned-retail' | 'operational-centers' | 'needs-review';

export interface HierarchyGroupKey {
  kind: HierarchyGroupKind;
  districtId?: string;
}

/**
 * `isRetail` reflects the Location's business type (see `isRetailHierarchyType`), independent of
 * `hierarchyApplicability`. Applicability answers whether hierarchy applies; it never identifies
 * whether a Location is a retail store, so callers must pass the type-derived flag explicitly.
 */
// Namespaced so a District ID can never collide with a non-District group key or a renamed label.
export function resolveHierarchyGroupKey(hierarchy: ResolvedLocationHierarchy | undefined, isRetail: boolean): HierarchyGroupKey {
  if (hierarchy?.districtId) return { kind: 'district', districtId: hierarchy.districtId };
  const applicability = hierarchy?.hierarchyApplicability;
  const hasIssues = (hierarchy?.applicabilityIssues.length ?? 0) > 0;
  if (isRetail) {
    if (applicability === 'Applicable' && !hasIssues) return { kind: 'unassigned-retail' };
    return { kind: 'needs-review' };
  }
  if (applicability === 'Not Applicable' && !hasIssues) return { kind: 'operational-centers' };
  return { kind: 'needs-review' };
}

export function hierarchyGroupId(key: HierarchyGroupKey): string {
  return key.kind === 'district' ? `district:${key.districtId}` : key.kind;
}

// District names are shared registry data, so group headings may show them; per-Location diagnostics
// (hierarchyIssues/applicabilityIssues) are never summarized at the group level and are shown per row.
export function hierarchyGroupLabel(key: HierarchyGroupKey, hierarchy: ResolvedLocationHierarchy | undefined): string {
  if (key.kind === 'district') {
    return hierarchy?.districtName ? `${hierarchy.districtName} (${key.districtId})` : `Unresolved District (${key.districtId})`;
  }
  if (key.kind === 'operational-centers') return 'Operational Centers / Non-retail Locations';
  if (key.kind === 'unassigned-retail') return 'Unassigned Retail Locations';
  return 'Needs Review';
}


function referenceId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export interface LocationHierarchyControlFields {
  regionId?: string;
  districtId?: string;
  hierarchyApplicability?: EffectiveHierarchyApplicability;
}

// Selecting a Region clears the prior District and, once a reference exists, makes the record explicitly Applicable.
export function applyLocationRegionSelection<T extends LocationHierarchyControlFields>(current: T, regionId: string): T {
  return { ...current, regionId: regionId || undefined, districtId: undefined, hierarchyApplicability: regionId ? 'Applicable' : current.hierarchyApplicability };
}

export function applyLocationDistrictSelection<T extends LocationHierarchyControlFields>(current: T, districtId: string): T {
  return { ...current, districtId: districtId || undefined, hierarchyApplicability: districtId ? 'Applicable' : current.hierarchyApplicability };
}

export interface QuickAddHierarchyControlFields {
  regionId: string;
  districtId: string;
  hierarchyApplicability: '' | EffectiveHierarchyApplicability;
}

// Fleet Quick Add uses required string fields (empty string, not undefined) for its uncommitted draft form state.
export function applyQuickAddRegionSelection<T extends QuickAddHierarchyControlFields>(current: T, regionId: string): T {
  return { ...current, regionId, districtId: '', hierarchyApplicability: regionId ? 'Applicable' : current.hierarchyApplicability };
}

export function applyQuickAddDistrictSelection<T extends QuickAddHierarchyControlFields>(current: T, districtId: string): T {
  return { ...current, districtId, hierarchyApplicability: districtId ? 'Applicable' : current.hierarchyApplicability };
}