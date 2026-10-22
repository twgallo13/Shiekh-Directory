import { isDeepStrictEqual } from 'node:util';
import { isRetailHierarchyType } from '../src/lib/hierarchyResolution';
import { personLifecycle } from '../src/lib/personLifecycle';
import { allowsLeadershipPosition, LEADERSHIP_POSITION_FIELDS, validPositionIds, type PositionPerson } from '../src/lib/personPositions';

/** Check final assignments for every writer; grandfather unmapped legacy records, not new conflicts. */
export function validatePersonPositionState(
  writes: { collection: string; id: string; operation: string; data?: Record<string, unknown> }[],
  previous: (Record<string, unknown> | undefined)[],
  people: ({ id: string } & PositionPerson)[], locations: Record<string, unknown>[],
  districts: { id: string; districtManagerId?: unknown }[],
) {
  const mappedChanges = new Set<string>();
  writes.forEach((w, i) => {
    if (w.collection !== 'people' || w.operation !== 'set' || !Object.hasOwn(w.data!, 'positionIds') || isDeepStrictEqual(w.data!.positionIds, previous[i]?.positionIds)) return;
    if (!validPositionIds(w.data!.positionIds)) throw new Error('Choose unique positions from the approved position list.');
    mappedChanges.add(w.id);
  });
  const finalLocations = new Map(locations.map(l => [String(l.id), l]));
  const finalDistricts = new Map<string, Record<string, unknown>>(districts.map(d => [d.id, d]));
  for (const w of writes) {
    const records = w.collection === 'locations' ? finalLocations : w.collection === 'districts' ? finalDistricts : null;
    if (records) { if (w.operation === 'delete') records.delete(w.id); else records.set(w.id, { ...records.get(w.id), ...w.data, id: w.id }); }
  }
  const check = (record: Record<string, unknown>, field: keyof typeof LEADERSHIP_POSITION_FIELDS, id: unknown, collection: string) => {
    if (typeof id !== 'string' || !id) return;
    const index = writes.findIndex(w => w.collection === collection && w.id === record.id);
    const before = index >= 0 ? previous[index]?.[field] : undefined;
    const added = index >= 0 && (Array.isArray(record[field]) ? !(Array.isArray(before) && before.includes(id)) : before !== id);
    if (!added && !mappedChanges.has(id)) return;
    const person = people.find(p => p.id === id);
    if (person && Object.hasOwn(person, 'positionIds') && personLifecycle(person) !== 'active') throw new Error('Controlled leadership assignments require a clearly Active Person. Resolve lifecycle before assigning or mapping responsibilities.');
    if (person && !allowsLeadershipPosition(person, LEADERSHIP_POSITION_FIELDS[field])) {
      throw new Error(`Position change conflicts with ${LEADERSHIP_POSITION_FIELDS[field]} responsibility on ${collection === 'districts' ? 'District' : 'Location'} ${String(record.name || record.id)}. Retain that position explicitly or reassign/vacate the responsibility first.`);
    }
  };
  for (const l of finalLocations.values()) for (const field of Object.keys(LEADERSHIP_POSITION_FIELDS) as (keyof typeof LEADERSHIP_POSITION_FIELDS)[]) {
    const d = finalDistricts.get(String(l.districtId));
    if (field === 'districtManagerId' && isRetailHierarchyType(l.type) && d && Object.hasOwn(d, 'districtManagerId')) continue;
    const value = l[field]; for (const id of Array.isArray(value) ? value : [value]) check(l, field, id, 'locations');
  }
  for (const d of finalDistricts.values()) check(d, 'districtManagerId', d.districtManagerId, 'districts');
}
