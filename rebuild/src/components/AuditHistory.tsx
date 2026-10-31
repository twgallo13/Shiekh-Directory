import { useState, useEffect } from 'react';
import { History, ChevronDown, ChevronUp, User, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { AuditLogEntry, AuditAction, UserRole } from '../types';

interface AuditHistoryProps {
  locationId: string;
  locationName: string;
}

const ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  reject: 'Rejected',
  assign: 'Assigned',
  unassign: 'Unassigned',
  'closure:start': 'Closure started',
  'closure:end': 'Closure ended',
  send: 'Sent',
  respond: 'Responded',
  cancel: 'Cancelled',
  deny: 'Access denied',
  'request-signin': 'Sign-in requested',
  'use-signin-token': 'Sign-in token used',
  'one-click-confirm': 'One-click confirmed',
  'one-click-update': 'One-click update',
  'logout': 'Logged out',
  'revoke-session': 'Session revoked',
  'revoke-all-sessions': 'All sessions revoked',
};

const ROLE_COLORS: Record<UserRole, string> = {
  Viewer: 'bg-gray-100 text-gray-700',
  Store: 'bg-blue-100 text-blue-700',
  Leader: 'bg-purple-100 text-purple-700',
  Steward: 'bg-green-100 text-green-700',
  Admin: 'bg-red-100 text-red-700',
};

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function formatFieldName(field: string): string {
  const fieldLabels: Record<string, string> = {
    mainPhone: 'Phone',
    sharedInboxEmail: 'Email',
    address: 'Address',
    standardHours: 'Hours',
    name: 'Name',
    storeType: 'Store Type',
    mallOrCenterName: 'Mall/Center',
    wayfindingDirections: 'Directions',
    status: 'Status',
    reason: 'Reason',
  };
  return fieldLabels[field] || field.replace(/([A-Z])/g, ' $1').trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'object') {
    if ('street' in (value as Record<string, unknown>)) {
      const addr = value as { street: string; city: string; state: string; zip: string };
      return `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`;
    }
    return 'Updated';
  }
  return String(value);
}

export function AuditHistory({ locationId }: AuditHistoryProps) {
  const { getIdToken, authUser } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchAudit() {
      try {
        const token = await getIdToken();
        const response = await fetch(`/api/app/audit/location/${locationId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (response.status === 403) {
            setError('You do not have permission to view audit history');
          } else {
            setError('Failed to load audit history');
          }
          return;
        }

        const { data } = await response.json();
        setEntries(data || []);
      } catch {
        setError('Failed to load audit history');
      } finally {
        setLoading(false);
      }
    }

    if (isExpanded) {
      fetchAudit();
    }
  }, [locationId, getIdToken, isExpanded]);

  const toggleEntry = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canViewAudit = authUser?.role === 'Steward' || authUser?.role === 'Admin' || authUser?.role === 'Leader';

  if (!canViewAudit) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <History className="w-4 h-4" />
          Change History
        </h3>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-sm text-gray-500 mt-2">Loading history...</p>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No changes recorded yet
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {entries.map(entry => (
                <div key={entry.id} className="p-3">
                  <button
                    onClick={() => toggleEntry(entry.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">
                            {ACTION_LABELS[entry.action] || entry.action}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${ROLE_COLORS[entry.userRole]}`}>
                            {entry.userRole}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                          <User className="w-3 h-3" />
                          <span className="truncate">{entry.userEmail}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(entry.timestamp)}
                      </div>
                    </div>
                  </button>

                  {expandedEntries.has(entry.id) && entry.changes.length > 0 && (
                    <div className="mt-2 pl-2 border-l-2 border-gray-200 space-y-1">
                      {entry.changes.map((change, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-medium text-gray-700">
                            {formatFieldName(change.field)}:
                          </span>
                          {change.oldValue !== undefined && (
                            <span className="text-red-600 line-through ml-1">
                              {formatValue(change.oldValue)}
                            </span>
                          )}
                          {change.newValue !== undefined && (
                            <span className="text-green-600 ml-1">
                              {formatValue(change.newValue)}
                            </span>
                          )}
                        </div>
                      ))}
                      {entry.previousVersion !== undefined && entry.newVersion !== undefined && (
                        <div className="text-xs text-gray-400">
                          Version {entry.previousVersion} → {entry.newVersion}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
