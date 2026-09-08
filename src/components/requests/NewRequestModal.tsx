import React, { useState } from 'react';
import { LocationRecord, RequestChangeType, Person } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { PersonSelector } from '../people/PersonSelector';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';
import { DEFAULT_WEEKLY_HOURS } from '../../lib/defaultHours';
import { Send, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormLabel } from '../common/FormLabel';
import { Modal } from '../common/Modal';

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
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  const targetLoc = locations.find(l => l.id === selectedLocId);
  const initialLocationId = location?.id || locations[0]?.id || '';
  const hasRequestDraft = Boolean(
    selectedLocId !== initialLocationId ||
    changeType !== 'Phone Number Correction' ||
    reason.trim() ||
    newPhone.trim() ||
    newManager ||
    newStatus !== 'Open — Normal Operations' ||
    noticeText.trim()
  );

  const requestClose = () => {
    if (hasRequestDraft) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

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
    <>
      <Modal
        isOpen={!isDiscardConfirmOpen}
        title="Submit Store Correction Request"
        description="Send a proposed directory change for steward review."
        icon={<AlertCircle className="h-5 w-5 text-amber-600" aria-hidden="true" />}
        size="md"
        onClose={requestClose}
      >
        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <FormLabel>Target Location</FormLabel>
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
            <FormLabel>Change Category</FormLabel>
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
              <FormLabel required>New Customer Direct Phone</FormLabel>
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
                <FormLabel>New Status</FormLabel>
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
                <FormLabel>Notice Description</FormLabel>
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
              <FormLabel>Proposed Weekly Operating Hours</FormLabel>
              <WeeklyHoursEditor
                schedule={newHours}
                onChange={setNewHours}
              />
            </div>
          )}

          <div>
            <FormLabel>Reason for Request / Notes</FormLabel>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide background context for the Directory Data Steward..."
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 focus:bg-white"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-neutral-200">
            <Button size="sm" onClick={requestClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="primary"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Submit for Approval</span>
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDiscardConfirmOpen}
        title="Discard correction request?"
        description="The proposed changes and reviewer context in this request will be permanently discarded."
        confirmLabel="Discard request"
        onConfirm={onClose}
        onCancel={() => setIsDiscardConfirmOpen(false)}
      />
    </>
  );
};
