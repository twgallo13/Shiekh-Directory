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

export async function loadAccount(user: SessionUser, request: typeof fetch = fetch): Promise<Account> {
  const response = await request("/api/auth/me", { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(response.status === 403 ? "No unique active directory access record is available. Contact your administrator." : "Your session could not be authorized. Sign in again or contact your administrator.");
  const account = await response.json() as Account;
  if (account.uid !== user.uid || account.status !== "Active" || !["System Administrator", "Directory Data Steward", "Editor", "Viewer"].includes(account.role) || typeof account.accessScope !== "string" || !account.accessScope.trim()) throw new Error("Directory access is unavailable.");
  return account;
}

export function createSessionController(publish: (state: SessionState) => void, resolve: (user: SessionUser) => Promise<Account> = loadAccount) {
  let generation = 0;
  let stopped = false;
  return {
    async restore(user: SessionUser | null, background = false) {
      const current = ++generation;
      if (!background || !user) publish({ ...INITIAL_SESSION, user, status: user ? "loading" : "signed-out" });
      if (!user) return;
      try {
        const account = await resolve(user);
        if (!stopped && current === generation) publish({ status: "authorized", user, account, error: "" });
      } catch (error) {
        if (!stopped && current === generation) publish({ status: "denied", user, account: null, error: error instanceof Error ? error.message : "Directory access is unavailable." });
      }
    },
    clear() { generation++; publish({ ...INITIAL_SESSION, status: "signed-out" }); },
    stop() { stopped = true; generation++; },
  };
}

export function clearProtectedStorage(storage: Storage) {
  for (const key of Object.keys(storage)) if (key.startsWith("shiekh_") || key === "emailForSignIn") storage.removeItem(key);
}

export function serializeLocalDraft(value: unknown) {
  return JSON.stringify(value, (key, field) => ["role", "accessScope", "customClaims", "idToken", "refreshToken", "invitationToken"].includes(key) ? undefined : field);
}