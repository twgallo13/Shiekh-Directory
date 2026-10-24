import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { authActions, getSharedAuth } from "../lib/authClient";
import { clearProtectedStorage, createSessionBoundary, createSessionController, INITIAL_SESSION, SESSION_SIGNOUT_SIGNAL, type SessionState } from "../lib/authSession";

export interface AuthContextValue extends SessionState { signOut(): Promise<void>; retry(): void; emailLink: string | null; clearEmailLink(): void;
  currentSession(): SessionState; sessionGeneration(): number; onSessionBoundary(listener: () => void): () => void;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
let capturedLink: string | null | undefined;
function captureEmailLink() {
  if (capturedLink !== undefined) return capturedLink;
  capturedLink = window.location.pathname === "/auth/email-link" && window.location.search ? window.location.href : null;
  if (capturedLink) window.history.replaceState(window.history.state, "", "/auth/email-link");
  return capturedLink;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(INITIAL_SESSION);
  const [emailLink, setEmailLink] = useState(captureEmailLink);
  const controller = useRef<ReturnType<typeof createSessionController> | null>(null);
  const boundary = useRef<ReturnType<typeof createSessionBoundary> | null>(null);
  if (!boundary.current) boundary.current = createSessionBoundary();
  const signingOut = useRef(false);
  useEffect(() => {
    const session = createSessionController(setState, undefined, boundary.current!);
    controller.current = session;
    try {
      const auth = getSharedAuth();
      const unsubscribe = onIdTokenChanged(auth, user => { if (!signingOut.current) void session.restore(user); }, () => session.deny("Firebase session restoration failed."));
      const otherTabSignOut = (event: StorageEvent) => {
        if (event.key !== SESSION_SIGNOUT_SIGNAL || !event.newValue || event.storageArea !== localStorage) return;
        session.clear();
        try { clearProtectedStorage(sessionStorage); } catch { /* The session is fenced even if browser storage is unavailable. */ }
      };
      window.addEventListener('storage', otherTabSignOut);
      const refresh = () => { if (!signingOut.current && document.visibilityState === "visible") void session.restore(auth.currentUser, true); };
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      const timer = window.setInterval(refresh, 60_000);
      return () => { session.stop(); unsubscribe(); window.clearInterval(timer); window.removeEventListener('storage', otherTabSignOut); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
    } catch {
      session.deny("Firebase sign-in is not configured for this directory.");
      return () => session.stop();
    }
  }, []);
  const clearEmailLink = () => { capturedLink = null; setEmailLink(null); };
  const signOut = async () => {
    signingOut.current = true;
    controller.current?.clear();
    try { localStorage.setItem(SESSION_SIGNOUT_SIGNAL, crypto.randomUUID()); } catch { /* Firebase sign-out still runs when local broadcast is unavailable. */ }
    clearEmailLink();
    clearProtectedStorage(localStorage);
    clearProtectedStorage(sessionStorage);
    try {
      await authActions().signOut();
      clearProtectedStorage(localStorage);
      clearProtectedStorage(sessionStorage);
      window.history.replaceState(null, "", "/sign-in");
      window.location.replace("/sign-in");
    } catch {
      controller.current?.deny("Sign-out could not finish. Retry sign-out before leaving this shared device.");
    }
  };
  return <AuthContext.Provider value={{ ...state, emailLink, clearEmailLink, signOut,
    currentSession: () => boundary.current!.snapshot(),
    sessionGeneration: () => boundary.current!.generation(),
    onSessionBoundary: listener => boundary.current!.subscribe(listener),
    retry: () => {
    if (signingOut.current) return;
    try { void controller.current?.restore(getSharedAuth().currentUser); }
    catch { controller.current?.deny("Firebase sign-in is not configured for this directory."); }
  } }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required.");
  return context;
}
