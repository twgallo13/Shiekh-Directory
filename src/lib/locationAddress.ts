/** Location-owned public postal/wayfinding fields. No personnel, access or incident data. */
export const ADDRESS_FIELDS = ['address', 'suite', 'city', 'state', 'zipCode', 'mallOrCenterName', 'wayfindingDirections'] as const;
export const OPTIONAL_ADDRESS_COLUMNS = { Suite: 'suite', MallOrCenterName: 'mallOrCenterName', WayfindingDirections: 'wayfindingDirections' } as const;
export type AddressField = typeof ADDRESS_FIELDS[number];
const limits: Record<AddressField, number> = { address: 300, suite: 100, city: 100, state: 2, zipCode: 10, mallOrCenterName: 200, wayfindingDirections: 1000 };
const optional = new Set<string>(Object.values(OPTIONAL_ADDRESS_COLUMNS));
export function normalizeAddressValues(input: Record<string, unknown>, current?: Record<string, unknown>) {
  const values = { ...input }, issues: { field: AddressField; message: string }[] = [];
  for (const field of ADDRESS_FIELDS) {
    if (!Object.hasOwn(input, field) || (current && input[field] === current[field])) continue;
    const value = input[field];
    if (optional.has(field) && (value === null || (typeof value === 'string' && !value.trim()))) { values[field] = null; continue; }
    if (typeof value !== 'string' || !value.trim() || value.trim().length > limits[field] || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
      issues.push({ field, message: `${field} must be plain text of 1–${limits[field]} characters${optional.has(field) ? ', or explicitly cleared' : ''}.` }); continue;
    }
    values[field] = field === 'state' ? value.trim().toUpperCase() : value.trim();
    if (field === 'state' && !/^[A-Z]{2}$/.test(String(values[field]))) issues.push({ field, message: 'state must be a two-letter US state or territory abbreviation.' });
    if (field === 'zipCode' && !/^\d{5}(?:-\d{4})?$/.test(String(values[field]))) issues.push({ field, message: 'zipCode must be five digits or ZIP+4; preserve leading zeroes.' });
  }
  return { values, issues };
}

/** Public additive fields always have explicit null when absent or unusable. */
export function publicAddressText(field: 'suite' | 'wayfindingDirections', value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = normalizeAddressValues({ [field]: value });
  return result.issues.length || typeof result.values[field] !== 'string' ? null : result.values[field] as string;
}
