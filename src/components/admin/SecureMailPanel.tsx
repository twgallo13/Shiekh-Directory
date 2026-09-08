import { useState } from "react";
import { RefreshCw, Send, ShieldCheck } from "lucide-react";
import { mailRequest } from "../../lib/mailClient";
import { useDirectory } from "../../context/DirectoryContext";
import { useAuth } from "../../context/AuthContext";

export function SecureMailPanel() {
  const { sendDiagnosticTestEmail } = useDirectory();
  const { account, status } = useAuth();
  const identity = account?.email || account?.name;
  const [recipient, setRecipient] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (status !== "authorized" || !account || !["System Administrator", "Directory Data Steward"].includes(account.role)) return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Mail request failed."); }
    finally { setBusy(false); }
  }

  return (
    <section className="space-y-4 border-b border-neutral-200 pb-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-neutral-900"><ShieldCheck className="h-4 w-4" />Secure Mail</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-all text-xs text-neutral-600">{identity || "Not signed in"}</span>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span>Mail configuration: {configured === null ? "Not checked" : configured ? "Configured" : "Unavailable"}</span>
        <button type="button" title="Check mail configuration" aria-label="Check mail configuration" disabled={!identity || busy}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-50"
          onClick={() => run(async () => { setConfigured((await mailRequest("status")).configured === true); })}>
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => { const result = await sendDiagnosticTestEmail(recipient); setMessage(result.message); });
      }}>
        <label className="min-w-0 flex-1 text-xs font-semibold text-neutral-700">
          Approved Recipient
          <input type="email" required value={recipient} onChange={(event) => setRecipient(event.target.value)}
            className="mt-1 block w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2" />
        </label>
        <button type="submit" disabled={!identity || busy || configured === false}
          className="flex items-center gap-2 rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
          <Send className="h-4 w-4" />{busy ? "Working..." : "Send Diagnostic"}
        </button>
      </form>
      {message && <p role="status" className="break-words text-xs text-neutral-700">{message}</p>}
    </section>
  );
}