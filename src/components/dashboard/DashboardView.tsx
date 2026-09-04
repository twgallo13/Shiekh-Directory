import React from 'react';
import { 
  Building, 
  Users, 
  Clock, 
  AlertTriangle, 
  GitPullRequest, 
  ShieldCheck, 
  Search, 
  Printer, 
  ArrowRight, 
  Phone, 
  Plus, 
  CheckCircle2, 
  Zap,
  ExternalLink,
  MapPin
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, PersonRecord } from '../../types';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';

interface DashboardViewProps {
  onNavigateToTab: (tab: 'dashboard' | 'locations' | 'people' | 'requests' | 'print-sheet' | 'admin') => void;
  onSelectLocation: (location: LocationRecord) => void;
  onSelectPerson: (person: PersonRecord) => void;
  onOpenSearch: () => void;
  onOpenNewRequest: (location?: LocationRecord) => void;
  onAddNewLocation: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigateToTab,
  onSelectLocation,
  onSelectPerson,
  onOpenSearch,
  onOpenNewRequest,
  onAddNewLocation,
}) => {
  const { locations, people, requests, currentUser } = useDirectory();

  const activeStores = locations.filter(l => l.recordStatus === 'Active');
  const storesWithNotices = locations.filter(l => l.operationalStatus !== 'Open — Normal Operations' || l.activeNotice);
  const pendingRequests = requests.filter(r => r.status === 'Submitted');

  // District statistics
  const districts = [
    { 
      id: 'd1', 
      name: 'District 1', 
      dm: 'Rudy Calderon', 
      region: 'NorCal, NV, WA, OR, TX',
      stores: locations.filter(l => l.districtManagerName?.includes('Rudy')),
      color: 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-300'
    },
    { 
      id: 'd2', 
      name: 'District 2', 
      dm: 'David Castro', 
      region: 'Central Valley & LA Central',
      stores: locations.filter(l => l.districtManagerName?.includes('David')),
      color: 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300'
    },
    { 
      id: 'd3', 
      name: 'District 3', 
      dm: 'Karlo Llovido', 
      region: 'Inland Empire, South Bay, San Diego',
      stores: locations.filter(l => l.districtManagerName?.includes('Karlo')),
      color: 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20 text-rose-900 dark:text-rose-300'
    },
  ];

  const canEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  return (
    <div className="space-y-5">
      {/* Welcome / Quick Search Bar Banner */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white p-5 sm:p-6 rounded-2xl shadow-md border border-neutral-800 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white font-bold text-[11px] uppercase tracking-wider">
              Authoritative Source of Truth
            </span>
            <span className="text-xs text-neutral-400">
              Shiekh Shoes Retail & Corporate Directory
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Find Any Store, Manager, Phone or Hours
          </h1>

          <p className="text-xs sm:text-sm text-neutral-300">
            Canonical data repository for 100+ retail stores across CA, NV, WA, OR, TX with real-time hours, store manager assignments, and print-ready export sheets.
          </p>

          {/* Instant Search Bar Trigger */}
          <div className="pt-2 flex flex-col sm:flex-row gap-2">
            <button
              onClick={onOpenSearch}
              className="flex-1 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-left text-neutral-300 flex items-center justify-between transition-colors backdrop-blur-xs"
            >
              <div className="flex items-center gap-2.5">
                <Search className="w-4 h-4 text-red-400" />
                <span>Quick search by store #, city, mall name, manager...</span>
              </div>
              <kbd className="hidden sm:inline-block px-2 py-0.5 bg-white/10 rounded text-[10px] font-mono text-neutral-400">
                ⌘K / Ctrl+K
              </kbd>
            </button>

            <button
              onClick={() => onNavigateToTab('print-sheet')}
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>1-Sheet PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div 
          onClick={() => onNavigateToTab('locations')}
          className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs hover:shadow-xs hover:border-red-500 cursor-pointer transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Total Retail Stores</span>
            <Building className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {locations.length}
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>{activeStores.length} active in directory</span>
          </div>
        </div>

        <div 
          onClick={() => onNavigateToTab('people')}
          className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs hover:shadow-xs hover:border-red-500 cursor-pointer transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Personnel & Managers</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {people.length}
          </div>
          <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
            Store Managers & Field Leadership
          </div>
        </div>

        <div 
          onClick={() => onNavigateToTab('requests')}
          className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs hover:shadow-xs hover:border-amber-500 cursor-pointer transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Update Requests</span>
            <GitPullRequest className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            {pendingRequests.length}
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            {pendingRequests.length > 0 ? 'Pending Data Steward review' : 'All updates synced'}
          </div>
        </div>

        <div 
          onClick={() => onNavigateToTab('admin')}
          className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs hover:shadow-xs hover:border-emerald-500 cursor-pointer transition-all space-y-1"
        >
          <div className="flex items-center justify-between text-neutral-400">
            <span className="text-xs font-semibold">Downstream Sync</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
            100%
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
            Store Locator & POS healthy
          </div>
        </div>
      </div>

      {/* Operational Notices & Alerts Bar (if any stores have non-standard status) */}
      {storesWithNotices.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-300 dark:border-amber-800/80 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 text-xs font-bold uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Active Operational Status Notices ({storesWithNotices.length})</span>
            </div>
            <button
              onClick={() => onNavigateToTab('locations')}
              className="text-xs font-bold text-amber-700 dark:text-amber-400 hover:underline"
            >
              Filter in Directory →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {storesWithNotices.slice(0, 3).map(store => (
              <div
                key={store.id}
                onClick={() => onSelectLocation(store)}
                className="p-3 bg-white dark:bg-neutral-900 rounded-xl border border-amber-200 dark:border-amber-900/60 cursor-pointer hover:border-amber-400 transition-colors text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between font-bold text-neutral-900 dark:text-neutral-100">
                  <span>Store #{store.storeNumber} · {store.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 rounded font-semibold">
                    {store.operationalStatus}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600 dark:text-neutral-300 font-medium">
                  {store.activeNotice?.shortDescription || `${store.city}, ${store.state}`}
                </p>
                {store.activeNotice?.expectedResolutionDate && (
                  <div className="text-[10px] text-amber-700 dark:text-amber-400 font-mono font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-600" />
                    <span>Expected Resolution: {store.activeNotice.expectedResolutionDate}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* District Leadership Cards Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
            <span>Retail Field Organization by District</span>
          </h2>
          <button
            onClick={() => onNavigateToTab('locations')}
            className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
          >
            <span>View All Stores</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {districts.map(dist => (
            <div
              key={dist.id}
              className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      {dist.name}
                    </span>
                    <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                      {dist.dm}
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 rounded text-xs font-bold font-mono">
                    {dist.stores.length} Stores
                  </span>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  {dist.region}
                </p>
              </div>

              {/* Sample store chips in this district */}
              <div className="space-y-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="text-[11px] font-semibold text-neutral-400 uppercase">
                  Representative Stores
                </div>
                <div className="space-y-1">
                  {dist.stores.slice(0, 3).map(st => (
                    <div
                      key={st.id}
                      onClick={() => onSelectLocation(st)}
                      className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer flex items-center justify-between text-xs transition-colors"
                    >
                      <span className="font-medium truncate max-w-[170px]">
                        #{st.storeNumber} {st.name}
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {st.city}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => onNavigateToTab('locations')}
                className="w-full mt-2 py-1.5 bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 rounded text-xs font-semibold text-center transition-colors"
              >
                Inspect District Stores →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Row: Quick Action Launchpad */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          Logged in as: <strong className="text-neutral-800 dark:text-neutral-200">{currentUser.displayName}</strong> ({currentUser.role})
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onOpenNewRequest()}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded text-xs font-medium flex items-center gap-1.5"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span>Submit Correction</span>
          </button>

          {canEdit && (
            <button
              onClick={onAddNewLocation}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Authoritative Store</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
