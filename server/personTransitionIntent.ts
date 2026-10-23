import { validPositionIds, type PersonPositionId, LEADERSHIP_POSITION_FIELDS } from '../src/lib/personPositions';

export type LeadershipField = keyof typeof LEADERSHIP_POSITION_FIELDS;
export type ResponsibilityDecision = {
  owner: 'districts' | 'locations'; id: string; field: LeadershipField;
  action: 'retain' | 'vacate' | 'replace' | 'assign'; replacementId?: string;
};
export type WorkplaceDecision = { action: 'retain' | 'clear' | 'replace'; ids?: string[] };
export interface PersonTransitionIntent {
  schemaVersion: 1; personId: string; positionIds: PersonPositionId[]; lifecycle: 'keep' | 'inactive'; reason: string;
  responsibilities: ResponsibilityDecision[];
  primaryWorkplace: WorkplaceDecision; supports: WorkplaceDecision; acknowledgedRequestIds: string[];
}
export const canonicalTransitionId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
export const object = (v: unknown): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
function fail(): never { throw new Error('Invalid Person transition intent.'); }
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every(canonicalTransitionId) || new Set(value).size !== value.length) fail();
  return [...value].sort();
}
function workplace(value: unknown, primary: boolean): WorkplaceDecision {
  if (!object(value) || !keys(value, ['action', 'ids']) || !['retain', 'clear', 'replace'].includes(value.action)) fail();
  if (value.action !== 'replace') { if (Object.hasOwn(value, 'ids')) fail(); return { action: value.action }; }
  const links = ids(value.ids);
  if (!links.length || primary && links.length !== 1) fail();
  return { action: 'replace', ids: links };
}

/** Detached fixed-schema intent only; no caller paths, versions, patches or authority claims. */
export function normalizePersonTransitionIntent(value: unknown): PersonTransitionIntent {
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { fail(); }
  if (!encoded || Buffer.byteLength(encoded) > 128 * 1024 || !object(value)
    || !keys(value, ['schemaVersion', 'personId', 'positionIds', 'lifecycle', 'reason', 'responsibilities', 'primaryWorkplace', 'supports', 'acknowledgedRequestIds'])
    || value.schemaVersion !== 1 || !canonicalTransitionId(value.personId) || !validPositionIds(value.positionIds)
    || !['keep', 'inactive'].includes(value.lifecycle) || typeof value.reason !== 'string'
    || !value.reason.trim() || value.reason.trim().length > 1000 || !Array.isArray(value.responsibilities)) fail();
  const seen = new Set<string>();
  const responsibilities = value.responsibilities.map((d: unknown): ResponsibilityDecision => {
    if (!object(d) || !keys(d, ['owner', 'id', 'field', 'action', 'replacementId'])
      || !['districts', 'locations'].includes(d.owner) || !canonicalTransitionId(d.id)
      || typeof d.field !== 'string' || !Object.hasOwn(LEADERSHIP_POSITION_FIELDS, d.field) || d.owner === 'districts' && d.field !== 'districtManagerId'
      || !['retain', 'vacate', 'replace', 'assign'].includes(d.action)) fail();
    const key = `${d.owner}/${d.id}/${d.field}`;
    if (seen.has(key)) fail(); seen.add(key);
    if (d.action === 'replace' ? !canonicalTransitionId(d.replacementId) || d.replacementId === value.personId : Object.hasOwn(d, 'replacementId')) fail();
    return { owner: d.owner, id: d.id, field: d.field as LeadershipField, action: d.action, ...(d.action === 'replace' ? { replacementId: d.replacementId } : {}) };
  }).sort((a, b) => `${a.owner}/${a.id}/${a.field}`.localeCompare(`${b.owner}/${b.id}/${b.field}`));
  return { schemaVersion: 1, personId: value.personId, positionIds: [...value.positionIds].sort(), lifecycle: value.lifecycle,
    reason: value.reason.trim(), responsibilities, primaryWorkplace: workplace(value.primaryWorkplace, true), supports: workplace(value.supports, false),
    acknowledgedRequestIds: ids(value.acknowledgedRequestIds) };
}
