import { isDeepStrictEqual } from 'node:util';
import type { DirectoryWrite } from './firestoreDirectory';
import { DirectoryValidationError } from './firestoreDirectory';
import { personLifecycle } from '../src/lib/personLifecycle';
import { canonicalId } from './personnelProjection';

const scalar = ['storeManagerId', 'districtManagerId', 'regionalManagerId'] as const;
const lists = ['assistantStoreManagerIds', 'keyHolderIds'] as const;
const fail = (message: string): never => { throw new DirectoryValidationError(message); };
const strip = (row: Record<string, unknown>, keys: string[]) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const metadata = ['id', 'version', 'updatedAt'];
// Ordinary Location normalization omits empty ID fields. A command-written null vacancy
// remains the same vacancy; no non-empty relationship may disappear or change here.
const normalizedLocation=(row:Record<string,unknown>)=>Object.fromEntries(Object.entries(strip(row,metadata)).filter(([key,value])=>!['regionId','districtId',...scalar].includes(key as any)||value!==null&&value!==undefined&&value!==''));

/** Internal proof for a single name-only batch against the complete transaction Location inventory.
 * All authority, generic validation, native transaction and audit capacity checks still apply.
 * Does not derive or accept staffing moves, eligibility, contact or permission changes.
 */
export function validateManagedPersonRename(writes: DirectoryWrite[], previous: (Record<string, unknown> | undefined)[], personId: string, locations: Record<string, unknown>[] | undefined) {
  const index = writes.findIndex(w => w.collection === 'people' && w.id === personId), write = writes[index], before = previous[index], after = write?.data;
  if (!before || !after || write.operation !== 'set' || writes.filter(w => w.collection === 'people').length !== 1 || !locations || locations.length > 1000 || writes.length > 90) fail('Reload the complete manager name-change review before saving.');
  const fullName = after.fullName;
  if (typeof fullName !== 'string' || fullName !== fullName.trim() || !fullName.length || fullName.length > 1000 || /[\u0000-\u001f\u007f]/.test(fullName)
    || fullName === before.fullName || personLifecycle(before) !== 'active' || personLifecycle(after) !== 'active'
    || Object.hasOwn(after, 'name') && after.name !== fullName
    || !isDeepStrictEqual(strip(before, [...metadata, 'name', 'fullName']), strip(after, [...metadata, 'name', 'fullName']))) fail('Save a manager name change separately. Positions, status, contacts, workplace and other fields must remain unchanged.');
  const validVersion = (row: Record<string, unknown>) => Number.isSafeInteger(row.version ?? 0) && Number(row.version ?? 0) >= 0 && Number(row.version ?? 0) < Number.MAX_SAFE_INTEGER;
  if (!validVersion(before)) fail('Resolve the manager record version before renaming.');
  const affected = locations.filter(l => scalar.some(field => l[field] === personId) || lists.some(field => Array.isArray(l[field]) && l[field].includes(personId)));
  const keys = writes.map(w => `${w.collection}/${w.id}`);
  if (new Set(keys).size !== keys.length || new Set(locations.map(l => l.id)).size !== locations.length || writes.length !== affected.length + 1) fail('The manager name-change batch must include every affected Location exactly once. Reload before saving.');
  for (const location of affected) {
    if (!canonicalId(location.id) || !validVersion(location)) fail('Resolve affected Location identities and versions before renaming.');
    const targetIndex = writes.findIndex(w => w.collection === 'locations' && w.id === location.id), target = writes[targetIndex];
    if (!target || target.operation !== 'set' || !target.data || !previous[targetIndex]
      || !isDeepStrictEqual(strip(previous[targetIndex]!, ['id']), strip(location, ['id']))) fail('The manager name-change inventory changed. Reload before saving.');
    const expected = { ...location };
    for (const field of scalar) if (location[field] === personId) expected[field.replace(/Id$/, 'Name')] = fullName;
    for (const field of lists) {
      if (!Array.isArray(location[field]) || !location[field].includes(personId)) continue;
      const ids = location[field] as unknown[], namesField = field.replace(/Ids$/, 'Names'), names = location[namesField];
      if (!ids.every(canonicalId) || new Set(ids).size !== ids.length || !Array.isArray(names) || names.length !== ids.length || !names.every(n => typeof n === 'string')) fail('Resolve the affected leadership name list before renaming; unrelated names will not be guessed.');
      expected[namesField] = ids.map((id, i) => id === personId ? fullName : names[i]);
    }
    if (!isDeepStrictEqual(normalizedLocation(expected), normalizedLocation(target.data))) fail('Manager name changes may update only the matching leadership display names on affected Locations.');
  }
  return { personId, fullName: fullName as string, affectedLocations: affected.length };
}
