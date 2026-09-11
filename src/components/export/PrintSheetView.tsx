import React, { useMemo, useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { Printer, AlertTriangle, Filter, Search } from 'lucide-react';
import { LocationRecord } from '../../types';
import { resolveActivePerson } from '../../lib/readProjectionContract';
import { Button } from '../common/Button';
import { PageHeader } from '../common/PageHeader';

export const PrintSheetView: React.FC = () => {
  const { locations, people } = useDirectory();
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handlePrint = () => {
    window.print();
  };

  const leadershipByLocationId = useMemo(() => {
    const map = new Map<string, { storeManagerName?: string; districtManagerName?: string }>();
    locations.forEach(loc => {
      map.set(loc.id, {
        storeManagerName: resolveActivePerson(loc.storeManagerId, people)?.fullName,
        districtManagerName: resolveActivePerson(loc.districtManagerId, people)?.fullName,
      });
    });
    return map;
  }, [locations, people]);

  // Get distinct districts sorted
  const distinctDistricts = Array.from(
    new Set(locations.map(l => l.district).filter(Boolean))
  ).sort() as string[];

  // Filter locations
  const filteredLocations = locations.filter(loc => {
    if (districtFilter !== 'all' && loc.district !== districtFilter) return false;
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const leadership = leadershipByLocationId.get(loc.id);
    return (
      loc.storeNumber.includes(term) ||
      loc.name.toLowerCase().includes(term) ||
      loc.city.toLowerCase().includes(term) ||
      loc.state.toLowerCase().includes(term) ||
      loc.phone.toLowerCase().includes(term) ||
      leadership?.storeManagerName?.toLowerCase().includes(term) ||
      leadership?.districtManagerName?.toLowerCase().includes(term)
    );
  });

  // Group filtered locations by district
  const groupedByDistrict = new Map<string, { dmName: string; stores: LocationRecord[] }>();

  // Ensure consistent district ordering
  const sortedDistricts = Array.from(
    new Set(filteredLocations.map(l => l.district || 'Unassigned District'))
  ).sort();

  sortedDistricts.forEach(districtName => {
    const storesInDistrict = filteredLocations
      .filter(l => (l.district || 'Unassigned District') === districtName)
      .sort((a, b) => {
        const numA = parseInt(a.storeNumber, 10);
        const numB = parseInt(b.storeNumber, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.storeNumber.localeCompare(b.storeNumber);
      });

    if (storesInDistrict.length > 0) {
      const dmName = storesInDistrict
        .map(store => leadershipByLocationId.get(store.id)?.districtManagerName)
        .find(Boolean) || 'Unassigned DM';
      groupedByDistrict.set(districtName, { dmName, stores: storesInDistrict });
    }
  });

  const currentDate = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <div className="space-y-4 print:space-y-0">
      <div className="print:hidden">
        <PageHeader
          title="1-Sheet Retail Directory PDF"
          description={`Compact landscape export grouped by District Manager (${filteredLocations.length} stores displayed)`}
        />
      </div>

      {/* Print Controls / Action Bar - Hidden in Print Mode */}
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-xs print:hidden sm:flex-row sm:items-center sm:justify-end">
          <div className="relative flex-1 sm:max-w-56">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter table..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-neutral-200 bg-neutral-50 py-1.5 pl-8 pr-3 text-xs text-neutral-800 focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-neutral-600">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="bg-neutral-50 border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none cursor-pointer"
            >
              <option value="all">All Districts ({locations.length} Stores)</option>
              {distinctDistricts.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            <span>Print 1-Sheet Directory</span>
          </Button>
      </div>

      {/* Printable Sheet Container */}
      <div
        id="print-directory-sheet"
        className="rounded-xl border border-neutral-200 bg-white p-6 text-neutral-900 shadow-xs print:m-0 print:rounded-none print:border-none print:p-0 print:shadow-none"
      >
        
        {/* Printable Header */}
        <div className="print-sheet-header mb-3 flex items-center justify-between border-b-2 border-neutral-900 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-red-600 text-white text-[11px] font-black px-2 py-0.5 rounded tracking-wider">
                SHIEKH
              </span>
              <h1 className="text-base font-black tracking-tight text-neutral-900 uppercase">
                Master Retail Store Directory
              </h1>
            </div>
            <p className="text-[10px] text-neutral-600 mt-0.5 font-medium">
              Official Corporate Fleet Roster • Shiekh Shoes Operational Directory
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-bold text-neutral-900 font-mono">
              Total Fleet: {filteredLocations.length} Stores
            </div>
            <div className="text-[9px] text-neutral-500">
              Published: {currentDate} • Internal Operational Reference
            </div>
          </div>
        </div>

        {/* Directory Tables Grouped By District */}
        <div className="print-sheet-groups space-y-4 print:space-y-1">
          {Array.from(groupedByDistrict.entries()).map(([districtName, { dmName, stores }]) => (
            <div key={districtName} className="print-district break-inside-avoid">
              
              {/* District Sub-Header Bar */}
              <div className="print-district-header mb-1 flex items-center justify-between border-y border-neutral-300 bg-neutral-100 px-3 py-1 text-[11px] font-bold text-neutral-900">
                <span className="uppercase tracking-wider text-red-700">
                  {districtName} ({stores.length} Locations)
                </span>
                <span className="text-neutral-700 text-[10px] font-medium">
                  District Manager: <strong className="text-neutral-900 font-semibold">{dmName}</strong>
                </span>
              </div>

              {/* Stores Table */}
              <table className="w-full text-left text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500 uppercase text-[8.5px] tracking-wider font-semibold">
                    <th className="py-1 px-1.5 w-12">Store #</th>
                    <th className="py-1 px-1.5">Store / Center Name</th>
                    <th className="py-1 px-1.5">Street Address</th>
                    <th className="py-1 px-1.5 w-24">City</th>
                    <th className="py-1 px-1.5 w-8">ST</th>
                    <th className="py-1 px-1.5 w-28">Phone</th>
                    <th className="py-1 px-1.5 w-36">Store Manager</th>
                    <th className="py-1 px-1.5 w-32">District Manager</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-normal">
                  {stores.map((loc, idx) => {
                    const hasNotice = loc.operationalStatus !== 'Open — Normal Operations' || Boolean(loc.activeNotice);
                    return (
                      <tr 
                        key={loc.id} 
                        className={`hover:bg-neutral-50/60 ${idx % 2 === 1 ? 'bg-neutral-50/30' : ''}`}
                      >
                        <td className="py-1 px-1.5 font-mono font-bold text-neutral-900 whitespace-nowrap">
                          #{loc.storeNumber}
                        </td>
                        <td className="py-1 px-1.5 font-medium text-neutral-900">
                          {hasNotice && (
                            <span 
                              title={`Notice: ${loc.activeNotice?.shortDescription || loc.operationalStatus}`}
                              className="inline-flex items-center text-amber-600 mr-1 align-middle"
                            >
                              <AlertTriangle className="w-3 h-3 inline" />
                            </span>
                          )}
                          <span>{loc.name}</span>
                        </td>
                        <td className="py-1 px-1.5 text-neutral-600 truncate max-w-[180px]">
                          {loc.address}
                        </td>
                        <td className="py-1 px-1.5 text-neutral-800 whitespace-nowrap font-medium">
                          {loc.city}
                        </td>
                        <td className="py-1 px-1.5 text-neutral-700 font-bold whitespace-nowrap">
                          {loc.state}
                        </td>
                        <td className="py-1 px-1.5 font-mono font-semibold text-neutral-900 whitespace-nowrap">
                          {loc.phone}
                        </td>
                        <td className="py-1 px-1.5 text-neutral-700 truncate max-w-[140px]">
                          {leadershipByLocationId.get(loc.id)?.storeManagerName || <span className="text-neutral-400 italic">Open Position</span>}
                        </td>
                        <td className="py-1 px-1.5 text-neutral-700 truncate max-w-[130px]">
                          {leadershipByLocationId.get(loc.id)?.districtManagerName || dmName}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Printable Footer */}
  <div className="print-sheet-footer mt-4 flex items-center justify-between border-t border-neutral-300 pt-2 text-[9px] text-neutral-500">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
              <AlertTriangle className="w-2.5 h-2.5" /> Indicates active notice or temporary operating schedule
            </span>
          </div>
          <div>
            Shiekh Shoes Retail Directory • Confidential & Proprietary
          </div>
        </div>
      </div>
    </div>
  );
};
