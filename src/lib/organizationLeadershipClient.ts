import type { SessionState } from './authSession';
import type { OrganizationCapabilities, OrganizationCatalog, OrganizationLeadershipIntent, OrganizationOperationList, OrganizationOperationOutcome, OrganizationPreparation } from './organizationLeadershipContract';

export class OrganizationTransportError extends Error {
  constructor(message = 'The result could not be confirmed. Check the original review before trying again.', public readonly status?: number) { super(message); }
}
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const text = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const version = (v: unknown) => v === null || Number.isSafeInteger(v) && Number(v) >= 0;
const strings = (v: unknown, max = 500) => Array.isArray(v) && v.length <= max && v.every(s => text(s));
const ids = (v: unknown, max = 25): v is string[] => Array.isArray(v) && v.length <= max && v.every(id) && new Set(v).size === v.length;
const type = (v: unknown) => v === 'district' || v === 'region';
function invalid(): never { throw new OrganizationTransportError('The server response could not be verified. Keep this review and check recovery.'); }

export function parseOrganizationCapabilities(v: unknown): OrganizationCapabilities {
  if (!exact(v, ['schemaVersion', 'catalogEnabled', 'newCommandsEnabled', 'recoveryEnabled']) || v.schemaVersion !== 1 || ['catalogEnabled', 'newCommandsEnabled', 'recoveryEnabled'].some(k => typeof v[k] !== 'boolean') || v.newCommandsEnabled && (!v.catalogEnabled || !v.recoveryEnabled)) invalid();
  return v as OrganizationCapabilities;
}
export function parseOrganizationCatalog(v: unknown): OrganizationCatalog {
  if (!exact(v, ['schemaVersion', 'complete', 'evaluatedAt', 'issues', 'units', 'people']) || v.schemaVersion !== 1 || v.complete !== true || !instant(v.evaluatedAt) || !strings(v.issues)
    || !Array.isArray(v.units) || v.units.length > 600 || !Array.isArray(v.people) || v.people.length > 5000) invalid();
  const seen = new Set<string>(); let memberships = 0;
  for (const u of v.units) {
    if (!exact(u, ['unitType', 'id', 'name', 'status', 'regionId', 'version', 'leadershipVersion', 'ownership', 'assignmentState', 'primaryPersonId', 'members', 'storeCount', 'issues']) || !type(u.unitType) || !id(u.id) || !text(u.name) || !text(u.status)
      || !(u.regionId === null || id(u.regionId)) || !version(u.version) || !version(u.leadershipVersion) || !['legacy', 'managed', 'unsupported'].includes(u.ownership)
      || !['unmanaged', 'vacant', 'assigned', 'invalid'].includes(u.assignmentState) || !(u.primaryPersonId === null || id(u.primaryPersonId)) || !Array.isArray(u.members)
      || !Number.isSafeInteger(u.storeCount) || u.storeCount < 0 || u.storeCount > 1000 || !strings(u.issues)) invalid();
    const key = JSON.stringify([u.unitType, u.id]); if (seen.has(key)) invalid(); seen.add(key);
    memberships += u.members.length; if (memberships > 15000 || u.members.some(m => !object(m)) || new Set(u.members.map(m => m.personId)).size !== u.members.length) invalid();
    for (const m of u.members) if (!exact(m, ['personId', 'fullName', 'isPrimary', 'eligible', 'issues']) || !id(m.personId) || !text(m.fullName) || typeof m.isPrimary !== 'boolean' || typeof m.eligible !== 'boolean' || !strings(m.issues)) invalid();
  }
  if (v.people.some(p => !object(p)) || new Set(v.people.map(p => p.id)).size !== v.people.length) invalid();
  for (const p of v.people) if (!exact(p, ['id', 'fullName', 'eligibleUnitTypes']) || !id(p.id) || !text(p.fullName) || !Array.isArray(p.eligibleUnitTypes) || p.eligibleUnitTypes.length > 2 || !p.eligibleUnitTypes.every(type) || new Set(p.eligibleUnitTypes).size !== p.eligibleUnitTypes.length) invalid();
  return v as OrganizationCatalog;
}
export function parseOrganizationOutcome(v: unknown, operationId: string): OrganizationOperationOutcome {
  if (!object(v) || v.schemaVersion !== 1 || v.operationId !== operationId || !id(v.operationId)) invalid();
  const keys = v.state === 'missing' ? ['schemaVersion', 'operationId', 'state'] : v.state === 'committed' ? ['schemaVersion', 'operationId', 'state', 'updatedAt', 'auditId', 'changedRecords'] : ['schemaVersion', 'operationId', 'state', 'updatedAt'];
  if (!exact(v, keys) || !['missing', 'prepared', 'committed', 'cancelled'].includes(v.state) || v.state !== 'missing' && !instant(v.updatedAt)
    || v.state === 'committed' && (!id(v.auditId) || !Number.isSafeInteger(v.changedRecords) || v.changedRecords < 1 || v.changedRecords > 200)) invalid();
  return v as OrganizationOperationOutcome;
}
export function parseOrganizationPreparation(v: unknown, intent: OrganizationLeadershipIntent): OrganizationPreparation {
  if (!object(v) || v.state !== 'prepared') return parseOrganizationOutcome(v, intent.operationId);
  if (!exact(v, ['schemaVersion', 'operationId', 'state', 'updatedAt', 'expiresAt', 'reviewHash', 'review']) || v.schemaVersion !== 1 || v.operationId !== intent.operationId || !instant(v.updatedAt) || !instant(v.expiresAt)
    || Date.parse(v.expiresAt) <= Date.parse(v.updatedAt) || typeof v.reviewHash !== 'string' || !/^[a-f0-9]{64}$/.test(v.reviewHash) || !Array.isArray(v.review) || v.review.length !== intent.units.length) invalid();
  const seen = new Set<string>();
  for (const u of v.review) {
    if (!exact(u, ['unitType', 'unitId', 'name', 'reason', 'activating', 'beforePrimaryPersonId', 'primaryPersonId', 'added', 'ended', 'members', 'compatibilityStores']) || !type(u.unitType) || !id(u.unitId) || !text(u.name) || !text(u.reason, 500)
      || typeof u.activating !== 'boolean' || !(u.beforePrimaryPersonId === null || id(u.beforePrimaryPersonId)) || !(u.primaryPersonId === null || id(u.primaryPersonId)) || !ids(u.added) || !ids(u.ended)
      || !Array.isArray(u.members) || u.members.length > 25 || !Number.isSafeInteger(u.compatibilityStores) || u.compatibilityStores < 0 || u.compatibilityStores > 1000) invalid();
    for (const m of u.members) if (!object(m) || !exact(m, Object.hasOwn(m, 'eligibilityIssue') ? ['personId', 'fullName', 'isPrimary', 'eligibilityIssue'] : ['personId', 'fullName', 'isPrimary']) || !id(m.personId) || !text(m.fullName) || typeof m.isPrimary !== 'boolean' || Object.hasOwn(m, 'eligibilityIssue') && !text(m.eligibilityIssue)) invalid();
    const target = intent.units.find(x => x.unitType === u.unitType && x.unitId === u.unitId), key = JSON.stringify([u.unitType, u.unitId]);
    if (seen.has(key) || !target || u.activating !== target.activateLegacy || u.reason !== target.reason.trim() || u.primaryPersonId !== target.primaryPersonId
      || new Set(u.members.map(m => m.personId)).size !== u.members.length || JSON.stringify(u.members.map(m => m.personId).sort()) !== JSON.stringify([...target.memberPersonIds].sort())
      || u.members.some(m => m.isPrimary !== (m.personId === u.primaryPersonId))) invalid();
    seen.add(key);
  }
  return v as OrganizationPreparation;
}
export function parseOrganizationList(v: unknown): OrganizationOperationList {
  if (!exact(v, ['schemaVersion', 'complete', 'operations']) || v.schemaVersion !== 1 || v.complete !== true || !Array.isArray(v.operations) || v.operations.length > 100) invalid();
  const seen = new Set<string>();
  for (const o of v.operations) {
    if (!exact(o, ['operationId', 'state', 'updatedAt', 'expiresAt']) || !id(o.operationId) || o.state !== 'prepared' || !instant(o.updatedAt) || !instant(o.expiresAt) || seen.has(o.operationId)) invalid();
    seen.add(o.operationId);
  }
  return v as OrganizationOperationList;
}

