export function getSemanticLocationDocId(loc: { storeNumber: string }): string {
  const cleanNumber = loc.storeNumber.replace(/[^a-zA-Z0-9]/g, '');
  return `loc_store_${cleanNumber}`;
}

export function getSemanticPersonDocId(person: { workEmail?: string; name?: string; fullName?: string; id?: string }): string {
  if (person.workEmail && person.workEmail.includes('@')) {
    const prefix = person.workEmail.toLowerCase().split('@')[0].replace(/[^a-z0-9_.-]/g, '_');
    return `person_${prefix}`;
  }
  const displayName = person.fullName || person.name || person.id || 'unknown';
  const namePrefix = displayName.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return `person_${namePrefix || 'unknown'}`;
}
