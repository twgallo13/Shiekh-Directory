import { Firestore } from "@google-cloud/firestore";
import { AccessDenied } from "./authAuthority";
import type { MailEvent, MailIdentity, ResolveMailEvent } from "./mailApi";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

export function createFirestoreMailEventResolver(): ResolveMailEvent {
  const firestore = new Firestore({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || DEFAULT_GOOGLE_CLOUD_PROJECT,
    databaseId: process.env.FIRESTORE_DATABASE_ID || DEFAULT_FIRESTORE_DATABASE,
  });
  return async (event, entityId, identity) => resolveEvent(firestore, event, entityId, identity);
}

export async function resolveEvent(firestore: Firestore, event: MailEvent, entityId: string, identity: MailIdentity) {
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
    const steward = process.env.DIRECTORY_STEWARD_EMAIL;
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