import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Database, 
  Download, 
  Upload, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  HardDrive, 
  FileCheck, 
  Calendar, 
  Plus, 
  Layers,
  Sparkles,
  Server,
  RefreshCw
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { AppEnvironment } from '../../types';

export const BackupRecoveryPanel: React.FC = () => {
  const { 
    locations, 
    people, 
    requests, 
    auditLogs, 
    users, 
    environment, 
    setEnvironment,
    backupSnapshots,
    lastAutomatedBackupTime,
    exportDatabaseBackup, 
    importDatabaseBackup, 
    createManualBackup, 
    resetToDefaultBaseline, 
    currentUser 
  } = useDirectory();

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotSuccessMessage, setSnapshotSuccessMessage] = useState<string | null>(null);
  const [manualSnapshotName, setManualSnapshotName] = useState('');
  const [showSnapshotDialog, setShowSnapshotDialog] = useState(false);

  const handleExportBackup = () => {
    const json = exportDatabaseBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shiekh-directory-sor-backup-${environment.toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestoreBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      const success = importDatabaseBackup(content);
      if (success) {
        setImportStatus('Database successfully restored from JSON backup snapshot.');
        setTimeout(() => setImportStatus(null), 5000);
      } else {
        alert('Failed to parse and restore database backup. Please ensure the file is a valid SoR export.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCreateManualSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingSnapshot(true);
    const snap = createManualBackup(manualSnapshotName.trim() || undefined);
    setIsCreatingSnapshot(false);
    setShowSnapshotDialog(false);
    setManualSnapshotName('');
    setSnapshotSuccessMessage(`Point-in-time snapshot "${snap.name}" created successfully (${snap.recordCounts.locations} stores, ${snap.recordCounts.people} personnel).`);
    setTimeout(() => setSnapshotSuccessMessage(null), 5000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Status & Environment Management */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-red-600" />
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Disaster Recovery, Database Snapshots & Environment Security (Sec 22)
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Authoritative System of Record (SoR) point-in-time snapshot management, export/restore pipelines, and automated backup schedules.
            </p>
          </div>

          {/* Create Snapshot Trigger */}
          <button
            onClick={() => setShowSnapshotDialog(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Create Point-in-Time Snapshot</span>
          </button>
        </div>

        {/* Snapshot / Import Feedback Banners */}
        {snapshotSuccessMessage && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-bold animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{snapshotSuccessMessage}</span>
          </div>
        )}

        {importStatus && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-lg text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2 font-bold animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        {/* Snapshot Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="flex items-center gap-2 text-neutral-500 text-xs font-semibold">
              <Clock className="w-4 h-4 text-neutral-400" />
              <span>Last Automated Backup</span>
            </div>
            <div className="mt-1 font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {new Date(lastAutomatedBackupTime).toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>GCP Cloud Scheduler Cron Active (Daily 02:00 UTC)</span>
            </div>
          </div>

          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="flex items-center gap-2 text-neutral-500 text-xs font-semibold">
              <HardDrive className="w-4 h-4 text-neutral-400" />
              <span>Available SoR Snapshots</span>
            </div>
            <div className="mt-1 text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {backupSnapshots.length} Snapshots
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Across automated cron & manual audit baselines
            </div>
          </div>

          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="flex items-center gap-2 text-neutral-500 text-xs font-semibold">
              <Layers className="w-4 h-4 text-neutral-400" />
              <span>Current Target Environment</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className={`px-2 py-0.5 text-xs rounded font-bold uppercase ${
                environment === 'PRODUCTION' 
                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' 
                  : environment === 'STAGING'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
              }`}>
                {environment}
              </span>
              <select
                value={environment}
                onChange={e => setEnvironment(e.target.value as AppEnvironment)}
                className="px-2 py-0.5 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-xs text-neutral-800 dark:text-neutral-200 font-semibold"
              >
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="STAGING">STAGING</option>
                <option value="DEVELOPMENT">DEVELOPMENT</option>
              </select>
            </div>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Controls database partitioning & API headers
            </div>
          </div>
        </div>
      </div>

      {/* Snapshot History Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-neutral-500" />
            <h3 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 uppercase tracking-wider">
              Authoritative Point-in-Time Snapshot Registry
            </h3>
          </div>
          <span className="text-xs text-neutral-400 font-semibold">
            {backupSnapshots.length} Available Snapshots
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400 font-semibold">
                <th className="py-2.5 px-4">Snapshot Name & Description</th>
                <th className="py-2.5 px-4">Created Timestamp</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4">Entity Counts</th>
                <th className="py-2.5 px-4">Size</th>
                <th className="py-2.5 px-4">Created By</th>
                <th className="py-2.5 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {backupSnapshots.map(snap => (
                <tr key={snap.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-neutral-900 dark:text-neutral-100">
                      {snap.name}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-400">
                      ID: {snap.id}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-700 dark:text-neutral-300">
                    {new Date(snap.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      snap.type === 'automated' 
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' 
                        : 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                    }`}>
                      {snap.type}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-neutral-600 dark:text-neutral-300">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-semibold">{snap.recordCounts.locations} Stores</span>
                      <span>·</span>
                      <span className="font-semibold">{snap.recordCounts.people} Personnel</span>
                      <span>·</span>
                      <span className="text-neutral-400">{snap.recordCounts.auditLogs} Audit Logs</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-neutral-600 dark:text-neutral-300">
                    {formatBytes(snap.sizeBytes)}
                  </td>
                  <td className="py-3 px-4 text-neutral-600 dark:text-neutral-400">
                    {snap.createdBy}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{snap.status}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual JSON Export / Import and Baseline Reset */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
            <Download className="w-4 h-4 text-neutral-500" />
            <span>Export Authoritative JSON Backup Archive</span>
          </h3>
          <p className="text-xs text-neutral-500">
            Export a complete offline JSON file containing all {locations.length} store records, {people.length} personnel, role assignments, audit logs, and SMTP configuration.
          </p>
          <button
            onClick={handleExportBackup}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download Offline JSON Backup</span>
          </button>
        </div>

        <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-neutral-900 dark:text-neutral-100 uppercase tracking-wider flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-neutral-500" />
            <span>Restore Master State from JSON File</span>
          </h3>
          <p className="text-xs text-neutral-500">
            Select a verified Shiekh Shoes SoR backup JSON archive to restore complete store data and personnel records.
          </p>
          <label className="inline-block px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-bold cursor-pointer transition-colors">
            <span>Select JSON Backup File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleRestoreBackupFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Emergency Baseline Reset Danger Zone */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-red-200 dark:border-red-900/60 shadow-xs space-y-2">
        <h3 className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4" />
          <span>Emergency Canonical Baseline Reset</span>
        </h3>
        <p className="text-xs text-neutral-500">
          Resets all local storage state back to the original 30+ Shiekh Shoes retail stores and executive personnel seed data.
        </p>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
        >
          Reset Master Database to Factory Baseline
        </button>
      </div>

      {/* CREATE MANUAL SNAPSHOT DIALOG */}
      {showSnapshotDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  Create Point-in-Time SoR Snapshot
                </h3>
              </div>
              <button
                onClick={() => setShowSnapshotDialog(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualSnapshot} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                  Snapshot Name / Memo *
                </label>
                <input
                  type="text"
                  required
                  value={manualSnapshotName}
                  onChange={e => setManualSnapshotName(e.target.value)}
                  placeholder="e.g. Pre-Q4 Mall Expansion Snapshot"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                />
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-1.5 text-neutral-600 dark:text-neutral-400">
                <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                  Target Snapshot Scope:
                </div>
                <ul className="list-disc list-inside text-[11px] space-y-0.5">
                  <li>{locations.length} Store Location Records</li>
                  <li>{people.length} Leadership & Personnel Contacts</li>
                  <li>{requests.length} Pending Update Requests</li>
                  <li>{auditLogs.length} Immutable Audit Log Entries</li>
                  <li>{users.length} Authenticated User Accounts & Scopes</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSnapshotDialog(false)}
                  className="px-3.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingSnapshot}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {isCreatingSnapshot && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Generate Snapshot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET CONFIRMATION MODAL */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-base">Reset Master Database?</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              This will restore all retail stores, people, and leadership assignments back to the initial canonical baseline.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  resetToDefaultBaseline();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