/** Bound to one synchronous auth generation, with deadlines and no automatic retries.
 * UI must durably retain an operation marker BEFORE calling any mutating method. */
export function createOrganizationSessionTransport(options: { session(): SessionState; generation(): number; request: typeof fetch; timeoutMs?: number }, family: 'leadership' | 'moves' | 'creation') {
  if (!['leadership','moves','creation'].includes(family)) throw new OrganizationTransportError();
  const initial = options.session(), uid = initial.user?.uid, generation = options.generation();
  let disposed = false; const active = new Set<AbortController>();
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new OrganizationTransportError();
  const check = () => {
    const s = options.session();
    if (disposed || s.status !== 'authorized' || !s.user || s.user.uid !== uid || s.account?.uid !== uid || !(family === 'creation' ? ['System Administrator','Directory Data Steward','Editor'].includes(s.account.role) : s.account.role === 'System Administrator') || s.account.status !== 'Active' || s.account.accessScope !== 'Company-wide' || options.generation() !== generation) throw new OrganizationTransportError('Your session changed. Sign in and check recovery before continuing.', 403);
    return s.user;
  };
  const call = async (mode: string, body?: unknown) => {
    if (!['capabilities', 'catalog', 'operations', 'prepare', 'commit', 'status', 'cancel', 'directory'].includes(mode) || family === 'creation' && mode === 'catalog') throw new OrganizationTransportError();
    const user = check(), abort = new AbortController(); active.add(abort);
    let rejectAbort: () => void;
    const expired = new Promise<never>((_, reject) => { rejectAbort = () => reject(new OrganizationTransportError()); abort.signal.addEventListener('abort', rejectAbort, { once: true }); });
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const job = (async () => {
      const token = await user.getIdToken(); check();
      if (abort.signal.aborted || typeof token !== 'string' || !token.length || token.length > 8192 || /\s/.test(token)) throw new OrganizationTransportError();
      const encoded = body === undefined ? undefined : JSON.stringify(body);
      if (encoded && new TextEncoder().encode(encoded).byteLength > (family === 'creation' ? 200_000 : 32 * 1024)) throw new OrganizationTransportError(family === 'creation' ? 'This store draft is too large. Remove some optional information.' : 'This review is too large. Select fewer units.', 413);
      const response = await options.request(mode === 'directory' ? '/api/auth/bootstrap' : `/api/directory/${family === 'creation' ? 'location-creations' : family === 'moves' ? 'organization-moves' : 'organization-leadership'}/${mode}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', redirect: 'error', signal: abort.signal,
        headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(encoded === undefined ? {} : { body: encoded }) });
      check();
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new OrganizationTransportError(undefined, response.status);
      const raw = await response.text(); if (raw.length > 8_000_000) invalid();
      if (family === 'creation' && mode !== 'directory' && new TextEncoder().encode(raw).byteLength > 128_000) invalid();
      const value = JSON.parse(raw); check();
      if (!response.ok) {
        const safe = [400, 409, 413, 422].includes(response.status) && object(value.error) && (/^organization_(?:invalid_input|conflict|ineligible|capacity)$/.test(value.error.code) || family === 'creation' && /^location_creation_(?:invalid_input|conflict|capacity)$/.test(value.error.code)) && text(value.error.message);
        throw new OrganizationTransportError(safe ? value.error.message : undefined, response.status);
      }
      return value;
    })();
    try { const result = await Promise.race([job, expired]); check(); if (abort.signal.aborted) throw new OrganizationTransportError(); return result; }
    catch (error) { abort.abort(); throw error instanceof OrganizationTransportError ? error : new OrganizationTransportError(); }
    finally { clearTimeout(timer); abort.signal.removeEventListener('abort', rejectAbort!); active.delete(abort); }
  };
  return { call, dispose() { disposed = true; for (const a of active) a.abort(); } };
}

export function createOrganizationHttpPort(options: Parameters<typeof createOrganizationSessionTransport>[0]) {
  const { call, dispose } = createOrganizationSessionTransport(options, 'leadership');
  return {
    capabilities: async () => parseOrganizationCapabilities(await call('capabilities')),
    catalog: async () => parseOrganizationCatalog(await call('catalog')),
    list: async () => parseOrganizationList(await call('operations')),
    directory: () => call('directory'),
    prepare: async (intent: OrganizationLeadershipIntent) => parseOrganizationPreparation(await call('prepare', intent), intent),
    commit: async (operationId: string, reviewHash: string) => { if (!id(operationId) || !/^[a-f0-9]{64}$/.test(reviewHash)) invalid(); return parseOrganizationOutcome(await call('commit', { operationId, reviewHash }), operationId); },
    status: async (operationId: string) => { if (!id(operationId)) invalid(); return parseOrganizationOutcome(await call('status', { operationId }), operationId); },
    cancel: async (operationId: string) => { if (!id(operationId)) invalid(); return parseOrganizationOutcome(await call('cancel', { operationId }), operationId); },
    dispose,
  };
}
