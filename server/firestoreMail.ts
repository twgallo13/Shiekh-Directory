import { randomUUID } from "node:crypto";
import { Firestore } from "@google-cloud/firestore";
import { AccessDenied } from "./authAuthority";
import { parseMailSettings, type MailConfiguration, type MailEvent, type MailIdentity, type MailSettingsStore, type ResolveMailEvent } from "./mailApi";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

export function createFirestoreMailEventResolver(): ResolveMailEvent {
  const firestore = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE,
  });
  return async (event, entityId, identity, configuration) => resolveEvent(firestore, event, entityId, identity, configuration);
}

export function createFirestoreMailSettingsStore(): MailSettingsStore {
  const firestore = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE,
  });
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
    return {
      to: user.email.toLowerCase(),
      subject: "Your Shiekh Directory access is ready",
      text: `Hello ${safeText(user.displayName || user.name || "there")},\n\nYour Shiekh Directory access record is active. Open https://shiekh-dir.ai.studio/sign-in and choose Email link or your approved sign-in method.\n\nRole: ${safeText(user.role)}\nAccess scope: ${safeText(user.accessScope)}`,
    };
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
    return {
      to: steward.toLowerCase(),
      subject: `Directory update request: ${safeText(request.targetName)}`,
      text: `${safeText(requester.name)} submitted a ${safeText(request.changeType)} request for ${safeText(request.targetName)}.\n\nReview it at https://shiekh-dir.ai.studio/requests`,
    };
  }
  if (request.status !== (event === "request-approved" ? "Approved" : "Rejected")) throw new AccessDenied();
  return {
    to: requester.email.toLowerCase(),
    subject: `Directory request ${request.status.toLowerCase()}: ${safeText(request.targetName)}`,
    text: `Your ${safeText(request.changeType)} request for ${safeText(request.targetName)} was ${request.status.toLowerCase()}.\n\nView the directory at https://shiekh-dir.ai.studio/requests`,
  };
}

function safeText(value: unknown) {
  return String(value || "").replace(/[\r\n]+/g, " ").slice(0, 200);
}

function mailbox(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}