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
  if (!response.ok) throw new Error(apiClientErrorMessage(payload));
  return payload as T;
}

export function apiClientErrorMessage(payload: unknown): string {
  const code = payload && typeof payload === "object"
    && "error" in payload && payload.error && typeof payload.error === "object"
    && "code" in payload.error && typeof payload.error.code === "string"
    ? payload.error.code
    : "";
  switch (code) {
    case "invalid_token": return "Your sign-in session is no longer valid. Sign in again.";
    case "access_denied": return "Only System Administrators can manage API clients.";
    case "api_client_not_found": return "This API client no longer exists. Refresh the client list.";
    case "api_client_conflict": return "This API client changed and the requested action is no longer allowed. Refresh the client list.";
    case "invalid_request": return "The API client request was invalid.";
    case "api_client_management_unavailable": return "API client management is temporarily unavailable.";
    default: return "API client management request failed.";
  }
}
