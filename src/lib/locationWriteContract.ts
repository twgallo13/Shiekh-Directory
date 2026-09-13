import { normalizeUsPhone, normalizeWebUrl } from './contactNormalization';

export interface LocationWriteNormalizationIssue {
  field: 'phone' | 'phoneExtension' | 'googleReviewUrl' | 'storePageUrl';
  message: string;
}

export interface LocationWriteNormalizationResult {
  values: Record<string, unknown>;
  issues: LocationWriteNormalizationIssue[];
}

export function normalizeLocationWriteValues(
  input: Record<string, unknown>,
  current?: Record<string, unknown>,
): LocationWriteNormalizationResult {
  const values = { ...input };
  const issues: LocationWriteNormalizationIssue[] = [];

  if (Object.hasOwn(values, 'phone')
    && (values.phone !== current?.phone || values.phoneExtension !== current?.phoneExtension)) {
    const normalized = normalizeUsPhone(values.phone);
    if (!normalized) {
      issues.push({ field: 'phone', message: 'phone must be a valid US phone number.' });
    } else {
      values.phone = normalized.e164;
      if (normalized.extension) values.phoneExtension = normalized.extension;
      else if (typeof values.phoneExtension === 'string' && values.phoneExtension.trim()) {
        const extension = values.phoneExtension.trim();
        if (/^\d{1,10}$/.test(extension)) values.phoneExtension = extension;
        else issues.push({ field: 'phoneExtension', message: 'phoneExtension must contain 1 to 10 digits.' });
      } else {
        delete values.phoneExtension;
      }
    }
  }

  for (const field of ['googleReviewUrl', 'storePageUrl'] as const) {
    if (!Object.hasOwn(values, field) || values[field] === '' || values[field] === current?.[field]) continue;
    const normalized = normalizeWebUrl(values[field]);
    if (!normalized) issues.push({ field, message: `${field} must be an HTTP or HTTPS URL without credentials.` });
    else values[field] = normalized;
  }

  return { values, issues };
}