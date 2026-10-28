import type { OrganizationCatalog, OrganizationLeadershipIntent, OrganizationUnitSummary } from './organizationLeadershipContract';
export interface OrganizationRosterDraft { unitType: OrganizationUnitSummary['unitType']; unitId: string; members: string[]; primary: string | null; activationReviewed: boolean }
export const organizationUnitKey = (type: string, id: string) => JSON.stringify([type, id]);
export function reapplyOrganizationRosters(before: OrganizationCatalog, latest: OrganizationCatalog, drafts: OrganizationRosterDraft[]) {
  return drafts.map(d => {
    const old = before.units.find(u => u.unitType === d.unitType && u.id === d.unitId), fresh = latest.units.find(u => u.unitType === d.unitType && u.id === d.unitId);
    if (!old || !fresh) throw new Error('A selected unit is unavailable. Remove it and review the available units.');
    const previous = old.members.map(m => m.personId), removed = previous.filter(id => !d.members.includes(id));
    const members = [...new Set([...fresh.members.map(m => m.personId).filter(id => !removed.includes(id)), ...d.members.filter(id => !previous.includes(id))])];
    const proposedPrimary = d.primary !== old.primaryPersonId ? d.primary : fresh.primaryPersonId;
    return { ...d, members, primary: proposedPrimary && members.includes(proposedPrimary) ? proposedPrimary : null, activationReviewed: false };
  });
}
export function beginOrganizationRoster(unit: OrganizationUnitSummary, catalog: OrganizationCatalog, personId?: string): OrganizationRosterDraft {
  const members = unit.members.map(m => m.personId);
  if (personId && !members.includes(personId)) {
    if (!catalog.people.some(p => p.id === personId && p.eligibleUnitTypes.includes(unit.unitType))) throw new Error('Save the matching position and Active status before assigning this person.');
    members.push(personId);
  }
  return { unitType: unit.unitType, unitId: unit.id, members, primary: unit.primaryPersonId, activationReviewed: false };
}
/** Full desired rosters preserve incumbents. Primary is never inferred from row order, position or
 * adding the first member. No changed roles/profile/workplace/account data is included. */
export function buildOrganizationRosterIntent(catalog: OrganizationCatalog, drafts: OrganizationRosterDraft[], reason: string): OrganizationLeadershipIntent['units'] {
  if (catalog.issues.length || !drafts.length || drafts.length > 5 || new Set(drafts.map(d => organizationUnitKey(d.unitType, d.unitId))).size !== drafts.length) throw new Error('Choose up to five valid Districts or Regions.');
  const units: OrganizationLeadershipIntent['units'] = [];
  for (const d of drafts) {
    const u = catalog.units.find(u => u.unitType === d.unitType && u.id === d.unitId);
    if (!u || u.status !== 'Active' || u.issues.length || u.version === null || u.leadershipVersion === null || u.ownership === 'unsupported') throw new Error('Resolve the listed organization issues before assigning managers.');
    if (d.members.length > 25 || new Set(d.members).size !== d.members.length || !d.members.every(id => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))) throw new Error('Choose unique managers, up to 25 per unit.');
    if (d.members.length ? !d.primary || !d.members.includes(d.primary) : d.primary !== null) throw new Error('Choose a Primary Manager, or remove every manager to confirm a vacancy.');
    const before = u.members.map(m => m.personId), added = d.members.filter(id => !before.includes(id)), ended = before.filter(id => !d.members.includes(id));
    const primaryChanged = u.primaryPersonId !== d.primary;
    for (const id of d.members) if ((added.includes(id) || primaryChanged && id === d.primary) && !catalog.people.some(p => p.id === id && p.eligibleUnitTypes.includes(u.unitType))) throw new Error('New managers and Primary promotions need the matching linked position and Active status.');
    const activateLegacy = u.ownership === 'legacy';
    if (!activateLegacy && !added.length && !ended.length && !primaryChanged) continue;
    if (activateLegacy && !d.activationReviewed) throw new Error('Acknowledge the reviewed setup for each unit before continuing.');
    if (typeof reason !== 'string' || reason.length > 500 || /[\u0000-\u001f\u007f]/.test(reason) || (activateLegacy || primaryChanged || ended.length) && reason.trim().length < 5) throw new Error('Add a short reason for setup, a Primary change or an assignment ending.');
    units.push({ unitType: d.unitType, unitId: d.unitId, expectedVersion: u.version, expectedLeadershipVersion: u.leadershipVersion,
      activateLegacy, memberPersonIds: [...d.members], primaryPersonId: d.primary, reason: reason.trim() });
  }
  if (!units.length) throw new Error('Add or remove a manager, or deliberately change the Primary before reviewing.');
  return units;
}
