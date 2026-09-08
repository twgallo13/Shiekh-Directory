import { randomUUID } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { AccessDenied } from "./authAuthority";
import { parseMailSettings, type MailConfiguration, type MailEvent, type MailIdentity, type MailSettingsStore, type ResolveDiagnosticTemplate, type ResolveMailEvent } from "./mailApi";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

export function createFirestoreMailEventResolver(): ResolveMailEvent {
  const firestore = createFirestore();
  return async (event, entityId, identity, configuration) => resolveEvent(firestore, event, entityId, identity, configuration);
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
  if (event === "user-invitation") {
    const snapshot = await firestore.collection("users").doc(entityId).get();
    const user = snapshot.data();
    if (!snapshot.exists || !mailbox(user?.email) || user?.status !== "Active") throw new AccessDenied();
    const storeNumber = safeText(user.storeNumber || String(user.accessScope || "").replace(/^Store\s+/i, "") || "Company-wide");
    const location = storeNumber === "Company-wide" ? null : await firestore.collection("locations").where("storeNumber", "==", storeNumber).limit(1).get();
    const content = await resolveTemplate(firestore, "tmpl-account-invite", {
      recipient_name: user.displayName || user.name || "there",
      role: user.role,
      store_number: storeNumber,
      store_name: location?.docs[0]?.data()?.name || (storeNumber === "Company-wide" ? "All locations" : "Assigned location"),
    });
    return { to: user.email.toLowerCase(), ...content };
  }

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

function safeText(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").slice(0, 200);
}

function mailbox(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}