export type PublicProfileCheck =
  | { ok: true; rateLimit?: number }
  | { ok: false; code: string; message: string };

const RATE_MESSAGE = 'An explicit rateLimit from 1 to 10000 is required for a public-profile:read key. Use 120 requests per minute for the store landing page key.';

/** public-profile:read stays alone, and its rate limit stays between 1 and 10000. */
export function checkPublicProfileClient(
  scopes: readonly string[],
  rateLimit: unknown,
  mode: 'create' | 'update',
): PublicProfileCheck {
  if (!scopes.includes('public-profile:read')) return { ok: true };
  if (mode === 'create' && scopes.length !== 1) {
    return {
      ok: false,
      code: 'invalid_request',
      message: 'public-profile:read cannot be combined with other scopes.',
    };
  }
  if (typeof rateLimit !== 'number' || !Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 10000) {
    return { ok: false, code: 'rate_limit_required', message: RATE_MESSAGE };
  }
  return { ok: true, rateLimit };
}
