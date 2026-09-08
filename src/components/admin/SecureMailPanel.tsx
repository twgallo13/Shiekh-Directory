import { useEffect, useState } from "react";
import { LockKeyhole, RefreshCw, Save, Send, ShieldCheck } from "lucide-react";
import { getMailSettings, mailRequest, saveMailSettings, type MailSettings } from "../../lib/mailClient";
import { useDirectory } from "../../context/DirectoryContext";
import { useAuth } from "../../context/AuthContext";

export function SecureMailPanel() {
  const { sendDiagnosticTestEmail } = useDirectory();
  const { account, status } = useAuth();
  const identity = account?.email || account?.name;
  const canEdit = account?.role === "System Administrator";
  const [recipient, setRecipient] = useState("");
  const [settings, setSettings] = useState<MailSettings | null>(null);
  const [recipients, setRecipients] = useState("");
  const [passwordConfigured, setPasswordConfigured] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (status !== "authorized") return;
    void loadSettings();
  }, [status, account?.uid]);
  if (status !== "authorized" || !account || !["System Administrator", "Directory Data Steward"].includes(account.role)) return null;

  async function loadSettings() {
    setBusy(true);
    setMessage("");
    try {
      const result = await getMailSettings();
      setSettings(result.settings);
      setRecipients(result.settings.diagnosticRecipients.join(", "));
      setRecipient(current => current || result.settings.diagnosticRecipients[0] || "");
      setPasswordConfigured(result.passwordConfigured);
      setConfigured(result.passwordConfigured);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Mail settings could not be loaded."); }
    finally { setBusy(false); }
  }

  function update<K extends keyof MailSettings>(field: K, value: MailSettings[K]) {
    setSettings(current => current ? { ...current, [field]: value } : current);
  }

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
          onClick={() => run(async () => { setConfigured((await mailRequest("status")).configured === true); await loadSettings(); })}>
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      {settings && (
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault();
          if (!canEdit) return;
          void run(async () => {
            const diagnosticRecipients = recipients.split(",").map(value => value.trim()).filter(Boolean);
            const result = await saveMailSettings({ ...settings, diagnosticRecipients });
            setSettings(result.settings);
            setRecipients(result.settings.diagnosticRecipients.join(", "));
            setPasswordConfigured(result.passwordConfigured);
            setConfigured(result.passwordConfigured);
            setMessage("Mail settings saved.");
          });
        }}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-semibold text-neutral-700">SMTP host
              <input required disabled={!canEdit} value={settings.smtpHost} onChange={event => update("smtpHost", event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
            <label className="text-xs font-semibold text-neutral-700">Port
              <select disabled={!canEdit} value={settings.smtpPort} onChange={event => update("smtpPort", Number(event.target.value) as 465 | 587)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100">
                <option value={587}>587 - STARTTLS</option><option value={465}>465 - TLS</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-neutral-700">SMTP username
              <input required disabled={!canEdit} value={settings.smtpUser} onChange={event => update("smtpUser", event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
            <label className="text-xs font-semibold text-neutral-700">From name
              <input required disabled={!canEdit} value={settings.fromName} onChange={event => update("fromName", event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
            <label className="text-xs font-semibold text-neutral-700">From email
              <input type="email" required disabled={!canEdit} value={settings.fromEmail} onChange={event => update("fromEmail", event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
            <label className="text-xs font-semibold text-neutral-700">Reply-to email
              <input type="email" disabled={!canEdit} value={settings.replyToEmail} onChange={event => update("replyToEmail", event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
            <label className="text-xs font-semibold text-neutral-700">Steward alerts
              <input type="email" required disabled={!canEdit} value={settings.stewardAlertRecipient} onChange={event => update("stewardAlertRecipient", event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
            <label className="text-xs font-semibold text-neutral-700 md:col-span-2">Approved diagnostic recipients
              <input required disabled={!canEdit} value={recipients} onChange={event => setRecipients(event.target.value)} className="mt-1 block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 disabled:bg-neutral-100" />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-3">
            <span className="flex items-center gap-2 text-xs text-neutral-600"><LockKeyhole className="h-4 w-4" />Password: {passwordConfigured ? "Secret Manager connected" : "Unavailable"}</span>
            {canEdit && <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />Save settings</button>}
          </div>
        </form>
      )}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => { const result = await sendDiagnosticTestEmail(recipient); setMessage(result.message); });
      }}>
        <label className="min-w-0 flex-1 text-xs font-semibold text-neutral-700">
          Approved Recipient
          <input type="email" required value={recipient} onChange={(event) => setRecipient(event.target.value)}
            list="approved-mail-recipients"
            className="mt-1 block w-full min-w-0 rounded-md border border-neutral-300 bg-white px-3 py-2" />
          <datalist id="approved-mail-recipients">{settings?.diagnosticRecipients.map(value => <option key={value} value={value} />)}</datalist>
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