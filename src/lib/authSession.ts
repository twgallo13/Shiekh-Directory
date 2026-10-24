export interface Account {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  role: "System Administrator" | "Directory Data Steward" | "Editor" | "Viewer";
  status: "Active";
  accessScope: string;
  personId: string | null;
  authenticationMethod: string;
}
export interface SessionUser { uid: string; getIdToken(forceRefresh?: boolean): Promise<string> }
export interface SessionState { status: "loading" | "signed-out" | "authorized" | "denied"; user: SessionUser | null; account: Account | null; error: string }
export const INITIAL_SESSION: SessionState = { status: "loading", user: null, account: null, error: "" };

export const SESSION_SIGNOUT_SIGNAL = 'shiekh_session_signout_v1';
/** Synchronous authority boundary, independent of React render scheduling. Not persisted.
 * Same-authority background refreshes do not invalidate an in-flight reviewed command.
 */
export function createSessionBoundary() {
  let state: SessionState = INITIAL_SESSION, generation = 0;
  const listeners = new Set<() => void>();
  const authority = (s: SessionState) => JSON.stringify([s.status, s.user?.uid ?? null, s.account?.uid ?? null, s.account?.role ?? null, s.account?.status ?? null, s.account?.accessScope ?? null, s.account?.personId ?? null]);
  const invalidate = () => { generation++; for (const listener of [...listeners]) { try { listener(); } catch { /* One disposed consumer cannot prevent other fences. */ } } };
  return {
    snapshot: () => state,
    generation: () => generation,
    update(next: SessionState) { const changed = authority(state) !== authority(next); state = next; if (changed) invalidate(); },
    invalidate,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

export async function loadAccount(user: SessionUser, request: typeof fetch = fetch): Promise<Account> {
  const response = await request("/api/auth/me", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(response.status === 403 ? "No unique active directory access record is available. Contact your administrator." : "Your session could not be authorized. Sign in again or contact your administrator.");
  const account = await response.json() as Account;
  if (account.uid !== user.uid || account.status !== "Active" || !["System Administrator", "Directory Data Steward", "Editor", "Viewer"].includes(account.role) || typeof account.accessScope !== "string" || !account.accessScope.trim()) throw new Error("Directory access is unavailable.");
  return account;
}

export function createSessionController(publish: (state: SessionState) => void, resolve: (user: SessionUser) => Promise<Account> = loadAccount, boundary = createSessionBoundary()) {
  let generation = 0;
  let stopped = false;
  const emit = (state: SessionState) => { boundary.update(state); publish(state); };
  return {
    boundary,
    async restore(user: SessionUser | null, background = false) {
      if (stopped) return;
      const current = ++generation;
      const previous = boundary.snapshot();
      if (!background || !user || previous.status === 'authorized' && previous.user?.uid !== user.uid) emit({ ...INITIAL_SESSION, user, status: user ? "loading" : "signed-out" });
      if (!user) return;
      try {
        const account = await resolve(user);
        if (!stopped && current === generation) emit({ status: "authorized", user, account, error: "" });
      } catch (error) {
        if (!stopped && current === generation) emit({ status: "denied", user, account: null, error: error instanceof Error ? error.message : "Directory access is unavailable." });
      }
    },
    clear() { if (stopped) return; generation++; boundary.invalidate(); emit({ ...INITIAL_SESSION, status: "signed-out" }); },
    deny(error: string) { if (stopped) return; generation++; boundary.invalidate(); emit({ ...INITIAL_SESSION, status: 'denied', error }); },
    stop() { stopped = true; generation++; boundary.invalidate(); },
  };
}

export function clearProtectedStorage(storage: Storage) {
  for (const key of Object.keys(storage)) if (key.startsWith("shiekh_") || key === "emailForSignIn") storage.removeItem(key);
}

export function serializeLocalDraft(value: unknown) {
  return JSON.stringify(value, (key, field) => ["role", "accessScope", "customClaims", "idToken", "refreshToken", "invitationToken"].includes(key) ? undefined : field);
}
