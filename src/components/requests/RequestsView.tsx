import React, { useState } from 'react';
import { 
  GitPullRequest, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertTriangle, 
  User, 
  Building, 
  ChevronRight, 
  Check, 
  X,
  Filter,
  Plus
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { UpdateRequest, RequestStatus } from '../../types';

interface RequestsViewProps {
  onOpenNewRequest: () => void;
  onSelectLocationById: (locId: string) => void;
}

export const RequestsView: React.FC<RequestsViewProps> = ({
  onOpenNewRequest,
  onSelectLocationById,
}) => {
  const { requests, approveUpdateRequest, rejectUpdateRequest, currentUser } = useDirectory();
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [selectedReq, setSelectedReq] = useState<UpdateRequest | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [rejectionModalOpen, setRejectionModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const canApprove = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const filteredRequests = requests.filter(r => {
    if (filterStatus === 'pending') return r.status === 'Submitted' || r.status === 'Under Review';
    if (filterStatus === 'completed') return r.status === 'Approved' || r.status === 'Completed';
    if (filterStatus === 'rejected') return r.status === 'Rejected';
    return true;
  });

  const handleApprove = (req: UpdateRequest) => {
    approveUpdateRequest(req.id, reviewerNotes || 'Approved by Directory Data Steward.');
    setSelectedReq(null);
    setReviewerNotes('');
  };

  const handleReject = (req: UpdateRequest) => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejecting this change request.');
      return;
    }
    rejectUpdateRequest(req.id, rejectionReason.trim());
    setRejectionModalOpen(false);
    setSelectedReq(null);
    setRejectionReason('');
  };

  return (
    <div className="space-y-4">
      {/* Header Banner */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Directory Requests & Correction Queue
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 text-xs font-bold">
              {requests.filter(r => r.status === 'Submitted').length} pending review
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Controlled governance workflow: Submit → Data Steward Review → Integrity Check → Master SoR Update.
          </p>
        </div>

        <button
          onClick={onOpenNewRequest}
          className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Update Request</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-lg w-fit text-xs font-medium">
        {[
          { id: 'pending', label: 'Pending Review', count: requests.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length },
          { id: 'completed', label: 'Approved & Applied', count: requests.filter(r => r.status === 'Approved' || r.status === 'Completed').length },
          { id: 'rejected', label: 'Rejected / Closed', count: requests.filter(r => r.status === 'Rejected').length },
          { id: 'all', label: 'All History', count: requests.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterStatus(tab.id)}
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              filterStatus === tab.id
                ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs font-bold'
                : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <span>{tab.label}</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-neutral-200 dark:bg-neutral-600 rounded-full font-bold">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main Request List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-2" />
            <h3 className="font-bold text-sm text-neutral-700 dark:text-neutral-300">
              No requests in this queue
            </h3>
            <p className="text-xs text-neutral-400 mt-1">
              All store and leadership updates are synchronized with the authoritative system of record.
            </p>
          </div>
        ) : (
          filteredRequests.map(req => {
            const isPending = req.status === 'Submitted' || req.status === 'Under Review';
            return (
              <div
                key={req.id}
                className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-2xs hover:shadow-xs transition-all space-y-3"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-neutral-500">
                      #{req.id}
                    </span>
                    <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                      {req.changeType}
                    </span>
                    <span className="text-neutral-400">•</span>
                    <button
                      onClick={() => onSelectLocationById(req.targetId)}
                      className="font-semibold text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      {req.targetName}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded font-bold ${
                      req.status === 'Approved' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                      req.status === 'Rejected' ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400' :
                      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                    }`}>
                      {req.status}
                    </span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {new Date(req.submittedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Submitter details */}
                <div className="text-xs text-neutral-500 dark:text-neutral-400 flex flex-wrap items-center gap-2">
                  <span>Submitted by: <strong>{req.submittedBy.name}</strong> ({req.submittedBy.role})</span>
                  <span>•</span>
                  <span>Notes: <em className="text-neutral-800 dark:text-neutral-200">"{req.notes}"</em></span>
                </div>

                {/* Visual Diff: Current Snapshot -> Requested Value */}
                <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs">
                  <div className="font-bold text-neutral-400 text-[10px] uppercase tracking-wider mb-1.5">
                    Proposed Change Comparison (Diff)
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-2.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase">Current Authoritative Value</div>
                      <div className="mt-1 font-mono text-xs text-neutral-700 dark:text-neutral-300 space-y-1">
                        {Object.entries(req.currentSnapshot).map(([k, v]) => {
                          if (k === 'standardHours' && v && typeof v === 'object') {
                            const sched = v as any;
                            return (
                              <div key={k} className="text-[11px]">
                                <div className="font-bold text-neutral-500 mb-0.5">Standard Hours:</div>
                                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                                  const dayInfo = sched[day];
                                  if (!dayInfo) return null;
                                  return (
                                    <div key={day} className="flex justify-between text-neutral-600 dark:text-neutral-400 py-0.2">
                                      <span className="capitalize">{day.slice(0, 3)}:</span>
                                      <span>{dayInfo.isClosed ? 'Closed' : `${dayInfo.open} - ${dayInfo.close}`}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          if (k === 'holidayHours' && Array.isArray(v)) {
                            return (
                              <div key={k} className="text-[11px]">
                                <div className="font-bold text-neutral-500 mb-0.5">Holiday Hours:</div>
                                {v.length === 0 ? <div className="text-neutral-400">None</div> : v.map((h: any, i: number) => (
                                  <div key={i} className="text-neutral-600 dark:text-neutral-400">
                                    {h.date}: {h.holidayName} ({h.hours?.isClosed ? 'Closed' : `${h.hours?.open} - ${h.hours?.close}`})
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div key={k} className="break-words">
                              <strong className="text-neutral-400">{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v || 'none')}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-2.5 bg-red-50/50 dark:bg-red-950/20 rounded border border-red-200 dark:border-red-900/60">
                      <div className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase">Requested New Value</div>
                      <div className="mt-1 font-mono text-xs text-red-700 dark:text-red-300 space-y-1 font-bold">
                        {Object.entries(req.requestedChanges).map(([k, v]) => {
                          if (k === 'standardHours' && v && typeof v === 'object') {
                            const sched = v as any;
                            return (
                              <div key={k} className="text-[11px]">
                                <div className="font-bold text-red-600 dark:text-red-400 mb-0.5">Proposed Standard Hours:</div>
                                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                                  const dayInfo = sched[day];
                                  if (!dayInfo) return null;
                                  return (
                                    <div key={day} className="flex justify-between py-0.2 text-red-800 dark:text-red-200">
                                      <span className="capitalize">{day.slice(0, 3)}:</span>
                                      <span>{dayInfo.isClosed ? 'Closed' : `${dayInfo.open} - ${dayInfo.close}`}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          }
                          if (k === 'holidayHours' && Array.isArray(v)) {
                            return (
                              <div key={k} className="text-[11px]">
                                <div className="font-bold text-red-600 dark:text-red-400 mb-0.5">Proposed Holiday Exceptions:</div>
                                {v.map((h: any, i: number) => (
                                  <div key={i} className="text-red-800 dark:text-red-200">
                                    {h.date}: {h.holidayName} ({h.hours?.isClosed ? 'Closed' : `${h.hours?.open} - ${h.hours?.close}`})
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return (
                            <div key={k} className="break-words">
                              <strong className="text-red-500">{k}:</strong> {typeof v === 'object' ? JSON.stringify(v) : String(v || 'none')}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Decision Info if closed */}
                {req.decisionBy && (
                  <div className="text-xs p-2.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
                    <div>
                      <span className="font-bold">{req.status} by {req.decisionBy}</span> on {new Date(req.decisionAt!).toLocaleString()}
                      {req.decisionNotes && <div className="text-neutral-500 italic mt-0.5">"{req.decisionNotes}"</div>}
                    </div>
                  </div>
                )}

                {/* Data Steward Action Buttons */}
                {isPending && canApprove && (
                  <div className="pt-2 flex items-center justify-end gap-2">
                    <button
                      onClick={() => {
                        setSelectedReq(req);
                        setRejectionModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-red-100 hover:text-red-700 rounded text-xs font-medium transition-colors"
                    >
                      Reject Request
                    </button>
                    <button
                      onClick={() => handleApprove(req)}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve & Apply to Master SoR</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Rejection Note Modal */}
      {rejectionModalOpen && selectedReq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              Reject Update Request #{selectedReq.id}
            </h3>
            <p className="text-xs text-neutral-500">
              Please enter the decision notes or reason. The requester ({selectedReq.submittedBy.name}) will be notified by email.
            </p>
            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              placeholder="e.g. Current information verified as accurate; manager transfer postponed."
              className="w-full p-2.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectionModalOpen(false)}
                className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(selectedReq)}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
