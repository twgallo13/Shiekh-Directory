import React, { useState } from 'react';
import { 
  History, 
  RotateCcw, 
  Search, 
  Filter, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  ShieldAlert, 
  User, 
  Building, 
  Layers, 
  Check, 
  ChevronRight,
  ArrowRight
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { AuditEntry } from '../../types';

export const AuditRollbackPanel: React.FC = () => {
  const { auditLogs, rollbackAuditEntry, currentUser } = useDirectory();

  const [filterEntity, setFilterEntity] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAudit, setSelectedAudit] = useState<AuditEntry | null>(null);
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const canRollback = currentUser.role === 'System Administrator' || currentUser.role === 'Directory Data Steward';

  const filteredLogs = auditLogs.filter(log => {
    if (filterEntity !== 'all' && log.entityType !== filterEntity) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        log.entityName.toLowerCase().includes(q) ||
        log.fieldChanged.toLowerCase().includes(q) ||
        log.changedBy.toLowerCase().includes(q) ||
        log.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleExecuteRollback = (audit: AuditEntry) => {
    const outcome = rollbackAuditEntry(audit.id);
    setActionFeedback(outcome);
    setRollbackModalOpen(false);
    setSelectedAudit(null);
    setTimeout(() => setActionFeedback(null), 4000);
  };

  const getEntityIcon = (type: AuditEntry['entityType']) => {
    switch (type) {
      case 'Location':
        return <Building className="w-4 h-4 text-blue-600" />;
      case 'Person':
        return <User className="w-4 h-4 text-purple-600" />;
      case 'User':
        return <User className="w-4 h-4 text-amber-600" />;
      case 'Setting':
        return <Layers className="w-4 h-4 text-neutral-600" />;
      default:
        return <History className="w-4 h-4 text-neutral-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
            <History className="w-5 h-5 text-red-600" />
            <span>Immutable Audit Trail & Point-in-Time Rollback (Blueprint Sec 22)</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Complete cryptographic audit trail recording all store updates, roster transfers, SMTP reconfigurations, and bulk migrations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-mono font-bold text-neutral-700 dark:text-neutral-300">
            {auditLogs.length} Total Audit Events
          </span>
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center gap-2.5 ${
            actionFeedback.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-800 dark:text-red-300'
          }`}
        >
          {actionFeedback.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span className="font-semibold">{actionFeedback.message}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-neutral-500 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            <span>Entity:</span>
          </span>
          {['all', 'Location', 'Person', 'User', 'Setting'].map(ent => (
            <button
              key={ent}
              onClick={() => setFilterEntity(ent)}
              className={`px-2.5 py-1 rounded-md transition-colors ${
                filterEntity === ent
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 font-bold'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              {ent === 'all' ? 'All Entities' : ent}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search audit trail..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-8 pr-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs w-full sm:w-64"
          />
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/70 text-neutral-500 dark:text-neutral-400 font-bold border-b border-neutral-200 dark:border-neutral-800">
                <th className="py-3 px-3 w-28">Audit ID</th>
                <th className="py-3 px-3">Entity & Action</th>
                <th className="py-3 px-3">Before vs. After Comparison</th>
                <th className="py-3 px-3 w-40">Changed By</th>
                <th className="py-3 px-3 w-36">Timestamp</th>
                <th className="py-3 px-3 text-right w-28">Governance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-400 text-xs">
                    No audit records match the current filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => {
                  const isRollbackEvent = log.isRollback || log.fieldChanged.includes('Rollback');

                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors ${
                        isRollbackEvent ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-mono text-[11px] text-neutral-500 font-bold">
                        #{log.id.slice(-8)}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {getEntityIcon(log.entityType)}
                          <div>
                            <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                              <span>{log.entityName}</span>
                              {isRollbackEvent && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[9px] font-bold">
                                  Rollback
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-medium">{log.fieldChanged}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-1 max-w-sm">
                          {log.previousValue && (
                            <div className="flex items-start gap-1 text-[11px] text-neutral-500 font-mono truncate">
                              <span className="text-red-500 font-bold">Old:</span>
                              <span className="truncate">{log.previousValue}</span>
                            </div>
                          )}
                          <div className="flex items-start gap-1 text-[11px] text-neutral-800 dark:text-neutral-200 font-mono font-semibold truncate">
                            <span className="text-emerald-600 font-bold">New:</span>
                            <span className="truncate">{log.newValue}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {log.changedBy}
                        </div>
                        {log.relatedRequestId && (
                          <div className="text-[10px] text-neutral-400 font-mono">
                            Req: #{log.relatedRequestId}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3 text-[11px] text-neutral-500 font-mono">
                        <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                        <div className="text-[10px] text-neutral-400">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right">
                        {canRollback && log.previousValue && !isRollbackEvent && (
                          <button
                            onClick={() => {
                              setSelectedAudit(log);
                              setRollbackModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-neutral-100 hover:bg-red-50 hover:text-red-700 dark:bg-neutral-800 dark:hover:bg-red-950 text-neutral-700 dark:text-neutral-300 rounded text-[11px] font-bold flex items-center gap-1 transition-colors ml-auto"
                            title="Revert to previous value"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Rollback</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rollback Confirmation Modal */}
      {rollbackModalOpen && selectedAudit && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600 font-bold text-base">
              <ShieldAlert className="w-5 h-5" />
              <span>Confirm Rollback Governance Action</span>
            </div>

            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              You are about to revert the following change in the authoritative master system of record:
            </p>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2 text-xs">
              <div className="font-bold text-neutral-900 dark:text-neutral-100">
                {selectedAudit.entityName} ({selectedAudit.fieldChanged})
              </div>

              <div className="p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-900">
                <div className="text-[10px] text-red-600 uppercase font-bold">Current Active Value (Will be overwritten)</div>
                <div className="font-mono text-xs text-red-900 dark:text-red-200 truncate mt-0.5">
                  {selectedAudit.newValue}
                </div>
              </div>

              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded border border-emerald-200 dark:border-emerald-900">
                <div className="text-[10px] text-emerald-600 uppercase font-bold">Restoring Value To (Previous State)</div>
                <div className="font-mono text-xs text-emerald-900 dark:text-emerald-200 truncate font-bold mt-0.5">
                  {selectedAudit.previousValue}
                </div>
              </div>
            </div>

            <div className="text-[11px] text-neutral-500 italic">
              This rollback will be cryptographically documented as a new governance audit event.
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRollbackModalOpen(false)}
                className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExecuteRollback(selectedAudit)}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Confirm & Apply Rollback</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
