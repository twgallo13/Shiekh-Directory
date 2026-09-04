import React, { useState } from 'react';
import { 
  Mail, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Server, 
  Clock, 
  Filter, 
  FileText,
  Paperclip,
  Bell,
  Sliders,
  Sparkles,
  Zap,
  CheckSquare,
  Square,
  Building,
  UserMinus,
  AlertTriangle
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { SmtpConfig, EmailLogEntry } from '../../types';

export const SmtpConfigPanel: React.FC = () => {
  const { smtpConfig, updateSmtpConfig, sendTestEmail, emailLogs } = useDirectory();
  
  const [activeTab, setActiveTab] = useState<'server' | 'rules' | 'logs'>('server');
  const [formData, setFormData] = useState<SmtpConfig>(smtpConfig);
  const [showPassword, setShowPassword] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('theo@shiekhshoes.org');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<EmailLogEntry | null>(null);

  React.useEffect(() => {
    if (smtpConfig) {
      setFormData(smtpConfig);
    }
  }, [smtpConfig]);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    updateSmtpConfig(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleToggleRule = (key: keyof SmtpConfig) => {
    const updated = {
      ...formData,
      [key]: !formData[key]
    };
    setFormData(updated);
    updateSmtpConfig(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailRecipient) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await sendTestEmail(testEmailRecipient);
      setIsTesting(false);
      if (res.success) {
        setTestResult({
          success: true,
          message: res.log?.details || `Successfully connected to ${formData.host}:${formData.port} and dispatched test message to ${testEmailRecipient}. Handshake acknowledged via TLS.`,
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || res.log?.details || `SMTP connection failed: Unable to authenticate with ${formData.host}:${formData.port}. Check credentials or server environment variables.`,
        });
      }
    } catch (err: any) {
      setIsTesting(false);
      setTestResult({
        success: false,
        message: err.message || `SMTP Error: Failed to reach backend email relay service.`,
      });
    }
  };

  const filteredLogs = emailLogs.filter(log => {
    if (logFilter === 'all') return true;
    return log.emailType === logFilter;
  });

  return (
    <div className="space-y-6">
      {/* Header Overview */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Mail className="w-5 h-5 text-red-600" />
              <span>SMTP & Transactional Notification Service (Blueprint Sec 10A)</span>
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Configure corporate SMTP relay, granular event notification rules, and monitor transactional audit dispatches.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>SMTP Relay Active</span>
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-800">
          <button
            onClick={() => setActiveTab('server')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeTab === 'server'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Server & Relay Parameters</span>
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeTab === 'rules'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Notification Rules Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
              activeTab === 'logs'
                ? 'bg-red-600 text-white shadow-xs'
                : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Outbox Logs ({emailLogs.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: Server & Relay Parameters */}
      {activeTab === 'server' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            <form onSubmit={handleSave} className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
              <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                <Server className="w-4 h-4 text-neutral-500" />
                <span>Relay Server Parameters</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    SMTP Host Server
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.host || ''}
                    onChange={e => setFormData({ ...formData, host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.port ?? 587}
                    onChange={e => setFormData({ ...formData, port: parseInt(e.target.value) || 587 })}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    SMTP Username / Account
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username || ''}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    placeholder="notifications@shiekhshoes.com"
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      App Password / Secret
                    </label>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
                      Stored in Server Env
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password || ''}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      placeholder="•••••••••••••••• (Set via SMTP_PASSWORD)"
                      className="w-full pl-3 pr-9 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-2 text-neutral-400 hover:text-neutral-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    From Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.fromName || ''}
                    onChange={e => setFormData({ ...formData, fromName: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    From Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.fromEmail || ''}
                    onChange={e => setFormData({ ...formData, fromEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Reply-To Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.replyToEmail || ''}
                    onChange={e => setFormData({ ...formData, replyToEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                    Directory Steward Alert Recipient
                  </label>
                  <input
                    type="email"
                    required
                    value={formData.directoryStewardEmail || ''}
                    onChange={e => setFormData({ ...formData, directoryStewardEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 font-bold"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 dark:text-neutral-300">
                  <input
                    type="checkbox"
                    checked={Boolean(formData.secureTls)}
                    onChange={e => setFormData({ ...formData, secureTls: e.target.checked })}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  <span>Enforce strict STARTTLS encryption handshake</span>
                </label>
              </div>

              <div className="pt-3 flex items-center justify-between">
                {saveSuccess ? (
                  <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>SMTP parameters saved successfully!</span>
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">Settings take effect immediately</span>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors"
                >
                  Save SMTP Configuration
                </button>
              </div>
            </form>

            {/* Diagnostics: Send Test Email */}
            <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
              <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                <Send className="w-4 h-4 text-neutral-500" />
                <span>Live SMTP Connection Diagnostic</span>
              </h3>
              <p className="text-xs text-neutral-500">
                Send a test packet to verify authentication, TLS handshake, and delivery throughput.
              </p>

              <form onSubmit={handleSendTest} className="flex gap-2">
                <input
                  type="email"
                  required
                  value={testEmailRecipient}
                  onChange={e => setTestEmailRecipient(e.target.value)}
                  placeholder="recipient@shiekhshoes.com"
                  className="flex-1 px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100"
                />
                <button
                  type="submit"
                  disabled={isTesting}
                  className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                >
                  {isTesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>{isTesting ? 'Testing Handshake...' : 'Send Test Email'}</span>
                </button>
              </form>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    testResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                      : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                  }`}
                >
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  )}
                  <span className="font-mono">{testResult.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Logs Peek */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-neutral-500" />
                  <span>Recent Dispatches</span>
                </h3>
                <button
                  onClick={() => setActiveTab('logs')}
                  className="text-xs text-red-600 dark:text-red-400 font-bold hover:underline"
                >
                  View All
                </button>
              </div>

              <div className="space-y-2">
                {emailLogs.slice(0, 4).map(log => (
                  <div
                    key={log.id}
                    onClick={() => { setSelectedLog(log); setActiveTab('logs'); }}
                    className="p-2.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700/80 cursor-pointer hover:bg-neutral-100 text-xs space-y-1"
                  >
                    <div className="flex justify-between font-bold text-neutral-900 dark:text-neutral-100 truncate">
                      <span>{log.subject}</span>
                      <span className="text-[10px] text-emerald-600">{log.status}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-neutral-400 font-mono">
                      <span>{log.recipients[0]}</span>
                      <span>{new Date(log.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Notification Rules Engine (Blueprint Sec 10A) */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-red-600" />
                  <span>Granular Transactional Notification Rules (Blueprint Sec 10A)</span>
                </h3>
                <p className="text-xs text-neutral-500 mt-1">
                  Global switches controlling corporate email dispatches triggered by directory and administrative workflows.
                </p>
              </div>
              {saveSuccess && (
                <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Rules Updated</span>
                </span>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Rule 1: New Update Requests */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <Mail className="w-4 h-4 text-blue-600" />
                      <span>New Update Request Submissions</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Emails the Directory Data Steward immediately when a field user submits a store or personnel change.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRule('notifyOnNewRequest')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.notifyOnNewRequest !== false
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {formData.notifyOnNewRequest !== false ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Rule 2: Decision Broadcasts */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Approval & Rejection Decisions</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Emails the original submitter when their request is reviewed, approved, or rejected with steward notes.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRule('notifyRequesterOnDecision')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.notifyRequesterOnDecision !== false
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {formData.notifyRequesterOnDecision !== false ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Rule 3: Store Manager Vacancies & Reassignments */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-purple-600" />
                      <span>Store Manager & Leadership Reassignment</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Dispatches alerts to District Managers and HR when store leadership roster is modified or vacated.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRule('notifyOnStoreManagerChange')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.notifyOnStoreManagerChange !== false
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {formData.notifyOnStoreManagerChange !== false ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Rule 4: Operational Status Notices (Temporary Closure, Remodel, Holiday) */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      <span>Operational Status & Closure Notices</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Broadcasts urgent notifications when a store transitions to Temporarily Closed, Remodeling, or Modified Hours.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRule('notifyOnOperationalStatusChange')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.notifyOnOperationalStatusChange !== false
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {formData.notifyOnOperationalStatusChange !== false ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Rule 5: User Offboarding & Store Reassignments */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <UserMinus className="w-4 h-4 text-red-600" />
                      <span>User Offboarding & SOX Separation Alerts</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Notifies IT Security & Stewards when an administrative user is soft-deactivated and their stores reassigned.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRule('notifyOnUserOffboarded')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.notifyOnUserOffboarded !== false
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {formData.notifyOnUserOffboarded !== false ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>

              {/* Rule 6: Daily District Digest */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700/80 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-indigo-600" />
                      <span>Daily Morning District Manager Digest</span>
                    </h4>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Sends 7:00 AM summary of store roster changes and pending update requests in their territory.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleRule('dailyDigestDistrictManagers')}
                    className={`p-1.5 rounded-lg text-xs font-bold transition-all ${
                      formData.dailyDigestDistrictManagers !== false
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400'
                    }`}
                  >
                    {formData.dailyDigestDistrictManagers !== false ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: Outbox & Delivery Logs */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-neutral-500" />
                  <span>Email Outbox & Delivery Audit Logs</span>
                </h3>
                <span className="text-[11px] text-neutral-400">{emailLogs.length} total transactional messages logged</span>
              </div>

              <div className="flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-neutral-400" />
                <select
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  className="text-xs bg-neutral-100 dark:bg-neutral-800 border-none rounded px-2.5 py-1 text-neutral-700 dark:text-neutral-300"
                >
                  <option value="all">All Logs ({emailLogs.length})</option>
                  <option value="Directory Update Request">Update Requests</option>
                  <option value="Request Status Update">Status Updates</option>
                  <option value="Store Directory PDF">PDF Broadcasts</option>
                  <option value="Test Email">Test Pings</option>
                </select>
              </div>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-[600px] pr-1">
              {filteredLogs.length === 0 ? (
                <div className="p-12 text-center text-neutral-400 text-xs">
                  No email delivery records match filter.
                </div>
              ) : (
                filteredLogs.map(log => (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="p-3 bg-neutral-50 dark:bg-neutral-800/60 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-700/80 rounded-xl cursor-pointer transition-all space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900 dark:text-neutral-100 truncate max-w-[320px]">
                        {log.subject}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                        {log.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-neutral-500">
                      <span className="font-mono truncate max-w-[300px]">To: {log.recipients.join(', ')}</span>
                      <span>{new Date(log.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ({new Date(log.sentAt).toLocaleDateString()})</span>
                    </div>

                    {log.attachmentName && (
                      <div className="flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-mono">
                        <Paperclip className="w-3 h-3" />
                        <span>{log.attachmentName}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                Email Dispatch Details
              </h3>
              <button onClick={() => setSelectedLog(null)} className="text-neutral-400 hover:text-neutral-600">
                ✕
              </button>
            </div>

            <div>
              <div className="text-neutral-500 text-[10px] uppercase font-bold">Subject</div>
              <div className="font-bold text-sm text-neutral-900 dark:text-neutral-100">{selectedLog.subject}</div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-neutral-600 dark:text-neutral-400">
              <div>
                <span className="font-bold">Sent At:</span> {new Date(selectedLog.sentAt).toLocaleString()}
              </div>
              <div>
                <span className="font-bold">Sent By:</span> {selectedLog.sentBy}
              </div>
            </div>

            <div>
              <div className="text-neutral-500 text-[10px] uppercase font-bold">Recipients</div>
              <div className="font-mono text-neutral-800 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 p-2 rounded">
                {selectedLog.recipients.join('\n')}
              </div>
            </div>

            {selectedLog.details && (
              <div>
                <div className="text-neutral-500 text-[10px] uppercase font-bold">Message / Diagnostic Body</div>
                <div className="text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800 p-2.5 rounded whitespace-pre-wrap font-mono text-[11px]">
                  {selectedLog.details}
                </div>
              </div>
            )}

            {selectedLog.attachmentName && (
              <div className="p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded flex items-center gap-2">
                <FileText className="w-4 h-4 text-red-600" />
                <span className="font-mono text-[11px] font-bold text-red-700 dark:text-red-300">
                  {selectedLog.attachmentName}
                </span>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
