import {
  COMPANY_TILE_KEYS,
  type CompanyTileKey,
  type StorePageTileDefaults,
} from '../constants/storePage';

const MAX_URL_LENGTH = 500;
const REVIEW_HOSTS = new Set([
  'g.page',
  'search.google.com',
  'www.google.com',
  'google.com',
  'maps.google.com',
  'maps.app.goo.gl',
]);

const WEBSITE_HOSTS = new Set([
  'shiekh.com',
  'www.shiekh.com',
]);

const COMPANY_HOSTS = new Set([
  'shiekh.com',
  'www.shiekh.com',
  'apps.apple.com',
  'play.google.com',
  'get-card.sunbit.com',
  'instagram.com',
  'www.instagram.com',
]);

const MAGENTO_ID = /^[1-9][0-9]{0,5}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export type UrlResult =
  | { ok: true; href: string | null }
  | { ok: false; message: string };

function hasWhitespaceOrControl(value: string): boolean {
  return /[\u0000-\u001F\u007F\s]/.test(value);
}

function isBlockedRedirectPath(pathname: string): boolean {
  const path = pathname.toLowerCase();
  return (
    path === '/url' || path.startsWith('/url/') ||
    path === '/amp' || path.startsWith('/amp/') ||
    path === '/search' || path.startsWith('/search/') ||
    path === '/aclk' || path.startsWith('/aclk/')
  );
}

function reviewPathAllowed(host: string, pathname: string): boolean {
  if (isBlockedRedirectPath(pathname)) return false;
  switch (host) {
    case 'g.page':
    case 'maps.app.goo.gl':
      return true;
    case 'search.google.com':
      return pathname === '/local/writereview';
    case 'maps.google.com':
      return pathname === '/' || pathname === '/maps' || pathname.startsWith('/maps/');
    case 'www.google.com':
    case 'google.com':
      return pathname === '/maps' || pathname.startsWith('/maps/');
    default:
      return false;
  }
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

function isIpLiteral(hostname: string): boolean {
  const host = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return IPV4.test(host) || host.includes(':');
}

function inspectHttps(raw: string, maxLength: number): { ok: true; url: URL } | { ok: false; message: string } {
  if (hasWhitespaceOrControl(raw)) {
    return { ok: false, message: 'Link cannot contain spaces or line breaks.' };
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, message: 'Enter a full https link.' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, message: 'Link must start with https.' };
  }
  if (url.username || url.password) {
    return { ok: false, message: 'Link cannot include a username or password.' };
  }
  if (url.port) {
    return { ok: false, message: 'Link cannot include a port.' };
  }
  if (url.href.length > maxLength) {
    return { ok: false, message: `Link must be ${maxLength} characters or less.` };
  }
  return { ok: true, url };
}

function parseHttps(raw: string, hosts: Set<string>, hostMessage: string): UrlResult {
  const inspected = inspectHttps(raw, MAX_URL_LENGTH);
  if (!inspected.ok) return inspected;
  const host = inspected.url.hostname.toLowerCase();
  if (host.endsWith('.') || !hosts.has(host)) {
    return { ok: false, message: hostMessage };
  }
  return { ok: true, href: inspected.url.href };
}

const FIND_STORE_HOSTS = new Set(['shiekh.com', 'www.shiekh.com', 'qr.shiekh.store']);
const DEFAULT_IMAGE_HOSTS = new Set(['qr.shiekh.store']);

export type UrlFieldUpdate =
  | { action: 'keep' }
  | { action: 'clear' }
  | { action: 'set'; href: string }
  | { action: 'invalid'; message: string };

/** Exact host match on the normalized hostname. Punycode look-alikes are not the listed hosts. */
function hostAllowed(hostname: string, hosts: Set<string>): boolean {
  const host = hostname.toLowerCase();
  if (host.endsWith('.') || host === 'localhost' || host.endsWith('.localhost') || isIpLiteral(host)) return false;
  return hosts.has(host);
}

function readAllowlistedUrl(raw: unknown, hosts: Set<string>, hostMessage: string): UrlFieldUpdate {
  if (raw === undefined) return { action: 'keep' };
  if (raw === null || raw === '') return { action: 'clear' };
  if (typeof raw !== 'string') return { action: 'invalid', message: 'Enter a link.' };
  const inspected = inspectHttps(raw, 2048);
  if (!inspected.ok) return { action: 'invalid', message: inspected.message };
  if (!hostAllowed(inspected.url.hostname, hosts)) {
    return { action: 'invalid', message: hostMessage };
  }
  return { action: 'set', href: inspected.url.href };
}

export function readFindStoreUrl(raw: unknown): UrlFieldUpdate {
  return readAllowlistedUrl(
    raw,
    FIND_STORE_HOSTS,
    'Use an https link on shiekh.com, www.shiekh.com, or qr.shiekh.store.',
  );
}

export function readDefaultStoreImageUrl(raw: unknown): UrlFieldUpdate {
  return readAllowlistedUrl(raw, DEFAULT_IMAGE_HOSTS, 'Use an https link on qr.shiekh.store.');
}

