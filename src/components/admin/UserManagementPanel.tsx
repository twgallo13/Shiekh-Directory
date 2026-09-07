import React from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { ShieldCheck, History, Users, Database } from 'lucide-react';

export const UserManagementPanel: React.FC = () => {
  const { users, auditLogs, currentUser } = useDirectory();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Governance, Audit Logs & Access Control</h2>
        <p className="text-xs text-neutral-500">
          Traceability logs, role-based authorization parameters, and database sync status
        </p>
      </div>

      {/* Role Definitions */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 shadow-xs">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-red-600" />
          <h3 className="text-sm font-bold text-neutral-900">Configured User Roles</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {users.map(u => (
            <div key={u.id} className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-neutral-900">{u.name}</span>
                {u.id === currentUser.id && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-bold border border-red-200">
                    Active
                  </span>
                )}
              </div>
              <div className="text-neutral-500 font-mono text-[11px]">{u.email}</div>
              <div className="text-neutral-600 text-[11px] pt-1 border-t border-neutral-200">
                Role: <strong className="text-neutral-900">{u.role}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 shadow-xs">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-bold text-neutral-900">Audit & Change Log Trail</h3>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {auditLogs.map(log => (
            <div
              key={log.id}
              className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-neutral-600">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-neutral-900">{log.action}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700 font-medium">
                    {log.entityType}: {log.entityName}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-neutral-400">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-neutral-700 text-[11px]">{log.details}</p>
              <div className="text-[10px] text-neutral-500">
                Logged by <strong className="text-neutral-700">{log.userName}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
