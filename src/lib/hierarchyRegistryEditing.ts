import type { DistrictRecord, RegionRecord } from '../types';

type RegistryRecord = RegionRecord | DistrictRecord;

interface RegistryEditBase<T extends RegistryRecord> {
  id: string;
  name: string;
  original: T;
  expectedVersion: number;
  review: { latest: T | null } | null;
}

export type RegionEditState = RegistryEditBase<RegionRecord> & { kind: 'region' };
export type DistrictEditState = RegistryEditBase<DistrictRecord> & { kind: 'district'; regionId: string };
export type RegistryEditState = RegionEditState | DistrictEditState;

export function beginRegionEdit(record: RegionRecord): RegionEditState {
  return {
    kind: 'region',
    id: record.id,
    name: record.name,
    original: record,
    expectedVersion: record.version ?? 0,
    review: null,
  };
}

export function beginDistrictEdit(record: DistrictRecord): DistrictEditState {
  return {
    kind: 'district',
    id: record.id,
    name: record.name,
    regionId: record.regionId,
    original: record,
    expectedVersion: record.version ?? 0,
    review: null,
  };
}

export function reviewRegistryConflict<T extends RegistryEditState>(editing: T, latest: T['original'] | null): T {
  return { ...editing, review: { latest } };
}

export function discardRegistryDraft(editing: RegistryEditState): RegistryEditState | null {
  const latest = editing.review?.latest;
  if (!latest) return null;
  return editing.kind === 'region'
    ? beginRegionEdit(latest as RegionRecord)
    : beginDistrictEdit(latest as DistrictRecord);
}

export function reapplyRegistryDraft(editing: RegistryEditState): RegistryEditState | null {
  const latest = editing.review?.latest;
  if (!latest) return null;
  if (editing.kind === 'region') {
    return {
      ...editing,
      original: latest as RegionRecord,
      expectedVersion: latest.version ?? 0,
      review: null,
    };
  }
  return {
    ...editing,
    original: latest as DistrictRecord,
    expectedVersion: latest.version ?? 0,
    review: null,
  };
}

export function registryEditRecord(editing: RegistryEditState): RegionRecord | DistrictRecord {
  if (editing.kind === 'region') {
    return { ...editing.original, id: editing.id, name: editing.name.trim() };
  }
  return { ...editing.original, id: editing.id, name: editing.name.trim(), regionId: editing.regionId };
}