function urlResult(update: UrlFieldUpdate): UrlResult {
  if (update.action === 'invalid') return { ok: false, message: update.message };
  if (update.action === 'set') return { ok: true, href: update.href };
  return { ok: true, href: null };
}

export function validateFindStoreUrl(raw: unknown): UrlResult {
  return urlResult(readFindStoreUrl(raw));
}

export function validateDefaultStoreImageUrl(raw: unknown): UrlResult {
  return urlResult(readDefaultStoreImageUrl(raw));
}

/** Empty becomes null. Otherwise a Google review link on an allowed host and path. */
export function validateReviewUrl(raw: unknown): UrlResult {
  if (raw === null || raw === undefined) return { ok: true, href: null };
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a review link.' };
  if (raw.trim() === '') return { ok: true, href: null };
  const parsed = parseHttps(
    raw,
    REVIEW_HOSTS,
    'Use a Google review link (Google Maps, g.page, or the write-a-review page).',
  );
  if (!parsed.ok || !parsed.href) return parsed;
  const url = new URL(parsed.href);
  if (!reviewPathAllowed(url.hostname.toLowerCase(), url.pathname)) {
    return {
      ok: false,
      message: 'That Google link is not a review page. Redirect links are not allowed.',
    };
  }
  return parsed;
}

/** Empty becomes null. Otherwise an https store website link on shiekh.com or www.shiekh.com. */
export function validateWebsiteUrl(raw: unknown): UrlResult {
  if (raw === null || raw === undefined) return { ok: true, href: null };
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a store website URL.' };
  if (raw.trim() === '') return { ok: true, href: null };
  const inspected = inspectHttps(raw, MAX_URL_LENGTH);
  if (!inspected.ok) return inspected;
  if (!hostAllowed(inspected.url.hostname, WEBSITE_HOSTS)) {
    return { ok: false, message: 'Use an https link on shiekh.com or www.shiekh.com.' };
  }
  return { ok: true, href: inspected.url.href };
}


/** An Admin-saved https link on an allowlisted host. Anything else is not a public tile url. */
export function savedCompanyTileUrl(key: CompanyTileKey, row: unknown): string | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const fields = row as Record<string, unknown>;
  if (key === 'app') {
    const ios = validateCompanyUrl(fields.iosUrl, false);
    const android = validateCompanyUrl(fields.androidUrl, false);
    return (ios.ok && ios.href) || (android.ok && android.href) || null;
  }
  const url = validateCompanyUrl(fields.url, false);
  return url.ok ? url.href : null;
}

export function validateCompanyUrl(raw: unknown, required: boolean): UrlResult {
  if (raw === null || raw === undefined || raw === '') {
    if (required) return { ok: false, message: 'Enter a link.' };
    return { ok: true, href: null };
  }
  if (typeof raw !== 'string') return { ok: false, message: 'Enter a link.' };
  return parseHttps(
    raw,
    COMPANY_HOSTS,
    'Use an https link on shiekh.com, the app stores, Sunbit, or Instagram.',
  );
}

export function parseMagentoStoreId(raw: unknown): { ok: true; id: string | null } | { ok: false; message: string } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, id: null };
  if (typeof raw !== 'string' || !MAGENTO_ID.test(raw)) {
    return { ok: false, message: 'Magento store ID must be 1 to 6 digits and cannot start with 0.' };
  }
  return { ok: true, id: raw };
}

export function parseExpectedVersion(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return null;
  return raw;
}

export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
}

function isRealDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface ValidatedHoursException {
  type: 'holiday' | 'special';
  label: string;
  startDate: string;
  endDate: string;
  closed: boolean;
  intervals: { open: string; close: string }[];
  source?: string;
}

export function validateHoursException(
  input: unknown,
): { ok: true; value: ValidatedHoursException } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'Hours exception is not valid.' };
  }
  const data = input as Record<string, unknown>;
  if (data.type !== 'holiday' && data.type !== 'special') {
    return { ok: false, message: 'Hours exception type must be holiday or special.' };
  }
  if (typeof data.label !== 'string' || data.label.trim().length === 0) {
    return { ok: false, message: 'Label is required.' };
  }
  if (data.label.trim().length > 60) {
    return { ok: false, message: 'Label must be 60 characters or less.' };
  }
  if (typeof data.startDate !== 'string' || !isRealDate(data.startDate)) {
    return { ok: false, message: 'Start date must be YYYY-MM-DD.' };
  }
  const endDate = data.endDate === undefined ? data.startDate : data.endDate;
  if (typeof endDate !== 'string' || !isRealDate(endDate)) {
    return { ok: false, message: 'End date must be YYYY-MM-DD.' };
  }
  if (endDate < data.startDate) {
    return { ok: false, message: 'End date cannot be before the start date.' };
  }
  if (typeof data.closed !== 'boolean') {
    return { ok: false, message: 'Closed must be yes or no.' };
  }
  if (!Array.isArray(data.intervals)) {
    return { ok: false, message: 'Intervals must be a list of open and close times.' };
  }
  const intervals: { open: string; close: string }[] = [];
  for (const interval of data.intervals) {
    if (!interval || typeof interval !== 'object' || Array.isArray(interval)) {
      return { ok: false, message: 'Each interval needs an open and close time.' };
    }
    const row = interval as Record<string, unknown>;
    if (typeof row.open !== 'string' || !CLOCK.test(row.open) || typeof row.close !== 'string' || !CLOCK.test(row.close)) {
      return { ok: false, message: 'Times must be HH:MM in 24-hour form.' };
    }
    intervals.push({ open: row.open, close: row.close });
  }
  let source: string | undefined;
  if (data.source !== undefined) {
    if (typeof data.source !== 'string' || data.source.length === 0 || data.source.length > 40) {
      return { ok: false, message: 'Hours exception source is not valid.' };
    }
    if (/[\u0000-\u001F\u007F]/.test(data.source)) {
      return { ok: false, message: 'Hours exception source is not valid.' };
    }
    source = data.source;
  }
  return {
    ok: true,
    value: {
      type: data.type,
      label: data.label.trim(),
      startDate: data.startDate,
      endDate,
      closed: data.closed,
      intervals,
      ...(source !== undefined ? { source } : {}),
    },
  };
}

