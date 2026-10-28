import type { OrganizationCatalog, OrganizationUnitSummary } from './organizationLeadershipContract';

export type OrganizationPersonReview = { phase: 'loading' | 'legacy' | 'ready' | 'unavailable'; units: OrganizationUnitSummary[] };
/** Read-only review of canonical Primary AND Additional memberships. Never offboarding clearance. */
export function organizationPersonResponsibilities(catalog: OrganizationCatalog, personId: string) {
  return catalog.units.filter(unit => unit.ownership === 'managed' && unit.members.some(member => member.personId === personId));
}
export function organizationPositionConflicts(units: OrganizationUnitSummary[], positions: readonly string[]) {
  return units.filter(unit => !positions.includes(unit.unitType === 'district' ? 'district-manager' : 'regional-manager'));
}
export async function readOrganizationPersonReview(port: { capabilities(): Promise<{ catalogEnabled: boolean }>; catalog(): Promise<OrganizationCatalog> }, personId: string): Promise<OrganizationPersonReview> {
  if (!(await port.capabilities()).catalogEnabled) return { phase: 'legacy', units: [] };
  const catalog = await port.catalog();
  // An invalid source cannot establish absence, even when the member projection is empty.
  if (catalog.complete !== true || catalog.issues.length || catalog.units.some(unit => unit.ownership === 'unsupported' || unit.assignmentState === 'invalid')) throw new Error('Resolve the organization review before changing positions or status.');
  return { phase: 'ready', units: organizationPersonResponsibilities(catalog, personId) };
}
