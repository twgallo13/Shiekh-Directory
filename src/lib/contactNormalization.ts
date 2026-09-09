import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export interface NormalizedPhone {
  e164: string;
  extension?: string;
  display: string;
}

export function normalizeUsPhone(value: unknown): NormalizedPhone | null {
  if (typeof value !== 'string' || !value.trim() || value.length > 100) return null;
  const phone = parsePhoneNumberFromString(value, 'US');
  if (!phone || phone.countryCallingCode !== '1' || !phone.isValid()) return null;
  const extension = phone.ext || undefined;
  return {
    e164: phone.number,
    ...(extension ? { extension } : {}),
    display: phone.formatNational(),
  };
}

export function formatUsPhone(value: unknown, extension?: unknown): string {
  const normalized = normalizeUsPhone(value);
  if (!normalized) return typeof value === 'string' ? value : '';
  const resolvedExtension = typeof extension === 'string' && extension ? extension : normalized.extension;
  return `${normalized.display.replace(/ ext\. \d+$/, '')}${resolvedExtension ? ` ext. ${resolvedExtension}` : ''}`;
}

export function normalizeWebUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || value.trim() !== value || !value) return null;
  const normalized = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(normalized);
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password
      ? normalized
      : null;
  } catch {
    return null;
  }
}