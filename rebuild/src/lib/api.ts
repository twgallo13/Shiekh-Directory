type AuthGetter = () => Promise<{
  isStoreSession: boolean;
  token?: string;
}>;

let authGetter: AuthGetter | null = null;

export function setAuthGetter(getter: AuthGetter): void {
  authGetter = getter;
}

export interface ApiRequestOptions extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

export async function apiFetch(
  url: string,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const { headers: customHeaders = {}, ...restOptions } = options;

  if (!authGetter) {
    throw new Error('Auth getter not initialized. Call setAuthGetter first.');
  }

  const { isStoreSession, token } = await authGetter();

  const headers: Record<string, string> = {
    ...customHeaders,
  };

  if (isStoreSession) {
    return fetch(url, {
      ...restOptions,
      headers,
      credentials: 'include',
    });
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...restOptions,
    headers,
  });
}

export async function apiGet(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  return apiFetch(url, { ...options, method: 'GET' });
}

export async function apiPost(
  url: string,
  body?: unknown,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...options.headers,
  };
  
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  return apiFetch(url, {
    ...options,
    method: 'POST',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch(
  url: string,
  body?: unknown,
  options: ApiRequestOptions = {}
): Promise<Response> {
  const headers: Record<string, string> = {
    ...options.headers,
  };
  
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  return apiFetch(url, {
    ...options,
    method: 'PATCH',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete(url: string, options: ApiRequestOptions = {}): Promise<Response> {
  return apiFetch(url, { ...options, method: 'DELETE' });
}
