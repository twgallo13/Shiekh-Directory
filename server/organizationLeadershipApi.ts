import { json, Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import { DirectoryWriteDenied, type DirectoryWriter } from './firestoreDirectory';
import { LeadershipPlanError, normalizeOrganizationLeadershipIntent } from './organizationLeadershipPlanner';
import { normalizeOrganizationOperationMarker } from './organizationLeadershipOperations';

/** Private administrator endpoints. Every operation is gated again by the Store; no public API scope
 * or generic collection grant enables them. Never include raw infrastructure errors in responses. */
export function createOrganizationLeadershipRouter(authenticate: Authenticate | null, store: DirectoryWriter) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  const authorize: RequestHandler = async (request, response, next) => {
    const token = request.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return void response.status(401).json({ error: { code: 'invalid_token' } });
    if (!authenticate) return void response.status(503).json({ error: { code: 'organization_unavailable' } });
    try {
      const actor = await authenticate(token);
      if (actor.role !== 'System Administrator' || actor.status !== 'Active' || actor.accessScope !== 'Company-wide') return void response.status(403).json({ error: { code: 'organization_access_denied' } });
      response.locals.organizationActor = actor; next();
    } catch (error) { response.status(error instanceof AccessDenied ? 403 : error instanceof AuthenticationUnavailable ? 503 : 401).json({ error: { code: 'organization_access_denied' } }); }
  };
  const limits = (limit: number) => rateLimit({ limit, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (_req, res) => res.locals.organizationActor.uid });
  const commandLimit = limits(10), readLimit = limits(120);
  const capabilities = () => {
    const c = store.organizationLeadershipCapabilities?.();
    const recoveryEnabled = c?.schemaVersion === 1 && c.recoveryEnabled === true && !!store.readOrganizationLeadershipOperation && !!store.cancelOrganizationLeadershipOperation && !!store.listOrganizationLeadershipOperations;
    const catalogEnabled = c?.schemaVersion === 1 && c.catalogEnabled === true && !!store.readOrganizationCatalog;
    return { schemaVersion: 1 as const, catalogEnabled, recoveryEnabled,
      newCommandsEnabled: catalogEnabled && recoveryEnabled && c.newCommandsEnabled === true && !!store.prepareOrganizationLeadership && !!store.commitOrganizationLeadership };
  };
  const unavailable = (response: Response, error?: unknown) => {
    const known = error instanceof LeadershipPlanError;
    const status = error instanceof DirectoryWriteDenied ? 403 : known ? error.code === 'conflict' ? 409 : error.code === 'invalid_input' ? 400 : error.code === 'ineligible' ? 422 : error.code === 'capacity' ? 413 : 503 : 503;
    return response.status(status).json({ error: { code: known ? `organization_${error.code}` : 'organization_unconfirmed', message: known ? error.message : 'The operation could not be confirmed. Keep its identity and check recovery before another submission.' } });
  };
  const send = (response: Response, value: unknown) => response.type('application/json').end(JSON.stringify(value));
  const admit = (kind: 'catalog' | 'command' | 'recovery'): RequestHandler => (_request, response, next) => {
    try { const c = capabilities(); if (!(kind === 'catalog' ? c.catalogEnabled : kind === 'command' ? c.newCommandsEnabled : c.recoveryEnabled)) return void unavailable(response); next(); }
    catch { unavailable(response); }
  };
  const bounded: RequestHandler = (req, res, next) => json({ limit: '32kb' })(req, res, (error?: unknown) => {
    if (error) return void res.status((error as { type?: string }).type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'invalid_organization_body' } });
    next();
  });
  router.get('/capabilities', authorize, readLimit, (_req, res) => { try { return send(res, capabilities()); } catch { return unavailable(res); } });
  router.get('/catalog', authorize, readLimit, admit('catalog'), async (_req, res) => {
    try { return send(res, await store.readOrganizationCatalog!(res.locals.organizationActor)); } catch (error) { return unavailable(res, error); }
  });
  router.get('/operations', authorize, readLimit, admit('recovery'), async (_req, res) => {
    try { return send(res, await store.listOrganizationLeadershipOperations!(res.locals.organizationActor)); } catch (error) { return unavailable(res, error); }
  });
  for (const mode of ['prepare', 'commit', 'status', 'cancel'] as const) router.post(`/${mode}`, authorize, mode === 'prepare' || mode === 'commit' ? commandLimit : readLimit,
    admit(mode === 'prepare' || mode === 'commit' ? 'command' : 'recovery'), bounded, async (req, res) => {
      let input: unknown;
      try {
        input = mode === 'prepare' ? normalizeOrganizationLeadershipIntent(req.body) : normalizeOrganizationOperationMarker(req.body);
        if (mode === 'commit' && !(input as { reviewHash?: string }).reviewHash) throw new Error();
      } catch { return res.status(400).json({ error: { code: 'invalid_organization_command' } }); }
      const actor = res.locals.organizationActor as Account;
      try {
        const result = mode === 'prepare' ? await store.prepareOrganizationLeadership!(input, actor) : mode === 'commit' ? await store.commitOrganizationLeadership!(input, actor)
          : mode === 'status' ? await store.readOrganizationLeadershipOperation!(input, actor) : await store.cancelOrganizationLeadershipOperation!(input, actor);
        return send(res, result);
      } catch (error) { return unavailable(res, error); }
    });
  return router;
}
