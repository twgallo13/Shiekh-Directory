import React, { useState } from "react";
import { KeyRound, LogIn, Mail, Store } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authActions, authErrorMessage } from "../../lib/authClient";

export function SignInView() {
  const { emailLink, clearEmailLink } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"password" | "reset" | "link">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setMessage(""); setError("");
    try { await action(); }
    catch (failure) { setError(authErrorMessage(failure)); }
    finally { setBusy(false); setPassword(""); }
  }
  const complete = Boolean(emailLink);
  return <main className="min-h-screen bg-neutral-50 px-5 py-12 text-neutral-900">
    <div className="mx-auto w-full max-w-sm space-y-6">
      <Store className="h-9 w-9 text-red-600" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Shiekh Store Directory</h1>
      <h2 className="text-lg font-semibold">{complete ? "Complete email sign-in" : mode === "reset" ? "Reset password" : "Sign in"}</h2>
      {!complete && <button type="button" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-3 text-sm disabled:opacity-50" onClick={() => void run(() => authActions().google())}><LogIn className="h-4 w-4" />Continue with Google</button>}
      {!complete && <div className="flex border-b border-neutral-300" role="tablist" aria-label="Email sign-in method">
        {([['password', 'Password'], ['link', 'Email link (no password)']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} disabled={busy} onClick={() => { setMode(value); setError(""); setMessage(""); }} className={`flex-1 border-b-2 px-3 py-2 text-sm ${mode === value ? 'border-red-600 font-semibold' : 'border-transparent'}`}>{label}</button>)}
      </div>}
      {!complete && mode === "link" && <p className="text-sm text-neutral-600">Use this after an administrator grants you access. The email signs you in without a password and may appear in Spam or company quarantine.</p>}
      {complete && <p className="text-sm text-neutral-600">Enter the exact email address that received this secure link. No password is required.</p>}
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault();
        void run(async () => {
          const actions = authActions();
          if (emailLink) { await actions.completeLink(email, emailLink); clearEmailLink(); navigate("/", { replace: true }); }
          else if (mode === "password") await actions.password(email, password);
          else if (mode === "reset") { await actions.reset(email); setMessage("If this account is eligible, a password-reset email will arrive shortly."); }
          else { await actions.sendLink(email); setMessage("Firebase accepted the passwordless email request; this is not inbox-delivery confirmation. Check Spam or company quarantine, then use the same email address to complete sign-in."); }
        });
      }}>
        <label className="block text-sm font-medium">Email<input type="email" name="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2" /></label>
        {!complete && mode === "password" && <label className="block text-sm font-medium">Password<input type="password" name="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2" /></label>}
        <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{mode === "password" ? <KeyRound className="h-4 w-4" /> : <Mail className="h-4 w-4" />}{busy ? "Working..." : complete ? "Complete sign-in" : mode === "reset" ? "Send password reset" : mode === "link" ? "Send sign-in link" : "Sign in with password"}</button>
      </form>
      {!complete && <button type="button" disabled={busy} className="text-sm text-red-700 underline" onClick={() => { setMode(mode === "reset" ? "password" : "reset"); setMessage(""); setError(""); }}>{mode === "reset" ? "Back to sign-in" : "Forgot password?"}</button>}
      {complete && <button type="button" disabled={busy} className="text-sm underline" onClick={() => { clearEmailLink(); navigate("/sign-in", { replace: true }); }}>Cancel email sign-in</button>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-neutral-700">{message}</p>}
    </div>
  </main>;
}