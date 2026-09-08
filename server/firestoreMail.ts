import { randomUUID } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth, type UserRecord } from "firebase-admin/auth";
import { AccessDenied } from "./authAuthority";
import { parseMailSettings, type MailConfiguration, type MailEvent, type MailIdentity, type MailOutcome, type MailSettingsStore, type RecordMailOutcome, type ResolveDiagnosticTemplate, type ResolveInvitationEmail, type ResolveInvitationLink, type ResolveMailEvent } from "./mailApi";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

export function createFirestoreMailEventResolver(): ResolveMailEvent {
  const firestore = createFirestore();
  return async (event, entityId, identity, configuration) => resolveEvent(firestore, event, entityId, identity, configuration);
}

export function createFirestoreInvitationLinkResolver(): ResolveInvitationLink {
  const firestore = createFirestore();
  const generateLink = createFirebaseSignInLinkGenerator();
  return (entityId, identity) => resolveInvitationLink(firestore, entityId, identity, generateLink);
}

export function createFirestoreInvitationEmailResolver(): ResolveInvitationEmail {
  const firestore = createFirestore();
  const auth = createInvitationAuth();
  const generateLink = createFirebaseSignInLinkGenerator();
  return (entityId, identity, configuration) => resolveSmtpInvitationEmail(firestore, auth, entityId, identity, configuration, generateLink);
}

export async function resolveSmtpInvitationEmail(firestore: Firestore, auth: Pick<Auth, "getUserByEmail" | "createUser">, entityId: string, identity: MailIdentity, configuration: MailConfiguration, generateLink: (email: string) => Promise<string>) {
  const reference = firestore.collection("users").doc(entityId);
  const snapshot = await reference.get();
  const user = snapshot.data();
  if (!snapshot.exists || !mailbox(user?.email) || user?.status !== "Active") throw new AccessDenied();
  const email = user.email.toLowerCase();
  let firebaseUser: UserRecord;
  try {
    firebaseUser = await auth.getUserByEmail(email);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    firebaseUser = await auth.createUser({ email, displayName: safeText(user.displayName || user.name || email), disabled: false });
  }
  if (firebaseUser.disabled) throw new AccessDenied();
  if (user.firebaseUid && user.firebaseUid !== firebaseUser.uid) throw new AccessDenied();
  await reference.set({ firebaseIdentityProvisioned: true }, { merge: true });
  const activationLink = await generateLink(email);
  const recipientName = safeText(user.displayName || user.name || "there");
  const role = safeText(user.role || "Directory user");
  const subject = "Your Shiekh Directory secure sign-in link";
  const encodedLink = escapeHtml(activationLink);
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#dc2626;color:#fff;padding:18px 24px"><h2 style="margin:0;font-size:20px">Welcome to Shiekh Directory</h2></div><div style="padding:24px;background:#fff"><p>Hello <strong>${escapeHtml(recipientName)}</strong>,</p><p>An administrator granted <strong>${escapeHtml(email)}</strong> access as <strong>${escapeHtml(role)}</strong>.</p><p>Use the secure button below to finish setup and sign in. No password is required.</p><p style="margin:24px 0"><a href="${encodedLink}" style="background:#b91c1c;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:700">Finish setup and sign in</a></p><p style="font-size:12px;color:#4b5563">This one-time link expires automatically. If you did not expect this invitation, ignore this message.</p></div></div>`;
  const text = `Hello ${recipientName},\n\nAn administrator granted ${email} access to Shiekh Directory as ${role}.\n\nFinish setup and sign in:\n${activationLink}\n\nThis one-time link expires automatically.`;
  const outboxReference = (requestId: string) => firestore.collection("outbox_logs").doc(`out-${requestId}`);
  return {
    message: { to: email, subject, html, text },
    async recordOutcome(status: "Queued" | "Accepted" | "Failed", requestId: string, errorMessage?: string) {
      const timestamp = new Date().toISOString();
      await outboxReference(requestId).set({
        id: `out-${requestId}`,
        timestamp,
        recipient: email,
        subject,
        status,
        transport: "SMTP",
        templateId: "signup-invitation",
        entityId,
        requestedBy: identity.uid,
        ...(errorMessage ? { errorMessage } : {}),
      }, { merge: true });
      if (status === "Accepted") await reference.set({
        invitationStatus: "Pending",
        invitationDelivery: "SMTP email",
        invitationDeliveryStatus: "Accepted",
        invitedAt: timestamp,
        invitedBy: identity.uid,
      }, { merge: true });
    },
  };
}

