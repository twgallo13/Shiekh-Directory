import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { ApiClientAuthenticator, ManagedApiCredential } from './apiClientApi';
import { accessLogMiddleware, createAuthenticationMiddleware, requireScope, sendError } from './directoryApi';
import type { PersonnelDataset, PersonnelRepository } from './firestorePersonnel';
import { canonicalId, projectPerson, projectStaffing } from './personnelProjection';

export const PERSONNEL_CONTRACT_VERSION = 'personnel-staffing-v2.1';
export const PERSONNEL_SNAPSHOT_TTL_MS = 15 * 60_000;
interface Snapshot { version: string; client: string; token: string; grants: string; at: string }
interface Cursor { snapshot: string; dataset: PersonnelDataset; after: string; limit: number }

function grants(credential: ManagedApiCredential): string {
  return createHash('sha256').update(JSON.stringify({ scopes: [...credential.scopes].sort(), version: credential.grantsVersion ?? 0 })).digest('hex');
}
function sign(value: unknown, key: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${payload}.${createHmac('sha256', key).update(`personnel-v2:${payload}`).digest('base64url')}`;
}
function verify(value: string, key: string): unknown {
  if (value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const [payload, mac] = value.split('.');
  const expected = createHmac('sha256', key).update(`personnel-v2:${payload}`).digest();
  const supplied = Buffer.from(mac, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); }
  catch { return null; }
}
function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function snapshotValue(value: unknown, credential: ManagedApiCredential): value is Snapshot {
  return object(value) && Object.keys(value).length === 5
    && value.version === PERSONNEL_CONTRACT_VERSION && value.client === credential.clientId
    && value.token === credential.tokenVersionId && value.grants === grants(credential)
    && typeof value.at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(value.at) && Number.isFinite(Date.parse(value.at));
}

export function createPersonnelApiRouter(options: { authenticator: ApiClientAuthenticator; repository: PersonnelRepository; now?: () => Date; rateLimit?: false }): Router {
  const router = Router();
  const now = options.now || (() => new Date());
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  router.use(accessLogMiddleware);
  if (options.rateLimit !== false) router.use(rateLimit({
    limit: 100, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_request, response) => { sendError(response, 429, 'rate_limit_exceeded', 'Too many requests. Try again later.'); },
  }));
  router.use(createAuthenticationMiddleware(options.authenticator));
  router.get('/snapshot', (request, response) => {
    const credential = response.locals.apiCredential as ManagedApiCredential;
    if (!credential.scopes.some(scope => scope === 'personnel:read' || scope === 'staffing:read')) return sendError(response, 403, 'insufficient_scope', 'personnel:read or staffing:read is required.');
    if (Object.keys(request.query).length) return sendError(response, 400, 'invalid_query', 'Snapshot creation takes no query parameters.');
    const snapshotAt = new Date(Math.floor(now().getTime() / 1000) * 1000).toISOString();
    const snapshot = sign({ version: PERSONNEL_CONTRACT_VERSION, client: credential.clientId, token: credential.tokenVersionId, grants: grants(credential), at: snapshotAt }, credential.cursorSigningKey);
    return response.json({ snapshot, snapshotAt, expiresAt: new Date(Date.parse(snapshotAt) + PERSONNEL_SNAPSHOT_TTL_MS).toISOString(), contractVersion: PERSONNEL_CONTRACT_VERSION });
  });

  for (const dataset of ['personnel', 'location-staffing'] as const) {
    router.get([`/${dataset}`, `/${dataset}/:id`], requireScope(dataset === 'personnel' ? 'personnel:read' : 'staffing:read'), async (request, response) => {
      const detail = request.params.id !== undefined;
      const id = typeof request.params.id === 'string' ? request.params.id : undefined;
      const allowed = detail ? ['snapshot'] : ['snapshot', 'cursor', 'limit'];
      if (Object.keys(request.query).some(key => !allowed.includes(key)) || typeof request.query.snapshot !== 'string') return sendError(response, 400, 'invalid_query', 'A snapshot is required; only documented query parameters are accepted.');
      if (detail && !canonicalId(id)) return sendError(response, 400, 'invalid_id', 'Use an exact canonical document ID.');
      const rawLimit = request.query.limit;
      const limit = rawLimit === undefined ? 50 : typeof rawLimit === 'string' && /^[1-9]\d{0,2}$/.test(rawLimit) ? Number(rawLimit) : 0;
      if (limit < 1 || limit > 100) return sendError(response, 400, 'invalid_limit', 'limit must be an integer from 1 to 100.');
      const credential = response.locals.apiCredential as ManagedApiCredential;
      const snapshot = verify(request.query.snapshot, credential.cursorSigningKey);
      if (!snapshotValue(snapshot, credential)) return sendError(response, 400, 'invalid_snapshot', 'Snapshot is invalid for this credential and authorization.');
      const age = now().getTime() - Date.parse(snapshot.at);
      if (age < 0 || age >= PERSONNEL_SNAPSHOT_TTL_MS) return sendError(response, 409, 'snapshot_expired', 'Restart the complete full snapshot.');
      let afterId: string | undefined;
      if (request.query.cursor !== undefined) {
        const cursor = typeof request.query.cursor === 'string' ? verify(request.query.cursor, credential.cursorSigningKey) : null;
        if (!object(cursor) || Object.keys(cursor).length !== 4 || cursor.snapshot !== request.query.snapshot || cursor.dataset !== dataset || cursor.limit !== limit || !canonicalId(cursor.after)) return sendError(response, 400, 'invalid_cursor', 'Cursor does not match snapshot, dataset or page size.');
        afterId = cursor.after;
      }
      try {
        const page = await options.repository.read({ dataset, snapshotAt: new Date(snapshot.at), limit, afterId, ...(detail ? { id } : {}) });
        const data = page.records.map(record => dataset === 'personnel' ? projectPerson(record, page.locations) : projectStaffing(record, page.people, page.regions, page.districts));
        const sync = { mode: 'full', snapshotAt: snapshot.at, contractVersion: PERSONNEL_CONTRACT_VERSION };
        if (detail) return data.length ? response.json({ data: data[0], sync }) : sendError(response, 404, 'record_not_found', 'No record has this canonical ID at the snapshot.');
        const nextCursor = page.nextId ? sign({ snapshot: request.query.snapshot, dataset, after: page.nextId, limit } satisfies Cursor, credential.cursorSigningKey) : null;
        return response.json({ data, pagination: { limit, nextCursor }, sync });
      } catch (error) {
        console.error('[Personnel API Source]', JSON.stringify({ dataset, requestId: response.locals.requestId, outcome: 'unavailable', ...(object(error) && typeof error.code === 'number' ? { code: error.code } : {}) }));
        return sendError(response, 503, 'snapshot_unavailable', 'The pinned source snapshot could not be read. Do not reconcile partial results.');
      }
    });
  }
  return router;
}
