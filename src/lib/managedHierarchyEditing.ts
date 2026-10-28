import { classifyHierarchyLocationType } from './hierarchyResolution';
/** Bootstrap records retain internal organization ownership metadata. A recognized or future
 * model must use its reviewed command; it must never fall back to legacy generic editing. */
export function requiresManagedHierarchyReview(unit: unknown): boolean {
  return !!unit && typeof unit === 'object' && Object.hasOwn(unit, 'leadershipModelVersion');
}
/** Changing retail format or non-retail subtype keeps use; crossing either boundary needs review. */
export function preservesLocationClassification(before:unknown,after:unknown):boolean{
  if(before===after)return true;
  const previous=classifyHierarchyLocationType(before),next=classifyHierarchyLocationType(after);
  return previous!=='unclassified'&&previous===next;
}
