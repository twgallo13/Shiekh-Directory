import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Mail, Power, PowerOff, Send, Clock, Server, FileText, History, RotateCcw, Eye,
  AlertTriangle, Check, X, RefreshCw, Loader2, Users, UserCheck, Shield,
  Plus, ExternalLink, Calendar, ToggleLeft, ToggleRight, Info, AlertCircle
} from 'lucide-react';
import { Dialog } from './Dialog';
import { useAuth } from '../context/AuthContext';

interface EmailType {
  id: string;
  name: string;
  description: string;
  placeholders: string[];
  category: string;
  audience: 'stores' | 'leaders' | 'admins';
  audienceLabel: string;
  purpose: string;
}

interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

interface TemplateHistory {
  version: number;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  changedAt: string;
  changedBy: string;
  changedByEmail: string;
}

interface EmailTypeSettings {
  enabled: boolean;
  template?: EmailTemplate;
  templateHistory?: TemplateHistory[];
}

interface EmailSettings {
  masterEnabled: boolean;
  envCutoverEnabled: boolean;
  effectiveEnabled: boolean;
  typeSettings: Record<string, EmailTypeSettings>;
  sender: {
    fromName: string;
    fromAddress: string;
    replyTo: string;
    footerText: string;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    secure: boolean;
    configured: boolean;
  };
  schedule: {
    reminderFrequencyDays: number;
    maxReminders: number;
    quietHoursStart: string;
    quietHoursEnd: string;
    timezone: string;
    sendDays: string[];
  };
  appBaseUrl: string;
  emailTypes: EmailType[];
  stats: {
    last7Days: {
      sent: number;
      logged: number;
      failed: number;
      suppressed: number;
    };
    pendingRecipients: {
      verifications: number;
      invitations: number;
    };
  };
}

interface OutboxEntry {
  id: string;
  to: string;
  type: string;
  subject?: string;
  sentAt: string;
  success?: boolean;
  blocked?: boolean;
  reason?: string;
  error?: string;
  isTest?: boolean;
}

type SectionId = 'overview' | 'types' | 'schedule' | 'sender' | 'outbox';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatDayName(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1, 3);
}

const DEFAULT_TEMPLATES: Record<string, { subject: string; bodyHtml: string; bodyText: string }> = {
  verification_request: {
    subject: '[Action Required] Verify Hours - Store {{storeNumber}}',
    bodyHtml: '<p>Hello,</p><p>Please verify your store hours for <strong>{{storeName}}</strong> (Store {{storeNumber}}).</p><p><a href="{{verificationUrl}}">Click here to verify</a></p><p>This request expires on {{expiresAt}}.</p>',
    bodyText: 'Hello,\n\nPlease verify your store hours for {{storeName}} (Store {{storeNumber}}).\n\nVerify here: {{verificationUrl}}\n\nThis request expires on {{expiresAt}}.',
  },
  verification_reminder: {
    subject: '[Reminder] Verify Hours - Store {{storeNumber}} - {{daysRemaining}} days remaining',
    bodyHtml: '<p>Hello,</p><p>This is a reminder to verify your store hours for <strong>{{storeName}}</strong>.</p><p>{{daysRemaining}} days remaining to respond.</p><p><a href="{{verificationUrl}}">Verify now</a></p>',
    bodyText: 'Hello,\n\nThis is a reminder to verify your store hours for {{storeName}}.\n\n{{daysRemaining}} days remaining to respond.\n\nVerify here: {{verificationUrl}}',
  },
  verification_confirmation: {
    subject: 'Hours Verified - Store {{storeNumber}}',
    bodyHtml: '<p>Hello,</p><p>Thank you for verifying the hours for <strong>{{storeName}}</strong> (Store {{storeNumber}}).</p><p>Verified on: {{verifiedAt}}</p>',
    bodyText: 'Hello,\n\nThank you for verifying the hours for {{storeName}} (Store {{storeNumber}}).\n\nVerified on: {{verifiedAt}}',
  },
  store_signin: {
    subject: 'Sign in to Shiekh Directory - Store {{storeNumber}}',
    bodyHtml: '<p>Hello,</p><p>Click the link below to sign in to the Shiekh Directory for <strong>{{storeName}}</strong>.</p><p><a href="{{signInUrl}}">Sign In</a></p><p>This link expires on {{expiresAt}}.</p>',
    bodyText: 'Hello,\n\nSign in to the Shiekh Directory for {{storeName}}:\n\n{{signInUrl}}\n\nThis link expires on {{expiresAt}}.',
  },
  dm_verification_request: {
    subject: '[Action Required] District Verification - {{districtName}}',
    bodyHtml: '<p>Hello {{recipientName}},</p><p>Please review the roster for <strong>{{districtName}}</strong> ({{storeCount}} stores).</p><p><a href="{{verificationUrl}}">Review District Roster</a></p><p>Please respond by {{expiresAt}}.</p>',
    bodyText: 'Hello {{recipientName}},\n\nPlease review the roster for {{districtName}} ({{storeCount}} stores).\n\nReview here: {{verificationUrl}}\n\nPlease respond by {{expiresAt}}.',
  },
  invitation: {
    subject: "You're invited to Shiekh Directory",
    bodyHtml: '<p>Hello,</p><p><strong>{{inviterName}}</strong> has invited you to join the Shiekh Directory as <strong>{{role}}</strong>.</p><p><a href="{{signInUrl}}">Accept Invitation</a></p><p>This invitation expires on {{expiresAt}}.</p>',
    bodyText: 'Hello,\n\n{{inviterName}} has invited you to join the Shiekh Directory as {{role}}.\n\nAccept here: {{signInUrl}}\n\nThis invitation expires on {{expiresAt}}.',
  },
  invitation_reminder: {
    subject: "Reminder: You're invited to Shiekh Directory",
    bodyHtml: '<p>Hello,</p><p>This is a reminder that <strong>{{inviterName}}</strong> invited you to join the Shiekh Directory as <strong>{{role}}</strong>.</p><p><a href="{{signInUrl}}">Accept Invitation</a></p><p>This invitation expires on {{expiresAt}}.</p>',
    bodyText: 'Hello,\n\nThis is a reminder that {{inviterName}} invited you to join the Shiekh Directory as {{role}}.\n\nAccept here: {{signInUrl}}\n\nThis invitation expires on {{expiresAt}}.',
  },
};

