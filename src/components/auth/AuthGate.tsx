import React from "react";
import { LogOut, RefreshCw } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { SignInView } from "./SignInView";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, account, error, emailLink, signOut, retry } = useAuth();
  if (status === "loading") return <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 text-neutral-700" role="status">Restoring secure session...</main>;
  if (emailLink || status === "signed-out") return <SignInView />;
  if (status !== "authorized" || !account) return <main className="min-h-screen bg-neutral-50 p-6 text-neutral-900"><section className="mx-auto max-w-lg space-y-4 py-12">
    <h1 className="text-xl font-semibold">Directory access unavailable</h1><p role="alert" className="text-sm">{error || "Contact your administrator to confirm your directory access."}</p>
    <div className="flex flex-wrap gap-3"><button type="button" onClick={retry} className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" />Retry access</button><button type="button" onClick={() => void signOut()} className="flex items-center gap-2 rounded-md border border-neutral-300 px-3 py-2 text-sm"><LogOut className="h-4 w-4" />Sign out</button></div>
  </section></main>;
  return <>{children}</>;
}