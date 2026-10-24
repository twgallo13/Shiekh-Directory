import { validPositionIds, type PersonPositionId, LEADERSHIP_POSITION_FIELDS } from './personPositions';

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
/** Stable JSON identity shared by server hashes and the in-memory client command. No authority claim. */
export function canonicalTransitionJSON(value: unknown, path = new Set<object>(), depth = 0): string {
  if (depth > 100) throw new Error('Transition JSON nesting is excessive.');
  if (Array.isArray(value) || object(value)) {
    if (path.has(value)) throw new Error('Transition JSON cannot contain cycles.');
    path.add(value);
    try {
      if (Array.isArray(value)) return `[${value.map(v => canonicalTransitionJSON(v, path, depth + 1)).join(',')}]`;
      return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalTransitionJSON(value[k], path, depth + 1)}`).join(',')}}`;
    } finally { path.delete(value); }
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  throw new Error('Transition identity requires JSON values only.');
}
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
  if (!encoded || new TextEncoder().encode(encoded).byteLength > 128 * 1024 || !object(value)
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
  }).sort((a, b) => {
    const left = `${a.owner}/${a.id}/${a.field}`; const right = `${b.owner}/${b.id}/${b.field}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return { schemaVersion: 1, personId: value.personId, positionIds: [...value.positionIds].sort(), lifecycle: value.lifecycle,
    reason: value.reason.trim(), responsibilities, primaryWorkplace: workplace(value.primaryWorkplace, true), supports: workplace(value.supports, false),
    acknowledgedRequestIds: ids(value.acknowledgedRequestIds) };
}
