import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { Firestore, type QueryDocumentSnapshot } from '@google-cloud/firestore';
import { AccessDenied, AuthenticationUnavailable, type Account, type Authenticate } from './authAuthority';
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from './firestoreLocations';
import type { DirectorySeed } from '../src/lib/directorySeed';
import { buildLocationImportPlan, LocationImportPreviewError } from '../src/lib/locationImportPreview';
import { LOCATION_IMPORT_MAX_BYTES } from '../src/lib/locationImportSchema';
import { buildLocationImportFieldDictionary, buildLocationImportReferenceCsv, buildLocationImportTemplate, buildLocationImportWorkedExample } from './locationImportCsv';
import {
  LOCATION_IMPORT_CONFIRMATION_TTL_MS,
  LOCATION_IMPORT_MAX_CHANGED_ROWS,
  LOCATION_IMPORT_MAX_ROWS,
  LocationImportConfirmationError,
  digestLocationImportActor,
  digestLocationImportSource,
  expiredConfirmation,
  signLocationImportManifest,
  verifyLocationImportManifest,
  type LocationImportManifest,
  type LocationImportReceipt,
} from './locationImportConfirmation';
import { DirectoryConflict, DirectoryValidationError, FirestoreDirectoryStore, LocationImportIdempotencyConflict, LocationImportPayloadTooLarge } from './firestoreDirectory';

const PREVIEW_ROLES: Account['role'][] = ['System Administrator', 'Directory Data Steward', 'Editor'];
export type LocationImportSnapshot = Pick<DirectorySeed, 'locations' | 'people' | 'regions' | 'districts'>;

export interface LocationImportPreviewStore {
  readLocationImportSnapshot(): Promise<LocationImportSnapshot>;
  confirmLocationImport?(manifest: LocationImportManifest, actor: Account, options?: { replayOnly?: boolean }): Promise<LocationImportReceipt>;
}

