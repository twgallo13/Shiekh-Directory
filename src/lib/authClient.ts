import { getApps, initializeApp } from "firebase/app";
import { browserPopupRedirectResolver, browserSessionPersistence, GoogleAuthProvider, initializeAuth, isSignInWithEmailLink, sendPasswordResetEmail, sendSignInLinkToEmail, signInWithEmailAndPassword, signInWithEmailLink, signInWithPopup, signOut, type Auth } from "firebase/auth";

export const FIREBASE_PROJECT = "gen-lang-client-0801664258";
export type AuthEnvironment = Record<string, string | undefined>;
const environment = ((import.meta as ImportMeta & { env?: AuthEnvironment }).env ?? {});
let sharedAuth: Auth | null = null;

export function firebaseConfiguration(env: AuthEnvironment) {
  if (env.VITE_FIREBASE_PROJECT_ID !== FIREBASE_PROJECT || !env.VITE_FIREBASE_API_KEY || !env.VITE_FIREBASE_APP_ID
    || env.VITE_FIREBASE_AUTH_DOMAIN !== `${FIREBASE_PROJECT}.firebaseapp.com`) throw new Error("Firebase sign-in is not configured for this directory.");
  return { apiKey: env.VITE_FIREBASE_API_KEY, appId: env.VITE_FIREBASE_APP_ID, projectId: FIREBASE_PROJECT, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN };
}

export function getSharedAuth(): Auth {
  if (sharedAuth) return sharedAuth;
  const config = firebaseConfiguration(environment);
  const app = getApps().find(candidate => candidate.name === "directory-browser") ?? initializeApp(config, "directory-browser");
  sharedAuth = initializeAuth(app, { persistence: browserSessionPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  return sharedAuth;
}

export function safeContinueUrl(value: string, origin: string, allowlist: string[]): string {
  const url = new URL(value, origin);
  if (!allowlist.includes(origin) || url.origin !== origin || url.username || url.password || url.search || url.hash
    || !["/auth/email-link", "/sign-in"].includes(url.pathname)
    || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("This sign-in redirect is not approved.");
  return url.href;
}

export function validateEmailLink(value: string, origin: string, allowlist: string[], apiKey: string) {
  const url = new URL(value);
  safeContinueUrl(`${url.origin}${url.pathname}`, origin, allowlist);
  if (url.pathname !== "/auth/email-link" || url.hash || url.username || url.password
    || url.searchParams.get("mode") !== "signIn" || !url.searchParams.get("oobCode") || url.searchParams.get("apiKey") !== apiKey
    || [...url.searchParams.keys()].some(key => !["mode", "oobCode", "apiKey", "continueUrl", "lang"].includes(key))
    || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) throw new Error("This email sign-in link is invalid.");
  const continuation = url.searchParams.get("continueUrl");
  if (continuation) safeContinueUrl(continuation, origin, allowlist);
  return url.href;
}

const firebaseActions = { signInWithPopup, signInWithEmailAndPassword, sendPasswordResetEmail, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut };
export function createAuthActions(auth: Auth, origin: string, allowlist: string[], sdk = firebaseActions) {
  return {
    google: () => sdk.signInWithPopup(auth, new GoogleAuthProvider()),
    password: (email: string, password: string) => sdk.signInWithEmailAndPassword(auth, email.trim(), password),
    reset: async (email: string) => {
      try { await sdk.sendPasswordResetEmail(auth, email.trim(), { url: safeContinueUrl("/sign-in", origin, allowlist) }); }
      catch (error) { if ((error as { code?: string }).code !== "auth/user-not-found") throw error; }
    },
    sendLink: (email: string) => sdk.sendSignInLinkToEmail(auth, email.trim(), { url: safeContinueUrl("/auth/email-link", origin, allowlist), handleCodeInApp: true }),
    completeLink: (email: string, link: string) => {
      const safe = validateEmailLink(link, origin, allowlist, auth.app.options.apiKey || "");
      if (!sdk.isSignInWithEmailLink(auth, safe)) throw new Error("This email sign-in link is invalid or expired.");
      return sdk.signInWithEmailLink(auth, email.trim(), safe);
    },
    signOut: () => sdk.signOut(auth),
  };
}
export function authActions() {
  return createAuthActions(getSharedAuth(), window.location.origin, (environment.VITE_AUTH_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()));
}
export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code;
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email"].includes(code || "")) return "Unable to sign in. Check your email and password.";
  if (code === "auth/operation-not-allowed") return "This sign-in method is not enabled. Contact your administrator.";
  if (code === "auth/unauthorized-domain") return "This browser domain is not approved for sign-in.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  if (["auth/expired-action-code", "auth/invalid-action-code"].includes(code || "")) return "This link is invalid or expired. Request a new sign-in link.";
  if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(code || "")) return "Google sign-in was cancelled.";
  if (code === "auth/popup-blocked") return "Allow the sign-in popup, then try again.";
  if (code === "auth/network-request-failed") return "Sign-in is unavailable. Check your connection and try again.";
  return "Unable to complete authentication. Contact your administrator or try again.";
}