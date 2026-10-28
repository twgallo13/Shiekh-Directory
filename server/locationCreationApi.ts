import { json, Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryWriter } from './firestoreDirectory';
import { assertLocationCreationActor, normalizeLocationCreationCommand, normalizeLocationCreationMarker } from './locationCreationRecovery';

/** Private Firebase-authenticated Company-wide writer endpoints. Store admission and live
 * authority are checked again; no generic commit fallback or consumer scope enables this route. */
export function createLocationCreationRouter(authenticate: Authenticate | null, store: DirectoryWriter) {
  const router = Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const authorize: RequestHandler = async (req, res, next) => {
    const token = req.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return void res.status(401).json({ error: { code: 'invalid_token' } });
    if (!authenticate) return void res.status(503).json({ error: { code: 'location_creation_unconfirmed' } });
    try { const actor = await authenticate(token); assertLocationCreationActor(actor); res.locals.locationCreationActor = actor; next(); }
    catch (e) { res.status(e instanceof AccessDenied || e instanceof DirectoryWriteDenied ? 403 : e instanceof AuthenticationUnavailable ? 503 : 401).json({ error: { code: 'location_creation_access_denied' } }); }
  };
  const limit = (count: number) => rateLimit({ limit: count, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (_req, res) => res.locals.locationCreationActor.uid });
  const commandLimit = limit(10), readLimit = limit(120);
  const capabilities = () => {
    const c = store.locationCreationCapabilities?.();
    const recoveryEnabled = c?.schemaVersion === 1 && c.recoveryEnabled === true && !!store.readLocationCreation && !!store.cancelLocationCreation && !!store.listLocationCreations;
    const catalogEnabled = c?.schemaVersion === 1 && c.catalogEnabled === true;
    const completeAdapter = !!store.prepareLocationCreation && !!store.commitLocationCreation && !!store.readLocationCreation && !!store.cancelLocationCreation && !!store.listLocationCreations;
    const legacyCreationEnabled = completeAdapter && c?.schemaVersion === 1 && c.catalogEnabled === false && c.recoveryEnabled === false && c.newCommandsEnabled === false;
    return { schemaVersion: 1 as const, catalogEnabled, recoveryEnabled, newCommandsEnabled: catalogEnabled && recoveryEnabled && c.newCommandsEnabled === true && !!store.prepareLocationCreation && !!store.commitLocationCreation, legacyCreationEnabled };
  };
  const unavailable = (res: Response, e?: unknown) => {
    const known = e instanceof DirectoryConflict || e instanceof DirectoryValidationError;
    const status = e instanceof DirectoryWriteDenied ? 403 : e instanceof DirectoryConflict ? 409 : e instanceof DirectoryValidationError ? 400 : 503;
    return res.status(status).json({ error: { code: e instanceof DirectoryConflict ? 'location_creation_conflict' : e instanceof DirectoryValidationError ? 'location_creation_invalid_input' : 'location_creation_unconfirmed', message: known ? e.message : 'The creation could not be confirmed. Keep its identity and check recovery before creating another.' } });
  };
  const send = (res: Response, value: unknown) => res.type('application/json').end(JSON.stringify(value));
  const admit = (command: boolean): RequestHandler => (_req, res, next) => { try { const c = capabilities(); if (!(command ? c.newCommandsEnabled : c.recoveryEnabled)) return void unavailable(res); next(); } catch { unavailable(res); } };
  const bounded: RequestHandler = (req, res, next) => json({ limit: 220_000 })(req, res, (e?: unknown) => { if (e) return void res.status((e as { type?: string }).type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'invalid_location_creation_body' } }); next(); });
  router.get('/capabilities', authorize, readLimit, async (_req, res) => { try {
    const c=capabilities();
    c.legacyCreationEnabled=c.legacyCreationEnabled && await store.locationCreationLegacyAllowed?.(res.locals.locationCreationActor)===true;
    return send(res,c);
  } catch { return unavailable(res); } });
  router.get('/operations', authorize, readLimit, admit(false), async (_req, res) => { try { return send(res, await store.listLocationCreations!(res.locals.locationCreationActor)); } catch (e) { return unavailable(res, e); } });
  for (const mode of ['prepare', 'commit', 'status', 'cancel'] as const) router.post(`/${mode}`, authorize, mode === 'prepare' || mode === 'commit' ? commandLimit : readLimit, admit(mode === 'prepare' || mode === 'commit'), bounded, async (req, res) => {
    let input: unknown;
    try { input = mode === 'prepare' || mode === 'commit' ? normalizeLocationCreationCommand(req.body) : normalizeLocationCreationMarker(req.body); }
    catch { return res.status(400).json({ error: { code: 'location_creation_invalid_input', message: 'Review the exact creation draft or recovery identity before continuing.' } }); }
    const actor = res.locals.locationCreationActor as Account;
    try { const result = mode === 'prepare' ? await store.prepareLocationCreation!(input, actor) : mode === 'commit' ? await store.commitLocationCreation!(input, actor) : mode === 'status' ? await store.readLocationCreation!(input, actor) : await store.cancelLocationCreation!(input, actor); return send(res, result); }
    catch (e) { return unavailable(res, e); }
  });
  return router;
}
