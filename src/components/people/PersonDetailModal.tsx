import React from 'react';
import { PersonRecord, LocationRecord, ContactPrivacyLevel } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { Mail, Phone, MapPin, Store } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';

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
    l.assistantStoreManagerIds?.includes(person.id) ||
    l.keyHolderIds?.includes(person.id) ||
    l.storeManagerName?.toLowerCase() === person.fullName?.toLowerCase() ||
    l.districtManagerName?.toLowerCase() === person.fullName?.toLowerCase()
  );

  const canEditPrivacy = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  return (
    <Modal
      isOpen={Boolean(person)}
      title={person.fullName}
      description={person.jobTitle || person.role || 'Team Member'}
      size="md"
      onClose={onClose}
      icon={(
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-sm font-bold text-red-700">
          {person.fullName?.[0] || 'P'}
        </div>
      )}
      footer={<div className="flex justify-end"><Button size="sm" onClick={onClose}>Close</Button></div>}
    >
        <div className="space-y-4 text-xs">
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
                <button
                  type="button"
                  key={loc.id}
                  onClick={() => {
                    if (onSelectLocation) {
                      onSelectLocation(loc);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <div>
                    <span className="font-bold text-red-600 mr-2">#{loc.storeNumber}</span>
                    <span className="font-medium text-neutral-900">{loc.name}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">{loc.city}, {loc.state}</span>
                </button>
              ))}
              {assignedLocs.length === 0 && (
                <EmptyState
                  icon={Store}
                  title="No assigned stores"
                  description="This person is not directly assigned to a store in the directory."
                  compact
                />
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
};
