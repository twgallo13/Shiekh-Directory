import { createOrganizationSessionTransport, OrganizationTransportError, parseOrganizationCapabilities, parseOrganizationCatalog, parseOrganizationList, parseOrganizationOutcome } from './organizationLeadershipClient';
import type { OrganizationMoveIntent, OrganizationMovePreparation } from './organizationMoveContract';

const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: unknown, fields: string[]): v is Record<string, any> => object(v) && Object.keys(v).length === fields.length && fields.every(k => Object.hasOwn(v, k));
const id = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(v);
const text = (v: unknown, max = 1000): v is string => typeof v === 'string' && v.length <= max && !!v.trim() && !/[\u0000-\u001f\u007f]/.test(v);
const instant = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const integer = (v: unknown, max: number) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= max;
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function invalid(): never { throw new OrganizationTransportError('The move review could not be verified. Keep its identity and check recovery.'); }
export function isOrganizationMoveIntent(v: unknown): v is OrganizationMoveIntent {
  return exact(v, ['schemaVersion', 'operationId', 'kind', 'id', 'expectedVersion', 'targetId', 'expectedTargetVersion', 'reason']) && v.schemaVersion === 1 && id(v.operationId)
    && ['store', 'district'].includes(v.kind) && id(v.id) && id(v.targetId) && integer(v.expectedVersion, Number.MAX_SAFE_INTEGER) && integer(v.expectedTargetVersion, Number.MAX_SAFE_INTEGER) && text(v.reason, 500) && v.reason.trim().length >= 5;
}
export function parseOrganizationMoveOutcome(v: unknown, operationId: string) {
  const value = parseOrganizationOutcome(v, operationId);
  if (value.state === 'committed' && !/^organization-move-[a-f0-9]{64}$/.test(value.auditId)) invalid();
  return value;
}
export function parseOrganizationMovePreparation(v: unknown, intent: OrganizationMoveIntent): OrganizationMovePreparation {
  if (!isOrganizationMoveIntent(intent)) invalid();
  if (!object(v) || v.state !== 'prepared') return parseOrganizationMoveOutcome(v, intent.operationId);
  if (!exact(v, ['schemaVersion', 'operationId', 'state', 'updatedAt', 'expiresAt', 'reviewHash', 'review']) || v.schemaVersion !== 1 || v.operationId !== intent.operationId
    || !instant(v.updatedAt) || !instant(v.expiresAt) || Date.parse(v.expiresAt) - Date.parse(v.updatedAt) !== 600_000 || !hash(v.reviewHash)) invalid();
  const r = v.review;
  if (!exact(r, ['kind', 'id', 'name', 'reason', 'before', 'after', 'stores', 'excludedNonRetail', 'businessDocuments']) || r.kind !== intent.kind || r.id !== intent.id || !text(r.name) || r.reason !== intent.reason.trim()
    || !Array.isArray(r.stores) || r.stores.length > 199 || !integer(r.excludedNonRetail, 1000) || !integer(r.businessDocuments, 200) || r.businessDocuments < 1) invalid();
  for (const hierarchy of [r.before, r.after]) {
    if (!exact(hierarchy, ['districtId', 'districtName', 'regionId', 'regionName', 'districtManager', 'regionalManager']) || !id(hierarchy.districtId) || !text(hierarchy.districtName) || !id(hierarchy.regionId) || !text(hierarchy.regionName)) invalid();
    for (const manager of [hierarchy.districtManager, hierarchy.regionalManager]) if (!exact(manager, ['id', 'name']) || (manager.id === null ? manager.name !== '' : !id(manager.id) || !text(manager.name))) invalid();
  }
  for (const store of r.stores) if (!exact(store, ['id', 'storeNumber', 'name', 'recordStatus']) || !id(store.id) || !text(store.storeNumber) || !text(store.name) || !['Active', 'Retired', 'Draft'].includes(store.recordStatus)) invalid();
  if (new Set(r.stores.map(s => s.id)).size !== r.stores.length || r.stores.length + r.excludedNonRetail > 1000) invalid();
  if (intent.kind === 'store') {
    if (r.after.districtId !== intent.targetId || r.before.districtId === r.after.districtId || r.stores.length !== 1 || r.stores[0].id !== intent.id || r.stores[0].name !== r.name || r.businessDocuments !== 1 || r.excludedNonRetail !== 0) invalid();
  } else if (r.before.districtId !== intent.id || r.after.districtId !== intent.id || r.after.regionId !== intent.targetId || r.before.regionId === r.after.regionId
    || r.businessDocuments !== r.stores.length + 1 || r.before.districtManager.id !== r.after.districtManager.id || r.before.districtManager.name !== r.after.districtManager.name) invalid();
  return v as OrganizationMovePreparation;
}
/** Fixed private route, bounded strict DTOs and inherited session/deadline fencing. No retries.
 * A workflow must durably record its operation ID BEFORE invoking prepare/commit/cancel. */
export function createOrganizationMoveHttpPort(options: Parameters<typeof createOrganizationSessionTransport>[0]) {
  const { call, dispose } = createOrganizationSessionTransport(options, 'moves');
  return {
    capabilities: async () => parseOrganizationCapabilities(await call('capabilities')),
    catalog: async () => parseOrganizationCatalog(await call('catalog')),
    list: async () => parseOrganizationList(await call('operations')),
    directory: () => call('directory'),
    prepare: async (intent: OrganizationMoveIntent) => { if (!isOrganizationMoveIntent(intent)) invalid(); return parseOrganizationMovePreparation(await call('prepare', intent), intent); },
    commit: async (operationId: string, reviewHash: string) => { if (!id(operationId) || !hash(reviewHash)) invalid(); return parseOrganizationMoveOutcome(await call('commit', { operationId, reviewHash }), operationId); },
    status: async (operationId: string) => { if (!id(operationId)) invalid(); return parseOrganizationMoveOutcome(await call('status', { operationId }), operationId); },
    cancel: async (operationId: string) => { if (!id(operationId)) invalid(); return parseOrganizationMoveOutcome(await call('cancel', { operationId }), operationId); },
    dispose,
  };
}
