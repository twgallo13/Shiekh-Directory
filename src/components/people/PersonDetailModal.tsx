import React from 'react';
import { PersonRecord, LocationRecord, ContactPrivacyLevel } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { X, Mail, Phone, MapPin, Building, Shield } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';

interface PersonDetailModalProps {
  person: PersonRecord | null;
  onClose: () => void;
  onSelectLocation?: (location: LocationRecord) => void;
}

export const PersonDetailModal: React.FC<PersonDetailModalProps> = ({
  person,
  onClose,
  onSelectLocation,
}) => {
  const { locations, currentUser, togglePersonPhonePrivacy } = useDirectory();

  if (!person) return null;

  const assignedLocs = locations.filter(l => 
    l.storeManagerId === person.id || 
    l.districtManagerId === person.id ||
    l.storeManagerName?.toLowerCase() === person.fullName?.toLowerCase() ||
    l.districtManagerName?.toLowerCase() === person.fullName?.toLowerCase()
  );

  const canEditPrivacy = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center font-bold text-sm">
              {person.fullName?.[0] || 'P'}
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900">{person.fullName}</h2>
              <p className="text-xs text-neutral-500">{person.jobTitle || person.role || 'Team Member'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
              <div className="text-neutral-500 text-[10px] font-semibold uppercase flex items-center gap-1">
                <Phone className="w-3 h-3 text-neutral-400" /> Direct Phone
              </div>
              <div className="font-mono text-neutral-900 font-medium">{person.phone || person.workPhone || 'N/A'}</div>
              <div className="pt-1 flex items-center justify-between">
                <PrivacyBadge level={person.phonePrivacy} />
                {canEditPrivacy && (
                  <select
                    value={person.phonePrivacy || 'Public'}
                    onChange={(e) => togglePersonPhonePrivacy(person.id, e.target.value as ContactPrivacyLevel)}
                    className="bg-white border border-neutral-300 text-[10px] rounded px-1.5 py-0.5 text-neutral-700 cursor-pointer"
                  >
                    <option value="Public">Public</option>
                    <option value="Internal">Internal</option>
                    <option value="Restricted">Restricted</option>
                  </select>
                )}
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
              <div className="text-neutral-500 text-[10px] font-semibold uppercase flex items-center gap-1">
                <Mail className="w-3 h-3 text-neutral-400" /> Email Address
              </div>
              <div className="text-neutral-900 font-medium truncate">{person.email || person.workEmail || 'N/A'}</div>
              <div className="text-neutral-400 text-[10px] pt-1">Company Workspace</div>
            </div>
          </div>

          {person.district && (
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-600">Territory / District:</span>
              </div>
              <span className="font-semibold text-neutral-900">{person.district}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Assigned Retail Stores ({assignedLocs.length})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {assignedLocs.map(loc => (
                <div
                  key={loc.id}
                  onClick={() => {
                    if (onSelectLocation) {
                      onSelectLocation(loc);
                      onClose();
                    }
                  }}
                  className="p-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg flex items-center justify-between cursor-pointer transition-colors"
                >
                  <div>
                    <span className="font-bold text-red-600 mr-2">#{loc.storeNumber}</span>
                    <span className="font-medium text-neutral-900">{loc.name}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">{loc.city}, {loc.state}</span>
                </div>
              ))}
              {assignedLocs.length === 0 && (
                <div className="text-neutral-500 text-xs italic p-3 bg-neutral-50 rounded border border-neutral-200 text-center">
                  No directly assigned retail stores in directory index.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-200 rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
