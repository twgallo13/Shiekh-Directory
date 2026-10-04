export type PersonLifecycle = 'active' | 'inactive' | 'unknown';

export function personLifecycle(person: { status?: unknown; activeStatus?: unknown }): PersonLifecycle {
  const status = person.status === 'Active' ? 'active' : person.status === 'Inactive' ? 'inactive' : undefined;
  const active = person.activeStatus === true ? 'active' : person.activeStatus === false ? 'inactive' : undefined;
  if ((person.status !== undefined && !status) || (person.activeStatus !== undefined && !active)) return 'unknown';
  if (status && active && status !== active) return 'unknown';
  return status || active || 'unknown';
}
