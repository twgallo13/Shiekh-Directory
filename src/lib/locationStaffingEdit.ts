import type { LocationRecord } from '../types';

const ROLE_FIELDS = [
  ['storeManagerId', 'storeManagerName', 'storeManagerPhone', 'storeManagerPhonePrivacy'],
  ['districtManagerId', 'districtManagerName'],
  ['regionalManagerId', 'regionalManagerName'],
  ['assistantStoreManagerIds', 'assistantStoreManagerNames'],
  ['keyHolderIds', 'keyHolderNames'],
] as const;

export function preserveUnchangedStaffing(raw: LocationRecord, baseline: LocationRecord, sanitized: LocationRecord): LocationRecord {
  const result = { ...sanitized };
  for (const fields of ROLE_FIELDS) {
    if (JSON.stringify(raw[fields[0]]) !== JSON.stringify(baseline[fields[0]])) continue;
    for (const field of fields) {
      if (Object.hasOwn(baseline, field)) Object.assign(result, { [field]: baseline[field] });
      else delete result[field];
    }
  }
  return result;
}
