export const API_BASE = process.env.API_BASE || 'http://127.0.0.1:13951';

export async function api(path: string, token: string | null, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = token.startsWith('StoreSession ') || token.startsWith('Bearer ')
    ? token
    : `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}

export async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

export const WEEK_HOURS = {
  monday: { closed: false, intervals: [{ open: '10:00', close: '20:00' }] },
  tuesday: { closed: false, intervals: [{ open: '10:00', close: '18:00' }, { open: '19:00', close: '21:00' }] },
  wednesday: { closed: false, intervals: [{ open: '22:00', close: '02:00' }] },
  thursday: { closed: true, intervals: [] },
  friday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
  saturday: { closed: false, intervals: [{ open: '10:00', close: '21:00' }] },
  sunday: { closed: true, intervals: [] },
};

export const GOOD_REVIEW_URL = 'https://g.page/r/abc/review';
