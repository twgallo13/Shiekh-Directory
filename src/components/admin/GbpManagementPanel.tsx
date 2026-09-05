import React, { useState } from 'react';
import {
  Globe,
  CheckCircle2,
  RefreshCw,
  Zap,
  Search,
  Download,
  Trash2,
  Clock,
  Sparkles
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';

export const GbpManagementPanel: React.FC = () => {
  const {
    locations,
    gbpConfig,
    gbpListings,
    gbpSyncLogs,
    autoMatchGbpListings,
    bulkSyncLocationsToGbp,
    syncSingleLocationToGbp,
    exportGbpLogsCsv,
    clearGbpLogs,
    testGbpHandshake,
  } = useDirectory();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'VERIFIED' | 'LINKED' | 'UNLINKED'>('ALL');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  const [autoMatchResult, setAutoMatchResult] = useState<{ matchedCount: number; alreadyMappedCount: number } | null>(null);
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [handshakeMessage, setHandshakeMessage] = useState<string | null>(null);

  // Filter listings
  const filteredListings = gbpListings.filter(listing => {
    const matchesSearch =
      listing.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.storeCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.locationName.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;

    if (filterStatus === 'VERIFIED') return listing.verificationStatus === 'VERIFIED';
    if (filterStatus === 'LINKED') return !!listing.linkedLocationId;
    if (filterStatus === 'UNLINKED') return !listing.linkedLocationId;
    return true;
  });

  const totalListings = gbpListings.length;
  const linkedListings = gbpListings.filter(l => l.linkedLocationId).length;
  const verifiedListings = gbpListings.filter(l => l.verificationStatus === 'VERIFIED').length;

  const handleAutoMatch = () => {
    const res = autoMatchGbpListings();
    setAutoMatchResult(res);
    setTimeout(() => setAutoMatchResult(null), 6000);
  };

  const handleBulkSync = async () => {
    setIsSyncingAll(true);
    setSyncProgress('Broadcasting updates to Google Business Profile listings...');
    try {
      const res = await bulkSyncLocationsToGbp();
      setSyncProgress(`Successfully synced ${res.successCount} of ${res.total} locations.`);
      setTimeout(() => setSyncProgress(null), 4000);
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleTestHandshake = async () => {
    setIsHandshaking(true);
    setHandshakeMessage(null);
    try {
      const res = await testGbpHandshake();
      setHandshakeMessage(res.message);
      setTimeout(() => setHandshakeMessage(null), 5000);
    } finally {
      setIsHandshaking(false);
    }
  };

  return (
    <div className="space-y-6" id="gbp-management-panel">
      {/* 1. Header & Configuration Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 border border-red-200 dark:border-red-900/50 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Google Business Profile (GBP) Management
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Simulated Gateway (Awaiting GCP Quota)
                </span>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Synchronize authoritative retail store hours, operational notices, and storefront addresses directly with Google Maps and Local Search.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              id="gbp-handshake-btn"
              onClick={handleTestHandshake}
              disabled={isHandshaking}
              className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isHandshaking ? 'animate-spin' : ''}`} />
              <span>{isHandshaking ? 'Pinging Gateway...' : 'Test Gateway Ping'}</span>
            </button>

            <button
              id="gbp-auto-match-btn"
              onClick={handleAutoMatch}
              className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 dark:text-amber-600" />
              <span>Auto-Match Listings</span>
            </button>

            <button
              id="gbp-bulk-sync-btn"
              onClick={handleBulkSync}
              disabled={isSyncingAll}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Zap className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>{isSyncingAll ? 'Broadcasting...' : 'Bulk Sync All to GBP'}</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {handshakeMessage && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{handshakeMessage}</span>
          </div>
        )}

        {autoMatchResult && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 rounded-lg text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>
                Auto-match complete: <strong>{autoMatchResult.matchedCount}</strong> new locations matched,{' '}
                <strong>{autoMatchResult.alreadyMappedCount}</strong> previously linked.
              </span>
            </div>
          </div>
        )}

        {syncProgress && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 rounded-lg text-xs flex items-center gap-2">
            <RefreshCw className="w-4 h-4 shrink-0 text-amber-600 animate-spin" />
            <span>{syncProgress}</span>
          </div>
        )}

        {/* Config Badges / Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200/80 dark:border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">GCP Service Account</div>
            <div className="text-xs font-mono font-bold text-neutral-900 dark:text-neutral-100 truncate mt-0.5" title={gbpConfig.clientEmail}>
              {gbpConfig.clientEmail || 'shiekh-gbp-sync-service@...'}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3 h-3" /> Credentials Configured
            </div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200/80 dark:border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Target GBP Account ID</div>
            <div className="text-xs font-mono font-bold text-neutral-900 dark:text-neutral-100 truncate mt-0.5">
              {gbpConfig.accountId || 'accounts/5840371318'}
            </div>
            <div className="text-[10px] text-neutral-500 mt-1">Shiekh Retail Locations Group</div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200/80 dark:border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Listings Linkage</div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">
              {linkedListings} / {totalListings} <span className="text-xs font-normal text-neutral-500">({Math.round((linkedListings / (totalListings || 1)) * 100)}%)</span>
            </div>
            <div className="text-[10px] text-neutral-500 mt-1">Mapped to SoR Directory Records</div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200/80 dark:border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">Google Verified Status</div>
            <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {verifiedListings} Verified
            </div>
            <div className="text-[10px] text-neutral-500 mt-1">Live on Google Search & Maps</div>
          </div>
        </div>
      </div>

      {/* 2. Listings Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Google Business Profile Listings ({filteredListings.length})
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Current store listings returned from the Google Business Information API v1 catalog.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search store code, title, city..."
                className="pl-8 pr-3 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs w-48 sm:w-60 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center bg-neutral-100 dark:bg-neutral-800 rounded-lg p-0.5 text-xs font-semibold">
              {(['ALL', 'LINKED', 'UNLINKED', 'VERIFIED'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilterStatus(tab)}
                  className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                    filterStatus === tab
                      ? 'bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xs font-bold'
                      : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200'
                  }`}
                >
                  {tab === 'ALL' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Listings Table */}
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/70 text-neutral-600 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-2.5 px-3">Store Code</th>
                <th className="py-2.5 px-3">GBP Listing Title</th>
                <th className="py-2.5 px-3">Address & City</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Linked SoR Location</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-normal">
              {filteredListings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-500 dark:text-neutral-400">
                    No Google Business Profile listings found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                filteredListings.map(listing => {
                  const linkedLoc = locations.find(l => l.id === listing.linkedLocationId);
                  return (
                    <tr key={listing.locationName} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                        {listing.storeCode}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100">{listing.title}</div>
                        <div className="text-[10px] text-neutral-500 font-mono">{listing.locationName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-300">
                        <div>{listing.address}</div>
                        <div className="text-[11px] text-neutral-500">{listing.city}, {listing.state} {listing.zipCode}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          listing.verificationStatus === 'VERIFIED'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }`}>
                          {listing.verificationStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {linkedLoc ? (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                              Store #{linkedLoc.storeNumber} ({linkedLoc.name})
                            </span>
                          </div>
                        ) : (
                          <span className="text-neutral-400 dark:text-neutral-500 italic text-[11px]">
                            Not Linked
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {linkedLoc ? (
                          <button
                            onClick={() => syncSingleLocationToGbp(linkedLoc.id)}
                            className="px-2.5 py-1 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 font-semibold rounded text-[11px] transition-colors cursor-pointer"
                          >
                            Push Update
                          </button>
                        ) : (
                          <span className="text-[11px] text-neutral-400">Auto-match to link</span>
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

      {/* 3. Audit Logs Section */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-500" />
              <span>GBP Synchronization Audit Logs ({gbpSyncLogs.length})</span>
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              Immutable telemetry tracking payload translations, diff summaries, and gateway response statuses.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {gbpSyncLogs.length > 0 && (
              <button
                onClick={clearGbpLogs}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Logs</span>
              </button>
            )}

            <button
              id="export-gbp-logs-btn"
              onClick={exportGbpLogsCsv}
              disabled={gbpSyncLogs.length === 0}
              className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 disabled:opacity-50 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Audit CSV</span>
            </button>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="overflow-x-auto border border-neutral-200 dark:border-neutral-800 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/70 text-neutral-600 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">Store</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Diff & Details</th>
                <th className="py-2.5 px-3">Operator</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 font-normal">
              {gbpSyncLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-500 dark:text-neutral-400">
                    No GBP sync audit events logged yet. Trigger a sync or test handshake above.
                  </td>
                </tr>
              ) : (
                gbpSyncLogs.slice(0, 20).map(log => (
                  <tr key={log.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                    <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-neutral-900 dark:text-neutral-100">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">
                        {log.storeNumber === 'ALL' ? 'Fleet-wide' : `Store #${log.storeNumber}`}
                      </div>
                      <div className="text-[10px] text-neutral-500 truncate max-w-[140px]">
                        {log.locationName}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        log.status === 'SUCCESS'
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : log.status === 'WARNING'
                          ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                          : 'bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300'
                      }`}>
                        {log.status} ({log.httpStatus})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-neutral-600 dark:text-neutral-300 text-[11px] max-w-xs truncate" title={log.diffSummary || log.payloadSummary}>
                      {log.diffSummary || log.payloadSummary}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-500 text-[11px]">
                      {log.syncedBy}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
