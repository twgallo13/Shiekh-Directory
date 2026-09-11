import React, { useState, useMemo } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, PersonRecord, LocationType, OperationalStatus } from '../../types';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';
import { resolveActivePerson } from '../../lib/readProjectionContract';
import { OperationalStatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { PageHeader } from '../common/PageHeader';
import { 
  Search, 
  Plus, 
  ExternalLink,
  ChevronRight,
  Table,
  Layers,
  LayoutGrid,
  SlidersHorizontal,
  X,
  Check,
  Building,
  Clock,
  MapPin,
  Phone,
  Calendar,
  AlertCircle
} from 'lucide-react';

interface LocationsViewProps {
  onSelectLocation: (location: LocationRecord) => void;
  onSelectPerson?: (person: PersonRecord) => void;
  onEditLocation: (location: LocationRecord) => void;
  onAddNewLocation: () => void;
  onRequestCorrection: (location: LocationRecord) => void;
}

const locationTypes: LocationType[] = [
  'Enclosed Mall',
  'Strip Center / Shopping Center',
  'Street / Standalone Location',
  'Corporate Office',
  'Warehouse / Distribution Center',
  'Other Company Location'
];

const operationalStatuses: OperationalStatus[] = [
  'Open — Normal Operations',
  'Temporarily Modified Hours',
  'Under Remodel / Renovation',
  'Temporarily Closed — Emergency',
  'Opening Soon — New Store',
  'Permanently Closed'
];

export const LocationsView: React.FC<LocationsViewProps> = ({
  onSelectLocation,
  onSelectPerson,
  onEditLocation,
  onAddNewLocation,
  onRequestCorrection,
}) => {
  const { 
    locations, 
    people, 
    currentUser, 
    hoursTemplates, 
    applyHoursTemplate, 
    updateLocation 
  } = useDirectory();

  // State Restoration
  const [viewMode, setViewMode] = useState<'table' | 'district' | 'cards'>('table');
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);

  // Filter Ribbon States
  const [searchTerm, setSearchTerm] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [includeRetired, setIncludeRetired] = useState(false);

  // Bulk Action Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>('');
  const [bulkTemplateId, setBulkTemplateId] = useState<string>('');
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Corporate Holiday / Temporary Exception State
  const [exceptionName, setExceptionName] = useState<string>('');
  const [exceptionStartDate, setExceptionStartDate] = useState<string>('');
  const [exceptionEndDate, setExceptionEndDate] = useState<string>('');
  const [exceptionOperatingStatus, setExceptionOperatingStatus] = useState<'Closed' | 'Modified Hours'>('Closed');
  const [exceptionOpenTime, setExceptionOpenTime] = useState<string>('10:00');
  const [exceptionCloseTime, setExceptionCloseTime] = useState<string>('18:00');

  const canAdd = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const handleOpenPerson = (e: React.MouseEvent, personId?: string) => {
    e.stopPropagation();
    if (!onSelectPerson || !personId) return;
    const found = people.find(p => p.id === personId);
    if (found) {
      onSelectPerson(found);
    }
  };

  const leadershipByLocationId = useMemo(() => {
    const map = new Map<string, { storeManager?: PersonRecord; districtManager?: PersonRecord }>();
    locations.forEach(loc => {
      map.set(loc.id, {
        storeManager: resolveActivePerson(loc.storeManagerId, people),
        districtManager: resolveActivePerson(loc.districtManagerId, people),
      });
    });
    return map;
  }, [locations, people]);

  const districts = useMemo(() => {
    return Array.from(new Set(locations.map(l => l.district).filter(Boolean))).sort() as string[];
  }, [locations]);

  const states = useMemo(() => {
    return Array.from(new Set(locations.map(l => l.state).filter(Boolean))).sort() as string[];
  }, [locations]);

  const activeCount = locations.filter(l => l.recordStatus !== 'Retired').length;
  const retiredCount = locations.filter(l => l.recordStatus === 'Retired').length;

  const filtered = useMemo(() => {
    return locations.filter(loc => {
      if (!includeRetired && loc.recordStatus === 'Retired') return false;
      if (districtFilter !== 'all' && loc.district !== districtFilter) return false;
      if (stateFilter !== 'all' && loc.state !== stateFilter) return false;
      if (statusFilter !== 'all' && loc.operationalStatus !== statusFilter) return false;
      if (typeFilter !== 'all' && loc.type !== typeFilter) return false;
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      const leadership = leadershipByLocationId.get(loc.id);
      return (
        loc.storeNumber.includes(term) ||
        loc.name.toLowerCase().includes(term) ||
        loc.city.toLowerCase().includes(term) ||
        loc.state.toLowerCase().includes(term) ||
        loc.type.toLowerCase().includes(term) ||
        leadership?.storeManager?.fullName.toLowerCase().includes(term) ||
        leadership?.districtManager?.fullName.toLowerCase().includes(term)
      );
    });
  }, [locations, includeRetired, districtFilter, stateFilter, statusFilter, typeFilter, searchTerm, leadershipByLocationId]);

  // District Groups calculation
  const districtGroups = useMemo(() => {
    const map = new Map<string, LocationRecord[]>();
    filtered.forEach(loc => {
      const d = loc.district || 'Unassigned District';
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(loc);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Multi-select helpers
  const isAllSelected = filtered.length > 0 && filtered.every(l => selectedStoreIds.includes(l.id));
  const isIndeterminate = !isAllSelected && filtered.some(l => selectedStoreIds.includes(l.id));

  const toggleSelectStore = (id: string) => {
    setSelectedStoreIds(prev => 
      prev.includes(id) ? prev.filter(sId => sId !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      const filteredIdSet = new Set(filtered.map(l => l.id));
      setSelectedStoreIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const merged = new Set([...selectedStoreIds, ...filtered.map(l => l.id)]);
      setSelectedStoreIds(Array.from(merged));
    }
  };

  const handleToggleDistrictSelect = (districtLocs: LocationRecord[]) => {
    const distIds = districtLocs.map(l => l.id);
    const allInDistSelected = distIds.every(id => selectedStoreIds.includes(id));
    if (allInDistSelected) {
      setSelectedStoreIds(prev => prev.filter(id => !distIds.includes(id)));
    } else {
      setSelectedStoreIds(prev => Array.from(new Set([...prev, ...distIds])));
    }
  };

  const hasActiveFilters = 
    districtFilter !== 'all' || 
    stateFilter !== 'all' || 
    statusFilter !== 'all' || 
    typeFilter !== 'all' || 
    searchTerm.trim() !== '';

  const resetFilters = () => {
    setSearchTerm('');
    setDistrictFilter('all');
    setStateFilter('all');
    setStatusFilter('all');
    setTypeFilter('all');
  };

  const handleApplyBulkUpdates = () => {
    if (selectedStoreIds.length === 0) return;

    selectedStoreIds.forEach(storeId => {
      const loc = locations.find(l => l.id === storeId);
      const updates: Partial<LocationRecord> & { holidayOverrides?: any[] } = {};

      if (bulkTemplateId) {
        applyHoursTemplate(storeId, bulkTemplateId);
      }
      if (bulkStatus) {
        updates.operationalStatus = bulkStatus as OperationalStatus;
      }

      // Map Corporate Holiday / Temporary Exception
      if (exceptionName.trim()) {
        const isClosed = exceptionOperatingStatus === 'Closed';
        const hoursDesc = isClosed 
          ? 'Closed All Day' 
          : `Modified Hours (${exceptionOpenTime} - ${exceptionCloseTime})`;

        // 1. Map into activeNotice
        updates.activeNotice = {
          shortDescription: `${exceptionName.trim()}: ${hoursDesc}`,
          effectiveDate: exceptionStartDate || new Date().toISOString().split('T')[0],
          expectedResolutionDate: exceptionEndDate || exceptionStartDate || undefined,
          displayUntilDate: exceptionEndDate || exceptionStartDate || undefined,
        };

        // 2. Map into holidayHours / holidayOverrides array
        const newOverride = {
          id: `hol-${Date.now()}-${storeId}`,
          holidayName: exceptionName.trim(),
          date: exceptionStartDate || new Date().toISOString().split('T')[0],
          hours: {
            open: isClosed ? '00:00' : exceptionOpenTime,
            close: isClosed ? '00:00' : exceptionCloseTime,
            isClosed: isClosed
          }
        };

        const existingHolidays = loc?.holidayHours || [];
        const filteredHolidays = existingHolidays.filter(
          h => h.holidayName !== exceptionName.trim() || h.date !== newOverride.date
        );
        const combinedHolidays = [...filteredHolidays, newOverride];
        updates.holidayHours = combinedHolidays;
        updates.holidayOverrides = combinedHolidays;

        // If operational status was not explicitly selected, set appropriate status
        if (!bulkStatus) {
          updates.operationalStatus = isClosed 
            ? 'Temporarily Closed — Emergency' 
            : 'Temporarily Modified Hours';
        }
      }

      if (Object.keys(updates).length > 0) {
        updateLocation(storeId, updates);
      }
    });

    const count = selectedStoreIds.length;
    setBulkSuccessMsg(`Successfully updated ${count} location${count > 1 ? 's' : ''}`);
    setTimeout(() => setBulkSuccessMsg(null), 4000);
    setSelectedStoreIds([]);
    setIsBulkModalOpen(false);
    setBulkStatus('');
    setBulkTemplateId('');
    setExceptionName('');
    setExceptionStartDate('');
    setExceptionEndDate('');
    setExceptionOperatingStatus('Closed');
    setExceptionOpenTime('10:00');
    setExceptionCloseTime('18:00');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Store Locations Directory"
        description={`${activeCount} active location${activeCount === 1 ? '' : 's'}${states.length > 0 ? ` across ${states.join(', ')}` : ''}${retiredCount > 0 ? ` (${retiredCount} retired in archive)` : ''}`}
        actions={canAdd ? (
          <Button variant="primary" size="sm" onClick={onAddNewLocation}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Store Location
          </Button>
        ) : undefined}
      />

      {/* Bulk Success Banner */}
      {bulkSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{bulkSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkSuccessMsg(null)}
            className="text-emerald-500 hover:text-emerald-800 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter Ribbon */}
      <div className="flex items-center justify-between gap-3 bg-white p-3 rounded-xl border border-neutral-200 shadow-xs flex-wrap">
        <div className="flex items-center gap-2.5 flex-1 min-w-[280px] flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search store #, name, city, manager, district..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-7 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500 focus:bg-white"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* All Districts Dropdown */}
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            className="bg-neutral-50 hover:bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer shadow-2xs"
          >
            <option value="all">All Districts</option>
            {districts.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* All States Dropdown */}
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="bg-neutral-50 hover:bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer shadow-2xs"
          >
            <option value="all">All States</option>
            {states.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* All Statuses Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-50 hover:bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer shadow-2xs"
          >
            <option value="all">All Statuses</option>
            {operationalStatuses.map(st => (
              <option key={st} value={st}>{st}</option>
            ))}
          </select>

          {/* All Types Dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-neutral-50 hover:bg-white border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer shadow-2xs"
          >
            <option value="all">All Types</option>
            {locationTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline px-1 cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Include Retired Stores Toggle */}
        <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer select-none bg-neutral-50 hover:bg-neutral-100 px-2.5 py-1.5 rounded-lg border border-neutral-200 transition-colors">
          <input
            type="checkbox"
            checked={includeRetired}
            onChange={(e) => setIncludeRetired(e.target.checked)}
            className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer"
          />
          <span>Include Retired Stores</span>
          {retiredCount > 0 && (
            <span className="text-[10px] bg-neutral-200 text-neutral-600 px-1.5 py-0.2 rounded-full">
              {retiredCount}
            </span>
          )}
        </label>
      </div>

      {/* Secondary Action Bar & View Toggles */}
      <div className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 rounded-xl border border-neutral-200 shadow-xs flex-wrap">
        {/* Left Side: Select All toggle and Bulk Update button */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-neutral-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isAllSelected}
              ref={el => {
                if (el) el.indeterminate = isIndeterminate;
              }}
              onChange={handleToggleSelectAll}
              className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer w-4 h-4"
            />
            <span>
              Select All {selectedStoreIds.length > 0 && (
                <span className="text-red-600 font-bold">({selectedStoreIds.length} selected)</span>
              )}
            </span>
          </label>

          <div className="h-4 w-px bg-neutral-200" />

          <button
            type="button"
            disabled={selectedStoreIds.length === 0}
            onClick={() => setIsBulkModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-2xs ${
              selectedStoreIds.length > 0
                ? 'bg-neutral-900 hover:bg-neutral-800 text-white cursor-pointer'
                : 'bg-neutral-100 text-neutral-400 border border-neutral-200 cursor-not-allowed'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Configure Bulk Hours & Holiday Exception</span>
          </button>

          {selectedStoreIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedStoreIds([])}
              className="text-[11px] text-neutral-500 hover:text-neutral-800 hover:underline cursor-pointer"
            >
              Deselect all
            </button>
          )}
        </div>

        {/* Right Side: Toggle Group mapping strictly to Table View, District Groups, and Cards View */}
        <div className="flex items-center bg-neutral-100 p-0.5 rounded-lg border border-neutral-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Table className="w-3.5 h-3.5" />
            <span>Table View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('district')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === 'district'
                ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>District Groups</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
              viewMode === 'cards'
                ? 'bg-white text-neutral-900 shadow-2xs font-bold'
                : 'text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards View</span>
          </button>
        </div>
      </div>

      {/* Main Content Area: Table View */}
      {viewMode === 'table' && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-700">
              <thead className="bg-neutral-50 text-neutral-500 font-semibold border-b border-neutral-200 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={el => {
                        if (el) el.indeterminate = isIndeterminate;
                      }}
                      onChange={handleToggleSelectAll}
                      className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer w-4 h-4"
                    />
                  </th>
                  <th className="py-3 px-4">Store</th>
                  <th className="py-3 px-4">Address & City</th>
                  <th className="py-3 px-4">Today's Hours</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">District Manager</th>
                  <th className="py-3 px-4">Store Manager</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-neutral-400">
                      No store locations match the active search and filter criteria.
                    </td>
                  </tr>
                ) : (
                  filtered.map(loc => {
                    const todayHours = getTodayHoursForLocation(loc);
                    const isRetired = loc.recordStatus === 'Retired';
                    const isSelected = selectedStoreIds.includes(loc.id);

                    return (
                      <tr
                        key={loc.id}
                        onClick={() => onSelectLocation(loc)}
                        className={`cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-red-50/70 hover:bg-red-50/90 font-medium' 
                            : 'hover:bg-neutral-50/80'
                        } ${isRetired ? 'bg-neutral-50/50 opacity-75' : ''}`}
                      >
                        <td 
                          className="py-3 px-3.5 text-center" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStore(loc.id)}
                            className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer w-4 h-4"
                          />
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                              #{loc.storeNumber}
                            </span>
                            <div className="font-semibold text-neutral-900">{loc.name}</div>
                            {isRetired && (
                              <span className="text-[10px] font-bold text-neutral-500 bg-neutral-200 px-1.5 py-0.5 rounded">
                                Retired
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="text-neutral-900 font-medium">{loc.city}, {loc.state}</div>
                          <div className="text-[11px] text-neutral-500 truncate max-w-[180px]">{loc.address}</div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-neutral-800">{todayHours.hoursString}</div>
                          {todayHours.isHolidayOverride && (
                            <span className="text-[10px] text-amber-600 font-medium">★ Holiday Override</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <OperationalStatusBadge status={loc.operationalStatus} />
                        </td>

                        <td className="py-3 px-4">
                          {leadershipByLocationId.get(loc.id)?.districtManager ? (
                            <button
                              type="button"
                              onClick={(e) => handleOpenPerson(e, leadershipByLocationId.get(loc.id)?.districtManager?.id)}
                              className="hover:text-red-600 hover:underline text-left cursor-pointer flex items-center gap-1 font-medium text-neutral-800"
                            >
                              <span>{leadershipByLocationId.get(loc.id)?.districtManager?.fullName}</span>
                              <ExternalLink className="w-3 h-3 text-neutral-400" />
                            </button>
                          ) : (
                            <span className="text-neutral-400 italic">Unassigned</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {leadershipByLocationId.get(loc.id)?.storeManager ? (
                            <button
                              type="button"
                              onClick={(e) => handleOpenPerson(e, leadershipByLocationId.get(loc.id)?.storeManager?.id)}
                              className="hover:text-red-600 hover:underline text-left cursor-pointer flex items-center gap-1 font-medium text-neutral-800"
                            >
                              <span>{leadershipByLocationId.get(loc.id)?.storeManager?.fullName}</span>
                              <ExternalLink className="w-3 h-3 text-neutral-400" />
                            </button>
                          ) : (
                            <span className="text-neutral-400 italic">Position Vacant</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right">
                          <ChevronRight className="w-4 h-4 text-neutral-400 inline-block" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Main Content Area: District Groups View */}
      {viewMode === 'district' && (
        <div className="space-y-4">
          {districtGroups.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-neutral-400">
              No districts match the active filter criteria.
            </div>
          ) : (
            districtGroups.map(([districtName, distLocs]) => {
              const allInDistSelected = distLocs.every(l => selectedStoreIds.includes(l.id));
              const someInDistSelected = !allInDistSelected && distLocs.some(l => selectedStoreIds.includes(l.id));
              const districtManager = distLocs.map(l => leadershipByLocationId.get(l.id)?.districtManager).find(Boolean);

              return (
                <div key={districtName} className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
                  {/* District Header */}
                  <div className="bg-neutral-50 px-4 py-3 border-b border-neutral-200 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={allInDistSelected}
                        ref={el => {
                          if (el) el.indeterminate = someInDistSelected;
                        }}
                        onChange={() => handleToggleDistrictSelect(distLocs)}
                        className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer w-4 h-4"
                        title="Select all stores in this district"
                      />
                      <div className="flex items-center gap-2">
                        <Building className="w-4 h-4 text-neutral-500" />
                        <h3 className="font-bold text-neutral-900 text-sm">{districtName}</h3>
                        <span className="bg-neutral-200 text-neutral-700 text-[10px] font-bold px-2 py-0.5 rounded-full font-mono">
                          {distLocs.length} store{distLocs.length > 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-neutral-600 flex items-center gap-1.5">
                      <span className="text-neutral-400">District Manager:</span>
                      {districtManager ? (
                        <button
                          type="button"
                          onClick={(e) => handleOpenPerson(e, districtManager.id)}
                          className="font-semibold text-neutral-800 hover:text-red-600 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>{districtManager.fullName}</span>
                          <ExternalLink className="w-3 h-3 text-neutral-400" />
                        </button>
                      ) : (
                        <span className="italic text-neutral-400">Unassigned</span>
                      )}
                    </div>
                  </div>

                  {/* District Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-neutral-700">
                      <tbody className="divide-y divide-neutral-100">
                        {distLocs.map(loc => {
                          const todayHours = getTodayHoursForLocation(loc);
                          const isSelected = selectedStoreIds.includes(loc.id);

                          return (
                            <tr
                              key={loc.id}
                              onClick={() => onSelectLocation(loc)}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-red-50/70 hover:bg-red-50/90 font-medium' : 'hover:bg-neutral-50/80'
                              }`}
                            >
                              <td className="py-2.5 px-3.5 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectStore(loc.id)}
                                  className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer w-4 h-4"
                                />
                              </td>
                              <td className="py-2.5 px-4 w-60">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                    #{loc.storeNumber}
                                  </span>
                                  <span className="font-semibold text-neutral-900">{loc.name}</span>
                                </div>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-neutral-800">{loc.city}, {loc.state}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="font-medium text-neutral-700">{todayHours.hoursString}</span>
                              </td>
                              <td className="py-2.5 px-4">
                                <OperationalStatusBadge status={loc.operationalStatus} />
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="text-neutral-600">{leadershipByLocationId.get(loc.id)?.storeManager?.fullName || 'Vacant'}</span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                <ChevronRight className="w-4 h-4 text-neutral-400 inline-block" />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Main Content Area: Cards View */}
      {viewMode === 'cards' && (
        <div>
          {filtered.length === 0 ? (
            <div className="bg-white border border-neutral-200 rounded-xl p-8 text-center text-neutral-400">
              No store locations match the active search and filter criteria.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(loc => {
                const isSelected = selectedStoreIds.includes(loc.id);
                const todayHours = getTodayHoursForLocation(loc);
                const isRetired = loc.recordStatus === 'Retired';

                return (
                  <div
                    key={loc.id}
                    onClick={() => onSelectLocation(loc)}
                    className={`bg-white rounded-xl border p-4 hover:shadow-md transition-all cursor-pointer relative space-y-3 ${
                      isSelected
                        ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50/25'
                        : 'border-neutral-200 hover:border-neutral-300 shadow-xs'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div 
                          onClick={(e) => e.stopPropagation()} 
                          className="pt-0.5"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectStore(loc.id)}
                            className="rounded border-neutral-300 text-red-600 focus:ring-red-500 cursor-pointer w-4 h-4"
                          />
                        </div>
                        <span className="font-mono font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 text-xs">
                          #{loc.storeNumber}
                        </span>
                        <div>
                          <h4 className="font-bold text-neutral-900 text-sm leading-tight">{loc.name}</h4>
                          <span className="text-[10px] text-neutral-400">{loc.type}</span>
                        </div>
                      </div>
                      <OperationalStatusBadge status={loc.operationalStatus} />
                    </div>

                    {/* Card Details */}
                    <div className="space-y-1.5 text-xs text-neutral-600 border-t border-neutral-100 pt-2.5">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate">{loc.address}, {loc.city}, {loc.state} {loc.zipCode}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="font-medium text-neutral-800">{todayHours.hoursString}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span>{loc.phone}</span>
                      </div>
                    </div>

                    {/* Card Footer: District & Manager */}
                    <div className="border-t border-neutral-100 pt-2 flex items-center justify-between text-[11px] text-neutral-500">
                      <span className="truncate max-w-[140px]">{loc.district || 'Unassigned District'}</span>
                      <span className="font-medium text-neutral-700 truncate max-w-[130px]">
                        {leadershipByLocationId.get(loc.id)?.storeManager?.fullName ? `Mgr: ${leadershipByLocationId.get(loc.id)?.storeManager?.fullName}` : 'Vacant'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bulk Update Hours & Status Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-bold text-neutral-900 text-base">Bulk Update Fleet Locations</h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Applying batch modifications to <strong className="text-neutral-800">{selectedStoreIds.length}</strong> selected store{selectedStoreIds.length > 1 ? 's' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-neutral-700 mb-1.5">
                  Update Operational Status
                </label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="">-- Keep Current Status (No Change) --</option>
                  {operationalStatuses.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Will instantly adjust status across Google Business Profile and customer directory.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1.5">
                  Apply Standard Hours Template
                </label>
                <select
                  value={bulkTemplateId}
                  onChange={(e) => setBulkTemplateId(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="">-- Keep Current Hours (No Change) --</option>
                  {hoursTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name} {t.description ? `(${t.description})` : ''}</option>
                  ))}
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">
                  Replaces regular weekly schedules with the selected operating template.
                </p>
              </div>

              {/* Corporate Holiday / Temporary Exception Section */}
              <div className="border border-neutral-200 bg-neutral-50/80 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-neutral-800 text-xs">
                    <Calendar className="w-3.5 h-3.5 text-red-600" />
                    <span>Corporate Holiday / Temporary Exception</span>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-medium">Optional Override</span>
                </div>
                
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                      Exception Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Thanksgiving, Christmas Eve, Special Inventory"
                      value={exceptionName}
                      onChange={(e) => setExceptionName(e.target.value)}
                      className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={exceptionStartDate}
                        onChange={(e) => setExceptionStartDate(e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={exceptionEndDate}
                        onChange={(e) => setExceptionEndDate(e.target.value)}
                        className="w-full bg-white border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:border-red-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-600 mb-1">
                      Operating Status
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExceptionOperatingStatus('Closed')}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          exceptionOperatingStatus === 'Closed'
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        Closed (All Day)
                      </button>
                      <button
                        type="button"
                        onClick={() => setExceptionOperatingStatus('Modified Hours')}
                        className={`py-1.5 px-3 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          exceptionOperatingStatus === 'Modified Hours'
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        Modified Hours
                      </button>
                    </div>
                  </div>

                  {exceptionOperatingStatus === 'Modified Hours' && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-500 mb-1">
                          Open Time
                        </label>
                        <input
                          type="time"
                          value={exceptionOpenTime}
                          onChange={(e) => setExceptionOpenTime(e.target.value)}
                          className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:border-red-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-neutral-500 mb-1">
                          Close Time
                        </label>
                        <input
                          type="time"
                          value={exceptionCloseTime}
                          onChange={(e) => setExceptionCloseTime(e.target.value)}
                          className="w-full bg-white border border-neutral-300 rounded-lg px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:border-red-500 font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-neutral-500">
                    Will inject schedule overrides into Google Maps and public store directory active notices.
                  </p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 text-[11px]">
                ⚠️ Warning: Bulk operations will immediately update all {selectedStoreIds.length} stores in staging state. Ensure you have confirmed hours schedules with district management before applying.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setIsBulkModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-neutral-600 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200/80 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!bulkStatus && !bulkTemplateId && !exceptionName.trim()}
                onClick={handleApplyBulkUpdates}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-xs ${
                  bulkStatus || bulkTemplateId || exceptionName.trim()
                    ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer'
                    : 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                }`}
              >
                Apply Updates to {selectedStoreIds.length} Stores
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
