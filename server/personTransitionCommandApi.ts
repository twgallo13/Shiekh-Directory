import { json, Router, type RequestHandler, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import { DirectoryConflict, DirectoryValidationError, DirectoryWriteDenied, type DirectoryWriter } from './firestoreDirectory';
import { normalizePersonTransitionIntent } from './personTransitionIntent';
import { normalizeTransitionPreparation, normalizeTransitionRecoveryMarker } from './personTransitionOperation';

/** Fixed admin-only endpoints. New commands and recovery have independent server gates. */
export function createPersonTransitionCommandPreviewRouter(authenticate: Authenticate | null, store: DirectoryWriter) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  const limit = rateLimit({ limit: 10, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (_request, response) => response.locals.transitionActor.uid });
  const authorize: RequestHandler = async (request, response, next) => {
    const token = request.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return response.status(401).json({ error: { code: 'invalid_token' } });
    if (!authenticate) return response.status(503).json({ error: { code: 'transition_preview_unavailable' } });
    let actor: Account;
    try { actor = await authenticate(token); }
    catch (error) { return response.status(error instanceof AccessDenied ? 403 : error instanceof AuthenticationUnavailable ? 503 : 401).json({ error: { code: 'transition_access_denied' } }); }
    if (actor.role !== 'System Administrator' || actor.status !== 'Active' || actor.accessScope !== 'Company-wide') return response.status(403).json({ error: { code: 'transition_access_denied' } });
    response.locals.transitionActor = actor; next();
  };
  const bounded: RequestHandler = (request, response, next) => json({ limit: '128kb' })(request, response, (error?: unknown) => {
    if (error) return response.status((error as { type?: string }).type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'invalid_transition_intent', message: 'A bounded valid JSON intent is required. No changes were made.' } });
    next();
  });
  const sendPrivate = (response: Response, value: unknown) => response.type('application/json').end(JSON.stringify(value));
  router.post('/preview', authorize, limit, bounded, async (request, response) => {
    let intent: ReturnType<typeof normalizePersonTransitionIntent>;
    try { intent = normalizePersonTransitionIntent(request.body); }
    catch { return response.status(400).json({ error: { code: 'invalid_transition_intent' } }); }
    try {
      if (!store.previewPersonTransitionCommand) throw new Error('Unavailable');
      const result = await store.previewPersonTransitionCommand(intent, response.locals.transitionActor as Account);
      // Avoid Express-generated ETag/304 responses for fresh private command previews.
      return response.type('application/json').end(JSON.stringify(result));
    } catch (error) {
      return response.status(error instanceof DirectoryWriteDenied ? 403 : error instanceof DirectoryValidationError ? 400 : 503).json({ error: { code: 'transition_preview_unavailable', message: 'A fresh change review is unavailable. No changes were made.' } });
    }
  });
  const capabilities = () => {
    const configured = store.personTransitionCapabilities?.();
    return { schemaVersion: 1 as const,
      newCommandsEnabled: configured?.schemaVersion === 1 && configured.newCommandsEnabled === true && configured.recoveryEnabled === true && !!store.preparePersonTransitionCommand && !!store.commitPersonTransitionCommand && !!store.previewPersonTransitionCommand && !!store.readPersonTransitionOperation && !!store.cancelPersonTransitionOperation && !!store.listPersonTransitionOperations,
      recoveryEnabled: configured?.schemaVersion === 1 && configured.recoveryEnabled === true && !!store.readPersonTransitionOperation && !!store.cancelPersonTransitionOperation && !!store.listPersonTransitionOperations };
  };
  const unavailable = (response: Response, error?: unknown) => response.status(error instanceof DirectoryWriteDenied ? 403 : error instanceof DirectoryConflict ? 409 : error instanceof DirectoryValidationError ? 400 : 503).json({ error: { code: 'transition_operation_unconfirmed', message: 'The operation could not be confirmed. Retain its original identity and use recovery before another submission.' } });
  const admit = (kind: 'command' | 'recovery'): RequestHandler => (_request, response, next) => {
    try { if (kind === 'command' ? !capabilities().newCommandsEnabled : !capabilities().recoveryEnabled) return void unavailable(response); next(); }
    catch { unavailable(response); }
  };
  const recoveryLimit = rateLimit({ limit: 120, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (_request, response) => response.locals.transitionActor.uid });
  router.get('/capabilities', authorize, recoveryLimit, (_request, response) => { try { return sendPrivate(response, capabilities()); } catch { return unavailable(response); } });
  router.get('/operations', authorize, recoveryLimit, admit('recovery'), async (_request, response) => {
    try { return sendPrivate(response, await store.listPersonTransitionOperations!(response.locals.transitionActor)); } catch (error) { return unavailable(response, error); }
  });
  for (const mode of ['prepare', 'commit'] as const) router.post(`/${mode}`, authorize, limit, admit('command'), bounded, async (request, response) => {
    const actor = response.locals.transitionActor as Account;
    let body: unknown;
    try { const parsed = normalizeTransitionPreparation(request.body, actor.uid); body = { schemaVersion: 1, operationId: parsed.identity.operationId, intent: parsed.intent, reviewEnvelope: parsed.reviewEnvelope }; }
    catch { return response.status(400).json({ error: { code: 'invalid_transition_command' } }); }
    try { return sendPrivate(response, await (mode === 'prepare' ? store.preparePersonTransitionCommand!(body, actor) : store.commitPersonTransitionCommand!(body, actor))); }
    catch (error) { return unavailable(response, error); }
  });
  for (const mode of ['status', 'cancel'] as const) router.post(`/${mode}`, authorize, recoveryLimit, admit('recovery'), bounded, async (request, response) => {
    let marker: ReturnType<typeof normalizeTransitionRecoveryMarker>;
    try { marker = normalizeTransitionRecoveryMarker(request.body); } catch { return response.status(400).json({ error: { code: 'invalid_transition_marker' } }); }
    try { return sendPrivate(response, await (mode === 'status' ? store.readPersonTransitionOperation!(marker, response.locals.transitionActor) : store.cancelPersonTransitionOperation!(marker, response.locals.transitionActor))); }
    catch (error) { return unavailable(response, error); }
  });
  return router;
}
