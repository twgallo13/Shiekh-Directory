import { useState, useEffect, useCallback } from 'react';
import { Mail, Power, PowerOff, Send, Clock, Server, FileText, History, RotateCcw, Eye, AlertTriangle, Check, X, ChevronDown, ChevronRight, RefreshCw, Loader2 } from 'lucide-react';
import { Dialog } from './Dialog';
import { useAuth } from '../context/AuthContext';

interface EmailType {
  id: string;
  name: string;
  description: string;
  placeholders: string[];
  category: string;
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

type SectionId = 'overview' | 'types' | 'templates' | 'sender' | 'smtp' | 'schedule' | 'outbox';

export function EmailSettingsView() {
  const { getIdToken } = useAuth();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [outboxLoading, setOutboxLoading] = useState(false);
  
  const [editingTemplate, setEditingTemplate] = useState<{
    typeId: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
  } | null>(null);
  
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState<{ html: string; subject: string } | null>(null);
  
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 587,
    user: '',
    password: '',
    secure: false,
  });
  
  const [senderForm, setSenderForm] = useState({
    fromName: '',
    fromAddress: '',
    replyTo: '',
    footerText: '',
  });
  
  const [scheduleForm, setScheduleForm] = useState({
    reminderFrequencyDays: 3,
    maxReminders: 3,
    quietHoursStart: '20:00',
    quietHoursEnd: '08:00',
    sendDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as string[],
  });
  
  const [appUrlForm, setAppUrlForm] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [sendingTest, setSendingTest] = useState<string | null>(null);

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
          host: data.smtp.host,
          port: data.smtp.port,
          user: data.smtp.user,
          password: '',
          secure: data.smtp.secure,
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
    } finally {
      setOutboxLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);
  
  useEffect(() => {
    if (activeSection === 'outbox') {
      fetchOutbox();
    }
  }, [activeSection, fetchOutbox]);

  const toggleMaster = async () => {
    if (!settings) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings/master', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !settings.masterEnabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };
  
  const toggleTypeEnabled = async (typeId: string) => {
    if (!settings) return;
    const currentEnabled = settings.typeSettings[typeId]?.enabled !== false;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${typeId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };
  
  const saveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${editingTemplate.typeId}/template`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: editingTemplate.subject,
          bodyHtml: editingTemplate.bodyHtml,
          bodyText: editingTemplate.bodyText,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save template');
      }
      setEditingTemplate(null);
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };
  
  const resetTemplate = async (typeId: string) => {
    if (!confirm('Reset this template to the default? This cannot be undone.')) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${typeId}/template/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to reset template');
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset template');
    } finally {
      setSaving(false);
    }
  };
  
  const restoreVersion = async (typeId: string, version: number) => {
    if (!confirm(`Restore version ${version}? This will create a new version.`)) return;
    try {
      setSaving(true);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${typeId}/template/restore/${version}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to restore version');
      setShowHistory(null);
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore');
    } finally {
      setSaving(false);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
      if (!res.ok) {
        throw new Error(data.error?.message || 'Connection failed');
      }
      alert('SMTP connection successful!');
    } catch (err) {
      alert(`SMTP test failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };
  
  const sendTestEmail = async (typeId: string) => {
    try {
      setSendingTest(typeId);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/test-send/${typeId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to send');
      }
      alert(`Test email sent to ${data.sentTo}`);
    } catch (err) {
      alert(`Failed to send test: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSendingTest(null);
    }
  };
  
  const retryEmail = async (id: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/outbox/${id}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to retry');
      await fetchOutbox();
    } catch (err) {
      alert(`Failed to retry: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading email settings...</span>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
        <p className="mt-4 text-gray-900 font-medium">Failed to load email settings</p>
        <p className="mt-2 text-gray-600">{error}</p>
        <button onClick={fetchSettings} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[44px]">
          Try Again
        </button>
      </div>
    );
  }

  if (!settings) return null;

  const sections: { id: SectionId; label: string; icon: typeof Mail }[] = [
    { id: 'overview', label: 'Overview', icon: Mail },
    { id: 'types', label: 'Email Types', icon: FileText },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'sender', label: 'Sender', icon: Send },
    { id: 'smtp', label: 'SMTP', icon: Server },
    { id: 'schedule', label: 'Schedule', icon: Clock },
    { id: 'outbox', label: 'Outbox', icon: Mail },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800 min-h-[44px] min-w-[44px] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              activeSection === section.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <section.icon className="w-4 h-4" />
            {section.label}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Master Switch */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {settings.effectiveEnabled ? (
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <Power className="w-6 h-6 text-green-600" />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                    <PowerOff className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Email Sending</h2>
                  <p className="text-sm text-gray-600">
                    {settings.effectiveEnabled 
                      ? 'Emails are being sent to recipients'
                      : 'Emails are logged only, not sent'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleMaster}
                disabled={saving}
                className={`px-6 py-2 rounded-lg font-medium min-h-[44px] ${
                  settings.masterEnabled
                    ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    : 'bg-green-600 text-white hover:bg-green-700'
                } disabled:opacity-50`}
              >
                {settings.masterEnabled ? 'Disable' : 'Enable'}
              </button>
            </div>
            
            {/* Status Indicators */}
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className={`rounded-lg p-4 ${settings.masterEnabled ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  {settings.masterEnabled ? <Check className="w-5 h-5 text-green-600" /> : <X className="w-5 h-5 text-gray-400" />}
                  <span className="font-medium text-gray-900">Admin Toggle</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {settings.masterEnabled ? 'Enabled in settings' : 'Disabled in settings'}
                </p>
              </div>
              <div className={`rounded-lg p-4 ${settings.envCutoverEnabled ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  {settings.envCutoverEnabled ? <Check className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
                  <span className="font-medium text-gray-900">Environment Variable</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {settings.envCutoverEnabled 
                    ? 'MAIL_CUTOVER_ENABLED=true' 
                    : 'MAIL_CUTOVER_ENABLED is not set (server safety ceiling)'}
                </p>
              </div>
            </div>
            
            {!settings.effectiveEnabled && (
              <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-amber-800">Emails will not be sent</p>
                    <p className="text-sm text-amber-700 mt-1">
                      {!settings.masterEnabled && !settings.envCutoverEnabled
                        ? 'Both the admin toggle and MAIL_CUTOVER_ENABLED must be enabled'
                        : !settings.masterEnabled
                        ? 'Enable the admin toggle above to start sending'
                        : 'Set MAIL_CUTOVER_ENABLED=true in the server environment'}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* App Base URL */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">App Base URL</h3>
            <p className="text-sm text-gray-600 mb-4">
              The base URL used in email links. Default is the Firebase Hosting URL.
            </p>
            <div className="flex gap-3">
              <input
                type="url"
                value={appUrlForm}
                onChange={(e) => setAppUrlForm(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="https://shiekh-directory-v2.web.app"
              />
              <button
                onClick={saveAppUrl}
                disabled={saving || appUrlForm === settings.appBaseUrl}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
              >
                Save
              </button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-500">Email Types</h3>
              <p className="text-2xl font-bold text-gray-900 mt-1">{settings.emailTypes.length}</p>
              <p className="text-sm text-gray-600">
                {Object.values(settings.typeSettings).filter(t => t.enabled !== false).length} enabled
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-500">SMTP Status</h3>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {settings.smtp.configured ? 'Configured' : 'Not Set'}
              </p>
              <p className="text-sm text-gray-600">
                {settings.smtp.configured ? settings.smtp.host : 'Configure SMTP to send emails'}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-500">Reminders</h3>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                Every {settings.schedule.reminderFrequencyDays} days
              </p>
              <p className="text-sm text-gray-600">
                Max {settings.schedule.maxReminders} per request
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Email Types Section */}
      {activeSection === 'types' && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Email Types</h2>
            <p className="text-sm text-gray-600 mt-1">Enable or disable specific email types</p>
          </div>
          <div className="divide-y divide-gray-100">
            {settings.emailTypes.map(type => {
              const typeSettings = settings.typeSettings[type.id];
              const enabled = typeSettings?.enabled !== false;
              return (
                <div key={type.id} className="p-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">{type.name}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{type.description}</p>
                  </div>
                  <button
                    onClick={() => toggleTypeEnabled(type.id)}
                    disabled={saving}
                    className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                      enabled
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        : 'bg-green-600 text-white hover:bg-green-700'
                    } disabled:opacity-50`}
                  >
                    {enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Templates Section */}
      {activeSection === 'templates' && (
        <div className="space-y-4">
          {settings.emailTypes.map(type => {
            const typeSettings = settings.typeSettings[type.id];
            const hasCustomTemplate = !!typeSettings?.template;
            const history = typeSettings?.templateHistory || [];
            const isExpanded = selectedType === type.id;
            
            return (
              <div key={type.id} className="bg-white rounded-lg border border-gray-200">
                <button
                  onClick={() => setSelectedType(isExpanded ? null : type.id)}
                  className="w-full p-4 flex items-center justify-between text-left min-h-[44px]"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                    <div>
                      <h3 className="font-medium text-gray-900">{type.name}</h3>
                      <p className="text-sm text-gray-500">
                        {hasCustomTemplate ? 'Custom template' : 'Default template'}
                        {history.length > 0 && ` · ${history.length} versions`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {settings.smtp.configured && (
                      <button
                        onClick={(e) => { e.stopPropagation(); sendTestEmail(type.id); }}
                        disabled={sendingTest === type.id}
                        className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 min-h-[36px] flex items-center gap-1"
                      >
                        {sendingTest === type.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Test
                      </button>
                    )}
                  </div>
                </button>
                
                {isExpanded && (
                  <div className="p-4 border-t border-gray-200 space-y-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Available Placeholders</h4>
                      <div className="flex flex-wrap gap-2">
                        {type.placeholders.map(p => (
                          <code key={p} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-700">
                            {`{{${p}}}`}
                          </code>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingTemplate({
                          typeId: type.id,
                          subject: typeSettings?.template?.subject || '',
                          bodyHtml: typeSettings?.template?.bodyHtml || '',
                          bodyText: typeSettings?.template?.bodyText || '',
                        })}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm min-h-[44px]"
                      >
                        Edit Template
                      </button>
                      {hasCustomTemplate && (
                        <button
                          onClick={() => resetTemplate(type.id)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm min-h-[44px]"
                        >
                          Reset to Default
                        </button>
                      )}
                      {history.length > 0 && (
                        <button
                          onClick={() => setShowHistory(type.id)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm min-h-[44px] flex items-center gap-1"
                        >
                          <History className="w-4 h-4" />
                          History
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sender Section */}
      {activeSection === 'sender' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Sender Settings</h2>
          
          <div>
            <label htmlFor="fromName" className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
            <input
              id="fromName"
              type="text"
              value={senderForm.fromName}
              onChange={(e) => setSenderForm({ ...senderForm, fromName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              placeholder="Shiekh Store Directory"
            />
          </div>
          
          <div>
            <label htmlFor="fromAddress" className="block text-sm font-medium text-gray-700 mb-1">From Address</label>
            <input
              id="fromAddress"
              type="email"
              value={senderForm.fromAddress}
              onChange={(e) => setSenderForm({ ...senderForm, fromAddress: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              placeholder="noreply@shiekh.com"
            />
          </div>
          
          <div>
            <label htmlFor="replyTo" className="block text-sm font-medium text-gray-700 mb-1">Reply-To Address (optional)</label>
            <input
              id="replyTo"
              type="email"
              value={senderForm.replyTo}
              onChange={(e) => setSenderForm({ ...senderForm, replyTo: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              placeholder="support@shiekh.com"
            />
          </div>
          
          <div>
            <label htmlFor="footerText" className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
            <textarea
              id="footerText"
              value={senderForm.footerText}
              onChange={(e) => setSenderForm({ ...senderForm, footerText: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="© Shiekh Shoes. All rights reserved."
            />
          </div>
          
          <button
            onClick={saveSender}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Saving...' : 'Save Sender Settings'}
          </button>
        </div>
      )}

      {/* SMTP Section */}
      {activeSection === 'smtp' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">SMTP Configuration</h2>
              <p className="text-sm text-gray-600">Configure your SMTP server for sending emails</p>
            </div>
            {settings.smtp.configured && (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                Configured
              </span>
            )}
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="smtpHost" className="block text-sm font-medium text-gray-700 mb-1">SMTP Host</label>
              <input
                id="smtpHost"
                type="text"
                value={smtpForm.host}
                onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="smtp.example.com"
              />
            </div>
            
            <div>
              <label htmlFor="smtpPort" className="block text-sm font-medium text-gray-700 mb-1">Port</label>
              <input
                id="smtpPort"
                type="number"
                value={smtpForm.port}
                onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value, 10) || 587 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="587"
              />
            </div>
            
            <div>
              <label htmlFor="smtpUser" className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                id="smtpUser"
                type="text"
                value={smtpForm.user}
                onChange={(e) => setSmtpForm({ ...smtpForm, user: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="your-username"
              />
            </div>
            
            <div>
              <label htmlFor="smtpPassword" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                id="smtpPassword"
                type="password"
                value={smtpForm.password}
                onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder={settings.smtp.configured ? '••••••••' : 'Enter password'}
              />
              <p className="text-xs text-gray-500 mt-1">Password is write-only and never displayed</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="smtpSecure"
              checked={smtpForm.secure}
              onChange={(e) => setSmtpForm({ ...smtpForm, secure: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="smtpSecure" className="text-sm text-gray-700">Use SSL/TLS (port 465)</label>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={saveSmtp}
              disabled={saving || !smtpForm.host || !smtpForm.user || !smtpForm.password}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
            >
              {saving ? 'Saving...' : 'Save SMTP Settings'}
            </button>
            
            {settings.smtp.configured && (
              <button
                onClick={testSmtp}
                disabled={testingSmtp}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 min-h-[44px] flex items-center gap-2"
              >
                {testingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Test Connection
              </button>
            )}
          </div>
        </div>
      )}

      {/* Schedule Section */}
      {activeSection === 'schedule' && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Schedule Settings</h2>
          <p className="text-sm text-gray-600">Configure reminder frequency and quiet hours</p>
          
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="reminderFrequency" className="block text-sm font-medium text-gray-700 mb-1">
                Reminder Frequency (days)
              </label>
              <input
                id="reminderFrequency"
                type="number"
                min="1"
                max="30"
                value={scheduleForm.reminderFrequencyDays}
                onChange={(e) => setScheduleForm({ ...scheduleForm, reminderFrequencyDays: parseInt(e.target.value, 10) || 3 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
              <p className="text-xs text-gray-500 mt-1">Days between reminder emails</p>
            </div>
            
            <div>
              <label htmlFor="maxReminders" className="block text-sm font-medium text-gray-700 mb-1">
                Max Reminders
              </label>
              <input
                id="maxReminders"
                type="number"
                min="0"
                max="10"
                value={scheduleForm.maxReminders}
                onChange={(e) => setScheduleForm({ ...scheduleForm, maxReminders: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
              />
              <p className="text-xs text-gray-500 mt-1">Maximum reminders per request (0 = unlimited)</p>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Quiet Hours (America/Los_Angeles)</label>
            <div className="flex items-center gap-4">
              <div>
                <label htmlFor="quietStart" className="block text-xs text-gray-500 mb-1">Start</label>
                <input
                  id="quietStart"
                  type="time"
                  value={scheduleForm.quietHoursStart}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, quietHoursStart: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>
              <span className="text-gray-500">to</span>
              <div>
                <label htmlFor="quietEnd" className="block text-xs text-gray-500 mb-1">End</label>
                <input
                  id="quietEnd"
                  type="time"
                  value={scheduleForm.quietHoursEnd}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, quietHoursEnd: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">No emails will be sent during quiet hours</p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Send Days</label>
            <div className="flex flex-wrap gap-2">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                <button
                  key={day}
                  onClick={() => {
                    const newDays = scheduleForm.sendDays.includes(day)
                      ? scheduleForm.sendDays.filter(d => d !== day)
                      : [...scheduleForm.sendDays, day];
                    setScheduleForm({ ...scheduleForm, sendDays: newDays });
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                    scheduleForm.sendDays.includes(day)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                </button>
              ))}
            </div>
          </div>
          
          <button
            onClick={saveSchedule}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
          >
            {saving ? 'Saving...' : 'Save Schedule Settings'}
          </button>
        </div>
      )}

      {/* Outbox Section */}
      {activeSection === 'outbox' && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Email Outbox</h2>
              <p className="text-sm text-gray-600">View sent emails and retry failed ones</p>
            </div>
            <button
              onClick={fetchOutbox}
              disabled={outboxLoading}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px] flex items-center gap-2"
            >
              {outboxLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
          </div>
          
          {outboxLoading && outbox.length === 0 ? (
            <div className="p-6 text-center text-gray-500">Loading...</div>
          ) : outbox.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No emails in outbox</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {outbox.map(entry => {
                let status: 'sent' | 'logged' | 'failed' | 'suppressed' = 'logged';
                let statusColor = 'bg-gray-100 text-gray-600';
                
                if (entry.blocked) {
                  status = 'suppressed';
                  statusColor = 'bg-amber-100 text-amber-700';
                } else if (entry.success === false) {
                  status = 'failed';
                  statusColor = 'bg-red-100 text-red-700';
                } else if (entry.success) {
                  status = 'sent';
                  statusColor = 'bg-green-100 text-green-700';
                }
                
                return (
                  <div key={entry.id} className="p-4 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 truncate">{entry.to}</span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${statusColor}`}>
                          {status}
                        </span>
                        {entry.isTest && (
                          <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                            test
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 truncate">{entry.type}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(entry.sentAt).toLocaleString()}
                        {entry.reason && ` · ${entry.reason}`}
                        {entry.error && ` · ${entry.error}`}
                      </p>
                    </div>
                    {status === 'failed' && (
                      <button
                        onClick={() => retryEmail(entry.id)}
                        className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 min-h-[36px] flex items-center gap-1"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Retry
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Template Editor Dialog */}
      {editingTemplate && (
        <Dialog
          isOpen={true}
          onClose={() => setEditingTemplate(null)}
          title={`Edit Template: ${settings.emailTypes.find(t => t.id === editingTemplate.typeId)?.name}`}
          size="lg"
          footer={
            <div className="flex gap-3">
              <button
                onClick={() => setEditingTemplate(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowPreview({ html: editingTemplate.bodyHtml, subject: editingTemplate.subject })}
                className="flex-1 py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 min-h-[44px] flex items-center justify-center gap-1"
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
              >
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="templateSubject" className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                id="templateSubject"
                type="text"
                value={editingTemplate.subject}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                placeholder="Email subject with {{placeholders}}"
              />
            </div>
            
            <div>
              <label htmlFor="templateHtml" className="block text-sm font-medium text-gray-700 mb-1">HTML Body</label>
              <textarea
                id="templateHtml"
                value={editingTemplate.bodyHtml}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, bodyHtml: e.target.value })}
                rows={10}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="<html>...</html>"
              />
            </div>
            
            <div>
              <label htmlFor="templateText" className="block text-sm font-medium text-gray-700 mb-1">Plain Text Body</label>
              <textarea
                id="templateText"
                value={editingTemplate.bodyText}
                onChange={(e) => setEditingTemplate({ ...editingTemplate, bodyText: e.target.value })}
                rows={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                placeholder="Plain text version..."
              />
            </div>
          </div>
        </Dialog>
      )}

      {/* History Dialog */}
      {showHistory && (
        <Dialog
          isOpen={true}
          onClose={() => setShowHistory(null)}
          title={`Template History: ${settings.emailTypes.find(t => t.id === showHistory)?.name}`}
          size="lg"
        >
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {(settings.typeSettings[showHistory]?.templateHistory || [])
              .sort((a, b) => b.version - a.version)
              .map(entry => (
                <div key={entry.version} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-medium text-gray-900">Version {entry.version}</span>
                      <span className="text-sm text-gray-500 ml-2">
                        {new Date(entry.changedAt).toLocaleString()} by {entry.changedByEmail}
                      </span>
                    </div>
                    <button
                      onClick={() => restoreVersion(showHistory, entry.version)}
                      disabled={saving}
                      className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded hover:bg-blue-100 min-h-[36px] flex items-center gap-1"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Restore
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 truncate">
                    <strong>Subject:</strong> {entry.subject}
                  </p>
                </div>
              ))}
          </div>
        </Dialog>
      )}

      {/* Preview Dialog */}
      {showPreview && (
        <Dialog
          isOpen={true}
          onClose={() => setShowPreview(null)}
          title="Template Preview"
          size="lg"
        >
          <div className="space-y-4">
            <div className="bg-gray-100 rounded-lg p-3">
              <p className="text-sm text-gray-500">Subject:</p>
              <p className="font-medium text-gray-900">{showPreview.subject}</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
              <div dangerouslySetInnerHTML={{ __html: showPreview.html }} />
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
