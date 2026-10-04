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
    const list = fields[0].endsWith('Ids');
    const rawId = list ? raw[fields[0]] || [] : raw[fields[0]];
    const baselineId = list ? baseline[fields[0]] || [] : baseline[fields[0]];
    if (JSON.stringify(rawId) !== JSON.stringify(baselineId)) continue;
    for (const field of fields) {
      if (Object.hasOwn(baseline, field)) Object.assign(result, { [field]: baseline[field] });
      else delete result[field];
    }
  }
  return result;
}