export function createFirestoreDiagnosticResolver(): ResolveDiagnosticTemplate {
  const firestore = createFirestore();
  return configuration => resolveTemplate(firestore, "tmpl-diagnostic-test", {
    smtp_host: configuration.host,
    smtp_port: String(configuration.port),
    timestamp: new Date().toISOString(),
    sender_name: configuration.fromName || "Shiekh Directory",
    sender_email: configuration.from,
  });
}

export function createFirestoreMailOutcomeRecorder(): RecordMailOutcome {
  const firestore = createFirestore();
  return outcome => recordMailOutcome(firestore, outcome);
}

export async function recordMailOutcome(firestore: Firestore, outcome: MailOutcome) {
  const timestamp = new Date().toISOString();
  await firestore.collection("outbox_logs").doc(`out-${outcome.requestId}`).set({
    id: `out-${outcome.requestId}`,
    timestamp,
    recipient: outcome.recipient.toLowerCase(),
    subject: safeText(outcome.subject),
    status: outcome.status,
    transport: "SMTP",
    templateId: outcome.templateId,
    ...(outcome.entityId ? { entityId: outcome.entityId } : {}),
    requestedBy: outcome.requestedBy,
    ...(outcome.errorMessage ? { errorMessage: safeText(outcome.errorMessage) } : {}),
  }, { merge: true });
}

export function createFirestoreMailSettingsStore(): MailSettingsStore {
  const firestore = createFirestore();
  const reference = firestore.collection("mail_settings").doc("smtp");
  return {
    async read() {
      const snapshot = await reference.get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() || {};
      const settings = parseMailSettings(Object.fromEntries([
        "smtpHost", "smtpPort", "smtpUser", "fromName", "fromEmail", "replyToEmail", "stewardAlertRecipient", "diagnosticRecipients",
      ].map(field => [field, data[field]])));
      if (!settings) throw new Error("Invalid stored mail settings.");
      return settings;
    },
    async write(settings, identity) {
      await firestore.runTransaction(async transaction => {
        transaction.set(reference, { ...settings, updatedAt: new Date().toISOString(), updatedBy: identity.uid });
        const audit = firestore.collection("audit_logs").doc(`aud-mail-${Date.now()}-${randomUUID().slice(0, 8)}`);
        transaction.set(audit, {
          id: audit.id,
          timestamp: new Date().toISOString(),
          userId: identity.uid,
          userName: safeText(identity.name || "Directory administrator"),
          action: "SMTP Config Updated",
          entityType: "Setting",
          entityId: "smtp",
          entityName: "SMTP Relay Settings",
          details: "Updated non-secret SMTP relay settings.",
        });
      });
    },
  };
}

export async function resolveEvent(firestore: Firestore, event: MailEvent, entityId: string, identity: MailIdentity, configuration: MailConfiguration) {
  const snapshot = await firestore.collection("requests").doc(entityId).get();
  const request = snapshot.data();
  if (!snapshot.exists || !request) throw new AccessDenied();
  const requester = request.requestedBy;
  if (!requester || !mailbox(requester.email)) throw new AccessDenied();
  if (event === "request-submitted") {
    if (requester.id !== identity.uid && !["System Administrator", "Directory Data Steward"].includes(String(identity.role))) throw new AccessDenied();
    const steward = configuration.steward;
    if (!mailbox(steward)) throw new Error("Directory steward email is unavailable.");
    const content = await resolveTemplate(firestore, "tmpl-correction-alert", requestVariables(request, identity));
    return { to: steward.toLowerCase(), ...content };
  }
  if (request.status !== (event === "request-approved" ? "Approved" : "Rejected")) throw new AccessDenied();
  const templateId = event === "request-approved" ? "tmpl-request-approved" : "tmpl-request-rejected";
  const content = await resolveTemplate(firestore, templateId, requestVariables(request, identity));
  return { to: requester.email.toLowerCase(), ...content };
}

