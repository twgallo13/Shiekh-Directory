import React, { useState } from "react";
import { KeyRound, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useDirectory } from "../../context/DirectoryContext";
import { useTheme } from "../../context/ThemeContext";
import { authActions, authErrorMessage } from "../../lib/authClient";
import type { Account } from "../../lib/authSession";

export function AccountDetails({ account, person }: { account: Account; person?: { id: string; fullName: string } }) {
  return <dl className="grid gap-4 text-sm sm:grid-cols-2">
    {[["Display name", account.name], ["Email", account.email || "Not available"], ["Email verification", account.emailVerified ? "Verified" : "Not verified"], ["Role", account.role], ["Access scope", account.accessScope], ["Status", account.status], ["Authentication method", account.authenticationMethod === "google.com" ? "Google" : account.authenticationMethod === "password" ? "Email (password or email link)" : account.authenticationMethod]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-neutral-500">{label}</dt><dd className="mt-1 break-words font-medium">{value}</dd></div>)}
    <div className="min-w-0"><dt className="text-neutral-500">People Directory record</dt><dd className="mt-1 break-words">{person ? <Link className="text-red-700 underline" to={`/people/${encodeURIComponent(person.id)}`}>{person.fullName}</Link> : account.personId ? `Linked record unavailable in this local directory (${account.personId})` : "Not linked"}</dd></div>
  </dl>;
}

export function AccountView() {
  const { account, signOut } = useAuth();
  const { people } = useDirectory();
  const { theme, setTheme } = useTheme();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  return <section className="max-w-3xl space-y-6 text-neutral-900">
    <h1 className="text-xl font-bold">My Profile / Account</h1>
    <AccountDetails account={account} person={people.find(person => person.id === account.personId)} />
    <label className="block border-t border-neutral-200 pt-5 text-sm font-medium">Appearance<select value={theme} onChange={event => setTheme(event.target.value as typeof theme)} className="mt-2 block rounded-md border border-neutral-300 bg-white px-3 py-2"><option value="light">Light</option><option value="dark">Dark</option><option value="system">Use system setting</option></select></label>
    {account.authenticationMethod === "password" && <div className="space-y-3 border-t border-neutral-200 pt-5 text-sm"><p>Email-link sign-in does not require a password. To create a password for the first time or change an existing one, request a separate secure password email.</p><button type="button" disabled={busy || !account.email} className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 disabled:opacity-50" onClick={async () => { setBusy(true); try { await authActions().reset(account.email!); setMessage("If this account is eligible, a password setup email will arrive shortly. Check Spam or company quarantine if needed."); } catch (error) { setMessage(authErrorMessage(error)); } finally { setBusy(false); } }}><KeyRound className="h-4 w-4" />Set or change password</button></div>}
    {message && <p role="status" className="text-sm">{message}</p>}
    <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white"><LogOut className="h-4 w-4" />Sign out</button>
  </section>;
}