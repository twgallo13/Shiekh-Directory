import type { LocationRecord, PersonRecord } from '../types';
import { isConventionalStoreInboxEmail, normalizeLocationInboxEmail } from './locationInboxEmail';
import { personLifecycle } from './personLifecycle';
import { classifyHierarchyLocationType } from './hierarchyResolution';

/** Classification only, not mailbox ownership/permission verification; no values are rewritten. */
export function sharedPersonEmailKind(value: unknown, locations: ReadonlyArray<{ locationInboxEmail?: unknown }>): 'conventional' | 'saved_location' | null {
  const normalized = normalizeLocationInboxEmail(value);
  if (!normalized) return null;
  if (isConventionalStoreInboxEmail(normalized.value)) return 'conventional';
  return locations.some(location => normalizeLocationInboxEmail(location.locationInboxEmail)?.comparisonKey === normalized.comparisonKey) ? 'saved_location' : null;
}

export interface PersonInboxResponsibility {
  location: LocationRecord;
  roles: Array<'Store Manager' | 'Assistant Manager'>;
  inbox: string | null;
  issues: string[];
}

/** Canonical SM/AM references only. Working at/supporting a store, title or email cannot create a responsibility. */
export function personInboxResponsibilities(person: PersonRecord, locations: LocationRecord[]): PersonInboxResponsibility[] {
  return locations.flatMap(location => {
    const roles: PersonInboxResponsibility['roles'] = [];
    if (location.storeManagerId === person.id) roles.push('Store Manager');
    if (Array.isArray(location.assistantStoreManagerIds) && location.assistantStoreManagerIds.includes(person.id)) roles.push('Assistant Manager');
    if (!roles.length) return [];
    const normalized = normalizeLocationInboxEmail(location.locationInboxEmail);
    const issues: string[] = [];
    if (!normalized) issues.push(location.locationInboxEmail ? 'Saved inbox needs review' : 'No store inbox recorded');
    if (location.recordStatus !== 'Active') issues.push(location.recordStatus === 'Retired' ? 'Retired Location — review assignment' : 'Location is not confirmed active');
    if (classifyHierarchyLocationType(location.type) !== 'retail') issues.push('Non-retail or unclassified Location — review assignment');
    const lifecycle = personLifecycle(person);
    if (lifecycle !== 'active') issues.push(lifecycle === 'inactive' ? 'Inactive Person — review assignment' : 'Person lifecycle needs review');
    return [{ location, roles, inbox: normalized?.value ?? null, issues }];
  }).sort((a, b) => a.location.storeNumber.localeCompare(b.location.storeNumber, undefined, { numeric: true }) || a.location.id.localeCompare(b.location.id));
}