export function createLocationImportPreviewRouter(
  authenticate: Authenticate | null,
  store: LocationImportPreviewStore,
  options: { rateLimit?: false; now?: () => Date; tokenSecret?: string } = {},
) {
  const router = Router();
  const now = options.now ?? (() => new Date());
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

  router.get('/locations/example', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      response.status(200).type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_locations_import_v1_worked_example.csv"')
        .send(buildLocationImportWorkedExample());
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.get('/locations/fields', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      response.status(200).type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_locations_import_v1_field_dictionary.csv"')
        .send(buildLocationImportFieldDictionary());
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.get('/locations/references', async (request, response) => {
    try {
      await authorizePreview(authenticate, request.get('authorization'));
      const snapshot = await store.readLocationImportSnapshot();
      const snapshotReadAt = now().toISOString();
      response.status(200).type('text/csv; charset=utf-8')
        .set('Content-Disposition', 'attachment; filename="shiekh_location_import_reference_ids.csv"')
        .set('X-Snapshot-Read-At', snapshotReadAt)
        .send(buildLocationImportReferenceCsv(snapshot));
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.post('/locations/preview', async (request, response) => {
    try {
      const account = await authorizePreview(authenticate, request.get('authorization'));
      const csv = request.body?.csv;
      if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv, 'utf8') > LOCATION_IMPORT_MAX_BYTES) {
        throw new LocationImportPreviewError('invalid_csv', 'Upload a non-empty CSV file no larger than 2 MB.');
      }
      const snapshot = await store.readLocationImportSnapshot();
      const issuedAt = now();
      const plan = buildLocationImportPlan(csv, snapshot, issuedAt.toISOString(), () => `loc-${randomUUID()}`);
      if (plan.preview.summary.totalRows > LOCATION_IMPORT_MAX_ROWS) throw new PreviewHttpError(400, 'batch_too_large', `Location imports support at most ${LOCATION_IMPORT_MAX_ROWS} rows.`);
      if (plan.writes.length > LOCATION_IMPORT_MAX_CHANGED_ROWS) throw new PreviewHttpError(400, 'batch_too_large', `Location imports support at most ${LOCATION_IMPORT_MAX_CHANGED_ROWS} changed rows.`);
      const eligible = plan.preview.summary.blocked === 0 && plan.writes.length > 0;
      if (!eligible) return response.status(200).json(plan.preview);
      if (!options.tokenSecret || !store.confirmLocationImport) {
        throw new PreviewHttpError(503, 'confirmation_unavailable', 'Location import confirmation is not configured.');
      }
      const operationId = `locimp-${randomUUID()}`;
      const batchId = `batch-${randomUUID()}`;
      const expiresAt = new Date(issuedAt.getTime() + LOCATION_IMPORT_CONFIRMATION_TTL_MS).toISOString();
      const manifest: LocationImportManifest = {
        version: 1,
        schema: plan.preview.schemaVersion,
        actorDigest: digestLocationImportActor(account),
        sourceDigest: digestLocationImportSource(csv),
        operationId,
        batchId,
        issuedAt: issuedAt.toISOString(),
        expiresAt,
        summary: plan.preview.summary,
        warningCount: plan.preview.summary.warnings,
        writes: plan.writes,
        unchanged: plan.unchanged,
      };
      response.status(200).json({
        ...plan.preview,
        confirmationToken: signLocationImportManifest(manifest, options.tokenSecret),
        operationId,
        batchId,
        expiresAt,
      });
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  router.post('/locations/confirm', async (request, response) => {
    try {
      const account = await authorizePreview(authenticate, request.get('authorization'));
      if (!options.tokenSecret || !store.confirmLocationImport) throw new PreviewHttpError(503, 'confirmation_unavailable', 'Location import confirmation is not configured.');
      const { csv, confirmationToken, operationId, warningsReviewed } = request.body || {};
      if (typeof csv !== 'string' || !csv.trim() || Buffer.byteLength(csv, 'utf8') > LOCATION_IMPORT_MAX_BYTES
        || typeof confirmationToken !== 'string' || typeof operationId !== 'string') {
        throw new PreviewHttpError(400, 'invalid_confirmation', 'CSV, confirmationToken, and operationId are required.');
      }
      const confirmedAt = now();
      const manifest = verifyLocationImportManifest(confirmationToken, options.tokenSecret, confirmedAt, true);
      if (manifest.operationId !== operationId) throw new LocationImportConfirmationError('confirmation_mismatch', 'The operation ID does not match this confirmation.');
      if (manifest.sourceDigest !== digestLocationImportSource(csv)) throw new LocationImportConfirmationError('confirmation_mismatch', 'The CSV does not match this confirmation.');
      if (manifest.actorDigest !== digestLocationImportActor(account)) throw new LocationImportConfirmationError('confirmation_mismatch', 'Your current authority does not match this confirmation.');
      if (manifest.warningCount > 0 && warningsReviewed !== true) throw new PreviewHttpError(409, 'warnings_not_reviewed', 'Review and acknowledge all warnings before confirming.');
      try {
        response.status(200).json(await store.confirmLocationImport(manifest, account, { replayOnly: Date.parse(manifest.expiresAt) <= confirmedAt.getTime() }));
      } catch (error) {
        if (error instanceof DirectoryConflict || error instanceof DirectoryValidationError
          || error instanceof LocationImportIdempotencyConflict || error instanceof LocationImportPayloadTooLarge
          || error instanceof LocationImportConfirmationError) throw error;
        throw new PreviewHttpError(503, 'confirmation_uncertain', 'The import outcome could not be confirmed. Retry the same operation ID and token.');
      }
    } catch (error) {
      sendPreviewError(response, error);
    }
  });

  return router;
}

export class FirestoreLocationImportPreviewStore implements LocationImportPreviewStore {
  private readonly directoryStore: FirestoreDirectoryStore;

  constructor(private readonly firestore: Firestore) {
    this.directoryStore = new FirestoreDirectoryStore(firestore);
  }

  async readLocationImportSnapshot(): Promise<LocationImportSnapshot> {
    return this.firestore.runTransaction(async transaction => {
      const [locations, people, regions, districts] = await Promise.all([
        transaction.get(this.firestore.collection('locations')),
        transaction.get(this.firestore.collection('people')),
        transaction.get(this.firestore.collection('regions')),
        transaction.get(this.firestore.collection('districts')),
      ]);
      return {
        locations: locations.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['locations'],
        people: people.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['people'],
        regions: regions.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['regions'],
        districts: districts.docs.map(document => toRecord(document)) as unknown as LocationImportSnapshot['districts'],
      };
    }, { readOnly: true });
  }

  confirmLocationImport(manifest: LocationImportManifest, actor: Account, options?: { replayOnly?: boolean }): Promise<LocationImportReceipt> {
    return this.directoryStore.confirmLocationImport(manifest, actor, options);
  }
}

export function createFirestoreLocationImportPreviewStore(): FirestoreLocationImportPreviewStore {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE;
  if (databaseId === '(default)') throw new Error('A named Firestore database is required.');
  return new FirestoreLocationImportPreviewStore(new Firestore({ projectId, databaseId }));
}

function toRecord(snapshot: QueryDocumentSnapshot): Record<string, unknown> {
  return { ...snapshot.data(), id: snapshot.id };
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
  if (error instanceof LocationImportConfirmationError) {
    const status = error.code === 'confirmation_tampered' || error.code === 'confirmation_too_large' ? 400 : 409;
    return response.status(status).json({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof LocationImportIdempotencyConflict) return response.status(409).json({ error: { code: 'idempotency_conflict', message: error.message } });
  if (error instanceof DirectoryConflict || error instanceof DirectoryValidationError) return response.status(409).json({ error: { code: 'stale_preview', message: 'The directory changed after preview. Preview the CSV again.' } });
  if (error instanceof LocationImportPayloadTooLarge) return response.status(400).json({ error: { code: 'atomic_payload_too_large', message: error.message } });
  if (error instanceof LocationImportPreviewError) return response.status(400).json({ error: { code: error.code, message: error.message } });
  return response.status(503).json({ error: { code: 'preview_unavailable', message: 'The authoritative directory snapshot could not be previewed.' } });
}