import React, { useState } from 'react';
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  Paperclip, 
  FileText, 
  Users, 
  X, 
  Printer, 
  Building,
  Check
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';

interface EmailPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailPdfModal: React.FC<EmailPdfModalProps> = ({ isOpen, onClose }) => {
  const { sendDirectoryPdfEmail, smtpConfig, people, locations } = useDirectory();

  const [recipientGroup, setRecipientGroup] = useState<string>('district_managers');
  const [customEmails, setCustomEmails] = useState('');
  const [subject, setSubject] = useState(`[Shiekh Shoes] Official 1-Sheet Store Directory — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`);
  const [memoNote, setMemoNote] = useState('Attached is the latest authoritative Shiekh Shoes Retail Store Directory & Leadership Roster. Please print and place in your store operational binder.');
  const [paperSize, setPaperSize] = useState('Letter_Landscape_11x8.5');
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen) return null;

  const districtManagerEmails = people
    .filter(p => p.jobTitle.includes('District Manager'))
    .map(p => p.email || `${p.name.toLowerCase().replace(/\s+/g, '.')}@shiekhshoes.com`);

  const executiveEmails = ['theo@shiekhshoes.org', 'm.vargas@shiekhshoes.com', 'leadership@shiekhshoes.com'];
  
  const allStoreEmails = locations.map(l => `store${l.storeNumber}@shiekhshoes.com`);

  const getActiveRecipients = (): string[] => {
    switch (recipientGroup) {
      case 'district_managers':
        return districtManagerEmails;
      case 'executives':
        return executiveEmails;
      case 'all_stores':
        return allStoreEmails.slice(0, 8); // Top sample stores or full list
      case 'custom':
        return customEmails
          .split(/[\n,;]+/)
          .map(e => e.trim())
          .filter(e => e.length > 0 && e.includes('@'));
      default:
        return [smtpConfig.directoryStewardEmail];
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = getActiveRecipients();
    if (recipients.length === 0) {
      alert('Please specify at least one valid recipient email address.');
      return;
    }

    setIsSending(true);
    setTimeout(() => {
      sendDirectoryPdfEmail(recipients, subject, memoNote, paperSize);
      setIsSending(false);
      setSentSuccess(true);
      setTimeout(() => {
        setSentSuccess(false);
        onClose();
      }, 1200);
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                Email Official 1-Sheet Directory PDF
              </h3>
              <p className="text-xs text-neutral-500">
                Dispatches high-resolution print PDF via corporate SMTP relay
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">✕</button>
        </div>

        {sentSuccess ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 mx-auto flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              PDF Distributed Successfully!
            </h4>
            <p className="text-xs text-neutral-500">
              Dispatched to {getActiveRecipients().length} recipient(s). Recorded in Email Outbox Log.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-5 overflow-y-auto space-y-4 text-xs">
            {/* Recipient Preset */}
            <div>
              <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1.5">
                Target Recipient Group (Blueprint Sec 10A)
              </label>
              <div className="space-y-1.5">
                {[
                  { id: 'district_managers', label: 'All District Managers (Rudy Calderon, David Castro, Karlo Llovido)', count: districtManagerEmails.length },
                  { id: 'executives', label: 'Corporate Executive Leadership & Directory Stewards', count: executiveEmails.length },
                  { id: 'all_stores', label: 'All Store Managers & General Retail Distribution', count: locations.length },
                  { id: 'custom', label: 'Custom Recipient Email Addresses', count: null },
                ].map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer ${
                      recipientGroup === opt.id
                        ? 'border-red-600 bg-red-50/40 dark:bg-red-950/30 text-red-900 dark:text-red-200 font-bold'
                        : 'border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="recipientGroup"
                        checked={recipientGroup === opt.id}
                        onChange={() => setRecipientGroup(opt.id)}
                        className="text-red-600"
                      />
                      <span>{opt.label}</span>
                    </div>
                    {opt.count !== null && (
                      <span className="text-[10px] px-1.5 py-0.2 bg-neutral-200 dark:bg-neutral-700 rounded font-mono">
                        {opt.count} emails
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>

            {recipientGroup === 'custom' && (
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Enter Custom Recipient Emails (Comma or newline separated)
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="r.calderon@shiekhshoes.com, store115@shiekhshoes.com"
                  value={customEmails}
                  onChange={e => setCustomEmails(e.target.value)}
                  className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border rounded font-mono text-xs"
                />
              </div>
            )}

            {/* Subject Line */}
            <div>
              <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                Email Subject
              </label>
              <input
                type="text"
                required
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border rounded text-xs"
              />
            </div>

            {/* Memo Note */}
            <div>
              <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                Message Body / Operational Memo
              </label>
              <textarea
                rows={2}
                value={memoNote}
                onChange={e => setMemoNote(e.target.value)}
                className="w-full p-2 bg-neutral-50 dark:bg-neutral-800 border rounded text-xs"
              />
            </div>

            {/* Attachment Preview Box */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-red-100 dark:bg-red-950 text-red-600 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                    <span>Shiekh_Store_Directory_1Sheet.pdf</span>
                    <span className="text-[10px] text-neutral-400 font-mono">(Landscape)</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Total {locations.length} Authoritative Store Records Included
                  </div>
                </div>
              </div>
              <Paperclip className="w-4 h-4 text-neutral-400" />
            </div>

            {/* Footer Buttons */}
            <div className="pt-2 flex items-center justify-between border-t">
              <span className="text-[11px] text-neutral-400">
                Via SMTP: {smtpConfig.host}:{smtpConfig.port}
              </span>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSending ? 'Dispatching...' : 'Dispatch Email Broadcast'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
