import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  MapPin, 
  Phone, 
  Clock, 
  User, 
  ShieldCheck, 
  Plus, 
  Download, 
  Printer, 
  Grid, 
  List, 
  Layers, 
  CheckCircle2, 
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  Lock
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord } from '../../types';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';
import { OperationalStatusBadge, PrivacyBadge } from '../common/StatusBadge';

interface LocationsViewProps {
  onSelectLocation: (location: LocationRecord) => void;
  onEditLocation: (location: LocationRecord) => void;
  onAddNewLocation: () => void;
  onRequestCorrection: (location: LocationRecord) => void;
  onNavigateToPdf: () => void;
}

export const LocationsView: React.FC<LocationsViewProps> = ({
  onSelectLocation,
  onEditLocation,
  onAddNewLocation,
  onRequestCorrection,
  onNavigateToPdf,
}) => {
  const { locations, currentUser } = useDirectory();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'district-groups'>('table');

  const canEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const isViewer = currentUser.role === 'Viewer';

  const filteredLocations = useMemo(() => {
    return locations.filter(loc => {
      // Search
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || (
        loc.storeNumber.toLowerCase().includes(term) ||
        loc.name.toLowerCase().includes(term) ||
        (loc.mallOrCenterName && loc.mallOrCenterName.toLowerCase().includes(term)) ||
        loc.city.toLowerCase().includes(term) ||
        loc.state.toLowerCase().includes(term) ||
        loc.zipCode.includes(term) ||
        loc.phone.includes(term) ||
        (loc.storeManagerName && loc.storeManagerName.toLowerCase().includes(term)) ||
        (loc.districtManagerName && loc.districtManagerName.toLowerCase().includes(term))
      );

      // District filter
      const matchesDistrict = selectedDistrict === 'all' || loc.district === selectedDistrict || (selectedDistrict === 'rudy' && loc.districtManagerName?.includes('Rudy')) || (selectedDistrict === 'david' && loc.districtManagerName?.includes('David')) || (selectedDistrict === 'karlo' && loc.districtManagerName?.includes('Karlo'));

      // State filter
      const matchesState = selectedState === 'all' || loc.state === selectedState;

      // Status filter
      const matchesStatus = selectedStatus === 'all' || (
        selectedStatus === 'open' ? loc.operationalStatus === 'Open — Normal Operations' : loc.operationalStatus !== 'Open — Normal Operations'
      );

      // Type filter
      const matchesType = selectedType === 'all' || loc.type === selectedType;

      return matchesSearch && matchesDistrict && matchesState && matchesStatus && matchesType;
    });
  }, [locations, searchTerm, selectedDistrict, selectedState, selectedStatus, selectedType]);

  // Export CSV matching exact Blueprint Specification Section 13
  const handleExportCsv = () => {
    const headers = [
      'location_id',
      'store_number',
      'location_name',
      'location_type',
      'mall_or_center_name',
      'address_1',
      'city',
      'state',
      'postal_code',
      'phone',
      'region',
      'district',
      'store_manager',
      'store_manager_phone',
      'district_manager',
      'operational_status',
      'last_updated'
    ];

    const rows = filteredLocations.map(loc => {
      const isQuarantined = loc.storeManagerPhoneVisibility === 'Pending Review' || loc.isStoreManagerPhoneVerified === false;
      const exportedManagerPhone = (isQuarantined && isViewer) ? '(•••) •••-••••' : (loc.storeManagerPhone || '');

      return [
        `"${loc.id}"`,
        `"${loc.storeNumber}"`,
        `"${loc.name.replace(/"/g, '""')}"`,
        `"${loc.type}"`,
        `"${loc.mallOrCenterName || ''}"`,
        `"${loc.address.replace(/"/g, '""')}"`,
        `"${loc.city}"`,
        `"${loc.state}"`,
        `"${loc.zipCode}"`,
        `"${loc.phone}"`,
        `"${loc.region || ''}"`,
        `"${loc.district || ''}"`,
        `"${loc.storeManagerName || ''}"`,
        `"${exportedManagerPhone}"`,
        `"${loc.districtManagerName || ''}"`,
        `"${loc.operationalStatus}"`,
        `"${loc.lastUpdated}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shiekh_store_directory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper for district color styling (WCAG AA compliant contrast)
  const getDistrictBadgeStyle = (dmName?: string) => {
    if (dmName?.includes('Rudy')) return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    if (dmName?.includes('David')) return 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800';
    if (dmName?.includes('Karlo')) return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-300 dark:border-neutral-700';
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Quick Actions */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Retail Locations & Stores Master
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
              {filteredLocations.length} locations
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Authoritative source of truth for store contacts, addresses, hours, and leadership assignments.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onNavigateToPdf}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-neutral-500" />
            <span>1-Sheet PDF</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-neutral-500" />
            <span>Export CSV</span>
          </button>

          {canEdit && (
            <button
              onClick={onAddNewLocation}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Location</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search store number, mall name, city, address, manager name..."
              className="w-full pl-9 pr-4 py-2 bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-neutral-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* View Switcher */}
          <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg self-start md:self-auto shrink-0">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'table' 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold' 
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table View</span>
            </button>
            <button
              onClick={() => setViewMode('district-groups')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'district-groups' 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold' 
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">District Groups</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'cards' 
                  ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-2xs font-semibold' 
                  : 'text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cards View</span>
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
          <div className="flex items-center gap-1 text-neutral-400 font-medium">
            <Filter className="w-3 h-3" />
            <span>Filters:</span>
          </div>

          {/* District Filter */}
          <select
            value={selectedDistrict}
            onChange={e => setSelectedDistrict(e.target.value)}
            className="px-2 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs text-neutral-700 dark:text-neutral-300"
          >
            <option value="all">All Districts</option>
            <option value="rudy">District 1 · Rudy Calderon (NorCal / NV / WA / OR / TX)</option>
            <option value="david">District 2 · David Castro (Central Valley & LA)</option>
            <option value="karlo">District 3 · Karlo Llovido (Inland Empire / SD)</option>
            <option value="Non-Retail / Corporate">Corporate / Logistics</option>
          </select>

          {/* State Filter */}
          <select
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
            className="px-2 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs text-neutral-700 dark:text-neutral-300"
          >
            <option value="all">All States</option>
            <option value="CA">California (CA)</option>
            <option value="NV">Nevada (NV)</option>
            <option value="WA">Washington (WA)</option>
            <option value="OR">Oregon (OR)</option>
            <option value="TX">Texas (TX)</option>
          </select>

          {/* Operational Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="px-2 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs text-neutral-700 dark:text-neutral-300"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open (Normal Operations)</option>
            <option value="alerts">Alerts / Modified / Remodel</option>
          </select>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value)}
            className="px-2 py-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-xs text-neutral-700 dark:text-neutral-300"
          >
            <option value="all">All Types</option>
            <option value="Enclosed Mall">Enclosed Mall</option>
            <option value="Strip Center / Shopping Center">Strip Center</option>
            <option value="Street / Standalone Location">Street / Standalone</option>
            <option value="Corporate Office">Corporate</option>
            <option value="Warehouse / Distribution Center">Warehouse / DC</option>
          </select>

          {(selectedDistrict !== 'all' || selectedState !== 'all' || selectedStatus !== 'all' || selectedType !== 'all' || searchTerm) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDistrict('all');
                setSelectedState('all');
                setSelectedStatus('all');
                setSelectedType('all');
              }}
              className="text-[11px] text-red-600 dark:text-red-400 hover:underline ml-auto font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Content Render */}
      {viewMode === 'table' && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/80 text-neutral-500 dark:text-neutral-400 font-semibold border-b border-neutral-200 dark:border-neutral-800">
                  <th className="py-2.5 px-3">Store #</th>
                  <th className="py-2.5 px-3">Location Name & Address</th>
                  <th className="py-2.5 px-3">City / State</th>
                  <th className="py-2.5 px-3">Store Phone</th>
                  <th className="py-2.5 px-3">District Manager</th>
                  <th className="py-2.5 px-3">Store Manager</th>
                  <th className="py-2.5 px-3">Status / Today's Hours</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60">
                {filteredLocations.map(loc => {
                  const hours = getTodayHoursForLocation(loc);
                  const isQuarantined = loc.storeManagerPhoneVisibility === 'Pending Review' || loc.isStoreManagerPhoneVerified === false;
                  const isManagementOnly = loc.storeManagerPhoneVisibility === 'Internal Management Only';
                  const shouldMaskPhone = (isQuarantined || isManagementOnly) && isViewer;

                  return (
                    <tr
                      key={loc.id}
                      onClick={() => onSelectLocation(loc)}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 cursor-pointer transition-colors group"
                    >
                      <td className="py-2.5 px-3 font-bold text-neutral-900 dark:text-neutral-100">
                        <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 font-mono text-xs">
                          #{loc.storeNumber}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-red-600 dark:group-hover:text-red-400">
                          {loc.name}
                        </div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                          {loc.address}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-neutral-800 dark:text-neutral-200">{loc.city}</span>
                        <span className="text-neutral-400 ml-1 font-bold">{loc.state}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        <a
                          href={`tel:${loc.phone}`}
                          onClick={e => e.stopPropagation()}
                          className="font-medium text-neutral-700 dark:text-neutral-300 hover:text-red-600 hover:underline"
                        >
                          {loc.phone}
                        </a>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${getDistrictBadgeStyle(loc.districtManagerName)}`}>
                          {loc.districtManagerName || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">
                          {loc.storeManagerName || <span className="text-neutral-400 italic">Vacant</span>}
                        </div>
                        {loc.storeManagerPhone && (
                          <div className="text-[10px] text-neutral-500 font-mono flex items-center gap-1 mt-0.5">
                            {shouldMaskPhone ? (
                              <span className="text-neutral-400 font-semibold tracking-wider flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5 text-amber-500" />
                                (•••) •••-••••
                              </span>
                            ) : (
                              <span>{loc.storeManagerPhone}</span>
                            )}
                            <PrivacyBadge 
                              visibility={loc.storeManagerPhoneVisibility || (loc.isStoreManagerPhoneVerified === false ? 'Pending Review' : 'Directory Public')} 
                              isVerified={loc.isStoreManagerPhoneVerified ?? true}
                              size="sm"
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="space-y-1">
                          <OperationalStatusBadge status={loc.operationalStatus} size="sm" />
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {hours.hoursString}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onRequestCorrection(loc)}
                            className="p-1 text-neutral-400 hover:text-amber-600 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                            title="Request Correction"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onSelectLocation(loc)}
                            className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded font-medium text-[11px]"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* District Grouped View (Reflecting Reference Spreadsheet) */}
      {viewMode === 'district-groups' && (
        <div className="space-y-4">
          {[
            { dm: 'Rudy Calderon', title: 'District 1 · Rudy Calderon (NorCal, NV, WA, OR, TX)', color: 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20' },
            { dm: 'David Castro', title: 'District 2 · David Castro (Central Valley & LA Central)', color: 'border-blue-300 bg-blue-50/40 dark:bg-blue-950/20' },
            { dm: 'Karlo Llovido', title: 'District 3 · Karlo Llovido (Inland Empire, South Bay, San Diego)', color: 'border-rose-300 bg-rose-50/40 dark:bg-rose-950/20' },
            { dm: 'Corporate', title: 'Corporate Offices & Logistics Facilities', color: 'border-neutral-300 bg-neutral-50/60 dark:bg-neutral-900' }
          ].map(grp => {
            const grpStores = filteredLocations.filter(loc => {
              if (grp.dm === 'Corporate') return loc.type === 'Corporate Office' || loc.type === 'Warehouse / Distribution Center';
              return loc.districtManagerName?.includes(grp.dm);
            });

            if (grpStores.length === 0) return null;

            return (
              <div key={grp.dm} className={`rounded-xl border p-4 ${grp.color} space-y-3`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    {grp.title} ({grpStores.length} locations)
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grpStores.map(loc => {
                    const hours = getTodayHoursForLocation(loc);
                    const isQuarantined = loc.storeManagerPhoneVisibility === 'Pending Review' || loc.isStoreManagerPhoneVerified === false;
                    const isManagementOnly = loc.storeManagerPhoneVisibility === 'Internal Management Only';
                    const shouldMaskPhone = (isQuarantined || isManagementOnly) && isViewer;

                    return (
                      <div
                        key={loc.id}
                        onClick={() => onSelectLocation(loc)}
                        className="p-3 bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-2xs hover:shadow-xs hover:border-red-500 cursor-pointer transition-all space-y-2"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-neutral-900 text-white font-mono">
                              #{loc.storeNumber}
                            </span>
                            <h4 className="font-bold text-xs text-neutral-900 dark:text-neutral-100 mt-1">
                              {loc.name}
                            </h4>
                          </div>
                          <OperationalStatusBadge status={loc.operationalStatus} size="sm" />
                        </div>

                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {loc.city}, {loc.state} • <a href={`tel:${loc.phone}`} className="font-semibold text-neutral-700 dark:text-neutral-300 hover:text-red-600">{loc.phone}</a>
                        </div>

                        <div className="text-[11px] pt-1.5 border-t border-neutral-100 dark:border-neutral-700/60 flex items-center justify-between text-neutral-600 dark:text-neutral-300">
                          <span>SM: <strong className="text-neutral-900 dark:text-neutral-100">{loc.storeManagerName || 'Vacant'}</strong></span>
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {shouldMaskPhone ? '(•••) •••-••••' : loc.storeManagerPhone}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cards View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredLocations.map(loc => {
            const hours = getTodayHoursForLocation(loc);
            const isQuarantined = loc.storeManagerPhoneVisibility === 'Pending Review' || loc.isStoreManagerPhoneVerified === false;
            const isManagementOnly = loc.storeManagerPhoneVisibility === 'Internal Management Only';
            const shouldMaskPhone = (isQuarantined || isManagementOnly) && isViewer;

            return (
              <div
                key={loc.id}
                onClick={() => onSelectLocation(loc)}
                className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs hover:shadow-md hover:border-red-500 cursor-pointer transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 bg-neutral-900 text-white rounded text-xs font-bold font-mono">
                      STORE #{loc.storeNumber}
                    </span>
                    <OperationalStatusBadge status={loc.operationalStatus} size="sm" />
                  </div>

                  <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                    {loc.name}
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {loc.address}, {loc.city}, {loc.state} {loc.zipCode}
                  </p>

                  <div className="mt-2.5 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Phone:</span>
                      <a href={`tel:${loc.phone}`} className="font-bold text-red-600 dark:text-red-400">{loc.phone}</a>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Store Manager:</span>
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {loc.storeManagerName || 'Vacant'} {shouldMaskPhone ? '(•••) •••-••••' : (loc.storeManagerPhone ? `(${loc.storeManagerPhone})` : '')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">District:</span>
                      <span className="text-[11px] font-medium">{loc.districtManagerName || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-xs text-neutral-400">
                  <span>ID: {loc.id}</span>
                  <span className="text-red-600 dark:text-red-400 font-semibold hover:underline">View Record →</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
