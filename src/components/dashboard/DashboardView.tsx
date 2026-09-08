import React, { useState, useMemo } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, PersonRecord } from '../../types';
import { OperationalStatusBadge } from '../common/StatusBadge';
import { EmptyState } from '../common/EmptyState';
import { PageHeader } from '../common/PageHeader';
import { 
  Store, 
  Users, 
  GitPullRequest, 
  ShieldCheck, 
  AlertTriangle, 
  ExternalLink,
  ChevronRight,
  Search,
  MapPin,
  Phone,
  Clock,
  AlertCircle,
  Building,
  CheckCircle2,
  X
} from 'lucide-react';

interface DashboardViewProps {
  onSelectLocation: (loc: LocationRecord) => void;
  onSelectPerson: (person: PersonRecord) => void;
  onNavigateToLocations: () => void;
  onNavigateToPeople: () => void;
  onNavigateToRequests: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectLocation,
  onSelectPerson,
  onNavigateToLocations,
  onNavigateToPeople,
  onNavigateToRequests,
}) => {
  const { locations, people, requests } = useDirectory();

  // Quick Reference Search & District Filter
  const [quickSearch, setQuickSearch] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');

  const pendingRequests = requests.filter(r => r.status === 'Pending');
  
  // Stores with Active Operational Notices (modified hours, remodel, emergency, or temporary notices)
  const storesWithNotices = useMemo(() => {
    return locations.filter(l => 
      l.operationalStatus !== 'Open — Normal Operations' || 
      (l.activeNotice && l.activeNotice.shortDescription)
    );
  }, [locations]);

  const verifiedStores = locations.filter(l => l.lastVerifiedAt);

  // Group all locations by district for Quick Reference Roster
  const districtMap = useMemo(() => {
    const map = new Map<string, { dm?: string; stores: LocationRecord[] }>();
    locations.forEach(l => {
      const dist = l.district || 'Unassigned District';
      if (!map.has(dist)) {
        map.set(dist, { dm: l.districtManagerName, stores: [] });
      }
      map.get(dist)!.stores.push(l);
    });
    return map;
  }, [locations]);

  // Unique list of districts for filter selector
  const districtList = useMemo(() => {
    return Array.from(districtMap.keys()).sort();
  }, [districtMap]);

  // Filtered store list for Quick Reference panel
  const quickRefStores = useMemo(() => {
    return locations.filter(l => {
      const matchesDistrict = selectedDistrict === 'all' || (l.district || 'Unassigned District') === selectedDistrict;
      if (!matchesDistrict) return false;

      if (!quickSearch.trim()) return true;
      const q = quickSearch.toLowerCase().trim();
      return (
        l.storeNumber.toLowerCase().includes(q) ||
        l.name.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.state.toLowerCase().includes(q) ||
        (l.storeManagerName && l.storeManagerName.toLowerCase().includes(q)) ||
        (l.district && l.district.toLowerCase().includes(q)) ||
        (l.districtManagerName && l.districtManagerName.toLowerCase().includes(q))
      );
    });
  }, [locations, selectedDistrict, quickSearch]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Dashboard"
        description="Current store coverage, directory health, and items requiring attention"
      />
      
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={onNavigateToLocations}
          className="group min-w-0 space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-xs transition-all hover:border-red-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          aria-label={`View ${locations.length} retail stores`}
        >
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold">Total Retail Stores</span>
            <Store className="h-4 w-4 text-red-600 transition-transform group-hover:scale-110" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{locations.length}</div>
          <div className="text-[11px] text-neutral-500">Active retail footprints</div>
        </button>

        <button
          type="button"
          onClick={onNavigateToPeople}
          className="group min-w-0 space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-xs transition-all hover:border-blue-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
          aria-label={`View ${people.length} people in the directory`}
        >
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold">Field Leadership Roster</span>
            <Users className="h-4 w-4 text-blue-600 transition-transform group-hover:scale-110" aria-hidden="true" />
          </div>
          <div className="text-2xl font-bold text-neutral-900">{people.length}</div>
          <div className="text-[11px] text-neutral-500">DMs, SMs & Support leads</div>
        </button>

        <button
          type="button"
          onClick={onNavigateToRequests}
          className="min-w-0 space-y-2 rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-xs transition-all hover:border-amber-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold">Pending Requests</span>
            <GitPullRequest className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-amber-700">{pendingRequests.length}</div>
          <div className="text-[11px] text-neutral-500">Awaiting steward review</div>
        </button>

        <div className="min-w-0 p-4 bg-white border border-neutral-200 rounded-xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-neutral-500">
            <span className="text-xs font-semibold">Steward Verified</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-700">
            {locations.length > 0 ? Math.round((verifiedStores.length / locations.length) * 100) : 0}%
          </div>
          <div className="text-[11px] text-neutral-500">{verifiedStores.length} of {locations.length} verified</div>
        </div>
      </div>

      {/* Dual-Column Layout: Left (Active Operational Notices Feed) & Right (Quick Reference Store List / District Roster) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column: Stores with Active Operational Notices */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs flex flex-col">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">Stores with Active Operational Notices</h3>
                <p className="text-[11px] text-neutral-500">
                  Live alerts for stores under modified hours, remodel, or temporary closures
                </p>
              </div>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
              {storesWithNotices.length} active alert{storesWithNotices.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className={`flex-1 overflow-y-auto max-h-[580px] pr-1 ${storesWithNotices.length === 0 ? 'flex min-h-64 items-center' : 'space-y-3'}`}>
            {storesWithNotices.map(loc => {
              const isRemodel = loc.operationalStatus === 'Under Remodel / Renovation';
              const isEmergency = loc.operationalStatus === 'Temporarily Closed — Emergency';
              const isModified = loc.operationalStatus === 'Temporarily Modified Hours';

              return (
                <button
                  type="button"
                  key={loc.id}
                  onClick={() => onSelectLocation(loc)}
                  className="group w-full space-y-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-3.5 text-left shadow-2xs transition-all hover:border-neutral-300 hover:bg-neutral-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                >
                  {/* Top Bar: Store Number & Status */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 text-xs font-mono font-bold">
                        STORE #{loc.storeNumber}
                      </span>
                      <span className="font-bold text-neutral-900 group-hover:text-red-700 transition-colors text-xs">
                        {loc.name}
                      </span>
                    </div>
                    <OperationalStatusBadge status={loc.operationalStatus} />
                  </div>

                  {/* Active Notice Banner */}
                  {loc.activeNotice && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200/80 rounded-lg text-xs space-y-1">
                      <div className="flex items-start gap-1.5 text-amber-900 font-semibold">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <span>{loc.activeNotice.shortDescription}</span>
                      </div>
                      {(loc.activeNotice.effectiveDate || loc.activeNotice.expectedResolutionDate) && (
                        <div className="text-[10px] text-amber-700 pl-5">
                          {loc.activeNotice.effectiveDate && <span>Effective: {loc.activeNotice.effectiveDate}</span>}
                          {loc.activeNotice.expectedResolutionDate && (
                            <span className="ml-2 font-medium">Through: {loc.activeNotice.expectedResolutionDate}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status Banner when no activeNotice string is present but status is abnormal */}
                  {!loc.activeNotice && (
                    <div className={`p-2 rounded-lg text-xs flex items-center gap-2 ${
                      isEmergency
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : isRemodel
                        ? 'bg-purple-50 text-purple-800 border border-purple-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}>
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[11px] font-medium">
                        {isRemodel && 'Facility actively under renovation — standard customer operations suspended.'}
                        {isEmergency && 'Emergency closure in effect — customer entry prohibited.'}
                        {isModified && 'Operating on non-standard temporary schedule.'}
                      </span>
                    </div>
                  )}

                  {/* Footer details: Address & Manager */}
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-200/70">
                    <div className="flex items-center gap-1 truncate max-w-[240px]">
                      <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
                      <span className="truncate">{loc.city}, {loc.state}</span>
                    </div>
                    <div className="flex items-center gap-1 font-medium text-neutral-700">
                      <span>{loc.storeManagerName ? `Mgr: ${loc.storeManagerName}` : 'Mgr Vacant'}</span>
                      <ChevronRight className="w-3 h-3 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </button>
              );
            })}

            {storesWithNotices.length === 0 && (
              <EmptyState
                icon={CheckCircle2}
                title="All stores operating normally"
                description="No active operational notices, modified hours schedules, or emergency closures across the fleet."
                compact
                className="w-full"
              />
            )}
          </div>
        </div>

        {/* Right Column: Quick Reference Store List / District Roster */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4 shadow-xs flex flex-col">
          <div className="border-b border-neutral-100 pb-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-200">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm">Quick Reference Store List / District Roster</h3>
                  <p className="text-[11px] text-neutral-500">
                    Instant access to store cards & district field leadership
                  </p>
                </div>
              </div>
              <span className="text-xs text-neutral-500 font-medium">
                {quickRefStores.length} stores
              </span>
            </div>

            {/* Quick Search & District Filter Controls */}
            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Quick find store #, name, city, DM..."
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  className="w-full pl-8 pr-7 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500 focus:bg-white"
                />
                {quickSearch && (
                  <button
                    type="button"
                    onClick={() => setQuickSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                    aria-label="Clear store search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="bg-neutral-50 border border-neutral-200 rounded-lg py-1.5 px-2.5 text-xs text-neutral-800 font-medium focus:outline-none focus:border-red-500 cursor-pointer max-w-[170px]"
              >
                <option value="all">All Districts ({districtList.length})</option>
                {districtList.map(dist => (
                  <option key={dist} value={dist}>{dist}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Reference Store Cards List */}
          <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[580px] pr-1">
            {quickRefStores.map(loc => {
              const dmPerson = people.find(p => p.district === loc.district || p.fullName === loc.districtManagerName);

              return (
                <div key={loc.id} className="group rounded-lg border border-neutral-200 bg-neutral-50 p-3 shadow-2xs transition-all hover:border-neutral-300 hover:bg-neutral-100/80">
                  <button
                    type="button"
                    onClick={() => onSelectLocation(loc)}
                    className="flex w-full items-start justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-red-600 text-xs">
                          #{loc.storeNumber}
                        </span>
                        <span className="font-bold text-neutral-900 group-hover:text-red-700 transition-colors text-xs truncate">
                          {loc.name}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-[11px] text-neutral-500 flex-wrap">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span>{loc.city}, {loc.state}</span>
                        </div>
                        <div className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span>{loc.phone}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <OperationalStatusBadge status={loc.operationalStatus} />
                    </div>
                  </button>

                  {/* Leadership & District Ribbon */}
                  <div className="mt-2 pt-2 border-t border-neutral-200/70 flex items-center justify-between text-[10px] text-neutral-500">
                    <div className="flex items-center gap-1">
                      <span className="text-neutral-400">District:</span>
                      <span className="font-semibold text-neutral-700 truncate max-w-[130px]">
                        {loc.district || 'Unassigned'}
                      </span>
                      {dmPerson && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectPerson(dmPerson);
                          }}
                          className="text-neutral-500 hover:text-red-600 hover:underline flex items-center gap-0.5 ml-1 cursor-pointer"
                          title="View District Manager"
                        >
                          <span>(DM: {dmPerson.fullName})</span>
                          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectLocation(loc)}
                      className="flex items-center gap-1 rounded font-medium text-neutral-700 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      aria-label={`View store ${loc.storeNumber}`}
                    >
                      <span>{loc.storeManagerName ? `Mgr: ${loc.storeManagerName}` : 'Mgr Vacant'}</span>
                      <ChevronRight className="w-3 h-3 text-neutral-400 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                </div>
              );
            })}

            {quickRefStores.length === 0 && (
              <EmptyState
                icon={Search}
                title="No stores match your search"
                description="Try adjusting the district filter or clearing the search query."
                compact
              />
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
