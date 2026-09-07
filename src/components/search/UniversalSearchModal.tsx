import React, { useState, useEffect } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, PersonRecord } from '../../types';
import { Search, Store, User, X, ArrowRight } from 'lucide-react';

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
  const { locations, people } = useDirectory();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
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
        l.city.toLowerCase().includes(cleanQuery) ||
        l.address.toLowerCase().includes(cleanQuery)
      ).slice(0, 5)
    : [];

  const matchingPeople = cleanQuery
    ? people.filter(p =>
        p.fullName.toLowerCase().includes(cleanQuery) ||
        p.jobTitle?.toLowerCase().includes(cleanQuery) ||
        p.district?.toLowerCase().includes(cleanQuery)
      ).slice(0, 5)
    : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-start justify-center pt-20 p-4">
      <div className="bg-white border border-neutral-200 rounded-xl max-w-xl w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        <div className="p-3.5 border-b border-neutral-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-neutral-400 ml-2" />
          <input
            type="text"
            autoFocus
            placeholder="Search stores, managers, districts, cities..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 text-xs space-y-3">
          {matchingLocations.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Store Locations
              </div>
              <div className="space-y-1">
                {matchingLocations.map(loc => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      onSelectLocation(loc);
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-lg hover:bg-neutral-50 flex items-center justify-between text-left cursor-pointer transition-colors border border-transparent hover:border-neutral-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <Store className="w-4 h-4 text-red-600" />
                      <div>
                        <div className="font-semibold text-neutral-900">
                          #{loc.storeNumber} — {loc.name}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          {loc.city}, {loc.state} • {loc.phone}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                  </button>
                ))}
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
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-lg hover:bg-neutral-50 flex items-center justify-between text-left cursor-pointer transition-colors border border-transparent hover:border-neutral-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <User className="w-4 h-4 text-blue-600" />
                      <div>
                        <div className="font-semibold text-neutral-900">{person.fullName}</div>
                        <div className="text-[11px] text-neutral-500">
                          {person.jobTitle || person.role} {person.district ? `• ${person.district}` : ''}
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
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
