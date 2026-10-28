/** Bootstrap records retain internal organization ownership metadata. A recognized or future
 * model must use its reviewed command; it must never fall back to legacy generic editing. */
export function requiresManagedHierarchyReview(unit: unknown): boolean {
  return !!unit && typeof unit === 'object' && Object.hasOwn(unit, 'leadershipModelVersion');
}
