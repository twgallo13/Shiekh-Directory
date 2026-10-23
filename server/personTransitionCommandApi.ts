import { json, Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import { DirectoryValidationError, DirectoryWriteDenied, type DirectoryWriter } from './firestoreDirectory';
import { normalizePersonTransitionIntent } from './personTransitionIntent';

/** Preview only. No other command method is registered, even with a configured keyring. */
export function createPersonTransitionCommandPreviewRouter(authenticate: Authenticate | null, store: DirectoryWriter) {
  const router = Router();
  const limit = rateLimit({ limit: 10, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (_request, response) => response.locals.transitionActor.uid });
  router.post('/preview', async (request, response, next) => {
    const token = request.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return response.status(401).json({ error: { code: 'invalid_token' } });
    if (!authenticate) return response.status(503).json({ error: { code: 'transition_preview_unavailable' } });
    let actor: Account;
    try { actor = await authenticate(token); }
    catch (error) { return response.status(error instanceof AccessDenied ? 403 : error instanceof AuthenticationUnavailable ? 503 : 401).json({ error: { code: 'transition_access_denied' } }); }
    if (actor.role !== 'System Administrator' || actor.status !== 'Active' || actor.accessScope !== 'Company-wide') return response.status(403).json({ error: { code: 'transition_access_denied' } });
    response.locals.transitionActor = actor; next();
  }, limit, (request, response, next) => json({ limit: '128kb' })(request, response, (error?: unknown) => {
    if (error) return response.status((error as { type?: string }).type === 'entity.too.large' ? 413 : 400).json({ error: { code: 'invalid_transition_intent', message: 'A bounded valid JSON intent is required. No changes were made.' } });
    next();
  }), async (request, response) => {
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
  return router;
}
