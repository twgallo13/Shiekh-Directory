import { isDeepStrictEqual } from 'node:util';
import type { Account } from './authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryWrite } from './firestoreDirectory';
import type { HierarchyRegistry } from '../src/lib/hierarchyAssignmentContract';
import { hasDistrictLeadership, isDistrictLeadershipMember } from '../src/lib/districtLeadership';
import { classifyHierarchyLocationType } from '../src/lib/hierarchyResolution';
import { personLifecycle } from '../src/lib/personLifecycle';

/** Validate the entire atomic handover and every alternate writer against District ownership. */
export function validateDistrictLeadershipState(writes: DirectoryWrite[], previous: (Record<string, unknown> | undefined)[],
  locations: Record<string, unknown>[], people: { id: string; fullName: string; status?: string; activeStatus?: boolean }[], registry: HierarchyRegistry | undefined, actor: Account): void {
  const districts = registry?.districts ?? [];
  const changedDistricts = new Set<string>();
  for (const [index, write] of writes.entries()) {
    if (write.collection !== 'districts' || write.operation !== 'set') continue;
    const before = previous[index];
    const data = write.data!;
    if (data.status === 'Retired' && data.districtManagerId) {
      throw new DirectoryValidationError('Vacate District leadership before retiring the District.');
    }
    if (!Object.hasOwn(data, 'districtManagerId')) continue;
    const id = data.districtManagerId;
    if (id !== null && (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id))) {
      throw new DirectoryValidationError('District Manager must be a canonical Person ID or explicit null vacancy.');
    }
    const changed = !before || !Object.hasOwn(before, 'districtManagerId') || before.districtManagerId !== id;
    if (!changed) continue;
    if (actor.role !== 'System Administrator') throw new DirectoryWriteDenied('Only administrators can change District leadership.');
    if (!before || data.status !== 'Active' || data.regionId !== before.regionId
      || !registry?.regions.some(r => r.id === data.regionId && r.status === 'Active')) {
      throw new DirectoryValidationError('Save an active District and its parent separately before changing its leader.');
    }
    const districtFields = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'districtManagerId', 'version', 'updatedAt'].includes(key)));
    if (!isDeepStrictEqual(districtFields(data), districtFields(before))) throw new DirectoryValidationError('District handover cannot change unrelated District fields.');
    if (id !== null) {
      const matches = people.filter(p => p.id === id);
      if (matches.length !== 1 || personLifecycle(matches[0]) !== 'active') throw new DirectoryValidationError('District leadership requires one active Person.');
    }
    const linked = locations.filter(l => l.districtId === write.id);
    if (linked.some(l => classifyHierarchyLocationType(l.type) === 'unclassified')) throw new DirectoryValidationError('Classify every linked Location before District handover.');
    const members = linked.filter(l => isDistrictLeadershipMember(l, write.id));
    if (members.some(l => l.regionId !== data.regionId || (l.hierarchyApplicability && l.hierarchyApplicability !== 'Applicable'))) {
      throw new DirectoryValidationError('Resolve Region/applicability conflicts before District handover.');
    }
    const canonical = (items: { id: string; version: number }[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
    const preview = write.districtLeadershipMembers;
    if (!preview || members.length > 99 || !isDeepStrictEqual(canonical(preview), canonical(members.map(l => ({ id: String(l.id), version: Number(l.version ?? 0) }))))) {
      throw new DirectoryConflict('District membership or a store version changed. Refresh and preview the complete District again.');
    }
    if (writes.length !== members.length + 1 || writes.some(w => w !== write && (w.collection !== 'locations' || w.operation !== 'set' || !members.some(l => l.id === w.id)))) {
      throw new DirectoryValidationError('Confirm the District and every previewed store together, without unrelated writes.');
    }
    for (const member of members) {
      const target = writes.find(w => w.collection === 'locations' && w.id === member.id)!;
      if (target.data?.districtManagerName !== (id === null ? '' : people.find(p => p.id === id)?.fullName)) {
        throw new DirectoryConflict('The selected Person’s name changed. Refresh and preview again.');
      }
      if (target.data?.districtId !== write.id || target.data?.regionId !== data.regionId || target.data?.type !== member.type
        || target.data?.hierarchyApplicability !== member.hierarchyApplicability || target.expectedVersion !== (member.version ?? 0)) {
        throw new DirectoryConflict('A previewed store changed hierarchy or version. Refresh before handover.');
      }
      // This command may change only the DM copies (plus server version/timestamp), never other store data.
      const strip = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([k]) => !['districtManagerId', 'districtManagerName', 'version', 'updatedAt'].includes(k)));
      if (!isDeepStrictEqual(strip(target.data!), strip(member))) throw new DirectoryValidationError('District handover cannot change unrelated store fields.');
    }
    if (Buffer.byteLength(JSON.stringify(writes), 'utf8') > 8_000_000) throw new DirectoryValidationError('District handover exceeds the atomic payload limit. No changes were made.');
    changedDistricts.add(write.id);
  }
  const finalLocations = new Map(locations.map(l => [String(l.id), l]));
  for (const write of writes) {
    if (write.collection === 'locations') {
      if (write.operation === 'delete') finalLocations.delete(write.id);
      else finalLocations.set(write.id, write.data!);
    }
  }
  const changedPeople = new Set(writes.filter(w => w.collection === 'people').map(w => w.id));
  for (const district of districts) {
    if (!hasDistrictLeadership(district)) continue;
    const managerId = district.districtManagerId;
    if (typeof managerId === 'string' && changedPeople.has(managerId)
      && !people.some(p => p.id === managerId && personLifecycle(p) === 'active')) {
      throw new DirectoryValidationError('Reassign or explicitly vacate District leadership before inactivating/deleting its Person.');
    }
    for (const [locationId, location] of finalLocations) {
      if (!isDistrictLeadershipMember(location, district.id)) continue;
      if (!changedDistricts.has(district.id) && !writes.some(w => w.collection === 'locations' && w.id === locationId)) continue;
      if ((location.districtManagerId || null) !== managerId) throw new DirectoryValidationError('District-owned DM cannot be overridden on a store. Refresh or use District leadership settings.');
    }
  }
}

/** Conservatively bound the single audit document, including all before/after fields and UTF-8. */
export function assertDistrictHandoverAuditSize(record: Record<string, unknown>): void {
  const upperBound = (value: unknown): number => {
    if (typeof value === 'string') return Buffer.byteLength(value, 'utf8') + 32;
    if (!value || typeof value !== 'object') return 32;
    if (Array.isArray(value)) return 32 + value.reduce((size, item) => size + 32 + upperBound(item), 0);
    return 32 + Object.entries(value).reduce((size, [key, item]) => size + Buffer.byteLength(key, 'utf8') + 32 + upperBound(item), 0);
  };
  // Leave headroom for the document name, protobuf framing and SDK representation.
  if (upperBound(record) > 900_000) throw new DirectoryValidationError('District handover audit exceeds the safe single-document size limit. No changes were saved; use a reviewed larger-scope workflow.');
}
