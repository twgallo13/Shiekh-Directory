import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { Firestore } from "@google-cloud/firestore";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { DEFAULT_FIRESTORE_DATABASE, DEFAULT_GOOGLE_CLOUD_PROJECT } from "./firestoreLocations";

export const APPLICATION_ROLES = ["System Administrator", "Directory Data Steward", "Editor", "Viewer"] as const;
export interface Account {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  role: typeof APPLICATION_ROLES[number];
  status: "Active";
  accessScope: string;
  personId: string | null;
  authenticationMethod: string;
}
export class AuthenticationUnavailable extends Error {}
export class AccessDenied extends Error {}
export interface UserMapping { firebaseUid?: unknown; email?: unknown; role?: unknown; status?: unknown; accessScope?: unknown; personId?: unknown }
export interface UserAuthority { find(field: "firebaseUid" | "email", value: string): Promise<UserMapping[]> }
export type Authenticate = (token: string) => Promise<Account>;

export function firebaseAuthenticator(auth: Pick<Auth, "verifyIdToken" | "getUser">, users: UserAuthority): Authenticate {
  return async (token) => {
    let decoded;
    let identity;
    try {
      decoded = await auth.verifyIdToken(token, true);
      if (decoded.aud !== DEFAULT_GOOGLE_CLOUD_PROJECT || decoded.iss !== `https://securetoken.google.com/${DEFAULT_GOOGLE_CLOUD_PROJECT}`) throw new Error();
      identity = await auth.getUser(decoded.uid);
      if (identity.disabled || identity.uid !== decoded.uid) throw new Error();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code && ["app/invalid-credential", "auth/invalid-credential", "auth/insufficient-permission", "auth/internal-error", "app/network-error"].includes(code)) throw new AuthenticationUnavailable();
      throw new Error("Invalid identity");
    }
    let matches: UserMapping[];
    try {
      matches = await users.find("firebaseUid", identity.uid);
      if (matches.length === 0) {
        if (!identity.emailVerified || !decoded.email_verified || !identity.email || decoded.email !== identity.email) throw new AccessDenied();
        matches = await users.find("email", identity.email);
        if (matches.some(record => record.firebaseUid && record.firebaseUid !== identity.uid)) throw new AccessDenied();
      }
    } catch (error) {
      if (error instanceof AccessDenied) throw error;
      throw new AuthenticationUnavailable();
    }
    if (matches.length !== 1) throw new AccessDenied();
    const record = matches[0];
    if (record.status !== "Active" || !APPLICATION_ROLES.some(role => role === record.role)
      || typeof record.accessScope !== "string" || !record.accessScope.trim()
      || (record.personId != null && typeof record.personId !== "string")) throw new AccessDenied();
    return {
      uid: identity.uid, email: identity.email ?? null, emailVerified: identity.emailVerified,
      name: identity.displayName || identity.email || "Directory account",
      role: record.role as Account["role"], status: "Active", accessScope: record.accessScope,
      personId: typeof record.personId === "string" && record.personId ? record.personId : null,
      authenticationMethod: decoded.firebase?.sign_in_provider || "unknown",
    };
  };
}

export function createFirebaseAuthenticator(): Authenticate | null {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIRESTORE_EMULATOR_HOST
    || (process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== DEFAULT_GOOGLE_CLOUD_PROJECT)
    || (process.env.FIRESTORE_DATABASE_ID && process.env.FIRESTORE_DATABASE_ID !== DEFAULT_FIRESTORE_DATABASE)) return null;
  try {
    const app = getApps().find(candidate => candidate.name === "directory-auth")
      ?? initializeApp({ projectId: DEFAULT_GOOGLE_CLOUD_PROJECT, credential: applicationDefault() }, "directory-auth");
    const firestore = new Firestore({ projectId: DEFAULT_GOOGLE_CLOUD_PROJECT, databaseId: DEFAULT_FIRESTORE_DATABASE });
    return firebaseAuthenticator(getAuth(app), {
      async find(field, value) {
        const snapshot = await firestore.collection("users").where(field, "==", value)
          .select("firebaseUid", "email", "role", "status", "accessScope", "personId").limit(2).get();
        return snapshot.docs.map(document => document.data());
      },
    });
  } catch { return null; }
}

export function createAuthRouter(authenticate: Authenticate | null, bootstrap?: unknown) {
  const router = Router();
  router.use((_request, response, next) => { response.set("Cache-Control", "no-store"); next(); });
  router.use(rateLimit({ limit: 120, windowMs: 60_000, standardHeaders: "draft-8", legacyHeaders: false }));
  router.get(["/me", "/bootstrap"], async (request, response) => {
    const token = request.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token || token.length > 8192) return response.status(401).json({ error: { code: "invalid_token" } });
    if (!authenticate) return response.status(503).json({ error: { code: "auth_unavailable" } });
    try {
      const account = await authenticate(token);
      if (request.path === "/bootstrap" && !bootstrap) return response.status(503).json({ error: { code: "directory_unavailable" } });
      response.json(request.path === "/bootstrap" ? bootstrap : account);
    }
    catch (error) {
      const status = error instanceof AuthenticationUnavailable ? 503 : error instanceof AccessDenied ? 403 : 401;
      response.status(status).json({ error: { code: status === 503 ? "auth_unavailable" : status === 403 ? "access_denied" : "invalid_token" } });
    }
  });
  return router;
}