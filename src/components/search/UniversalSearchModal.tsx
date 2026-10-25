import React, { useState, useEffect } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, PersonRecord } from '../../types';
import { resolveActivePerson } from '../../lib/readProjectionContract';
import { resolvePersonEmail } from '../../lib/personContacts';
import { PERSON_POSITIONS, personPositions, personPositionLabel } from '../../lib/personPositions';
import { personLifecycle } from '../../lib/personLifecycle';
import { PrivacyBadge } from '../common/StatusBadge';
import { Search, Store, User, X, ArrowRight } from 'lucide-react';
import { useDialogFocus } from '../common/useDialogFocus';

interface UniversalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (location: LocationRecord) => void;
  onSelectPerson: (person: PersonRecord) => void;
}

export const UniversalSearchModal: React.FC<UniversalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  onSelectPerson,
}) => {
  const { locations, people, districts } = useDirectory();
  const resultDescriptionId = React.useId();
  const [query, setQuery] = useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, onClose, dialogRef);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const cleanQuery = query.toLowerCase().trim();

  const matchingLocations = cleanQuery
    ? locations.filter(l => 
        l.storeNumber.includes(cleanQuery) ||
        l.name.toLowerCase().includes(cleanQuery) ||
        [l.address, l.suite, l.mallOrCenterName, l.wayfindingDirections].some(value => value?.toLowerCase().includes(cleanQuery)) ||
        l.city.toLowerCase().includes(cleanQuery) ||
        l.address.toLowerCase().includes(cleanQuery)
      ).slice(0, 5)
    : [];

  const matchingPeople = cleanQuery
    ? people.filter(p =>
        p.fullName.toLowerCase().includes(cleanQuery) ||
        resolvePersonEmail(p).value.toLowerCase().includes(cleanQuery) ||
        p.jobTitle?.toLowerCase().includes(cleanQuery) ||
        PERSON_POSITIONS.some(position => personPositions(p).ids.includes(position.id) && position.label.toLowerCase().includes(cleanQuery)) ||
        districts.some(district => district.districtManagerId === p.id && district.name.toLowerCase().includes(cleanQuery)) ||
        p.district?.toLowerCase().includes(cleanQuery)
      ).slice(0, 5)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-20 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search directory"
        tabIndex={-1}
        className="bg-white border border-neutral-200 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
      >
        <div className="p-3.5 border-b border-neutral-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-neutral-400 ml-2" />
          <input
            type="text"
            autoFocus
            placeholder="Search stores, managers, districts, cities..."
            aria-label="Search directory records"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close directory search"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[min(24rem,calc(100dvh-12rem))] space-y-3 overflow-y-auto p-2 text-xs">
          {matchingLocations.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Store Locations
              </div>
              <div className="space-y-1">
                {matchingLocations.map(loc => {
                  const storeManager = resolveActivePerson(loc.storeManagerId, people);
                  return (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => {
                        onSelectLocation(loc);
                      }}
                      aria-label={`Open store #${loc.storeNumber} ${loc.name}`}
                      aria-describedby={`${resultDescriptionId}-location-${loc.id}`}
                      className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                    >
                      <div className="flex min-w-0 items-start gap-2.5">
                        <Store aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                        <div id={`${resultDescriptionId}-location-${loc.id}`} className="min-w-0 break-words">
                          <div className="font-semibold text-neutral-900">
                            #{loc.storeNumber} — {loc.name}
                          </div>
                          {loc.recordStatus === 'Retired' && <p className="text-[11px] text-neutral-500">Retired</p>}
                          <p className="mt-1 text-neutral-700">{[loc.address, loc.suite].filter(Boolean).join(', ') || 'Address not recorded'}</p>
                          <p className="text-[11px] text-neutral-500">{[loc.city, loc.state, loc.zipCode].filter(Boolean).join(' ')}</p>
                          {loc.phone && <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">{loc.phone}<PrivacyBadge level={loc.phonePrivacy} /></div>}
                          {storeManager && <p className="mt-1 text-[11px] text-neutral-500">Store Manager: {storeManager.fullName}</p>}
                        </div>
                      </div>
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {matchingPeople.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Personnel Directory
              </div>
              <div className="space-y-1">
                {matchingPeople.map(person => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => {
                      onSelectPerson(person);
                    }}
                    aria-label={`Open profile for ${person.fullName}`}
                    aria-describedby={`${resultDescriptionId}-person-${person.id}`}
                    className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-neutral-200 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <User aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                      <div id={`${resultDescriptionId}-person-${person.id}`} className="min-w-0 break-words">
                        <div className="font-semibold text-neutral-900">{person.fullName}</div>
                        <div className="text-[11px] text-neutral-500">
                          {personPositionLabel(person)}
                        </div>
                        {person.jobTitle?.toLowerCase().includes(cleanQuery) && person.jobTitle.trim() !== personPositionLabel(person) && <p className="mt-1 text-[11px] text-neutral-500">Display title: {person.jobTitle}</p>}
                        {personLifecycle(person) !== 'active' && <p className="mt-1 text-[11px] text-amber-800">{personLifecycle(person) === 'inactive' ? 'Inactive' : 'Status needs review'}</p>}
                        {districts.filter(district => district.districtManagerId === person.id).map(district => <p key={district.id} className="mt-1 text-[11px] text-neutral-500">District: {district.name || district.id}{district.status === 'Retired' ? ' (Retired)' : ''}</p>)}
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim() && matchingLocations.length === 0 && matchingPeople.length === 0 && (
            <div className="p-8 text-center text-neutral-500 text-xs">
              No results found for "{query}"
            </div>
          )}

          {!query.trim() && (
            <div className="p-6 text-center text-neutral-400 text-xs">
              Type to search store numbers, names, personnel, or cities
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