const LOCATION_FIELDS = new Set([
  'address',
  'wayfindingDirections',
  'mainPhone',
  'sharedInboxEmail',
  'standardHours',
]);

export function sanitizeLocationProposal(
  proposed: unknown,
): { ok: true; changes: Record<string, unknown> } | { ok: false; code: string; message: string } {
  if (proposed === undefined || proposed === null) {
    return { ok: true, changes: {} };
  }
  if (typeof proposed !== 'object' || Array.isArray(proposed)) {
    return { ok: false, code: 'invalid_proposed_changes', message: 'Proposed changes are not valid.' };
  }
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(proposed as Record<string, unknown>)) {
    if (key === 'addHoursException') {
      const validated = validateHoursException(value);
      if (!validated.ok) {
        return { ok: false, code: 'invalid_hours_exception', message: validated.message };
      }
      changes.addHoursException = validated.value;
      continue;
    }
    if (!LOCATION_FIELDS.has(key)) {
      return {
        ok: false,
        code: 'invalid_proposed_changes',
        message: 'This request includes a field that cannot be applied.',
      };
    }
    changes[key] = value;
  }
  return { ok: true, changes };
}

function plainLabel(raw: unknown): { ok: true; label: string } | { ok: false; message: string } {
  if (typeof raw !== 'string') return { ok: false, message: 'Label is required.' };
  const label = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!label) return { ok: false, message: 'Label is required.' };
  if (label.length > 40) return { ok: false, message: 'Label must be 40 characters or less.' };
  if (/[<>]/.test(label)) return { ok: false, message: 'Label must be plain text.' };
  return { ok: true, label };
}

export function validateStorePageTiles(
  input: unknown,
): { ok: true; tiles: StorePageTileDefaults } | { ok: false; message: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: 'Tiles must be the six fixed company tiles.' };
  }
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== COMPANY_TILE_KEYS.length || COMPANY_TILE_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    return { ok: false, message: 'Tiles must be exactly app, launch, rewards, card, instagram, and returns.' };
  }
  const tiles = {} as StorePageTileDefaults;
  for (const key of COMPANY_TILE_KEYS) {
    const row = record[key];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return { ok: false, message: `The ${key} tile is not valid.` };
    }
    const fields = row as Record<string, unknown>;
    const allowed = key === 'app'
      ? ['label', 'iosUrl', 'androidUrl', 'show']
      : ['label', 'url', 'show'];
    for (const field of Object.keys(fields)) {
      if (!allowed.includes(field)) {
        return { ok: false, message: `The ${key} tile has a field that is not allowed.` };
      }
    }
    if (typeof fields.show !== 'boolean') {
      return { ok: false, message: `The ${key} tile needs a show yes or no.` };
    }
    const label = plainLabel(fields.label);
    if (!label.ok) return { ok: false, message: `${key}: ${label.message}` };
    if (key === 'app') {
      const ios = validateCompanyUrl(fields.iosUrl, fields.show === true && !fields.androidUrl);
      if (!ios.ok) return { ok: false, message: `App Store link: ${ios.message}` };
      const android = validateCompanyUrl(fields.androidUrl, fields.show === true && !ios.href);
      if (!android.ok) return { ok: false, message: `Google Play link: ${android.message}` };
      if (fields.show === true && !ios.href && !android.href) {
        return { ok: false, message: 'Turn the app tile on only when it has a store link.' };
      }
      tiles.app = { label: label.label, iosUrl: ios.href, androidUrl: android.href, show: fields.show };
    } else {
      const url = validateCompanyUrl(fields.url, fields.show === true);
      if (!url.ok) return { ok: false, message: `${key}: ${url.message}` };
      tiles[key] = { label: label.label, url: url.href, show: fields.show };
    }
  }
  return { ok: true, tiles };
}

export function isCompanyTileKey(value: string): value is CompanyTileKey {
  return (COMPANY_TILE_KEYS as readonly string[]).includes(value);
}
