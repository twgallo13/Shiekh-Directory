import React, { useState } from 'react';
import {
  Globe,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  Key,
  ExternalLink,
  Search,
  Filter,
  Download,
  Trash2,
  Code,
  ShieldCheck,
  Link as LinkIcon,
  Unlink,
  Server,
  Radio,
  Clock,
  ArrowRight,
  Info,
  Check,
  X,
  Layers,
  FileCode2,
  Database
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, GbpSyncLogEntry } from '../../types';
import { translateLocationToGbpSchema, generateGbpDiffSummary, validateLocationForGbp } from '../../lib/gbpSyncEngine';

export const GbpSyncPanel: React.FC = () => {
  const {
    locations,
    gbpConfig,
    gbpListings,
    gbpSyncLogs,
    updateGbpConfig,
    testGbpHandshake,
    mapLocationToGbp,
    unmapLocationFromGbp,
    autoMatchGbpListings,
    syncSingleLocationToGbp,
    bulkSyncLocationsToGbp,
    clearGbpLogs,
    exportGbpLogsCsv,
    currentUser,
  } = useDirectory();

  const [activeSubTab, setActiveSubTab] = useState<'mapping' | 'sync' | 'audit' | 'config' | 'schema'>('mapping');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'MAPPED' | 'UNMAPPED' | 'SYNCED' | 'ERROR'>('ALL');
  
  // Handshake State
  const [isHandshaking, setIsHandshaking] = useState(false);
  const [handshakeResult, setHandshakeResult] = useState<{ success: boolean; message: string; latencyMs: number } | null>(null);

  // Sync state
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number; storeName: string } | null>(null);
  const [syncingLocationId, setSyncingLocationId] = useState<string | null>(null);

  // Modals & Inspection
  const [selectedLocationForPayload, setSelectedLocationForPayload] = useState<LocationRecord | null>(null);
  const [selectedLocationForMapping, setSelectedLocationForMapping] = useState<LocationRecord | null>(null);
  const [selectedListingToMap, setSelectedListingToMap] = useState<string>('');
  const [autoMatchResult, setAutoMatchResult] = useState<{ matchedCount: number; alreadyMappedCount: number } | null>(null);

  // Selected store checkboxes for batch sync
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  // Calculate Metrics
  const totalFleet = locations.filter(l => l.recordStatus !== 'Archived').length;
  const mappedCount = locations.filter(l => l.gbpLocationId && l.recordStatus !== 'Archived').length;
  const unmappedCount = totalFleet - mappedCount;
  const syncedCount = locations.filter(l => l.gbpSyncStatus === 'Synced' && l.recordStatus !== 'Archived').length;
  const pendingOrErrorCount = locations.filter(l => (l.gbpSyncStatus === 'Pending Push' || l.gbpSyncStatus === 'Error') && l.recordStatus !== 'Archived').length;

  // Filtered Locations
  const filteredLocations = locations.filter(l => {
    if (l.recordStatus === 'Archived') return false;
    const matchesSearch = 
      l.storeNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.city.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.state.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (l.gbpLocationId && l.gbpLocationId.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'MAPPED') return !!l.gbpLocationId;
    if (statusFilter === 'UNMAPPED') return !l.gbpLocationId;
    if (statusFilter === 'SYNCED') return l.gbpSyncStatus === 'Synced';
    if (statusFilter === 'ERROR') return l.gbpSyncStatus === 'Error';
    return true;
  });

  const handleHandshakePing = async () => {
    setIsHandshaking(true);
    setHandshakeResult(null);
    try {
      const result = await testGbpHandshake();
      setHandshakeResult(result);
    } finally {
      setIsHandshaking(false);
    }
  };

  const handleAutoMatch = () => {
    const res = autoMatchGbpListings();
    setAutoMatchResult(res);
    setTimeout(() => setAutoMatchResult(null), 5000);
  };

  const handleSyncSingle = async (locId: string) => {
    setSyncingLocationId(locId);
    try {
      await syncSingleLocationToGbp(locId);
    } finally {
      setSyncingLocationId(null);
    }
  };

  const handleBulkSync = async () => {
    setIsSyncingAll(true);
    const targets = selectedStoreIds.length > 0 
      ? locations.filter(l => selectedStoreIds.includes(l.id))
      : locations.filter(l => l.gbpLocationId && l.recordStatus !== 'Archived');

    try {
      for (let i = 0; i < targets.length; i++) {
        const loc = targets[i];
        setSyncProgress({ current: i + 1, total: targets.length, storeName: `Store #${loc.storeNumber} (${loc.name})` });
        await syncSingleLocationToGbp(loc.id);
      }
    } finally {
      setIsSyncingAll(false);
      setSyncProgress(null);
      setSelectedStoreIds([]);
    }
  };

  const toggleSelectStore = (locId: string) => {
    setSelectedStoreIds(prev => 
      prev.includes(locId) ? prev.filter(id => id !== locId) : [...prev, locId]
    );
  };

  const toggleSelectAll = () => {
    const mappable = filteredLocations.filter(l => l.gbpLocationId).map(l => l.id);
    if (selectedStoreIds.length === mappable.length) {
      setSelectedStoreIds([]);
    } else {
      setSelectedStoreIds(mappable);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-950/60 rounded-lg text-blue-600 dark:text-blue-400">
                <Globe className="w-5 h-5" />
              </div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Google Business Profile (GBP) API Synchronization Engine
              </h2>
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300 rounded text-[10px] font-bold">
                v1 API (REST)
              </span>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 max-w-3xl">
              Authoritative one-way synchronization from Shiekh Master Directory to Google Maps & Search.
              Google listings strictly reflect validated Master SoR store hours, phone, operational status, and address.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleHandshakePing}
              disabled={isHandshaking}
              className="px-3.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors border border-neutral-300 dark:border-neutral-700"
            >
              <Radio className={`w-3.5 h-3.5 text-blue-500 ${isHandshaking ? 'animate-pulse' : ''}`} />
              <span>{isHandshaking ? 'Pinging Google Gateway...' : 'Handshake Ping'}</span>
            </button>

            <button
              onClick={handleBulkSync}
              disabled={isSyncingAll || mappedCount === 0}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
              <span>
                {isSyncingAll
                  ? `Syncing (${syncProgress?.current}/${syncProgress?.total})...`
                  : selectedStoreIds.length > 0
                  ? `Sync Selected (${selectedStoreIds.length})`
                  : `Bulk Push Fleet (${mappedCount})`}
              </span>
            </button>
          </div>
        </div>

        {/* Handshake Result Alert */}
        {handshakeResult && (
          <div className={`mt-4 p-3 rounded-lg border text-xs flex items-center justify-between gap-3 ${
            handshakeResult.success 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/80 text-red-900 dark:text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {handshakeResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              )}
              <span className="font-semibold">{handshakeResult.message}</span>
            </div>
            <span className="font-mono text-[11px] bg-white dark:bg-neutral-900 px-2 py-0.5 rounded border border-neutral-200 dark:border-neutral-700 shrink-0">
              {handshakeResult.latencyMs} ms
            </span>
          </div>
        )}

        {/* Auto Match Result Alert */}
        {autoMatchResult && (
          <div className="mt-4 p-3 rounded-lg border bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Auto-match complete: linked <strong>{autoMatchResult.matchedCount}</strong> new locations. 
              ({autoMatchResult.alreadyMappedCount} were already linked).
            </span>
          </div>
        )}

        {/* Progress Bar during Bulk Sync */}
        {isSyncingAll && syncProgress && (
          <div className="mt-4 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-neutral-800 dark:text-neutral-200">
              <span>Synchronizing: {syncProgress.storeName}</span>
              <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}% ({syncProgress.current}/{syncProgress.total})</span>
            </div>
            <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Fleet Metrics KPI Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800">
          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Fleet Total</div>
            <div className="text-xl font-bold text-neutral-900 dark:text-neutral-100 mt-0.5">{totalFleet}</div>
            <div className="text-[10px] text-neutral-500">Retail Stores</div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">GBP Linked</div>
            <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">{mappedCount}</div>
            <div className="text-[10px] text-neutral-500">{Math.round((mappedCount / totalFleet) * 100)}% Coverage</div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Fully Synced</div>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{syncedCount}</div>
            <div className="text-[10px] text-neutral-500">HTTP 200 Verified</div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Pending / Out of Sync</div>
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{pendingOrErrorCount}</div>
            <div className="text-[10px] text-neutral-500">Awaiting Push</div>
          </div>

          <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700/60">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider">Unmapped</div>
            <div className="text-xl font-bold text-neutral-600 dark:text-neutral-400 mt-0.5">{unmappedCount}</div>
            <div className="text-[10px] text-neutral-500">Requires Place Link</div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 overflow-x-auto pb-1 text-xs font-bold">
        {[
          { id: 'mapping', label: `Location Mapping & Listings (${mappedCount}/${totalFleet})`, icon: MapPin },
          { id: 'sync', label: 'One-Way Sync Engine & Push', icon: Zap },
          { id: 'audit', label: `Sync Audit Logs (${gbpSyncLogs.length})`, icon: Clock },
          { id: 'config', label: 'API Credentials & OAuth Settings', icon: Key },
          { id: 'schema', label: 'Google API Schema Translation', icon: FileCode2 },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-3 py-2 rounded-t-lg transition-all flex items-center gap-1.5 whitespace-nowrap border-b-2 ${
                isActive
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-white dark:bg-neutral-900 shadow-2xs'
                  : 'border-transparent text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: LOCATION MAPPING & LISTINGS */}
      {activeSubTab === 'mapping' && (
        <div className="space-y-4">
          {/* Controls & Filter Bar */}
          <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search store number, name, city, or GBP ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="MAPPED">Mapped Only</option>
                <option value="UNMAPPED">Unmapped Only</option>
                <option value="SYNCED">Synced (200 OK)</option>
                <option value="ERROR">Sync Error</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoMatch}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Automatically match internal Store Numbers with Google Business Profile Store Codes"
              >
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                <span>Auto-Match Listings by Store #</span>
              </button>
            </div>
          </div>

          {/* Locations Mapping Table */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 uppercase font-bold text-[10px] tracking-wider">
                    <th className="p-3 w-8">
                      <input
                        type="checkbox"
                        checked={selectedStoreIds.length > 0 && selectedStoreIds.length === filteredLocations.filter(l => l.gbpLocationId).length}
                        onChange={toggleSelectAll}
                        className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="p-3">Store # / Name</th>
                    <th className="p-3">Address & Phone</th>
                    <th className="p-3">SoR Operating Status</th>
                    <th className="p-3">GBP Location Link</th>
                    <th className="p-3">Google Listing Status</th>
                    <th className="p-3">Sync Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {filteredLocations.map(loc => {
                    const isMapped = !!loc.gbpLocationId;
                    const isSelected = selectedStoreIds.includes(loc.id);
                    const isSyncing = syncingLocationId === loc.id;
                    const linkedListing = gbpListings.find(l => l.locationName === loc.gbpLocationId);

                    return (
                      <tr 
                        key={loc.id} 
                        className={`hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors ${
                          isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            disabled={!isMapped}
                            checked={isSelected}
                            onChange={() => toggleSelectStore(loc.id)}
                            className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500 disabled:opacity-30"
                          />
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-neutral-900 dark:text-neutral-100">
                            Store #{loc.storeNumber}
                          </div>
                          <div className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                            {loc.name}
                          </div>
                        </td>

                        <td className="p-3">
                          <div className="text-neutral-700 dark:text-neutral-300">
                            {loc.address}
                          </div>
                          <div className="text-neutral-400 text-[11px]">
                            {loc.city}, {loc.state} {loc.zipCode} • {loc.phone}
                          </div>
                        </td>

                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            loc.operationalStatus === 'Open'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : loc.operationalStatus === 'Permanently Closed'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}>
                            {loc.operationalStatus}
                          </span>
                        </td>

                        <td className="p-3">
                          {isMapped ? (
                            <div className="space-y-0.5">
                              <div className="font-mono text-[10px] text-neutral-700 dark:text-neutral-300 font-semibold flex items-center gap-1">
                                <LinkIcon className="w-3 h-3 text-blue-600 shrink-0" />
                                <span>{loc.gbpLocationId}</span>
                              </div>
                              {loc.gbpPlaceId && (
                                <div className="text-[10px] text-neutral-400 font-mono">
                                  Place: {loc.gbpPlaceId}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 text-[11px] italic">
                              Unlinked
                            </span>
                          )}
                        </td>

                        <td className="p-3">
                          {isMapped ? (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              loc.gbpListingStatus === 'VERIFIED'
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}>
                              {loc.gbpListingStatus || 'VERIFIED'}
                            </span>
                          ) : (
                            <span className="text-neutral-400 text-[11px]">—</span>
                          )}
                        </td>

                        <td className="p-3">
                          {isMapped ? (
                            <div className="space-y-0.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                                loc.gbpSyncStatus === 'Synced'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : loc.gbpSyncStatus === 'Error'
                                  ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                              }`}>
                                {loc.gbpSyncStatus === 'Synced' && <CheckCircle2 className="w-2.5 h-2.5" />}
                                {loc.gbpSyncStatus === 'Error' && <AlertTriangle className="w-2.5 h-2.5" />}
                                {loc.gbpSyncStatus === 'Pending Push' && <Clock className="w-2.5 h-2.5" />}
                                <span>{loc.gbpSyncStatus || 'Pending Push'}</span>
                              </span>
                              {loc.gbpLastSyncedAt && (
                                <div className="text-[10px] text-neutral-400">
                                  {new Date(loc.gbpLastSyncedAt).toLocaleDateString()} {new Date(loc.gbpLastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-neutral-400 text-[11px]">—</span>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Inspect Payload */}
                            <button
                              onClick={() => setSelectedLocationForPayload(loc)}
                              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded transition-colors"
                              title="Inspect Google Business Profile JSON Schema Payload"
                            >
                              <Code className="w-3.5 h-3.5" />
                            </button>

                            {/* View On Google Maps */}
                            {(loc.gbpMapsUrl || linkedListing?.mapsUrl) && (
                              <a
                                href={loc.gbpMapsUrl || linkedListing?.mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-blue-600 dark:text-blue-400 rounded transition-colors"
                                title="Open Live Listing on Google Maps"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}

                            {/* Manual Link / Unlink */}
                            {isMapped ? (
                              <button
                                onClick={() => unmapLocationFromGbp(loc.id)}
                                className="p-1.5 hover:bg-red-50 dark:hover:bg-red-950/60 text-neutral-400 hover:text-red-600 rounded transition-colors"
                                title="Unlink from Google Listing"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedLocationForMapping(loc);
                                  setSelectedListingToMap('');
                                }}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-[11px] font-bold flex items-center gap-1 transition-colors"
                              >
                                <LinkIcon className="w-3 h-3" />
                                <span>Link</span>
                              </button>
                            )}

                            {/* Push Single */}
                            {isMapped && (
                              <button
                                onClick={() => handleSyncSingle(loc.id)}
                                disabled={isSyncing}
                                className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded text-[11px] font-bold flex items-center gap-1 transition-colors shadow-2xs disabled:opacity-50"
                              >
                                <Zap className={`w-3 h-3 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
                                <span>{isSyncing ? 'Pushing...' : 'Sync'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ONE-WAY SYNC ENGINE & PUSH */}
      {activeSubTab === 'sync' && (
        <div className="space-y-4">
          {/* Architectural Invariant Banner */}
          <div className="p-4 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Authoritative Master Directory (SoR) One-Way Push Invariant (Blueprint Sec 14)
              </h3>
            </div>
            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
              The Shiekh Shoes Master Store Directory is the single source of truth (SoR). 
              Synchronization is strictly <strong>one-way outbound</strong>. 
              External Google Business Profile changes or third-party edits are never pulled to overwrite Master records. 
              Only verified changes in this console push outbound to Google Maps & Search.
            </p>
          </div>

          {/* Sync Trigger Card */}
          <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Fleet-Wide Outbound Push Orchestrator
                </h4>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Translate and broadcast verified store operating hours, phone, operational status, and address to Google Business Profile v1 REST endpoints.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkSync}
                  disabled={isSyncingAll || mappedCount === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
                >
                  <Zap className={`w-4 h-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
                  <span>{isSyncingAll ? 'Synchronizing Retail Fleet...' : `Execute Push for ${mappedCount} Mapped Stores`}</span>
                </button>
              </div>
            </div>

            {/* Sync Settings & Switches */}
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">Auto-Push on Record Approval</span>
                  <input
                    type="checkbox"
                    checked={gbpConfig.autoSyncOnUpdate}
                    onChange={e => updateGbpConfig({ autoSyncOnUpdate: e.target.checked })}
                    className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                  />
                </div>
                <p className="text-[11px] text-neutral-500">
                  When enabled, approved changes to store hours, manager phone, or operational status automatically push to Google Maps in real-time.
                </p>
              </div>

              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">Pre-Flight Schema Validation Gate</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded font-bold text-[10px]">
                    ACTIVE
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500">
                  Enforces strict Google REST schema validation: 24-hr time arrays, 5-digit US postal codes, and standard E.164 phone formats before dispatch.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: OUTBOUND SYNC AUDIT LOGS */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-neutral-500" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                Google Business Profile Outbound API Audit Log
              </h3>
              <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded text-[10px] font-bold">
                {gbpSyncLogs.length} Events
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={exportGbpLogsCsv}
                disabled={gbpSyncLogs.length === 0}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Audit CSV</span>
              </button>

              <button
                onClick={clearGbpLogs}
                disabled={gbpSyncLogs.length === 0}
                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-red-200 dark:border-red-800 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Logs</span>
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-neutral-800/80 border-b border-neutral-200 dark:border-neutral-700 text-neutral-500 uppercase font-bold text-[10px] tracking-wider">
                    <th className="p-3">Timestamp</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Target Location</th>
                    <th className="p-3">HTTP Status</th>
                    <th className="p-3">Outcome</th>
                    <th className="p-3">Diff / Payload Summary</th>
                    <th className="p-3">Actor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                  {gbpSyncLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-neutral-400">
                        No GBP synchronization events logged yet. Execute a handshake or store sync.
                      </td>
                    </tr>
                  ) : (
                    gbpSyncLogs.map(log => (
                      <tr key={log.id} className="hover:bg-neutral-50/80 dark:hover:bg-neutral-800/40 transition-colors">
                        <td className="p-3 whitespace-nowrap text-neutral-500 text-[11px] font-mono">
                          {new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>

                        <td className="p-3 font-semibold text-neutral-900 dark:text-neutral-100">
                          {log.action}
                        </td>

                        <td className="p-3">
                          <div className="font-bold text-neutral-800 dark:text-neutral-200">
                            {log.storeNumber !== 'ALL' && log.storeNumber !== 'UNKNOWN' ? `Store #${log.storeNumber}` : log.locationName}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {log.gbpLocationId}
                          </div>
                        </td>

                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                            log.httpStatus === 200
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          }`}>
                            HTTP {log.httpStatus}
                          </span>
                        </td>

                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                          }`}>
                            {log.status}
                          </span>
                        </td>

                        <td className="p-3 max-w-md">
                          <div className="text-neutral-700 dark:text-neutral-300 text-[11px] line-clamp-2">
                            {log.diffSummary || log.payloadSummary}
                          </div>
                          {log.errorMessage && (
                            <div className="text-red-600 dark:text-red-400 text-[10px] mt-0.5 font-mono">
                              Error: {log.errorMessage}
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-neutral-500 text-[11px] whitespace-nowrap">
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
      )}

      {/* TAB 4: API CREDENTIALS & OAUTH SETTINGS */}
      {activeSubTab === 'config' && (
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Google Business Profile Service Account & API Configuration (Blueprint Sec 14)
              </h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Configure enterprise Google Cloud Project (GCP) credentials for automated server-to-server sync with Google Business Information API v1.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Account ID */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-700 dark:text-neutral-300">
                Google Business Account ID / Resource Name
              </label>
              <input
                type="text"
                value={gbpConfig.accountId}
                onChange={e => updateGbpConfig({ accountId: e.target.value })}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-mono text-xs"
                placeholder="accounts/1083921839281938"
              />
              <span className="text-[10px] text-neutral-400">Target Google Business Profile organizational account container.</span>
            </div>

            {/* Account Display Name */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-700 dark:text-neutral-300">
                Account Display Name
              </label>
              <input
                type="text"
                value={gbpConfig.accountName}
                onChange={e => updateGbpConfig({ accountName: e.target.value })}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs"
                placeholder="Shiekh Shoes Master Corporate Account"
              />
            </div>

            {/* Client Email / Service Account */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-700 dark:text-neutral-300">
                GCP Service Account Email
              </label>
              <input
                type="email"
                value={gbpConfig.clientEmail}
                onChange={e => updateGbpConfig({ clientEmail: e.target.value })}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg font-mono text-xs"
                placeholder="shiekh-directory-sync@shiekh-production.iam.gserviceaccount.com"
              />
            </div>

            {/* OAuth Scope */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-700 dark:text-neutral-300">
                Authorized OAuth 2.0 Scope
              </label>
              <input
                type="text"
                disabled
                value={gbpConfig.scope}
                className="w-full px-3 py-2 bg-neutral-100 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-lg font-mono text-xs text-neutral-500 cursor-not-allowed"
              />
              <span className="text-[10px] text-neutral-400">Mandatory scope for Google Business Information API write operations.</span>
            </div>

            {/* Environment Toggle */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-700 dark:text-neutral-300">
                Target API Gateway Environment
              </label>
              <select
                value={gbpConfig.environment}
                onChange={e => updateGbpConfig({ environment: e.target.value as any })}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs font-semibold"
              >
                <option value="PRODUCTION">PRODUCTION (Live Google Maps & Search)</option>
                <option value="SANDBOX">SANDBOX (Google My Business Mock Gateway)</option>
              </select>
            </div>

            {/* Connection Status */}
            <div className="space-y-1.5">
              <label className="font-bold text-neutral-700 dark:text-neutral-300">
                Handshake Status
              </label>
              <div className="px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg flex items-center justify-between">
                <span className={`font-bold flex items-center gap-1.5 ${
                  gbpConfig.isConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${gbpConfig.isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                  {gbpConfig.isConnected ? 'CONNECTED & AUTHORIZED' : 'NOT CONNECTED'}
                </span>
                <span className="text-[10px] text-neutral-400">
                  {gbpConfig.lastHandshake ? `Last verified: ${new Date(gbpConfig.lastHandshake).toLocaleTimeString()}` : 'Never'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SCHEMA TRANSLATION REFERENCE */}
      {activeSubTab === 'schema' && (
        <div className="bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <FileCode2 className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Master SoR to Google Business Profile v1 REST Schema Translation
              </h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Field mapping specifications between the internal Shiekh Directory database and Google My Business REST API.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            {/* Table 1: Attribute Mappings */}
            <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-700/60 space-y-3">
              <h4 className="font-bold text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                Core Property Translations
              </h4>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="text-neutral-400 text-[10px]">Title</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    SoR: &quot;Shiekh - &quot; + location.name (e.g. &quot;Shiekh - Glendale Galleria&quot;)
                  </div>
                </div>

                <div className="p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="text-neutral-400 text-[10px]">Storefront Address</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    postalAddress: &#123; addressLines: [loc.address], locality: loc.city, administrativeArea: loc.state, postalCode: loc.zipCode, regionCode: &apos;US&apos; &#125;
                  </div>
                </div>

                <div className="p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="text-neutral-400 text-[10px]">Primary Phone</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    phoneNumbers.primaryPhone: Formatted E.164 phone string
                  </div>
                </div>
              </div>
            </div>

            {/* Table 2: Status & Hours Translations */}
            <div className="p-4 bg-neutral-50 dark:bg-neutral-800/40 rounded-xl border border-neutral-200 dark:border-neutral-700/60 space-y-3">
              <h4 className="font-bold text-neutral-900 dark:text-neutral-100 border-b border-neutral-200 dark:border-neutral-700 pb-2">
                Status & Schedule Conversions
              </h4>
              <div className="space-y-2 font-mono text-[11px]">
                <div className="p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="text-neutral-400 text-[10px]">Operational Status Mapping</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    &apos;Open&apos; → <span className="text-emerald-600">OPEN</span><br />
                    &apos;Temporarily Closed&apos; / &apos;Under Remodel&apos; → <span className="text-amber-600">CLOSED_TEMPORARILY</span><br />
                    &apos;Permanently Closed&apos; → <span className="text-red-600">CLOSED_PERMANENTLY</span>
                  </div>
                </div>

                <div className="p-2 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-700">
                  <div className="text-neutral-400 text-[10px]">24-Hour Schedule Serialization</div>
                  <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                    regularHours.periods: &#91; &#123; openDay: &apos;MONDAY&apos;, openTime: &#123; hours: 10, minutes: 0 &#125;, closeDay: &apos;MONDAY&apos;, closeTime: &#123; hours: 21, minutes: 0 &#125; &#125; &#93;
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PAYLOAD INSPECTION */}
      {selectedLocationForPayload && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Google Business Profile v1 REST Payload: Store #{selectedLocationForPayload.storeNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedLocationForPayload(null)}
                className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3 flex-1 font-mono text-xs">
              <div className="p-3 bg-neutral-950 text-neutral-200 rounded-lg overflow-x-auto text-[11px] leading-relaxed">
                <pre>{JSON.stringify(translateLocationToGbpSchema(selectedLocationForPayload), null, 2)}</pre>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-800/80 text-blue-900 dark:text-blue-300 text-xs">
                <strong>Diff Summary:</strong> {generateGbpDiffSummary(selectedLocationForPayload)}
              </div>
            </div>

            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 border-t border-neutral-200 dark:border-neutral-800 flex justify-end">
              <button
                onClick={() => setSelectedLocationForPayload(null)}
                className="px-4 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded text-xs font-semibold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL LINKING */}
      {selectedLocationForMapping && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                  Link Store #{selectedLocationForMapping.storeNumber} to Google Listing
                </h3>
              </div>
              <button
                onClick={() => setSelectedLocationForMapping(null)}
                className="p-1 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded text-neutral-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Select an available Google Business Profile listing to associate with internal Store #{selectedLocationForMapping.storeNumber} ({selectedLocationForMapping.name}).
            </p>

            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                Available Google Business Listings
              </label>
              <select
                value={selectedListingToMap}
                onChange={e => setSelectedListingToMap(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs"
              >
                <option value="">-- Choose Google Listing --</option>
                {gbpListings.map(listing => (
                  <option 
                    key={listing.locationName} 
                    value={listing.locationName}
                    disabled={!!listing.linkedLocationId && listing.linkedLocationId !== selectedLocationForMapping.id}
                  >
                    {listing.title} ({listing.storeCode}) {listing.linkedLocationId ? '[Already Linked]' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedLocationForMapping(null)}
                className="px-3.5 py-1.5 bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 text-neutral-700 dark:text-neutral-200 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedListingToMap) {
                    mapLocationToGbp(selectedLocationForMapping.id, selectedListingToMap);
                    setSelectedLocationForMapping(null);
                  }
                }}
                disabled={!selectedListingToMap}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white rounded text-xs font-bold transition-colors"
              >
                Confirm Association
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
