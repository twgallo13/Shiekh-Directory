import React, { useState } from 'react';
import { 
  X, 
  Send, 
  AlertTriangle, 
  Building, 
  User, 
  Phone, 
  Clock, 
  CheckCircle2 
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { LocationRecord, RequestChangeType } from '../../types';

interface NewRequestModalProps {
  location: LocationRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  location,
  isOpen,
  onClose,
}) => {
  const { locations, currentUser, submitUpdateRequest } = useDirectory();

  const [selectedLocId, setSelectedLocId] = useState(location?.id || locations[0]?.id || '');
  const [changeType, setChangeType] = useState<RequestChangeType>('Store Manager Change');
  
  // Dynamic fields
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerPhone, setNewManagerPhone] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newStatus, setNewStatus] = useState('Open — Normal Operations');
  const [notes, setNotes] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  if (!isOpen) return null;

  const targetLoc = locations.find(l => l.id === (location?.id || selectedLocId));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLoc) return;

    const requestedChanges: Record<string, any> = {};
    const currentSnapshot: Record<string, any> = {};

    if (changeType === 'Store Manager Change') {
      currentSnapshot.storeManagerName = targetLoc.storeManagerName || '';
      currentSnapshot.storeManagerPhone = targetLoc.storeManagerPhone || '';
      requestedChanges.storeManagerName = newManagerName;
      requestedChanges.storeManagerPhone = newManagerPhone;
    } else if (changeType === 'Phone Number Correction') {
      currentSnapshot.phone = targetLoc.phone;
      requestedChanges.phone = newPhone;
    } else if (changeType === 'Address Correction') {
      currentSnapshot.address = targetLoc.address;
      requestedChanges.address = newAddress;
    } else if (changeType === 'Operational Status Change') {
      currentSnapshot.operationalStatus = targetLoc.operationalStatus;
      requestedChanges.operationalStatus = newStatus;
    } else {
      currentSnapshot.general = 'Previous Information';
      requestedChanges.general = notes;
    }

    submitUpdateRequest({
      targetType: 'Location',
      targetId: targetLoc.id,
      targetName: `Store #${targetLoc.storeNumber} (${targetLoc.name})`,
      targetStoreNumber: targetLoc.storeNumber,
      changeType,
      currentSnapshot,
      requestedChanges,
      notes,
      submittedBy: {
        name: currentUser.displayName,
        email: currentUser.email,
        role: currentUser.role,
      },
    });

    setSubmittedSuccess(true);
    setTimeout(() => {
      setSubmittedSuccess(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 bg-neutral-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-sm sm:text-base">
              Request Directory Update or Correction
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submittedSuccess ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto animate-bounce" />
            <h4 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              Update Request Submitted!
            </h4>
            <p className="text-xs text-neutral-500 max-w-xs mx-auto">
              Your requested change has been routed to the Directory Data Steward queue. You will receive an email confirmation once reviewed.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs">
            {/* Target Location Selector */}
            <div>
              <label className="block text-neutral-500 mb-1 font-semibold">Select Store / Location *</label>
              <select
                value={location?.id || selectedLocId}
                disabled={!!location}
                onChange={e => setSelectedLocId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 font-medium"
              >
                {locations.map(l => (
                  <option key={l.id} value={l.id}>
                    Store #{l.storeNumber} - {l.name} ({l.city}, {l.state})
                  </option>
                ))}
              </select>
            </div>

            {/* Change Type */}
            <div>
              <label className="block text-neutral-500 mb-1 font-semibold">Change Type *</label>
              <select
                value={changeType}
                onChange={e => setChangeType(e.target.value as RequestChangeType)}
                className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 font-medium"
              >
                <option value="Store Manager Change">Store Manager Change / Promotion</option>
                <option value="Assistant Manager Change">Assistant Manager / Keyholder Update</option>
                <option value="Phone Number Correction">Store Phone Number Correction</option>
                <option value="Address Correction">Store Address / Suite Correction</option>
                <option value="Store Hours Update">Store Hours Change</option>
                <option value="Holiday / Special Hours">Holiday or Special Event Hours</option>
                <option value="Operational Status Change">Operational Status (Remodel, Closure, Relocation)</option>
                <option value="New Location Proposal">New Store / Location Addition</option>
              </select>
            </div>

            {/* Contextual Input Fields based on Type */}
            {changeType === 'Store Manager Change' && (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="text-[11px] text-neutral-500">
                  Current Store Manager: <strong className="text-neutral-900 dark:text-neutral-100">{targetLoc?.storeManagerName || 'Vacant'}</strong> ({targetLoc?.storeManagerPhone || 'None'})
                </div>
                <div>
                  <label className="block text-neutral-500 mb-1">New Store Manager Name *</label>
                  <input
                    type="text"
                    required
                    value={newManagerName}
                    onChange={e => setNewManagerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                  />
                </div>
                <div>
                  <label className="block text-neutral-500 mb-1">New Manager Directory Phone *</label>
                  <input
                    type="text"
                    required
                    value={newManagerPhone}
                    onChange={e => setNewManagerPhone(e.target.value)}
                    placeholder="(555) 000-0000"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                  />
                </div>
              </div>
            )}

            {changeType === 'Phone Number Correction' && (
              <div>
                <div className="text-[11px] text-neutral-500 mb-1">
                  Current Store Phone: <strong>{targetLoc?.phone}</strong>
                </div>
                <label className="block text-neutral-500 mb-1">Corrected Store Phone *</label>
                <input
                  type="text"
                  required
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                />
              </div>
            )}

            {changeType === 'Address Correction' && (
              <div>
                <div className="text-[11px] text-neutral-500 mb-1">
                  Current Address: <strong>{targetLoc?.address}, {targetLoc?.city}, {targetLoc?.state} {targetLoc?.zipCode}</strong>
                </div>
                <label className="block text-neutral-500 mb-1">Corrected Street Address *</label>
                <input
                  type="text"
                  required
                  value={newAddress}
                  onChange={e => setNewAddress(e.target.value)}
                  placeholder="e.g. 123 Main St, Suite #204"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                />
              </div>
            )}

            {changeType === 'Operational Status Change' && (
              <div>
                <label className="block text-neutral-500 mb-1">Requested Operational Status</label>
                <select
                  value={newStatus}
                  onChange={e => setNewStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                >
                  <option value="Open — Normal Operations">Open — Normal Operations</option>
                  <option value="Temporarily Closed">Temporarily Closed</option>
                  <option value="Modified Hours">Modified Hours</option>
                  <option value="Under Remodel">Under Remodel</option>
                  <option value="Maintenance / Repair Issue">Maintenance / Repair Issue</option>
                  <option value="Relocating">Relocating</option>
                  <option value="Closing">Closing</option>
                  <option value="Permanently Closed">Permanently Closed</option>
                </select>
              </div>
            )}

            {/* Explanation / Reason Notes */}
            <div>
              <label className="block text-neutral-500 mb-1 font-semibold">
                Reason / Details & Effective Date *
              </label>
              <textarea
                required
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Explain the background, effective start date, authorization details..."
                className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100"
              />
            </div>

            <div className="text-[11px] text-neutral-400">
              Submitting as: <strong className="text-neutral-700 dark:text-neutral-300">{currentUser.displayName}</strong> ({currentUser.email})
            </div>

            {/* Action buttons */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded font-medium text-xs hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit to Data Steward</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
