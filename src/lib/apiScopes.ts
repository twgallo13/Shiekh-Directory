export const API_SCOPES = ['locations:read', 'personnel:read', 'staffing:read'] as const;
export type ApiScope = typeof API_SCOPES[number];

export function parseApiScopes(value: unknown, legacyMissing = false): ApiScope[] | null {
  if (value === undefined && legacyMissing) return ['locations:read'];
  if (!Array.isArray(value) || value.length === 0 || value.length > API_SCOPES.length) return null;
  const scopes: ApiScope[] = [];
  for (const entry of value) {
    if (!API_SCOPES.some(scope => scope === entry) || scopes.includes(entry)) return null;
    scopes.push(entry);
  }
  return API_SCOPES.filter(scope => scopes.includes(scope));
}
