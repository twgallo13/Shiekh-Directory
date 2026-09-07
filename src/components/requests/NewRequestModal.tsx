import React, { useState } from 'react';
import { LocationRecord, RequestChangeType, Person } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { PersonSelector } from '../people/PersonSelector';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';
import { DEFAULT_WEEKLY_HOURS } from '../../data/initialData';
import { X, Send, AlertCircle } from 'lucide-react';

interface NewRequestModalProps {
  location: LocationRecord | null;
  onClose: () => void;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({ location, onClose }) => {
  const { locations, currentUser, submitRequest } = useDirectory();
  
  const [selectedLocId, setSelectedLocId] = useState(location?.id || locations[0]?.id || '');
  const [changeType, setChangeType] = useState<RequestChangeType>('Phone Number Correction');
  const [reason, setReason] = useState('');

  // Form field states for requested changes
  const [newPhone, setNewPhone] = useState('');
  const [newManager, setNewManager] = useState<Person | null>(null);
  const [newStatus, setNewStatus] = useState('Open — Normal Operations');
  const [noticeText, setNoticeText] = useState('');
  const [newHours, setNewHours] = useState(location?.standardHours || DEFAULT_WEEKLY_HOURS);

  const targetLoc = locations.find(l => l.id === selectedLocId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLoc) return;

    let requestedChanges: any = {};
    let currentSnapshot: any = {};

    if (changeType === 'Phone Number Correction') {
      requestedChanges.phone = newPhone;
      currentSnapshot.phone = targetLoc.phone;
    } else if (changeType === 'Store Manager Change') {
      requestedChanges.storeManagerId = newManager?.id;
      requestedChanges.storeManagerName = newManager?.fullName || '';
      requestedChanges.storeManagerPhone = newManager?.phone || newManager?.workPhone || '';
      currentSnapshot.storeManagerId = targetLoc.storeManagerId;
      currentSnapshot.storeManagerName = targetLoc.storeManagerName;
    } else if (changeType === 'Operational Status Change') {
      requestedChanges.operationalStatus = newStatus;
      if (noticeText) {
        requestedChanges.activeNotice = {
          shortDescription: noticeText,
          effectiveDate: new Date().toISOString().split('T')[0]
        };
      }
      currentSnapshot.operationalStatus = targetLoc.operationalStatus;
    } else if (changeType === 'Standard Hours Adjustment') {
      requestedChanges.standardHours = newHours;
      currentSnapshot.standardHours = targetLoc.standardHours;
    }

    submitRequest({
      targetId: targetLoc.id,
      targetType: 'Location',
      targetStoreNumber: targetLoc.storeNumber,
      targetName: targetLoc.name,
      changeType,
      requestedBy: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        role: currentUser.role
      },
      requestedChanges,
      currentSnapshot,
      reason
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-neutral-200 rounded-xl max-w-lg w-full p-5 shadow-2xl">
        <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600" />
            <h3 className="font-bold text-neutral-900 text-sm">Submit Store Correction Request</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer rounded-lg hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-3 text-xs">
          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Target Location</label>
            <select
              value={selectedLocId}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedLocId(newId);
                const loc = locations.find(l => l.id === newId);
                if (loc?.standardHours) {
                  setNewHours(loc.standardHours);
                }
              }}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 cursor-pointer"
            >
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>
                  Store #{loc.storeNumber} — {loc.name} ({loc.city})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Change Category</label>
            <select
              value={changeType}
              onChange={(e) => setChangeType(e.target.value as RequestChangeType)}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 cursor-pointer"
            >
              <option value="Phone Number Correction">Phone Number Correction</option>
              <option value="Store Manager Change">Store Manager Leadership Change</option>
              <option value="Operational Status Change">Operational Status & Temporary Notice</option>
              <option value="Standard Hours Adjustment">Standard Hours Adjustment</option>
            </select>
          </div>

          {/* Conditional change inputs */}
          {changeType === 'Phone Number Correction' && (
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">New Customer Direct Phone *</label>
              <input
                type="text"
                required
                placeholder="(555) 000-0000"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 font-mono focus:outline-none focus:border-red-500 focus:bg-white"
              />
            </div>
          )}

          {changeType === 'Store Manager Change' && (
            <div>
              <PersonSelector
                label="New Store Manager"
                roleFilter="Store Manager"
                onChange={(p) => setNewManager(p)}
                required
              />
            </div>
          )}

          {changeType === 'Operational Status Change' && (
            <div className="space-y-2">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">New Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="Open — Normal Operations">Open — Normal Operations</option>
                  <option value="Temporarily Modified Hours">Temporarily Modified Hours</option>
                  <option value="Under Remodel / Renovation">Under Remodel / Renovation</option>
                  <option value="Temporarily Closed — Emergency">Temporarily Closed — Emergency</option>
                </select>
              </div>
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Notice Description</label>
                <input
                  type="text"
                  placeholder="e.g. Power outage or HVAC maintenance"
                  value={noticeText}
                  onChange={(e) => setNoticeText(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>
            </div>
          )}

          {changeType === 'Standard Hours Adjustment' && (
            <div>
              <label className="block text-neutral-700 font-semibold mb-1">Proposed Weekly Operating Hours</label>
              <WeeklyHoursEditor
                schedule={newHours}
                onChange={setNewHours}
              />
            </div>
          )}

          <div>
            <label className="block text-neutral-700 font-semibold mb-1">Reason for Request / Notes</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide background context for the Directory Data Steward..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg text-neutral-700 font-semibold cursor-pointer shadow-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Submit for Approval</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
