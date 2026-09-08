import { getSharedAuth } from "./authClient";

export async function mailRequest(route: "status" | "dispatch", recipient?: string) {
  const auth = getSharedAuth();
  if (!auth.currentUser) throw new Error("Sign in with your authorized directory account to use mail.");
  const token = await auth.currentUser.getIdToken();
  const response = await fetch(`/api/mail/${route}`, {
    method: route === "status" ? "GET" : "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(route === "dispatch" ? { body: JSON.stringify({ recipient, templateId: "tmpl-diagnostic-test" }) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Mail request failed.");
  return body;
}