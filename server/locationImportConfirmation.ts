import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Account } from './authAuthority';
import type { LocationImportPlannedWrite, LocationImportPreview, LocationImportUnchangedAssertion } from '../src/lib/locationImportPreview';
import { LOCATION_IMPORT_SCHEMA_VERSION } from '../src/lib/locationImportSchema';

export const LOCATION_IMPORT_MAX_ROWS = 100;
export const LOCATION_IMPORT_MAX_CHANGED_ROWS = 40;
export const LOCATION_IMPORT_MAX_TOKEN_BYTES = 1_000_000;
export const LOCATION_IMPORT_MAX_ATOMIC_BYTES = 8_000_000;
export const LOCATION_IMPORT_CONFIRMATION_TTL_MS = 10 * 60_000;

export interface LocationImportManifest {
  version: 1;
  schema: typeof LOCATION_IMPORT_SCHEMA_VERSION;
  actorDigest: string;
  sourceDigest: string;
  operationId: string;
  batchId: string;
  issuedAt: string;
  expiresAt: string;
  summary: LocationImportPreview['summary'];
  warningCount: number;
  writes: LocationImportPlannedWrite[];
  unchanged: LocationImportUnchangedAssertion[];
}

export interface LocationImportReceipt {
  operationId: string;
  batchId: string;
  committedAt: string;
  additions: number;
  updates: number;
  unchanged: number;
  locations: Array<{ id: string; name: string; storeNumber: string; record: Record<string, unknown> }>;
  replayed: boolean;
}

export class LocationImportConfirmationError extends Error {
  constructor(
    public readonly code: 'confirmation_tampered' | 'confirmation_expired' | 'confirmation_mismatch' | 'confirmation_too_large',
    message: string,
  ) { super(message); }
}

export function digestLocationImportActor(account: Account): string {
  return sha256(JSON.stringify({ uid: account.uid, role: account.role, status: account.status, accessScope: account.accessScope }));
}

export function loadLocationImportTokenSecret(value = process.env.LOCATION_IMPORT_TOKEN_SECRET): string | undefined {
  if (!value) return undefined;
  if (Buffer.byteLength(value, 'utf8') < 32) throw new Error('LOCATION_IMPORT_TOKEN_SECRET must contain at least 32 bytes.');
  return value;
}

export function digestLocationImportSource(csv: string): string {
  return sha256(csv);
}

export function digestLocationImportManifest(manifest: LocationImportManifest): string {
  return sha256(JSON.stringify(manifest));
}

export function signLocationImportManifest(manifest: LocationImportManifest, secret: string): string {
  const payload = Buffer.from(JSON.stringify(manifest)).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  const token = `${payload}.${signature}`;
  if (Buffer.byteLength(token, 'utf8') > LOCATION_IMPORT_MAX_TOKEN_BYTES) {
    throw new LocationImportConfirmationError('confirmation_too_large', 'The confirmation manifest exceeds the supported size.');
  }
  return token;
}

export function verifyLocationImportManifest(token: string, secret: string, now: Date, allowExpired = false): LocationImportManifest {
  if (!token || Buffer.byteLength(token, 'utf8') > LOCATION_IMPORT_MAX_TOKEN_BYTES) {
    throw new LocationImportConfirmationError('confirmation_too_large', 'The confirmation token exceeds the supported size.');
  }
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) throw tampered();
  const expectedSignature = createHmac('sha256', secret).update(payload).digest();
  let actualSignature: Buffer;
  try { actualSignature = Buffer.from(suppliedSignature, 'base64url'); }
  catch { throw tampered(); }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) throw tampered();

  let manifest: LocationImportManifest;
  try { manifest = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as LocationImportManifest; }
  catch { throw tampered(); }
  if (manifest.version !== 1 || manifest.schema !== LOCATION_IMPORT_SCHEMA_VERSION
    || !Array.isArray(manifest.writes) || manifest.writes.length > LOCATION_IMPORT_MAX_CHANGED_ROWS
    || !Array.isArray(manifest.unchanged)
    || manifest.summary?.totalRows > LOCATION_IMPORT_MAX_ROWS
    || manifest.summary?.additions + manifest.summary?.updates !== manifest.writes.length
    || manifest.summary?.unchanged !== manifest.unchanged.length
    || manifest.summary?.totalRows !== manifest.writes.length + manifest.unchanged.length) throw tampered();
  const issuedAt = Date.parse(manifest.issuedAt);
  const expiresAt = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt - issuedAt !== LOCATION_IMPORT_CONFIRMATION_TTL_MS) throw tampered();
  if (!allowExpired && expiresAt <= now.getTime()) throw expiredConfirmation();
  return manifest;
}

export function expiredConfirmation(): LocationImportConfirmationError {
  return new LocationImportConfirmationError('confirmation_expired', 'The confirmation token has expired. Preview the CSV again.');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function tampered(): LocationImportConfirmationError {
  return new LocationImportConfirmationError('confirmation_tampered', 'The confirmation token is invalid or has been altered.');
}