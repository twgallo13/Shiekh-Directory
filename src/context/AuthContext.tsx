import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { onIdTokenChanged } from "firebase/auth";
import { authActions, getSharedAuth } from "../lib/authClient";
import { clearProtectedStorage, createSessionController, INITIAL_SESSION, type SessionState } from "../lib/authSession";

export interface AuthContextValue extends SessionState { signOut(): Promise<void>; retry(): void; emailLink: string | null; clearEmailLink(): void }
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
  const signingOut = useRef(false);
  useEffect(() => {
    const session = createSessionController(setState);
    controller.current = session;
    try {
      const auth = getSharedAuth();
      const unsubscribe = onIdTokenChanged(auth, user => { if (!signingOut.current) void session.restore(user); }, () => setState({ ...INITIAL_SESSION, status: "denied", error: "Firebase session restoration failed." }));
      const refresh = () => { if (!signingOut.current && document.visibilityState === "visible") void session.restore(auth.currentUser, true); };
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refresh);
      const timer = window.setInterval(refresh, 60_000);
      return () => { session.stop(); unsubscribe(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
    } catch {
      setState({ ...INITIAL_SESSION, status: "denied", error: "Firebase sign-in is not configured for this directory." });
      return () => session.stop();
    }
  }, []);
  const clearEmailLink = () => { capturedLink = null; setEmailLink(null); };
  const signOut = async () => {
    signingOut.current = true;
    controller.current?.clear();
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
      setState({ ...INITIAL_SESSION, status: "denied", error: "Sign-out could not finish. Retry sign-out before leaving this shared device." });
    }
  };
  return <AuthContext.Provider value={{ ...state, emailLink, clearEmailLink, signOut, retry: () => {
    if (signingOut.current) return;
    try { void controller.current?.restore(getSharedAuth().currentUser); }
    catch { setState({ ...INITIAL_SESSION, status: "denied", error: "Firebase sign-in is not configured for this directory." }); }
  } }}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("AuthProvider is required.");
  return context;
}