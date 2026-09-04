import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  MapPin, 
  User, 
  Phone, 
  ArrowRight, 
  X, 
  ExternalLink, 
  Building, 
  Clock, 
  ShieldAlert,
  ChevronRight
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, PersonRecord } from '../../types';
import { getTodayHoursForLocation } from '../../utils/timezoneHelper';

interface UniversalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (location: LocationRecord) => void;
  onSelectPerson: (person: PersonRecord) => void;
  onRequestCorrection: (location?: LocationRecord) => void;
}

export const UniversalSearchModal: React.FC<UniversalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  onSelectPerson,
  onRequestCorrection,
}) => {
  const { locations, people } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'locations' | 'people'>('all');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // toggle search
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const searchResults = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      return {
        matchedLocations: locations.slice(0, 5),
        matchedPeople: people.slice(0, 4),
      };
    }

    const matchedLocations = locations.filter(loc => {
      return (
        loc.storeNumber.toLowerCase().includes(term) ||
        loc.name.toLowerCase().includes(term) ||
        (loc.mallOrCenterName && loc.mallOrCenterName.toLowerCase().includes(term)) ||
        loc.city.toLowerCase().includes(term) ||
        loc.state.toLowerCase().includes(term) ||
        loc.zipCode.includes(term) ||
        loc.phone.includes(term) ||
        (loc.districtManagerName && loc.districtManagerName.toLowerCase().includes(term)) ||
        (loc.storeManagerName && loc.storeManagerName.toLowerCase().includes(term)) ||
        (loc.district && loc.district.toLowerCase().includes(term)) ||
        (loc.region && loc.region.toLowerCase().includes(term))
      );
    });

    const matchedPeople = people.filter(p => {
      return (
        p.name.toLowerCase().includes(term) ||
        p.jobTitle.toLowerCase().includes(term) ||
        p.department.toLowerCase().includes(term) ||
        (p.district && p.district.toLowerCase().includes(term)) ||
        p.workPhone.includes(term) ||
        p.workEmail.toLowerCase().includes(term)
      );
    });

    return { matchedLocations, matchedPeople };
  }, [searchTerm, locations, people]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-start justify-center p-3 sm:p-6 md:pt-16 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Box */}
        <div className="p-3 sm:p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
          <Search className="w-5 h-5 text-red-600 dark:text-red-500 shrink-0" />
          <input
            type="text"
            placeholder="Search by store #, mall name, city, manager, district, employee..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            autoFocus
            className="w-full bg-transparent border-none outline-hidden text-sm sm:text-base text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={onClose}
            className="px-2 py-1 text-xs text-neutral-500 bg-neutral-100 dark:bg-neutral-800 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            ESC
          </button>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2 bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2 text-xs">
          <span className="text-neutral-400">Filter:</span>
          {(['all', 'locations', 'people'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-0.5 rounded-full capitalize font-medium transition-colors ${
                filterType === t 
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' 
                  : 'bg-neutral-200/70 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200'
              }`}
            >
              {t === 'all' ? `All Results` : t === 'locations' ? `Locations (${searchResults.matchedLocations.length})` : `People (${searchResults.matchedPeople.length})`}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="overflow-y-auto p-2 sm:p-3 space-y-4 divide-y divide-neutral-100 dark:divide-neutral-800/60">
          {/* Locations Section */}
          {(filterType === 'all' || filterType === 'locations') && searchResults.matchedLocations.length > 0 && (
            <div className="space-y-1.5 pt-2 first:pt-0">
              <div className="px-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center justify-between">
                <span>Locations & Retail Stores ({searchResults.matchedLocations.length})</span>
                <span className="text-[10px] lowercase text-neutral-400">Tap to inspect</span>
              </div>
              {searchResults.matchedLocations.map(loc => {
                const hours = getTodayHoursForLocation(loc);
                return (
                  <div
                    key={loc.id}
                    onClick={() => {
                      onSelectLocation(loc);
                      onClose();
                    }}
                    className="p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors flex items-center justify-between group border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-md bg-neutral-900 dark:bg-neutral-800 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        #{loc.storeNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-red-600 dark:group-hover:text-red-400">
                            {loc.name}
                          </span>
                          {loc.state && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded">
                              {loc.state}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.2 rounded font-medium ${
                            hours.isOpenNow 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' 
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}>
                            {hours.statusBadge.text}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5 mt-0.5">
                          <span>{loc.address}, {loc.city}, {loc.state} {loc.zipCode}</span>
                          <span>•</span>
                          <span className="font-medium text-neutral-700 dark:text-neutral-300">{loc.phone}</span>
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-neutral-400 mt-1">
                          <span>SM: {loc.storeManagerName || 'Unassigned'}</span>
                          <span>•</span>
                          <span>DM: {loc.districtManagerName || 'Unassigned'}</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}

          {/* People Section */}
          {(filterType === 'all' || filterType === 'people') && searchResults.matchedPeople.length > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="px-2 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                People & Store Leadership ({searchResults.matchedPeople.length})
              </div>
              {searchResults.matchedPeople.map(person => (
                <div
                  key={person.id}
                  onClick={() => {
                    onSelectPerson(person);
                    onClose();
                  }}
                  className="p-2.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer transition-colors flex items-center justify-between group border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 flex items-center justify-center font-bold text-xs shrink-0">
                      {person.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs sm:text-sm text-neutral-900 dark:text-neutral-100 group-hover:text-red-600 dark:group-hover:text-red-400">
                          {person.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded font-medium">
                          {person.jobTitle}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {person.department} {person.district && `• ${person.district}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {person.workPhone && (
                      <a
                        href={`tel:${person.workPhone}`}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 text-neutral-500 hover:text-red-600 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-md transition-colors"
                        title={`Call ${person.workPhone}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <ChevronRight className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No results */}
          {searchResults.matchedLocations.length === 0 && searchResults.matchedPeople.length === 0 && (
            <div className="p-8 text-center">
              <Building className="w-8 h-8 mx-auto text-neutral-300 dark:text-neutral-600 mb-2" />
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                No matching locations or personnel found for "{searchTerm}"
              </p>
              <p className="text-xs text-neutral-400 mt-1">
                Try searching for a store number (e.g. 7, 42, 105), city name, mall name, or manager.
              </p>
              <button
                onClick={() => {
                  onClose();
                  onRequestCorrection();
                }}
                className="mt-3 px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-semibold hover:bg-red-700"
              >
                Submit New Location Proposal
              </button>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <div>Authoritative SoR Database</div>
        </div>
      </div>
    </div>
  );
};
