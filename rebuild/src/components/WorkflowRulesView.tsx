import { useState, useEffect, useCallback } from 'react';
import { Settings, RotateCcw, Loader2, Clock, Calendar, Mail, Users, Shield, History } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

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

  useEffect(() => {
    fetchRules();
    fetchHistory();
  }, [fetchRules, fetchHistory]);

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

      <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">About Workflow Rules</p>
        <p>
          These settings control automated workflows for store verification. Changes take effect immediately 
          and are applied to new requests. In-progress verifications use the settings that were active when they started.
        </p>
      </div>
    </div>
  );
}
