export interface LocationInboxConflictMember {
  id: string;
  storeNumber: string;
  version: number;
}

export interface LocationInboxAcknowledgment {
  normalizedEmail: string;
  conflictDigest: string;
}

export interface NormalizedLocationInboxEmail {
  value: string;
  comparisonKey: string;
}

export function normalizeLocationInboxEmail(value: unknown): NormalizedLocationInboxEmail | null {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 254 || /\s/.test(trimmed)) return null;

  const separator = trimmed.lastIndexOf('@');
  if (separator <= 0 || separator !== trimmed.indexOf('@')) return null;
  const localPart = trimmed.slice(0, separator);
  const domain = trimmed.slice(separator + 1);
  if (localPart.length > 64 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)
    || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) return null;
  if (domain.length > 253 || domain.startsWith('.') || domain.endsWith('.')) return null;
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))) return null;

  const normalized = `${localPart}@${domain.toLowerCase()}`;
  return { value: normalized, comparisonKey: trimmed.toLowerCase() };
}

export function normalizePersonEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value === '') return '';
  return normalizeLocationInboxEmail(value)?.value ?? null;
}

export function locationInboxConflictDigest(
  email: string,
  members: readonly LocationInboxConflictMember[],
): string {
  const normalizedEmail = normalizeLocationInboxEmail(email);
  if (!normalizedEmail) throw new Error('A valid location inbox is required to calculate duplicate conflicts.');
  const stableMembers = [...members]
    .map(member => ({ id: member.id, storeNumber: member.storeNumber, version: member.version }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({ normalizedEmail: normalizedEmail.comparisonKey, members: stableMembers });
}

export function suggestedLocationInboxEmail(storeNumber: string): string | null {
  if (!/^\d+$/.test(storeNumber)) return null;
  const normalizedStoreNumber = storeNumber.replace(/^0+/, '');
  if (!normalizedStoreNumber) return null;
  return `store${normalizedStoreNumber}@shiekhshoes.com`;
}

export function resolvePersonEmailValue(person: { workEmail?: string; email?: string } | undefined): string {
  if (person && Object.hasOwn(person, 'workEmail')) return person.workEmail || '';
  return person?.email || '';
}
