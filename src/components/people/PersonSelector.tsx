import React, { useState, useMemo } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { Person } from '../../types';
import { Search, User, X } from 'lucide-react';

export interface PersonSelectorProps {
  label?: string;
  value?: string;
  onChange: (person: Person | null) => void;
  roleFilter?: string;
  placeholder?: string;
  required?: boolean;
}

export const PersonSelector: React.FC<PersonSelectorProps> = ({
  label,
  value,
  onChange,
  roleFilter,
  placeholder = 'Select canonical personnel...',
  required = false
}) => {
  const { people } = useDirectory();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      if (roleFilter && p.jobTitle !== roleFilter && p.role !== roleFilter) {
        return false;
      }
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        p.fullName?.toLowerCase().includes(term) ||
        p.name?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.phone?.toLowerCase().includes(term) ||
        p.district?.toLowerCase().includes(term)
      );
    });
  }, [people, roleFilter, searchTerm]);

  const selectedPerson = useMemo(() => {
    if (!value) return null;
    return people.find(p => p.id === value || p.fullName === value || p.name === value) || null;
  }, [people, value]);

  return (
    <div className="relative">
      {label && (
        <label className="block text-xs font-semibold text-neutral-700 mb-1">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
      )}

      {selectedPerson ? (
        <div className="flex items-center justify-between p-2 rounded-lg bg-neutral-50 border border-neutral-300 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center justify-center font-bold text-[10px]">
              {selectedPerson.fullName?.[0] || 'U'}
            </div>
            <div>
              <span className="font-semibold text-neutral-900">{selectedPerson.fullName}</span>
              <span className="text-[11px] text-neutral-500 ml-2">({selectedPerson.jobTitle || selectedPerson.role || 'Staff'})</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer rounded hover:bg-neutral-200 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div>
          <div
            onClick={() => setIsOpen(true)}
            className="min-h-[38px] px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-500 flex items-center justify-between cursor-pointer hover:border-neutral-400 focus:bg-white"
          >
            <span>{placeholder}</span>
            <Search className="w-3.5 h-3.5 text-neutral-400" />
          </div>

          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
              <div className="p-2 border-b border-neutral-200 sticky top-0 bg-white">
                <input
                  type="text"
                  autoFocus
                  placeholder="Type name, email or district..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-neutral-50 border border-neutral-300 rounded-lg text-xs text-neutral-900 placeholder-neutral-400 focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="divide-y divide-neutral-100">
                {filteredPeople.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className="w-full text-left p-2.5 hover:bg-neutral-50 transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <div>
                      <div className="font-semibold text-neutral-900 text-xs">{p.fullName}</div>
                      <div className="text-[11px] text-neutral-500">{p.jobTitle || p.role} • {p.phone || p.workPhone}</div>
                    </div>
                    {p.district && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 font-medium">
                        {p.district}
                      </span>
                    )}
                  </button>
                ))}
                {filteredPeople.length === 0 && (
                  <div className="p-4 text-center text-xs text-neutral-400">
                    No matching personnel found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
