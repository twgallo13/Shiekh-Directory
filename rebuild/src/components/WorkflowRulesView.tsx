import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Settings, RotateCcw, Loader2, Clock, Calendar, Mail, Users, Shield, History, FileText, Eye, EyeOff, AlertTriangle, Store, Building2, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Dialog } from './Dialog';

interface WorkflowRules {
  verificationCycleDays: number;
  requestExpiryDays: number;
  reminderLeadDays: number[];
  maxReminders: number;
  minReminderGapHours: number;
  dmEscalationDays: number;
  dmExpiryDays: number;
  invitationExpiryDays: number;
  storeOneClickLinkDays: number;
  signInLinkHours: number;
  storeSessionHours: number;
  correctionExpiryDays: number;
  hoursWrongDmTaskEnabled: boolean;
  hoursWrongDmTaskDueDays: number;
  storeHoursNeedApproval: boolean;
  reminderSendTime: string;
  dmEscalationEnabled: boolean;
}

interface RuleRange {
  min?: number;
  max?: number;
  type: 'number' | 'boolean' | 'array' | 'time';
}

interface HistoryEntry {
  id: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: string;
  userId: string;
  userEmail: string;
}

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

interface EmailType {
  id: string;
  name: string;
  description: string;
  purpose: string;
  audience: string;
  audienceLabel: string;
  placeholders: string[];
}

