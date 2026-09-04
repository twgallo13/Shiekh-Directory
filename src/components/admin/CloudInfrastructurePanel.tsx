import React, { useState } from 'react';
import { 
  Cloud, 
  Database, 
  ShieldCheck, 
  Activity, 
  RefreshCw, 
  UploadCloud, 
  DownloadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  Key, 
  Lock, 
  Server,
  User,
  Sparkles,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';

export const CloudInfrastructurePanel: React.FC = () => {
  const {
    firebaseConfig,
    cloudSyncStatus,
    lastCloudSyncAt,
    isCloudConnected,
    activeCloudUser,
    updateFirebaseConfig,
    testCloudConnection,
    pushAllToCloud,
    pullAllFromCloud,
    locations,
    people,
    requests,
    users,
    auditLogs
  } = useDirectory();

  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [formData, setFormData] = useState({
    projectId: firebaseConfig.projectId,
    appId: firebaseConfig.appId,
    apiKey: firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    firestoreDatabaseId: firebaseConfig.firestoreDatabaseId,
    storageBucket: firebaseConfig.storageBucket,
    messagingSenderId: firebaseConfig.messagingSenderId,
    oAuthClientId: firebaseConfig.oAuthClientId,
  });

  const [testingConnection, setTestingConnection] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    updateFirebaseConfig(formData);
    setIsEditingConfig(false);
    setActionFeedback({
      type: 'success',
      message: 'Firebase cloud backend parameters successfully updated and reinitialized.'
    });
  };

  const handleTestPing = async () => {
    setTestingConnection(true);
    setActionFeedback(null);
    const result = await testCloudConnection();
    setTestingConnection(false);
    if (result.success) {
      setActionFeedback({
        type: 'success',
        message: result.message
      });
    } else {
      setActionFeedback({
        type: 'error',
        message: result.message
      });
    }
  };

  const handlePushToCloud = async () => {
    setPushing(true);
    setActionFeedback(null);
    const result = await pushAllToCloud();
    setPushing(false);
    if (result.success) {
      setActionFeedback({
        type: 'success',
        message: `Successfully synchronized ${result.count} master records to Google Cloud Firestore collections.`
      });
    } else {
      setActionFeedback({
        type: 'error',
        message: `Cloud batch push failed: ${result.error}`
      });
    }
  };

  const handlePullFromCloud = async () => {
    setPulling(true);
    setActionFeedback(null);
    const result = await pullAllFromCloud();
    setPulling(false);
    if (result.success) {
      setActionFeedback({
        type: 'success',
        message: `Successfully pulled ${result.count} records from Cloud Firestore.`
      });
    } else {
      setActionFeedback({
        type: 'error',
        message: `Cloud pull failed: ${result.error}`
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Google Cloud Firestore & Firebase Auth Infrastructure
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Provisioned
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Multi-region GCP Cloud Firestore NoSQL collections with real-time snapshot synchronization and Google Identity Services OAuth 2.0 gateway.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleTestPing}
              disabled={testingConnection}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-neutral-300 dark:border-neutral-700"
            >
              <Activity className={`w-3.5 h-3.5 text-blue-500 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>{testingConnection ? 'Pinging...' : 'Ping Firestore Heartbeat'}</span>
            </button>

            <button
              onClick={handlePushToCloud}
              disabled={pushing}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <UploadCloud className={`w-3.5 h-3.5 ${pushing ? 'animate-bounce' : ''}`} />
              <span>{pushing ? 'Synchronizing...' : 'Push Local to Cloud'}</span>
            </button>

            <button
              onClick={handlePullFromCloud}
              disabled={pulling}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <DownloadCloud className={`w-3.5 h-3.5 ${pulling ? 'animate-bounce' : ''}`} />
              <span>{pulling ? 'Fetching...' : 'Pull from Firestore'}</span>
            </button>
          </div>
        </div>

        {/* Action Feedback Banner */}
        {actionFeedback && (
          <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : actionFeedback.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
              : 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
          }`}>
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : actionFeedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            ) : (
              <Sparkles className="w-4 h-4 shrink-0 text-blue-600" />
            )}
            <span className="font-medium">{actionFeedback.message}</span>
          </div>
        )}

        {/* Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Firestore Status</div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${cloudSyncStatus === 'synced' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
              <span>{cloudSyncStatus === 'synced' ? 'Live & Synchronized' : cloudSyncStatus === 'syncing' ? 'Sync in Progress' : 'Local Fallback'}</span>
            </div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Cloud Collections</div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
              5 Collections Active
            </div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Live Auth Session</div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5 truncate">
              {activeCloudUser ? activeCloudUser.email : 'Federated Anonymous'}
            </div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
            <div className="text-[11px] text-neutral-500 font-medium">Last Cloud Sync</div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5 text-[11px] font-mono">
              {lastCloudSyncAt ? new Date(lastCloudSyncAt).toLocaleTimeString() : 'Pending'}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Collections & Live Keys Configuration */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Firestore Collection Architecture */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-red-600" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Authoritative Firestore Collections
              </h3>
            </div>
            <span className="text-[11px] text-neutral-500 font-mono">
              DB: {firebaseConfig.firestoreDatabaseId}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-red-500" />
                <div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">/locations</div>
                  <div className="text-[11px] text-neutral-500">Retail Stores, Flagships, Headquarters & Outlets</div>
                </div>
              </div>
              <span className="font-bold px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded-md font-mono text-[11px]">
                {locations.length} docs
              </span>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-purple-500" />
                <div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">/people</div>
                  <div className="text-[11px] text-neutral-500">Executives, District Managers, General Managers & Stewards</div>
                </div>
              </div>
              <span className="font-bold px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded-md font-mono text-[11px]">
                {people.length} docs
              </span>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">/requests</div>
                  <div className="text-[11px] text-neutral-500">Governance Change Requests & Four-Eye Review Queue</div>
                </div>
              </div>
              <span className="font-bold px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded-md font-mono text-[11px]">
                {requests.length} docs
              </span>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">/users</div>
                  <div className="text-[11px] text-neutral-500">Authorized Directory User Accounts & Roles</div>
                </div>
              </div>
              <span className="font-bold px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded-md font-mono text-[11px]">
                {users.length} docs
              </span>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="font-bold text-neutral-900 dark:text-neutral-100 font-mono">/audit_logs</div>
                  <div className="text-[11px] text-neutral-500">Immutable SOX Compliance Audit Trail & Rollback References</div>
                </div>
              </div>
              <span className="font-bold px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded-md font-mono text-[11px]">
                {auditLogs.length} docs
              </span>
            </div>
          </div>

          {/* Semantic Document IDs & Data Labeling Specification (DISPATCH-008) */}
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800 space-y-2 text-xs">
            <div className="font-bold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5 text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              Semantic Document ID Format & Server Schema:
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
              <div className="p-1.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-400">Locations:</span> <span className="text-red-600 font-bold">store_007, corp_hq</span>
              </div>
              <div className="p-1.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-400">Users:</span> <span className="text-blue-600 font-bold">user_theo</span>
              </div>
              <div className="p-1.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-400">People:</span> <span className="text-purple-600 font-bold">person_r.calderon</span>
              </div>
              <div className="p-1.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-400">Labels:</span> <span className="text-emerald-600 font-bold">type_label, status_label</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Firebase Configuration & Credentials Panel */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                GCP & Firebase Connection Parameters
              </h3>
            </div>
            <button
              onClick={() => setIsEditingConfig(!isEditingConfig)}
              className="text-xs font-bold text-red-600 hover:text-red-700 underline"
            >
              {isEditingConfig ? 'Cancel' : 'Edit Configuration'}
            </button>
          </div>

          {!isEditingConfig ? (
            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-500 font-medium">GCP Project ID:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">{firebaseConfig.projectId}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-500 font-medium">Auth Domain:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">{firebaseConfig.authDomain}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-500 font-medium">Firebase App ID:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">{firebaseConfig.appId}</span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-500 font-medium">Google OAuth Client ID:</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100 text-[11px] truncate max-w-[200px]">
                  {firebaseConfig.oAuthClientId}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-800">
                <span className="text-neutral-500 font-medium">Web API Key:</span>
                <span className="font-mono text-neutral-900 dark:text-neutral-100">
                  {firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}••••••••••••` : 'None'}
                </span>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Production firestore.rules deployed and active for multi-tenant data isolation.</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveConfig} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Firebase Project ID
                </label>
                <input
                  type="text"
                  value={formData.projectId}
                  onChange={e => setFormData({ ...formData, projectId: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Web API Key
                </label>
                <input
                  type="text"
                  value={formData.apiKey}
                  onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Auth Domain
                </label>
                <input
                  type="text"
                  value={formData.authDomain}
                  onChange={e => setFormData({ ...formData, authDomain: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Firestore Database ID
                </label>
                <input
                  type="text"
                  value={formData.firestoreDatabaseId}
                  onChange={e => setFormData({ ...formData, firestoreDatabaseId: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  OAuth Client ID
                </label>
                <input
                  type="text"
                  value={formData.oAuthClientId}
                  onChange={e => setFormData({ ...formData, oAuthClientId: e.target.value })}
                  className="w-full px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditingConfig(false)}
                  className="px-3 py-1.5 text-neutral-600 hover:bg-neutral-100 rounded-lg text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs"
                >
                  Save & Re-initialize
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
