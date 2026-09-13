import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import type { DirectoryReader } from './firestoreDirectory';
import { buildLocationImportTemplate, LocationImportPreviewError, previewLocationImport } from '../src/lib/locationImportPreview';

const PREVIEW_ROLES: Account['role'][] = ['System Administrator', 'Directory Data Steward', 'Editor'];
const MAX_CSV_LENGTH = 2_000_000;

export function createLocationImportPreviewRouter(
  authenticate: Authenticate | null,
  store: DirectoryReader,
  options: { rateLimit?: false } = {},
) {
  const router = Router();
  router.use((_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
  if (options.rateLimit !== false) router.use(rateLimit({ limit: 20, windowMs: 60_000, standardHeaders: 'draft-8', legacyHeaders: false }));

  router.get('/locations/template', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      response
        .status(200)
        .type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_locations_import_v1.csv"')
        .send(buildLocationImportTemplate());
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.post('/locations/preview', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      const csv = request.body?.csv;
      if (typeof csv !== 'string' || !csv.trim() || csv.length > MAX_CSV_LENGTH) {
        throw new LocationImportPreviewError('invalid_csv', 'Upload a non-empty CSV file no larger than 2 MB.');
      }
      const snapshot = await store.read();
      response.status(200).json(previewLocationImport(csv, snapshot));
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  return router;
}

async function authorizePreview(authenticate: Authenticate | null, authorization: string | undefined): Promise<Account> {
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 8192) throw new PreviewHttpError(401, 'invalid_token', 'A valid Firebase ID token is required.');
  if (!authenticate) throw new PreviewHttpError(503, 'auth_unavailable', 'Directory authentication is unavailable.');
  let account: Account;
  try {
    account = await authenticate(token);
  } catch (error) {
    if (error instanceof AuthenticationUnavailable) throw new PreviewHttpError(503, 'auth_unavailable', 'Directory authentication is unavailable.');
    if (error instanceof AccessDenied) throw new PreviewHttpError(403, 'access_denied', 'Your account is not authorized to preview imports.');
    throw new PreviewHttpError(401, 'invalid_token', 'A valid Firebase ID token is required.');
  }
  if (!PREVIEW_ROLES.includes(account.role)) throw new PreviewHttpError(403, 'preview_not_allowed', 'Your role cannot preview Location imports.');
  if (!['Company', 'Company-wide'].includes(account.accessScope)) {
    throw new PreviewHttpError(403, 'unsupported_preview_scope', 'Location CSV preview currently requires company-wide access.');
  }
  return account;
}

class PreviewHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function sendPreviewError(response: { status(code: number): { json(body: unknown): unknown } }, error: unknown) {
  if (error instanceof PreviewHttpError) return response.status(error.status).json({ error: { code: error.code, message: error.message } });
  if (error instanceof LocationImportPreviewError) return response.status(400).json({ error: { code: error.code, message: error.message } });
  return response.status(503).json({ error: { code: 'preview_unavailable', message: 'The authoritative directory snapshot could not be previewed.' } });
}