export async function resolveInvitationLink(firestore: Firestore, entityId: string, identity: MailIdentity, generateLink: (email: string) => Promise<string>) {
  const result = await invitationForUser(firestore, entityId, identity, generateLink);
  await firestore.collection("users").doc(entityId).set({ invitationDelivery: "Copied link", invitationDeliveryStatus: "Submitted" }, { merge: true });
  return result.activationLink;
}

async function invitationForUser(firestore: Firestore, entityId: string, identity: MailIdentity, generateLink: (email: string) => Promise<string>) {
  const reference = firestore.collection("users").doc(entityId);
  const snapshot = await reference.get();
  const user = snapshot.data();
  if (!snapshot.exists || !mailbox(user?.email) || user?.status !== "Active") throw new AccessDenied();
  const activationLink = await generateLink(user.email.toLowerCase());
  await reference.set({ invitationStatus: "Pending", invitedAt: new Date().toISOString(), invitedBy: identity.uid }, { merge: true });
  return { user, activationLink };
}

export async function resolveTemplate(firestore: Firestore, templateId: string, variables: Record<string, unknown>) {
  const snapshot = await firestore.collection("email_templates").doc(templateId).get();
  const template = snapshot.data();
  if (!snapshot.exists || typeof template?.subject !== "string" || !template.subject.trim() || template.subject.length > 500
    || typeof template.bodyHtml !== "string" || !template.bodyHtml.trim() || template.bodyHtml.length > 100_000) throw new Error("Required mail template is unavailable.");
  const subject = substitute(template.subject, variables, value => safeText(value)).replace(/[\r\n]+/g, " ").trim();
  const html = substitute(template.bodyHtml, variables, escapeHtml)
    .replaceAll("https://directory.shiekhshoes.com", "https://shiekh-dir.ai.studio");
  return { subject, html, text: htmlToText(html) };
}

function requestVariables(request: FirebaseFirestore.DocumentData, identity: MailIdentity) {
  return {
    store_number: request.targetStoreNumber || "N/A",
    store_name: request.targetName,
    requested_by: request.requestedBy?.name,
    requester_role: request.requestedBy?.role,
    change_type: request.changeType,
    change_details: request.reason || JSON.stringify(request.requestedChanges || {}),
    reviewer_name: request.reviewedBy || identity.name || "Directory reviewer",
    rejection_reason: request.reviewerNotes || "Please contact the Directory Steward for details.",
  };
}

function substitute(template: string, variables: Record<string, unknown>, encode: (value: unknown) => string) {
  return template.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_match, name: string) => encode(variables[name]));
}

function escapeHtml(value: unknown) {
  return safeText(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function htmlToText(html: string) {
  return html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function createFirestore() {
  return new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE,
  });
}

function createFirebaseSignInLinkGenerator() {
  const app = getApps().find(candidate => candidate.name === "directory-invitations")
    ?? initializeApp({ projectId: DEFAULT_GOOGLE_CLOUD_PROJECT, credential: applicationDefault() }, "directory-invitations");
  const auth = getAuth(app);
  const appUrl = (process.env.DIRECTORY_APP_URL || "https://shiekh-dir.ai.studio").replace(/\/$/, "");
  return (email: string) => auth.generateSignInWithEmailLink(email, { url: `${appUrl}/auth/email-link`, handleCodeInApp: true });
}

function createInvitationAuth() {
  const app = getApps().find(candidate => candidate.name === "directory-invitations")
    ?? initializeApp({ projectId: DEFAULT_GOOGLE_CLOUD_PROJECT, credential: applicationDefault() }, "directory-invitations");
  return getAuth(app);
}

function safeText(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").slice(0, 200);
}

function mailbox(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}