export function EmailSettingsView() {
  const { getIdToken } = useAuth();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Template editor state
  const [editingType, setEditingType] = useState<EmailType | null>(null);
  const [templateForm, setTemplateForm] = useState({ subject: '', bodyHtml: '', bodyText: '' });
  const [templateDirty, setTemplateDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  
  // Confirmation dialogs
  const [confirmEnableEmail, setConfirmEnableEmail] = useState(false);
  const [confirmResetTemplate, setConfirmResetTemplate] = useState(false);
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState<TemplateHistory | null>(null);
  const [confirmCloseUnsaved, setConfirmCloseUnsaved] = useState(false);
  
  // Form states
  const [senderForm, setSenderForm] = useState({ fromName: '', fromAddress: '', replyTo: '', footerText: '' });
  const [senderDirty, setSenderDirty] = useState(false);
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, user: '', password: '', secure: false });
  const [smtpDirty, setSmtpDirty] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    reminderFrequencyDays: 3, maxReminders: 3,
    quietHoursStart: '20:00', quietHoursEnd: '08:00',
    sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as string[],
  });
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [appUrlForm, setAppUrlForm] = useState('');
  
  const templateEditorRef = useRef<HTMLTextAreaElement>(null);
  
  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to load settings');
      }
      const { data } = await res.json();
      setSettings(data);
      setSenderForm(data.sender);
      setScheduleForm({
        reminderFrequencyDays: data.schedule.reminderFrequencyDays,
        maxReminders: data.schedule.maxReminders,
        quietHoursStart: data.schedule.quietHoursStart,
        quietHoursEnd: data.schedule.quietHoursEnd,
        sendDays: data.schedule.sendDays,
      });
      setAppUrlForm(data.appBaseUrl);
      if (data.smtp.configured) {
        setSmtpForm({
          host: data.smtp.host, port: data.smtp.port,
          user: data.smtp.user, password: '', secure: data.smtp.secure,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);
  
  const fetchOutbox = useCallback(async () => {
    try {
      setOutboxLoading(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/outbox?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setOutbox(data);
      }
    } catch {
      // Silently fail outbox fetch
    } finally {
      setOutboxLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  
  useEffect(() => {
    if (activeSection === 'outbox') fetchOutbox();
  }, [activeSection, fetchOutbox]);
  
  // Unsaved changes guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (templateDirty || senderDirty || smtpDirty || scheduleDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [templateDirty, senderDirty, smtpDirty, scheduleDirty]);

  const toggleMaster = async (enable: boolean) => {
    if (!settings) return;
    if (enable && !settings.masterEnabled) {
      setConfirmEnableEmail(true);
      return;
    }
    await doToggleMaster(enable);
  };
  
  const doToggleMaster = async (enable: boolean) => {
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/master', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchSettings();
      showToast(enable ? 'Email sending enabled' : 'Email sending disabled');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setSaving(false);
      setConfirmEnableEmail(false);
    }
  };
  
  const toggleTypeEnabled = async (typeId: string, enable: boolean) => {
    if (!settings) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${typeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enable }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchSettings();
      const typeName = settings.emailTypes.find(t => t.id === typeId)?.name || typeId;
      showToast(`${typeName} ${enable ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const openTemplateEditor = (type: EmailType) => {
    if (!settings) return;
    const typeSettings = settings.typeSettings[type.id];
    const customTemplate = typeSettings?.template;
    const defaultTemplate = DEFAULT_TEMPLATES[type.id];
    
    setEditingType(type);
    setTemplateForm({
      subject: customTemplate?.subject || defaultTemplate?.subject || '',
      bodyHtml: customTemplate?.bodyHtml || defaultTemplate?.bodyHtml || '',
      bodyText: customTemplate?.bodyText || defaultTemplate?.bodyText || '',
    });
    setTemplateDirty(false);
    setShowPreview(false);
    setShowHistory(false);
  };
  
  const closeTemplateEditor = () => {
    if (templateDirty) {
      setConfirmCloseUnsaved(true);
    } else {
      setEditingType(null);
    }
  };
  
  const insertPlaceholder = (placeholder: string) => {
    const textarea = templateEditorRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = templateForm.bodyHtml;
    const newText = text.slice(0, start) + `{{${placeholder}}}` + text.slice(end);
    setTemplateForm({ ...templateForm, bodyHtml: newText });
    setTemplateDirty(true);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length + 4, start + placeholder.length + 4);
    }, 0);
  };
  
  const validatePlaceholders = (text: string, validPlaceholders: string[]): string[] => {
    const regex = /\{\{(\w+)\}\}/g;
    const invalid: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (!validPlaceholders.includes(match[1])) {
        invalid.push(match[1]);
      }
    }
    return invalid;
  };
  
  const templateInvalidPlaceholders = useMemo(() => {
    if (!editingType) return [];
    const allText = templateForm.subject + templateForm.bodyHtml + templateForm.bodyText;
    return validatePlaceholders(allText, editingType.placeholders);
  }, [editingType, templateForm]);
  
  const saveTemplate = async () => {
    if (!editingType) return;
    if (templateInvalidPlaceholders.length > 0) {
      showToast(`Unknown placeholders: ${templateInvalidPlaceholders.join(', ')}`, 'error');
      return;
    }
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${editingType.id}/template`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(templateForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save');
      }
      await fetchSettings();
      setTemplateDirty(false);
      showToast('Template saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const resetTemplate = async () => {
    if (!editingType) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${editingType.id}/template/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to reset');
      await fetchSettings();
      const defaultTemplate = DEFAULT_TEMPLATES[editingType.id];
      setTemplateForm({
        subject: defaultTemplate?.subject || '',
        bodyHtml: defaultTemplate?.bodyHtml || '',
        bodyText: defaultTemplate?.bodyText || '',
      });
      setTemplateDirty(false);
      setConfirmResetTemplate(false);
      showToast('Template reset to default');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reset', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const restoreVersion = async (entry: TemplateHistory) => {
    if (!editingType) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${editingType.id}/template/restore/${entry.version}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to restore');
      await fetchSettings();
      setTemplateForm({ subject: entry.subject, bodyHtml: entry.bodyHtml, bodyText: entry.bodyText });
      setTemplateDirty(false);
      setConfirmRestoreVersion(null);
      setShowHistory(false);
      showToast(`Restored version ${entry.version}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to restore', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const sendTestEmail = async () => {
    if (!editingType) return;
    try {
      setSendingTest(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/test-send/${editingType.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to send');
      if (data.logOnly) {
        showToast(data.message || `Test logged (not sent) - enable email sending to deliver`, 'error');
      } else {
        showToast(`Test email sent to ${data.sentTo}`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to send test', 'error');
    } finally {
      setSendingTest(false);
    }
  };
  
  const saveSender = async () => {
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/sender', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(senderForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save');
      }
      await fetchSettings();
      setSenderDirty(false);
      showToast('Sender settings saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const saveSmtp = async () => {
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/smtp', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(smtpForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save');
      }
      await fetchSettings();
      setSmtpDirty(false);
      showToast('SMTP settings saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const testSmtp = async () => {
    try {
      setTestingSmtp(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/smtp/test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Connection failed');
      showToast('SMTP connection successful');
    } catch (err) {
      showToast(`SMTP test failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error');
    } finally {
      setTestingSmtp(false);
    }
  };
  
  const saveSchedule = async () => {
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/schedule', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(scheduleForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save');
      }
      await fetchSettings();
      setScheduleDirty(false);
      showToast('Schedule settings saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  const saveAppUrl = async () => {
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/app-url', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ appBaseUrl: appUrlForm }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save');
      }
      await fetchSettings();
      showToast('App URL saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  };
  
  // Group email types by audience
  const typesByAudience = useMemo(() => {
    if (!settings) return {};
    const groups: Record<string, EmailType[]> = {};
    for (const type of settings.emailTypes) {
      if (!groups[type.audience]) groups[type.audience] = [];
      groups[type.audience].push(type);
    }
    return groups;
  }, [settings]);
  
  const audienceOrder = ['stores', 'leaders', 'admins'];
  const audienceIcons: Record<string, typeof Users> = {
    stores: Users,
    leaders: UserCheck,
    admins: Shield,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" role="status" aria-label="Loading email settings">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" aria-hidden="true" />
        <span className="ml-2 text-gray-600">Loading email settings...</span>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="text-center py-12" role="alert">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" aria-hidden="true" />
        <p className="mt-4 text-gray-900 font-medium">Failed to load email settings</p>
        <p className="mt-2 text-gray-600">{error}</p>
        <button
          onClick={fetchSettings}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[44px] min-w-[44px]"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!settings) return null;

  const sections: { id: SectionId; label: string; icon: typeof Mail }[] = [
    { id: 'overview', label: 'Overview', icon: Mail },
    { id: 'types', label: 'Email Types', icon: FileText },
    { id: 'schedule', label: 'Schedule', icon: Clock },
    { id: 'sender', label: 'Sender & Provider', icon: Server },
    { id: 'outbox', label: 'Outbox', icon: Send },
  ];

  const enabledTypesCount = settings.emailTypes.filter(t => settings.typeSettings[t.id]?.enabled !== false).length;
  const totalPendingRecipients = settings.stats.pendingRecipients.verifications + settings.stats.pendingRecipients.invitations;

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2" role="status" aria-live="polite">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 animate-fade-in ${
              toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="w-5 h-5" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-5 h-5" aria-hidden="true" />
            )}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Section Navigation */}
      <nav aria-label="Email settings sections">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4" role="tablist">
          {sections.map(section => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              role="tab"
              aria-selected={activeSection === section.id}
              aria-controls={`panel-${section.id}`}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                activeSection === section.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <section.icon className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">{section.label}</span>
              <span className="sm:hidden">{section.label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="space-y-6">
          {/* Master Status Card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {settings.effectiveEnabled ? (
                  <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Power className="w-7 h-7 text-green-600" aria-hidden="true" />
                  </div>
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <PowerOff className="w-7 h-7 text-gray-400" aria-hidden="true" />
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {settings.effectiveEnabled ? 'Emails are ON' : 'Emails are OFF'}
                  </h2>
                  <p className="text-gray-600 mt-1">
                    {settings.effectiveEnabled ? (
                      `${enabledTypesCount} email types active. Emails are being delivered to recipients.`
                    ) : !settings.masterEnabled ? (
                      'You\'ve turned off email sending. No emails will be delivered.'
                    ) : !settings.envCutoverEnabled ? (
                      'Waiting for server configuration. Set MAIL_CUTOVER_ENABLED=true to enable delivery.'
                    ) : (
                      'Email sending is currently disabled.'
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleMaster(!settings.masterEnabled)}
                disabled={saving}
                className={`px-6 py-3 rounded-lg font-medium min-h-[44px] flex items-center gap-2 ${
                  settings.masterEnabled
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-green-700 text-white hover:bg-green-800'
                } disabled:opacity-50`}
              >
                {settings.masterEnabled ? (
                  <>
                    <ToggleRight className="w-5 h-5" aria-hidden="true" />
                    Turn Off
                  </>
                ) : (
                  <>
                    <ToggleLeft className="w-5 h-5" aria-hidden="true" />
                    Turn On
                  </>
                )}
              </button>
            </div>
            
            {!settings.effectiveEnabled && settings.masterEnabled && !settings.envCutoverEnabled && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium text-amber-800">Server configuration required</p>
                  <p className="text-sm text-amber-700 mt-1">
                    A developer needs to set <code className="bg-amber-100 px-1 rounded">MAIL_CUTOVER_ENABLED=true</code> in the server environment before emails can be delivered.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Stats Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">Sent (7 days)</h3>
                <Check className="w-5 h-5 text-green-500" aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-2">{settings.stats.last7Days.sent}</p>
              <p className="text-sm text-gray-500 mt-1">emails delivered</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">Logged Only</h3>
                <FileText className="w-5 h-5 text-gray-400" aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-2">{settings.stats.last7Days.logged}</p>
              <p className="text-sm text-gray-500 mt-1">not sent (email off)</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">Failed</h3>
                <AlertTriangle className="w-5 h-5 text-red-500" aria-hidden="true" />
              </div>
              <p className={`text-3xl font-bold mt-2 ${settings.stats.last7Days.failed > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {settings.stats.last7Days.failed}
              </p>
              <p className="text-sm text-gray-500 mt-1">delivery errors</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500">Email Types</h3>
                <Mail className="w-5 h-5 text-blue-500" aria-hidden="true" />
              </div>
              <p className="text-3xl font-bold text-gray-900 mt-2">{enabledTypesCount}</p>
              <p className="text-sm text-gray-500 mt-1">of {settings.emailTypes.length} enabled</p>
            </div>
          </div>

          {/* App URL */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start gap-3 mb-4">
              <ExternalLink className="w-5 h-5 text-gray-400 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-gray-900">App URL for Email Links</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Links in emails (like verification URLs) will point to this address.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="url"
                id="appBaseUrl"
                value={appUrlForm}
                onChange={(e) => setAppUrlForm(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="https://shiekh-directory-v2.web.app"
                aria-label="Application base URL"
              />
              <button
                onClick={saveAppUrl}
                disabled={saving || appUrlForm === settings.appBaseUrl}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px] whitespace-nowrap"
              >
                Save URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Types Section */}
      {activeSection === 'types' && (
        <div id="panel-types" role="tabpanel" aria-labelledby="tab-types" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Email Types</h2>
              <p className="text-sm text-gray-600 mt-1">
                Control which emails are sent and customize their templates.
              </p>
            </div>
          </div>

          {audienceOrder.map(audience => {
            const types = typesByAudience[audience];
            if (!types || types.length === 0) return null;
            const Icon = audienceIcons[audience] || Users;
            const audienceLabel = types[0]?.audienceLabel || audience;
            
            return (
              <div key={audience} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 border-b border-gray-200 flex items-center gap-3">
                  <Icon className="w-5 h-5 text-gray-600" aria-hidden="true" />
                  <h3 className="font-semibold text-gray-900">{audienceLabel}</h3>
                  <span className="text-sm text-gray-500">
                    ({types.filter(t => settings.typeSettings[t.id]?.enabled !== false).length} of {types.length} active)
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {types.map(type => {
                    const typeSettings = settings.typeSettings[type.id];
                    const enabled = typeSettings?.enabled !== false;
                    const hasCustomTemplate = !!typeSettings?.template;
                    const historyCount = typeSettings?.templateHistory?.length || 0;
                    const lastEdited = typeSettings?.templateHistory?.[historyCount - 1]?.changedAt;
                    
                    return (
                      <div key={type.id} className="p-4 sm:p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-medium text-gray-900">{type.name}</h4>
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {enabled ? 'Active' : 'Off'}
                              </span>
                              {hasCustomTemplate && (
                                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                                  Custom
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{type.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                              <span>{type.purpose}</span>
                              {lastEdited && (
                                <span>Last edited {formatTimeAgo(lastEdited)}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => openTemplateEditor(type)}
                              className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 min-h-[44px] flex items-center gap-1"
                              aria-label={`Edit template for ${type.name}`}
                            >
                              <FileText className="w-4 h-4" aria-hidden="true" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>
                            <button
                              onClick={() => toggleTypeEnabled(type.id, !enabled)}
                              disabled={saving}
                              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                                enabled
                                  ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  : 'bg-green-700 text-white hover:bg-green-800'
                              } disabled:opacity-50`}
                              aria-label={enabled ? `Disable ${type.name}` : `Enable ${type.name}`}
                            >
                              {enabled ? 'Disable' : 'Enable'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Schedule Section */}
      {activeSection === 'schedule' && (
        <div id="panel-schedule" role="tabpanel" aria-labelledby="tab-schedule" className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start gap-3 mb-6">
              <Calendar className="w-5 h-5 text-gray-400 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-gray-900">When to Send Emails</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Control when reminder emails go out and set quiet hours.
                </p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Send Days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Send emails on these days
                </label>
                <div className="flex flex-wrap gap-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                    <button
                      key={day}
                      onClick={() => {
                        const newDays = scheduleForm.sendDays.includes(day)
                          ? scheduleForm.sendDays.filter(d => d !== day)
                          : [...scheduleForm.sendDays, day];
                        setScheduleForm({ ...scheduleForm, sendDays: newDays });
                        setScheduleDirty(true);
                      }}
                      className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] min-w-[44px] ${
                        scheduleForm.sendDays.includes(day)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                      aria-pressed={scheduleForm.sendDays.includes(day)}
                    >
                      {formatDayName(day)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quiet Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quiet hours: don't send between
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="time"
                    id="quietStart"
                    value={scheduleForm.quietHoursStart}
                    onChange={(e) => {
                      setScheduleForm({ ...scheduleForm, quietHoursStart: e.target.value });
                      setScheduleDirty(true);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    aria-label="Quiet hours start time"
                  />
                  <span className="text-gray-500">and</span>
                  <input
                    type="time"
                    id="quietEnd"
                    value={scheduleForm.quietHoursEnd}
                    onChange={(e) => {
                      setScheduleForm({ ...scheduleForm, quietHoursEnd: e.target.value });
                      setScheduleDirty(true);
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    aria-label="Quiet hours end time"
                  />
                  <span className="text-sm text-gray-500">(Pacific Time)</span>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  Emails will be held until quiet hours end.
                </p>
              </div>

              {/* Reminder Settings */}
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="reminderFrequency" className="block text-sm font-medium text-gray-700 mb-2">
                    Send reminders every
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="reminderFrequency"
                      type="number"
                      min="1"
                      max="30"
                      value={scheduleForm.reminderFrequencyDays}
                      onChange={(e) => {
                        setScheduleForm({ ...scheduleForm, reminderFrequencyDays: parseInt(e.target.value, 10) || 3 });
                        setScheduleDirty(true);
                      }}
                      className="w-20 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    />
                    <span className="text-gray-700">days</span>
                  </div>
                </div>
                <div>
                  <label htmlFor="maxReminders" className="block text-sm font-medium text-gray-700 mb-2">
                    Stop after this many reminders
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="maxReminders"
                      type="number"
                      min="0"
                      max="10"
                      value={scheduleForm.maxReminders}
                      onChange={(e) => {
                        setScheduleForm({ ...scheduleForm, maxReminders: parseInt(e.target.value, 10) || 0 });
                        setScheduleDirty(true);
                      }}
                      className="w-20 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    />
                    <span className="text-gray-500 text-sm">(0 = no limit)</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={saveSchedule}
                  disabled={saving || !scheduleDirty}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sender & Provider Section */}
      {activeSection === 'sender' && (
        <div id="panel-sender" role="tabpanel" aria-labelledby="tab-sender" className="space-y-6">
          {/* Sender Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start gap-3 mb-6">
              <Send className="w-5 h-5 text-gray-400 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-gray-900">Who Emails Come From</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Recipients will see this name and address.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="fromName" className="block text-sm font-medium text-gray-700 mb-1">
                    From Name
                  </label>
                  <input
                    id="fromName"
                    type="text"
                    value={senderForm.fromName}
                    onChange={(e) => {
                      setSenderForm({ ...senderForm, fromName: e.target.value });
                      setSenderDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="Shiekh Store Directory"
                  />
                </div>
                <div>
                  <label htmlFor="fromAddress" className="block text-sm font-medium text-gray-700 mb-1">
                    From Address
                  </label>
                  <input
                    id="fromAddress"
                    type="email"
                    value={senderForm.fromAddress}
                    onChange={(e) => {
                      setSenderForm({ ...senderForm, fromAddress: e.target.value });
                      setSenderDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="noreply@shiekh.com"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="replyTo" className="block text-sm font-medium text-gray-700 mb-1">
                  Reply-To Address <span className="text-gray-600 font-normal">(optional)</span>
                </label>
                <input
                  id="replyTo"
                  type="email"
                  value={senderForm.replyTo}
                  onChange={(e) => {
                    setSenderForm({ ...senderForm, replyTo: e.target.value });
                    setSenderDirty(true);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                  placeholder="support@shiekh.com"
                />
                <p className="text-sm text-gray-500 mt-1">
                  If someone replies to an email, it goes here instead of the from address.
                </p>
              </div>
              <div>
                <label htmlFor="footerText" className="block text-sm font-medium text-gray-700 mb-1">
                  Email Footer
                </label>
                <textarea
                  id="footerText"
                  value={senderForm.footerText}
                  onChange={(e) => {
                    setSenderForm({ ...senderForm, footerText: e.target.value });
                    setSenderDirty(true);
                  }}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="© Shiekh Shoes. All rights reserved."
                />
              </div>
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={saveSender}
                  disabled={saving || !senderDirty}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? 'Saving...' : 'Save Sender'}
                </button>
              </div>
            </div>
          </div>

          {/* SMTP Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div className="flex items-start gap-3">
                <Server className="w-5 h-5 text-gray-400 mt-0.5" aria-hidden="true" />
                <div>
                  <h2 className="font-semibold text-gray-900">Email Server (SMTP)</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Connection details for sending email.
                  </p>
                </div>
              </div>
              {settings.smtp.configured && (
                <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                  Connected
                </span>
              )}
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="smtpHost" className="block text-sm font-medium text-gray-700 mb-1">
                    Server Address
                  </label>
                  <input
                    id="smtpHost"
                    type="text"
                    value={smtpForm.host}
                    onChange={(e) => {
                      setSmtpForm({ ...smtpForm, host: e.target.value });
                      setSmtpDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label htmlFor="smtpPort" className="block text-sm font-medium text-gray-700 mb-1">
                    Port
                  </label>
                  <input
                    id="smtpPort"
                    type="number"
                    value={smtpForm.port}
                    onChange={(e) => {
                      setSmtpForm({ ...smtpForm, port: parseInt(e.target.value, 10) || 587 });
                      setSmtpDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label htmlFor="smtpUser" className="block text-sm font-medium text-gray-700 mb-1">
                    Username
                  </label>
                  <input
                    id="smtpUser"
                    type="text"
                    value={smtpForm.user}
                    onChange={(e) => {
                      setSmtpForm({ ...smtpForm, user: e.target.value });
                      setSmtpDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="your-username"
                  />
                </div>
                <div>
                  <label htmlFor="smtpPassword" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="smtpPassword"
                    type="password"
                    value={smtpForm.password}
                    onChange={(e) => {
                      setSmtpForm({ ...smtpForm, password: e.target.value });
                      setSmtpDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder={settings.smtp.configured ? '••••••••' : 'Enter password'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Password is stored securely and never displayed.
                  </p>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer min-h-[44px] py-2">
                <input
                  type="checkbox"
                  id="smtpSecure"
                  checked={smtpForm.secure}
                  onChange={(e) => {
                    setSmtpForm({ ...smtpForm, secure: e.target.checked });
                    setSmtpDirty(true);
                  }}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  Use SSL/TLS encryption (required for port 465)
                </span>
              </label>
              <div className="pt-4 border-t border-gray-200 flex flex-wrap gap-3">
                <button
                  onClick={saveSmtp}
                  disabled={saving || !smtpForm.host || !smtpForm.user || !smtpForm.password}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
                >
                  {saving ? 'Saving...' : 'Save SMTP'}
                </button>
                {settings.smtp.configured && (
                  <button
                    onClick={testSmtp}
                    disabled={testingSmtp}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 min-h-[44px] flex items-center gap-2"
                  >
                    {testingSmtp ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="w-4 h-4" aria-hidden="true" />
                    )}
                    Test Connection
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Outbox Section */}
      {activeSection === 'outbox' && (
        <div id="panel-outbox" role="tabpanel" aria-labelledby="tab-outbox">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="p-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-900">Email Log</h2>
                <p className="text-sm text-gray-600 mt-1">Recent emails and their delivery status.</p>
              </div>
              <button
                onClick={fetchOutbox}
                disabled={outboxLoading}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px] flex items-center gap-2"
                aria-label="Refresh email log"
              >
                {outboxLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="w-4 h-4" aria-hidden="true" />
                )}
                Refresh
              </button>
            </div>

            {outboxLoading && outbox.length === 0 ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" aria-hidden="true" />
                <p className="mt-2 text-gray-500">Loading...</p>
              </div>
            ) : outbox.length === 0 ? (
              <div className="p-8 text-center">
                <Mail className="w-12 h-12 text-gray-300 mx-auto" aria-hidden="true" />
                <p className="mt-2 text-gray-500">No emails sent yet.</p>
              </div>
            ) : (
              <>
                {/* Mobile: Card view */}
                <div className="lg:hidden divide-y divide-gray-100">
                  {outbox.map(entry => {
                    let statusColor = 'bg-gray-100 text-gray-700';
                    let statusLabel = 'Logged';
                    
                    if (entry.blocked) {
                      statusColor = 'bg-amber-100 text-amber-800';
                      statusLabel = 'Suppressed';
                    } else if (entry.success === false || entry.error) {
                      statusColor = 'bg-red-100 text-red-800';
                      statusLabel = 'Failed';
                    } else if (entry.success) {
                      statusColor = 'bg-green-100 text-green-800';
                      statusLabel = 'Sent';
                    }
                    
                    const typeName = settings.emailTypes.find(t => t.id === entry.type || `test-${t.id}` === entry.type)?.name || entry.type;
                    
                    return (
                      <div key={entry.id} className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-gray-900 break-all">{entry.to}</p>
                          <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${statusColor}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <span className="text-gray-700">{typeName}</span>
                          {entry.isTest && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">test</span>
                          )}
                          <span className="text-gray-500">· {formatTimeAgo(entry.sentAt)}</span>
                        </div>
                        {entry.error && (
                          <p className="text-xs text-red-600">{entry.error}</p>
                        )}
                        {entry.reason && (
                          <p className="text-xs text-gray-500">{entry.reason}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Desktop: Table view with contained scroll */}
                <div 
                  className="hidden lg:block overflow-x-auto focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset" 
                  tabIndex={0}
                  role="region"
                  aria-label="Email log table, scrollable"
                >
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="text-left text-sm text-gray-600 bg-gray-50">
                        <th className="px-5 py-3 font-medium">Recipient</th>
                        <th className="px-5 py-3 font-medium">Type</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {outbox.map(entry => {
                        let statusColor = 'bg-gray-100 text-gray-700';
                        let statusLabel = 'Logged';
                        
                        if (entry.blocked) {
                          statusColor = 'bg-amber-100 text-amber-800';
                          statusLabel = 'Suppressed';
                        } else if (entry.success === false || entry.error) {
                          statusColor = 'bg-red-100 text-red-800';
                          statusLabel = 'Failed';
                        } else if (entry.success) {
                          statusColor = 'bg-green-100 text-green-800';
                          statusLabel = 'Sent';
                        }
                        
                        const typeName = settings.emailTypes.find(t => t.id === entry.type || `test-${t.id}` === entry.type)?.name || entry.type;
                        
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-5 py-4">
                              <p className="font-medium text-gray-900 truncate max-w-[250px]">{entry.to}</p>
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-700">{typeName}</span>
                                {entry.isTest && (
                                  <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">test</span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`px-2 py-1 text-xs rounded-full ${statusColor}`}>
                                {statusLabel}
                              </span>
                              {entry.error && (
                                <p className="text-xs text-red-600 mt-1 truncate max-w-[200px]" title={entry.error}>
                                  {entry.error}
                                </p>
                              )}
                              {entry.reason && (
                                <p className="text-xs text-gray-500 mt-1 truncate max-w-[200px]" title={entry.reason}>
                                  {entry.reason}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-600">
                              {formatTimeAgo(entry.sentAt)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Template Editor Dialog */}
      {editingType && (
        <Dialog
          isOpen={true}
          onClose={closeTemplateEditor}
          title={`Edit: ${editingType.name}`}
          size="xl"
          footer={
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={closeTemplateEditor}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
              >
                Cancel
              </button>
              <div className="flex-1" />
              {settings.smtp.configured && (
                <button
                  onClick={sendTestEmail}
                  disabled={sendingTest || templateInvalidPlaceholders.length > 0}
                  className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sendingTest ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="w-4 h-4" aria-hidden="true" />
                  )}
                  Send Test to Me
                </button>
              )}
              <button
                onClick={saveTemplate}
                disabled={saving || templateInvalidPlaceholders.length > 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-gray-200">
              {/* Mobile-only preview toggle */}
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`lg:hidden px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] flex items-center gap-1 ${
                  showPreview ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-4 h-4" aria-hidden="true" />
                {showPreview ? 'Hide Preview' : 'Preview'}
              </button>
              
              {(settings.typeSettings[editingType.id]?.templateHistory?.length || 0) > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] flex items-center gap-1 ${
                    showHistory ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <History className="w-4 h-4" aria-hidden="true" />
                  History
                </button>
              )}
              
              {settings.typeSettings[editingType.id]?.template && (
                <button
                  onClick={() => setConfirmResetTemplate(true)}
                  className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium min-h-[44px] flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Reset to Default
                </button>
              )}
              
              {templateDirty && (
                <span className="text-sm text-amber-700 font-medium flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  Unsaved changes
                </span>
              )}
            </div>

            {/* Placeholder Chips */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Click to insert a placeholder:
              </p>
              <div className="flex flex-wrap gap-2">
                {editingType.placeholders.map(p => (
                  <button
                    key={p}
                    onClick={() => insertPlaceholder(p)}
                    className="px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 min-h-[44px] flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" aria-hidden="true" />
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Invalid Placeholders Warning */}
            {templateInvalidPlaceholders.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2" role="alert">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-medium text-red-800">Unknown placeholders</p>
                  <p className="text-sm text-red-700 mt-1">
                    Remove or fix: {templateInvalidPlaceholders.map(p => `{{${p}}}`).join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Editor / Preview - always two-pane at lg+ */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Editor Column */}
              <div className="space-y-4">
                <div>
                  <label htmlFor="templateSubject" className="block text-sm font-medium text-gray-700 mb-1">
                    Subject Line
                  </label>
                  <input
                    id="templateSubject"
                    type="text"
                    value={templateForm.subject}
                    onChange={(e) => {
                      setTemplateForm({ ...templateForm, subject: e.target.value });
                      setTemplateDirty(true);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                    placeholder="Verify Your Store Hours - {{storeName}}"
                  />
                </div>
                
                <div>
                  <label htmlFor="templateHtml" className="block text-sm font-medium text-gray-700 mb-1">
                    Email Body (HTML)
                  </label>
                  <textarea
                    ref={templateEditorRef}
                    id="templateHtml"
                    value={templateForm.bodyHtml}
                    onChange={(e) => {
                      setTemplateForm({ ...templateForm, bodyHtml: e.target.value });
                      setTemplateDirty(true);
                    }}
                    rows={12}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="<p>Hello,</p><p>Please verify your hours at {{storeName}}...</p>"
                  />
                </div>
                
                <div>
                  <label htmlFor="templateText" className="block text-sm font-medium text-gray-700 mb-1">
                    Plain Text Version
                  </label>
                  <textarea
                    id="templateText"
                    value={templateForm.bodyText}
                    onChange={(e) => {
                      setTemplateForm({ ...templateForm, bodyText: e.target.value });
                      setTemplateDirty(true);
                    }}
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="Hello, Please verify your hours..."
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Shown when HTML can't be displayed.
                  </p>
                </div>
              </div>

              {/* Preview Column - always visible at lg+, toggle on mobile */}
              <div className={`border border-gray-200 rounded-lg overflow-hidden bg-gray-50 ${showPreview ? '' : 'hidden lg:block'}`}>
                <div className="bg-white border-b border-gray-200 px-4 py-2">
                  <p className="text-sm text-gray-600">Live Preview</p>
                  <p className="font-medium text-gray-900 truncate">
                    {templateForm.subject || '(No subject)'}
                  </p>
                </div>
                <div className="p-4 bg-white max-h-[400px] overflow-y-auto">
                  {templateForm.bodyHtml ? (
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: templateForm.bodyHtml }}
                    />
                  ) : (
                    <p className="text-gray-400 italic">Start typing to see preview...</p>
                  )}
                </div>
              </div>
            </div>

            {/* History Drawer */}
            {showHistory && (
              <div className="border border-gray-200 rounded-lg overflow-hidden mt-4">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                  <h4 className="font-medium text-gray-900">Version History</h4>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="p-1 hover:bg-gray-200 rounded min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Close history"
                  >
                    <X className="w-5 h-5" aria-hidden="true" />
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                  {(settings.typeSettings[editingType.id]?.templateHistory || [])
                    .sort((a, b) => b.version - a.version)
                    .map(entry => (
                      <div key={entry.version} className="p-4 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium text-gray-900">Version {entry.version}</span>
                            <p className="text-sm text-gray-500">
                              {formatTimeAgo(entry.changedAt)} by {entry.changedByEmail}
                            </p>
                            <p className="text-sm text-gray-600 mt-1 truncate">
                              Subject: {entry.subject}
                            </p>
                          </div>
                          <button
                            onClick={() => setConfirmRestoreVersion(entry)}
                            className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 min-h-[36px] flex items-center gap-1"
                          >
                            <RotateCcw className="w-4 h-4" aria-hidden="true" />
                            Restore
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </Dialog>
      )}

      {/* Confirm Enable Email Dialog */}
      <Dialog
        isOpen={confirmEnableEmail}
        onClose={() => setConfirmEnableEmail(false)}
        title="Enable Email Sending?"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmEnableEmail(false)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={() => doToggleMaster(true)}
              disabled={saving}
              className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Enabling...' : 'Enable Emails'}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            When you turn on email sending, the system will start delivering emails to recipients.
          </p>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="font-medium text-blue-900 mb-2">What will start sending:</p>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• {enabledTypesCount} email types are active</li>
              {settings.stats.pendingRecipients.verifications > 0 && (
                <li>• {settings.stats.pendingRecipients.verifications} pending verification requests</li>
              )}
              {settings.stats.pendingRecipients.invitations > 0 && (
                <li>• {settings.stats.pendingRecipients.invitations} pending invitations</li>
              )}
              {totalPendingRecipients === 0 && (
                <li>• New emails will send as triggered</li>
              )}
            </ul>
          </div>
          
          {!settings.envCutoverEnabled && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Emails won't actually send until a developer sets <code className="bg-amber-100 px-1 rounded">MAIL_CUTOVER_ENABLED=true</code> on the server.
              </p>
            </div>
          )}
        </div>
      </Dialog>

      {/* Confirm Reset Template Dialog */}
      <Dialog
        isOpen={confirmResetTemplate}
        onClose={() => setConfirmResetTemplate(false)}
        title="Reset Template to Default?"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmResetTemplate(false)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={resetTemplate}
              disabled={saving}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Resetting...' : 'Reset Template'}
            </button>
          </div>
        }
      >
        <p className="text-gray-700">
          This will replace your custom template with the system default. Your version history will be preserved.
        </p>
      </Dialog>

      {/* Confirm Restore Version Dialog */}
      <Dialog
        isOpen={!!confirmRestoreVersion}
        onClose={() => setConfirmRestoreVersion(null)}
        title="Restore This Version?"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmRestoreVersion(null)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={() => confirmRestoreVersion && restoreVersion(confirmRestoreVersion)}
              disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Restoring...' : 'Restore Version'}
            </button>
          </div>
        }
      >
        <p className="text-gray-700">
          This will restore version {confirmRestoreVersion?.version} and save it as a new version. Your current template will be replaced.
        </p>
      </Dialog>

      {/* Confirm Close Unsaved Dialog */}
      <Dialog
        isOpen={confirmCloseUnsaved}
        onClose={() => setConfirmCloseUnsaved(false)}
        title="Discard Unsaved Changes?"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmCloseUnsaved(false)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Keep Editing
            </button>
            <button
              onClick={() => {
                setConfirmCloseUnsaved(false);
                setEditingType(null);
                setTemplateDirty(false);
              }}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 min-h-[44px]"
            >
              Discard Changes
            </button>
          </div>
        }
      >
        <p className="text-gray-700">
          You have unsaved changes to this template. Are you sure you want to close without saving?
        </p>
      </Dialog>
    </div>
  );
}
