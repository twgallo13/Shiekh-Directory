import { getSharedAuth } from "./authClient";

export type ApiClientStatus = "Active" | "Disabled" | "Revoked";
export type ApiTokenStatus = "Active" | "Retiring" | "Retired" | "Revoked";

export interface ApiTokenVersionSummary {
  status: ApiTokenStatus;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export interface ApiClientSummary {
  id: string;
  name: string;
  status: ApiClientStatus;
  scopes: ["locations:read"];
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  tokenVersions: ApiTokenVersionSummary[];
}

export interface IssuedApiClient {
  client: ApiClientSummary;
  token: string;
}

export async function listApiClients(): Promise<ApiClientSummary[]> {
  return (await apiClientRequest<{ clients: ApiClientSummary[] }>("", "GET")).clients;
}

export function createApiClient(name: string): Promise<IssuedApiClient> {
  return apiClientRequest("", "POST", { name });
}

export function disableApiClient(id: string): Promise<ApiClientSummary> {
  return apiClientRequest(`/${encodeURIComponent(id)}/disable`, "POST", {});
}

export function enableApiClient(id: string): Promise<ApiClientSummary> {
  return apiClientRequest(`/${encodeURIComponent(id)}/enable`, "POST", {});
}

export function rotateApiClient(id: string, retirePreviousImmediately: boolean): Promise<IssuedApiClient> {
  return apiClientRequest(`/${encodeURIComponent(id)}/rotate`, "POST", { retirePreviousImmediately });
}

export function revokeApiClient(id: string): Promise<ApiClientSummary> {
  return apiClientRequest(`/${encodeURIComponent(id)}/revoke`, "POST", {});
}

async function apiClientRequest<T>(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  const user = getSharedAuth().currentUser;
  if (!user) throw new Error("Sign in with a System Administrator account to manage API clients.");
  const response = await fetch(`/api/api-clients${path}`, {
    method,
    cache: "no-store",
    redirect: "error",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || "API client management is temporarily unavailable.");
  return payload as T;
}