interface EmailTemplate {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

interface EmailTypeSettings {
  enabled: boolean;
  template?: EmailTemplate;
}

interface EmailSettings {
  masterEnabled: boolean;
  typeSettings: Record<string, EmailTypeSettings>;
  emailTypes: EmailType[];
  defaultTemplates: Record<string, EmailTemplate>;
}

const AUDIENCE_ORDER = ['stores', 'leadership', 'admin'];
const AUDIENCE_ICONS: Record<string, React.ElementType> = {
  stores: Store,
  leadership: Building2,
  admin: User,
};

const RULE_DESCRIPTIONS: Record<keyof WorkflowRules, { label: string; description: string; unit?: string }> = {
  verificationCycleDays: {
    label: 'Verification Cycle',
    description: 'Days between required store hours verifications',
    unit: 'days',
  },
  requestExpiryDays: {
    label: 'Request Expiry',
    description: 'Days until a verification request expires',
    unit: 'days',
  },
  reminderLeadDays: {
    label: 'Reminder Lead Days',
    description: 'Days before expiry to send reminders (e.g., 3,1 sends at 3 days and 1 day before)',
    unit: 'days',
  },
  maxReminders: {
    label: 'Max Reminders',
    description: 'Maximum number of reminder emails per request (0 = no limit)',
    unit: 'reminders',
  },
  minReminderGapHours: {
    label: 'Min Reminder Gap',
    description: 'Minimum hours between sending reminders to the same store',
    unit: 'hours',
  },
  dmEscalationDays: {
    label: 'DM Escalation Days',
    description: 'Days after initial request before escalating to District Manager',
    unit: 'days',
  },
  dmExpiryDays: {
    label: 'DM Request Expiry',
    description: 'Days until a DM verification request expires',
    unit: 'days',
  },
  invitationExpiryDays: {
    label: 'Invitation Expiry',
    description: 'Days until a user invitation link expires',
    unit: 'days',
  },
  storeOneClickLinkDays: {
    label: 'One-Click Link Expiry',
    description: 'Days until store one-click action links expire',
    unit: 'days',
  },
  signInLinkHours: {
    label: 'Sign-In Link Expiry',
    description: 'Hours until store sign-in links expire',
    unit: 'hours',
  },
  storeSessionHours: {
    label: 'Store Session Duration',
    description: 'Hours until a store portal session expires',
    unit: 'hours',
  },
  correctionExpiryDays: {
    label: 'Correction Expiry',
    description: 'Days until pending corrections auto-expire',
    unit: 'days',
  },
  hoursWrongDmTaskEnabled: {
    label: 'Hours Wrong Creates DM Task',
    description: 'Create a task for DM when store reports hours are wrong',
  },
  hoursWrongDmTaskDueDays: {
    label: 'Hours Wrong Task Due',
    description: 'Days until the hours-wrong DM task is due',
    unit: 'days',
  },
  storeHoursNeedApproval: {
    label: 'Hours Changes Need Approval',
    description: 'Require admin approval for store-submitted hours changes',
  },
  reminderSendTime: {
    label: 'Reminder Send Time',
    description: 'Time of day (Pacific) to send reminder emails',
    unit: 'PT',
  },
  dmEscalationEnabled: {
    label: 'DM Escalation Enabled',
    description: 'Automatically escalate to DM after escalation days',
  },
};

const RULE_GROUPS: { name: string; icon: React.ElementType; rules: (keyof WorkflowRules)[] }[] = [
  {
    name: 'Verification Cycle',
    icon: Calendar,
    rules: ['verificationCycleDays', 'requestExpiryDays'],
  },
  {
    name: 'Reminders',
    icon: Mail,
    rules: ['reminderLeadDays', 'maxReminders', 'minReminderGapHours', 'reminderSendTime'],
  },
  {
    name: 'DM Escalation',
    icon: Users,
    rules: ['dmEscalationEnabled', 'dmEscalationDays', 'dmExpiryDays'],
  },
  {
    name: 'Store Portal',
    icon: Shield,
    rules: ['signInLinkHours', 'storeSessionHours', 'storeOneClickLinkDays'],
  },
  {
    name: 'Hours & Corrections',
    icon: Clock,
    rules: ['storeHoursNeedApproval', 'hoursWrongDmTaskEnabled', 'hoursWrongDmTaskDueDays', 'correctionExpiryDays'],
  },
  {
    name: 'Invitations',
    icon: Mail,
    rules: ['invitationExpiryDays'],
  },
];

export function WorkflowRulesView() {
  const { getIdToken } = useAuth();
  const [rules, setRules] = useState<WorkflowRules | null>(null);
  const [defaults, setDefaults] = useState<WorkflowRules | null>(null);
  const [ranges, setRanges] = useState<Record<keyof WorkflowRules, RuleRange> | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  // Email template state
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [editingType, setEditingType] = useState<EmailType | null>(null);
  const [templateForm, setTemplateForm] = useState({ subject: '', bodyHtml: '', bodyText: '' });
  const [templateDirty, setTemplateDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmResetTemplate, setConfirmResetTemplate] = useState(false);
  const templateEditorRef = useRef<HTMLTextAreaElement>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const fetchRules = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/workflow-rules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load workflow rules');
      const { data, defaults: defaultValues, ranges: rangeValues } = await res.json();
      setRules(data);
      setDefaults(defaultValues);
      setRanges(rangeValues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  const fetchHistory = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/workflow-rules/history?limit=50', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setHistory(data);
      }
    } catch {
      // Ignore history fetch errors
    }
  }, [getIdToken]);

  const fetchEmailSettings = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/email-settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setEmailSettings(data);
      }
    } catch {
      // Email settings fetch errors are non-fatal
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchRules();
    fetchHistory();
    fetchEmailSettings();
  }, [fetchRules, fetchHistory, fetchEmailSettings]);

  const toggleTypeEnabled = async (typeId: string, enabled: boolean) => {
    try {
      setSaving(`type-${typeId}`);
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${typeId}/toggle`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchEmailSettings();
      showToast(`Email ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setSaving(null);
    }
  };

  const openTemplateEditor = (type: EmailType) => {
    if (!emailSettings) return;
    const typeSettings = emailSettings.typeSettings[type.id];
    const customTemplate = typeSettings?.template;
    const defaultTemplate = emailSettings.defaultTemplates?.[type.id];
    
    setEditingType(type);
    setTemplateForm({
      subject: customTemplate?.subject || defaultTemplate?.subject || '',
      bodyHtml: customTemplate?.bodyHtml || defaultTemplate?.bodyHtml || '',
      bodyText: customTemplate?.bodyText || defaultTemplate?.bodyText || '',
    });
    setTemplateDirty(false);
    setShowPreview(false);
  };

  const closeTemplateEditor = () => {
    setEditingType(null);
    setTemplateDirty(false);
    setConfirmResetTemplate(false);
  };

  const saveTemplate = async () => {
    if (!editingType) return;
    try {
      setSaving('template');
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
      await fetchEmailSettings();
      setTemplateDirty(false);
      showToast('Template saved');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save', 'error');
    } finally {
      setSaving(null);
    }
  };

  const resetTemplate = async () => {
    if (!editingType) return;
    try {
      setSaving('template');
      const token = await getIdToken();
      const res = await fetch(`/api/app/email-settings/type/${editingType.id}/template/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to reset');
      await fetchEmailSettings();
      const defaultTemplate = emailSettings?.defaultTemplates?.[editingType.id];
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
      setSaving(null);
    }
  };

  const typesByAudience = useMemo(() => {
    if (!emailSettings?.emailTypes) return {};
    return emailSettings.emailTypes.reduce((acc, type) => {
      const audience = type.audience || 'other';
      if (!acc[audience]) acc[audience] = [];
      acc[audience].push(type);
      return acc;
    }, {} as Record<string, EmailType[]>);
  }, [emailSettings]);

  const updateRule = async (field: keyof WorkflowRules, value: unknown) => {
    try {
      setSaving(field);
      const token = await getIdToken();
      const res = await fetch(`/api/app/workflow-rules/${field}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to update');
      }
      const { data } = await res.json();
      setRules(data);
      showToast(`${RULE_DESCRIPTIONS[field].label} updated`);
      fetchHistory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update', 'error');
    } finally {
      setSaving(null);
    }
  };

  const resetRule = async (field: keyof WorkflowRules) => {
    if (!defaults) return;
    try {
      setSaving(field);
      const token = await getIdToken();
      const res = await fetch(`/api/app/workflow-rules/${field}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to reset');
      }
      const { data } = await res.json();
      setRules(data);
      showToast(`${RULE_DESCRIPTIONS[field].label} reset to default`);
      fetchHistory();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to reset', 'error');
    } finally {
      setSaving(null);
    }
  };

  const isModified = (field: keyof WorkflowRules): boolean => {
    if (!rules || !defaults) return false;
    const current = JSON.stringify(rules[field]);
    const defaultValue = JSON.stringify(defaults[field]);
    return current !== defaultValue;
  };

  const formatValue = (value: unknown): string => {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error || !rules || !defaults || !ranges) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error || 'Failed to load workflow rules'}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast container */}
      <div role="status" aria-live="polite" className="fixed top-20 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg ${
              toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-gray-400" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Workflow Rules</h2>
            <p className="text-sm text-gray-600">Configure timings and automation for verification workflows</p>
          </div>
        </div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]"
          aria-pressed={showHistory}
        >
          <History className="w-4 h-4" aria-hidden="true" />
          {showHistory ? 'Hide History' : 'Show History'}
        </button>
      </div>

      {showHistory && history.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-medium text-gray-900 mb-3">Recent Changes</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {history.map(entry => (
              <div key={entry.id} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900">
                    {RULE_DESCRIPTIONS[entry.field as keyof WorkflowRules]?.label || entry.field}
                  </span>
                  <span className="text-gray-500">
                    {new Date(entry.timestamp).toLocaleDateString()} {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div className="text-gray-600">
                  {formatValue(entry.oldValue)} → {formatValue(entry.newValue)}
                </div>
                <div className="text-gray-500">{entry.userEmail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {RULE_GROUPS.map(group => (
        <div key={group.name} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
            <group.icon className="w-5 h-5 text-gray-500" aria-hidden="true" />
            <h3 className="font-semibold text-gray-900">{group.name}</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {group.rules.map(field => {
              const info = RULE_DESCRIPTIONS[field];
              const range = ranges[field];
              const value = rules[field];
              const modified = isModified(field);
              const isSaving = saving === field;

              return (
                <div key={field} className="px-6 py-4 flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <label htmlFor={`rule-${field}`} className="font-medium text-gray-900">
                        {info.label}
                      </label>
                      {modified && (
                        <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded">
                          Modified
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{info.description}</p>
                    {range.type === 'number' && range.min !== undefined && range.max !== undefined && (
                      <p className="text-xs text-gray-500 mt-1">Range: {range.min}–{range.max} {info.unit}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {range.type === 'boolean' ? (
                      <button
                        id={`rule-${field}`}
                        onClick={() => updateRule(field, !value)}
                        disabled={isSaving}
                        className={`relative w-12 h-7 rounded-full transition-colors min-w-[48px] ${
                          value ? 'bg-blue-600' : 'bg-gray-300'
                        } ${isSaving ? 'opacity-50' : ''}`}
                        role="switch"
                        aria-checked={value as boolean}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                            value ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    ) : range.type === 'time' ? (
                      <input
                        id={`rule-${field}`}
                        type="time"
                        value={value as string}
                        onChange={e => updateRule(field, e.target.value)}
                        disabled={isSaving}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                      />
                    ) : range.type === 'array' ? (
                      <input
                        id={`rule-${field}`}
                        type="text"
                        value={(value as number[]).join(', ')}
                        onChange={e => {
                          const parts = e.target.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                          if (parts.length > 0) updateRule(field, parts);
                        }}
                        disabled={isSaving}
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                        placeholder="3, 1"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          id={`rule-${field}`}
                          type="number"
                          min={range.min}
                          max={range.max}
                          value={value as number}
                          onChange={e => {
                            const num = parseInt(e.target.value, 10);
                            if (!isNaN(num)) updateRule(field, num);
                          }}
                          disabled={isSaving}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
                        />
                        {info.unit && <span className="text-sm text-gray-500">{info.unit}</span>}
                      </div>
                    )}
                    {modified && (
                      <button
                        onClick={() => resetRule(field)}
                        disabled={isSaving}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
                        title="Reset to default"
                        aria-label={`Reset ${info.label} to default`}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {isSaving && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Email Templates Section */}
      {emailSettings && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3">
            <Mail className="w-5 h-5 text-gray-500" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-gray-900">Email Templates</h3>
              <p className="text-sm text-gray-600">Control which emails are sent and customize their templates</p>
            </div>
          </div>
          
          {AUDIENCE_ORDER.map(audience => {
            const types = typesByAudience[audience];
            if (!types || types.length === 0) return null;
            const AudienceIcon = AUDIENCE_ICONS[audience] || Users;
            const audienceLabel = types[0]?.audienceLabel || audience;
            
            return (
              <div key={audience} className="border-b border-gray-200 last:border-b-0">
                <div className="px-6 py-3 bg-gray-50 flex items-center gap-2 border-b border-gray-100">
                  <AudienceIcon className="w-4 h-4 text-gray-500" aria-hidden="true" />
                  <span className="text-sm font-medium text-gray-700">{audienceLabel}</span>
                  <span className="text-xs text-gray-500">
                    ({types.filter(t => emailSettings.typeSettings[t.id]?.enabled !== false).length} of {types.length} active)
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {types.map(type => {
                    const typeSettings = emailSettings.typeSettings[type.id];
                    const enabled = typeSettings?.enabled !== false;
                    const hasCustomTemplate = !!typeSettings?.template;
                    const isSavingType = saving === `type-${type.id}`;
                    
                    return (
                      <div key={type.id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{type.name}</span>
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
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => openTemplateEditor(type)}
                            className="px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 min-h-[44px] flex items-center gap-1"
                            aria-label={`Edit template for ${type.name}`}
                          >
                            <FileText className="w-4 h-4" aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            onClick={() => toggleTypeEnabled(type.id, !enabled)}
                            disabled={isSavingType}
                            className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                              enabled
                                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                : 'bg-green-700 text-white hover:bg-green-800'
                            } disabled:opacity-50`}
                            aria-label={enabled ? `Disable ${type.name}` : `Enable ${type.name}`}
                          >
                            {isSavingType ? <Loader2 className="w-4 h-4 animate-spin" /> : enabled ? 'Disable' : 'Enable'}
                          </button>
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

      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">About Workflow Rules</p>
        <p>
          These settings control automated workflows for store verification. Changes take effect immediately 
          and are applied to new requests. In-progress verifications use the settings that were active when they started.
        </p>
      </div>

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
              <button
                onClick={saveTemplate}
                disabled={saving === 'template'}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
              >
                {saving === 'template' ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`px-3 py-2 rounded-lg text-sm font-medium min-h-[44px] flex items-center gap-1 ${
                  showPreview ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {showPreview ? 'Hide Preview' : 'Preview'}
              </button>
              
              {emailSettings?.typeSettings[editingType.id]?.template && (
                <button
                  onClick={() => setConfirmResetTemplate(true)}
                  className="px-3 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium min-h-[44px] flex items-center gap-1"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Reset
                </button>
              )}
              
              {templateDirty && (
                <span className="text-sm text-amber-700 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  Unsaved changes
                </span>
              )}
            </div>

            <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
              <strong>Available placeholders:</strong>{' '}
              {editingType.placeholders.map(p => `{{${p}}}`).join(', ')}
            </div>

            <div className={showPreview ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : ''}>
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              
              {showPreview && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Subject Preview</p>
                    <div className="px-4 py-2 bg-gray-100 rounded-lg text-sm">
                      {templateForm.subject || '(no subject)'}
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Body Preview</p>
                    <div
                      className="border border-gray-300 rounded-lg p-4 bg-white text-sm overflow-auto max-h-[400px]"
                      dangerouslySetInnerHTML={{ __html: templateForm.bodyHtml }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </Dialog>
      )}

      {/* Confirm Reset Dialog */}
      {confirmResetTemplate && (
        <Dialog
          isOpen={true}
          onClose={() => setConfirmResetTemplate(false)}
          title="Reset Template?"
          size="sm"
          footer={
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmResetTemplate(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={resetTemplate}
                disabled={saving === 'template'}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 min-h-[44px]"
              >
                Reset to Default
              </button>
            </div>
          }
        >
          <p className="text-gray-600">
            This will restore the default template and discard any customizations.
          </p>
        </Dialog>
      )}
    </div>
  );
}
