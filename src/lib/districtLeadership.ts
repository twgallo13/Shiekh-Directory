import type { DistrictRecord, LocationRecord, Person, RegionRecord } from '../types';
import type { DirectoryWrite } from './directoryClient';
import { classifyHierarchyLocationType, isRetailHierarchyType } from './hierarchyResolution';
import { personLifecycle } from './personLifecycle';

export interface DistrictLeadershipMember { id: string; version: number }
export interface DistrictLeadershipPreview {
  district: DistrictRecord;
  managerId: string | null;
  managerName: string;
  reason: string;
  locations: LocationRecord[];
  excluded: LocationRecord[];
}

/** A persisted null is an explicit District-owned vacancy, not an opt-out. */
export function hasDistrictLeadership(district: { districtManagerId?: unknown } | undefined): boolean {
  return Boolean(district && Object.hasOwn(district, 'districtManagerId'));
}

/** Non-retail leadership is deliberately not swept into a retail District handover. */
export function isDistrictLeadershipMember(location: { districtId?: unknown; type?: unknown }, districtId: string): boolean {
  return location.districtId === districtId && isRetailHierarchyType(location.type);
}

/** Produce a detached preview; never infer leadership from existing conflicting store assignments. */
export function previewDistrictLeadership(district: DistrictRecord, managerId: string | null, reason: string,
  locations: LocationRecord[], people: Person[], regions: RegionRecord[]): DistrictLeadershipPreview {
  if (district.status !== 'Active' || !regions.some(r => r.id === district.regionId && r.status === 'Active')) {
    throw new Error('Choose an active District with an active parent Region.');
  }
  if (reason.trim().length < 5 || reason.trim().length > 500) throw new Error('Enter a reason between 5 and 500 characters.');
  const manager = managerId === null ? null : people.find(p => p.id === managerId);
  if (managerId !== null && (!manager || people.filter(p => p.id === managerId).length !== 1 || personLifecycle(manager) !== 'active')) {
    throw new Error('Choose one active Person or explicitly choose Vacant.');
  }
  const members = locations.filter(l => isDistrictLeadershipMember(l, district.id));
  if ([district, ...members].some(r => !Number.isInteger(r.version ?? 0) || (r.version ?? 0) < 0)) throw new Error('Invalid record versions require review before handover.');
  if (members.length > 99) throw new Error('This District exceeds the 99-store atomic handover limit. No changes were made.');
  if (new Set(members.map(l => l.id)).size !== members.length) throw new Error('Duplicate Location IDs require review before handover.');
  if (locations.some(l => l.districtId === district.id && classifyHierarchyLocationType(l.type) === 'unclassified')) throw new Error('A linked Location has an unknown type. Correct its classification before handover.');
  if (members.some(l => l.regionId !== district.regionId || (l.hierarchyApplicability && l.hierarchyApplicability !== 'Applicable'))) {
    throw new Error('Resolve the District stores’ Region/applicability conflicts before handover.');
  }
  if (hasDistrictLeadership(district) && district.districtManagerId === managerId
    && members.every(l => (l.districtManagerId || null) === managerId)) throw new Error('This District already has that assignment.');
  return structuredClone({ district, managerId, managerName: manager?.fullName || 'Vacant', reason: reason.trim(),
    locations: [...members].sort((a, b) => a.storeNumber.localeCompare(b.storeNumber)),
    excluded: locations.filter(l => l.districtId === district.id && !isDistrictLeadershipMember(l, district.id)) });
}

/** One atomic commit retains all existing Location fields and exact version baselines. */
export function districtLeadershipWrites(preview: DistrictLeadershipPreview): DirectoryWrite[] {
  return [{ collection: 'districts', id: preview.district.id, operation: 'set', expectedVersion: preview.district.version ?? 0,
    data: { ...preview.district, districtManagerId: preview.managerId },
    districtLeadershipMembers: preview.locations.map(l => ({ id: l.id, version: l.version ?? 0 })) },
  ...preview.locations.map(l => ({ collection: 'locations' as const, id: l.id, operation: 'set' as const, expectedVersion: l.version ?? 0,
    data: { ...l, districtManagerId: preview.managerId, districtManagerName: preview.managerId ? preview.managerName : '' } }))];
}

/** Keep Location copies compatible with existing readers; the District is the sole writable owner. */
export function inheritDistrictLeader(location: LocationRecord, districts: DistrictRecord[], people: Person[]): LocationRecord {
  const district = districts.find(d => isDistrictLeadershipMember(location, d.id));
  if (!hasDistrictLeadership(district)) return location;
  const id = district!.districtManagerId;
  return { ...location, districtManagerId: id || undefined, districtManagerName: people.find(p => p.id === id)?.fullName || '' };
}
