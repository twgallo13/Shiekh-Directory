import React, { useState } from 'react';
import { AuditLogEntry } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { 
  History, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  Calendar,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface AuditLogViewProps {
  logs: AuditLogEntry[];
  locationId?: string;
  emptyMessage?: string;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  logs,
  locationId,
  emptyMessage = 'No audit log entries recorded for this location yet.'
}) => {
  const { rollbackAuditChange, currentUser } = useDirectory();
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [rollbackAlert, setRollbackAlert] = useState<{ success: boolean; message: string } | null>(null);

  const canRollback = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const handleRollback = (logId: string) => {
    const result = rollbackAuditChange(logId);
    setRollbackAlert(result);
    setTimeout(() => setRollbackAlert(null), 5000);
  };

  const toggleExpand = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4">
      {/* Alert message if rollback was triggered */}
      {rollbackAlert && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 animate-in fade-in ${
            rollbackAlert.success
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {rollbackAlert.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{rollbackAlert.message}</span>
        </div>
      )}

      {logs.length === 0 ? (
        <div className="p-8 text-center bg-neutral-50 rounded-xl border border-neutral-200 text-neutral-400 space-y-2">
          <History className="w-8 h-8 mx-auto text-neutral-300 stroke-1" />
          <p className="text-xs font-medium">{emptyMessage}</p>
          <p className="text-[11px] text-neutral-400">
            Changes to operating hours, store managers, status, or contact details will appear here.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 border-l-2 border-neutral-200 space-y-4 my-2">
          {logs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const hasStateDiff = Boolean(log.previousState || log.newState);

            return (
              <div key={log.id} className="relative group">
                {/* Timeline node */}
                <div className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-red-500 group-hover:scale-110 transition-transform" />

                <div className="p-3.5 bg-neutral-50 group-hover:bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs space-y-2 transition-colors shadow-2xs">
                  {/* Top Bar: Action & Timestamp */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-neutral-900">{log.action}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700 font-medium">
                        {log.entityType}: {log.entityName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {canRollback && log.previousState && (
                        <button
                          type="button"
                          onClick={() => handleRollback(log.id)}
                          className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-2xs"
                          title="Restore location to state prior to this action"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-700" />
                          <span>Revert</span>
                        </button>
                      )}
                      <div className="flex items-center gap-1 text-[11px] font-mono text-neutral-500">
                        <Calendar className="w-3 h-3 text-neutral-400" />
                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Details Description */}
                  <p className="text-neutral-700 text-xs leading-relaxed font-normal">
                    {log.details}
                  </p>

                  {/* Author / Steward */}
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 border-t border-neutral-200/80 pt-2">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-neutral-400" />
                      <span>
                        Logged by <strong className="text-neutral-800 font-semibold">{log.userName}</strong>
                      </span>
                    </div>

                    {hasStateDiff && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(log.id)}
                        className="text-[10px] font-bold text-red-600 hover:text-red-700 flex items-center gap-0.5 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide Snapshot' : 'View Snapshot'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>

                  {/* State Diff / Snapshot preview if expanded */}
                  {isExpanded && hasStateDiff && (
                    <div className="mt-2 pt-2 border-t border-neutral-200 grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px] font-mono bg-neutral-100 p-2 rounded-lg">
                      {log.previousState && (
                        <div>
                          <div className="font-bold text-neutral-500 mb-1">Previous Snapshot:</div>
                          <pre className="max-h-40 overflow-y-auto text-neutral-700 bg-white p-2 rounded border border-neutral-200 whitespace-pre-wrap">
                            {JSON.stringify(log.previousState, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.newState && (
                        <div>
                          <div className="font-bold text-neutral-500 mb-1">New State:</div>
                          <pre className="max-h-40 overflow-y-auto text-neutral-700 bg-white p-2 rounded border border-neutral-200 whitespace-pre-wrap">
                            {JSON.stringify(log.newState, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
