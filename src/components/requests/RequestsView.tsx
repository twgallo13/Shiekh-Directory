import React, { useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { UpdateRequest } from '../../types';
import { GitPullRequest, Check, X, Clock, AlertCircle, ShieldCheck } from 'lucide-react';

interface RequestsViewProps {
  onOpenNewRequest: () => void;
}

const formatFieldName = (key: string): string => {
  const customLabels: Record<string, string> = {
    standardHours: 'Standard Operating Hours',
    operationalStatus: 'Operational Status',
    activeNotice: 'Temporary Operational Notice',
    storeManagerId: 'Store Manager ID',
    storeManagerName: 'Store Manager Name',
    storeManagerPhone: 'Store Manager Phone',
    storeManagerPhonePrivacy: 'Manager Phone Privacy',
    districtManagerName: 'District Manager Name',
    districtManagerId: 'District Manager ID',
    phone: 'Store Public Phone',
    phonePrivacy: 'Phone Privacy Level',
    address: 'Street Address',
    mallOrCenterName: 'Mall / Shopping Center',
    city: 'City',
    state: 'State',
    zipCode: 'Postal / ZIP Code',
    timeZone: 'Time Zone',
    googleReviewUrl: 'Google Review URL',
    storePageUrl: 'Store Webpage URL',
    recordStatus: 'Record Status',
    hoursSource: 'Hours Template Reference'
  };

  if (customLabels[key]) return customLabels[key];

  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
};

const renderFormattedValue = (value: unknown): React.ReactNode => {
  if (value === null || value === undefined) {
    return <span className="text-neutral-400 italic">None</span>;
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value !== 'object') {
    return String(value);
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-neutral-400 italic">None</span>;
    if (value.every(v => typeof v === 'string' || typeof v === 'number')) {
      return value.join(', ');
    }
    return (
      <pre className="text-[10px] font-mono whitespace-pre-wrap bg-neutral-100/80 p-1.5 rounded border border-neutral-200">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }

  const obj = value as Record<string, any>;

  // Check if standardHours (WeeklySchedule)
  const dayKeys = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const hasDays = dayKeys.some(day => day in obj);
  if (hasDays) {
    return (
      <div className="space-y-1 text-[11px] font-mono bg-neutral-100/60 p-2 rounded border border-neutral-200/80">
        {dayKeys.map(day => {
          const d = obj[day];
          if (!d) return null;
          const dayLabel = day.charAt(0).toUpperCase() + day.slice(1, 3);
          return (
            <div key={day} className="flex items-center justify-between">
              <span className="text-neutral-500 font-semibold">{dayLabel}:</span>
              <span className={d.isClosed ? 'text-rose-600 font-semibold' : 'text-neutral-800'}>
                {d.isClosed ? 'Closed' : `${d.open || ''} - ${d.close || ''}`}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Check if activeNotice (TemporaryNotice)
  if ('shortDescription' in obj || 'message' in obj || 'noticeText' in obj) {
    return (
      <div className="text-[11px] space-y-1 bg-amber-50/60 p-2 rounded border border-amber-200/70 text-amber-950">
        <div className="font-semibold text-amber-900">
          {obj.shortDescription || obj.message || obj.noticeText}
        </div>
        {(obj.effectiveDate || obj.startDate) && (
          <div className="text-[10px] text-amber-800/80">
            Effective: {obj.effectiveDate || obj.startDate}
            {(obj.expectedResolutionDate || obj.endDate) ? ` → ${obj.expectedResolutionDate || obj.endDate}` : ''}
          </div>
        )}
      </div>
    );
  }

  // Default formatting for any generic object
  return (
    <pre className="text-[10px] font-mono whitespace-pre-wrap bg-neutral-100/80 p-1.5 rounded border border-neutral-200 overflow-x-auto">
      {JSON.stringify(obj, null, 2)}
    </pre>
  );
};

export const RequestsView: React.FC<RequestsViewProps> = ({ onOpenNewRequest }) => {
  const { requests, currentUser, approveRequest, rejectRequest } = useDirectory();
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [reviewerNotes, setReviewerNotes] = useState<{ [id: string]: string }>({});

  const canReview = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const filtered = requests.filter(r => {
    if (filter === 'All') return true;
    return r.status === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Store Change & Correction Requests</h2>
          <p className="text-xs text-neutral-500">
            Governance workflow for phone numbers, manager changes, and operating status
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewRequest}
          className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
        >
          Submit New Request
        </button>
      </div>

      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
        {(['All', 'Pending', 'Approved', 'Rejected'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              filter === tab
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map(req => {
          const isPending = req.status === 'Pending';
          return (
            <div
              key={req.id}
              className="p-4 bg-white border border-neutral-200 rounded-xl space-y-3 shadow-xs"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 text-xs">
                      #{req.targetStoreNumber || 'N/A'}
                    </span>
                    <h3 className="font-bold text-sm text-neutral-900">{req.targetName}</h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-neutral-100 text-neutral-700 font-medium">
                      {req.changeType}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Requested by <strong className="text-neutral-800">{req.requestedBy.name}</strong> ({req.requestedBy.role}) on {new Date(req.requestedAt).toLocaleString()}
                  </div>
                </div>

                <div>
                  {req.status === 'Pending' && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Pending Review
                    </span>
                  )}
                  {req.status === 'Approved' && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5" /> Approved
                    </span>
                  )}
                  {req.status === 'Rejected' && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1.5">
                      <X className="w-3.5 h-3.5" /> Rejected
                    </span>
                  )}
                </div>
              </div>

              {/* Request Details Comparison */}
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-xs space-y-3">
                <div className="font-bold text-xs uppercase tracking-wider text-neutral-800">
                  PROPOSED CHANGE COMPARISON (DIFF)
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Left Column (Baseline) */}
                  <div className="p-3 bg-white rounded-lg border border-neutral-200 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-100 pb-1.5">
                      CURRENT AUTHORITATIVE VALUE
                    </div>
                    {Object.entries(req.currentSnapshot || {}).length === 0 ? (
                      <div className="text-neutral-400 italic text-[11px]">No baseline snapshot recorded</div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(req.currentSnapshot || {}).map(([key, val]) => (
                          <div key={key} className="space-y-0.5 pb-2 border-b border-neutral-100 last:border-0 last:pb-0">
                            <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider block">
                              {formatFieldName(key)}
                            </span>
                            <div className="text-xs text-neutral-700 font-normal">
                              {renderFormattedValue(val)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Column (Requested Changes) */}
                  <div className="p-3 bg-emerald-50/50 rounded-lg border border-emerald-200 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 border-b border-emerald-200/60 pb-1.5">
                      REQUESTED NEW VALUE
                    </div>
                    {Object.entries(req.requestedChanges || {}).length === 0 ? (
                      <div className="text-neutral-400 italic text-[11px]">No changes requested</div>
                    ) : (
                      <div className="space-y-2">
                        {Object.entries(req.requestedChanges || {}).map(([key, val]) => (
                          <div key={key} className="space-y-0.5 pb-2 border-b border-emerald-100 last:border-0 last:pb-0">
                            <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
                              {formatFieldName(key)}
                            </span>
                            <div className="text-xs font-bold text-emerald-900">
                              {renderFormattedValue(val)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {req.reason && (
                  <div className="text-neutral-600 text-xs pt-1 border-t border-neutral-200">
                    <span className="font-semibold text-neutral-800">Reason / Notes: </span>
                    {req.reason}
                  </div>
                )}
              </div>

              {/* Reviewer Action Bar */}
              {isPending && canReview && (
                <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-3">
                  <input
                    type="text"
                    placeholder="Optional reviewer notes..."
                    value={reviewerNotes[req.id] || ''}
                    onChange={(e) => setReviewerNotes({ ...reviewerNotes, [req.id]: e.target.value })}
                    className="flex-1 px-3 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500 focus:bg-white"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => rejectRequest(req.id, reviewerNotes[req.id])}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => approveRequest(req.id, reviewerNotes[req.id])}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve & Apply</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="p-8 text-center bg-white border border-neutral-200 rounded-xl text-neutral-500 text-xs shadow-xs">
            No change requests match this filter.
          </div>
        )}
      </div>
    </div>
  );
};
