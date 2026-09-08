import { getSharedAuth } from "./authClient";

export interface MailSettings {
  smtpHost: string;
  smtpPort: 465 | 587;
  smtpUser: string;
  fromName: string;
  fromEmail: string;
  replyToEmail: string;
  stewardAlertRecipient: string;
  diagnosticRecipients: string[];
}

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

export async function sendMailEvent(event: "user-invitation" | "request-submitted" | "request-approved" | "request-rejected", entityId: string) {
  const auth = getSharedAuth();
  if (!auth.currentUser) throw new Error("Sign in with your authorized directory account to use mail.");
  const response = await fetch('/api/mail/event', {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, entityId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || 'Mail request failed.');
  return body;
}

export async function createInvitationLink(entityId: string): Promise<string> {
  const auth = getSharedAuth();
  if (!auth.currentUser) throw new Error("Sign in with your authorized directory account to create an invitation link.");
  const response = await fetch('/api/mail/invitation-link', {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.activationLink !== 'string') throw new Error(body.error?.message || 'A secure sign-in link could not be generated.');
  return body.activationLink;
}

export async function getMailSettings(): Promise<{ settings: MailSettings; passwordConfigured: boolean }> {
  return mailSettingsRequest("GET");
}

export async function saveMailSettings(settings: MailSettings): Promise<{ settings: MailSettings; passwordConfigured: boolean }> {
  return mailSettingsRequest("PUT", settings);
}

async function mailSettingsRequest(method: "GET" | "PUT", settings?: MailSettings) {
  const auth = getSharedAuth();
  if (!auth.currentUser) throw new Error("Sign in with your authorized directory account to manage mail.");
  const response = await fetch("/api/mail/settings", {
    method,
    redirect: "error",
    headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}`, "Content-Type": "application/json" },
    ...(settings ? { body: JSON.stringify(settings) } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || "Mail settings request failed.");
  return body;
}