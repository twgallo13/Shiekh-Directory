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
import { resolvePersonPhone } from '../../lib/personContacts';
import { normalizeLocationInboxEmail } from '../../lib/locationInboxEmail';

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
  const [newLocationInboxEmail, setNewLocationInboxEmail] = useState('');
  const [clearLocationInboxEmail, setClearLocationInboxEmail] = useState(false);
  const [formError, setFormError] = useState('');
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
    || newLocationInboxEmail.trim()
    || clearLocationInboxEmail
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
      requestedChanges.storeManagerPhone = resolvePersonPhone(newManager || undefined).value;
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
    } else if (changeType === 'Other Store Info Update') {
      const proposedInbox = clearLocationInboxEmail ? null : normalizeLocationInboxEmail(newLocationInboxEmail)?.value;
      if (proposedInbox === undefined) {
        setFormError('Enter one valid shared location inbox email, or explicitly choose Clear inbox.');
        return;
      }
      const currentInbox = targetLoc.locationInboxEmail ?? null;
      const normalizedCurrentInbox = normalizeLocationInboxEmail(currentInbox)?.value ?? currentInbox;
      if (proposedInbox === normalizedCurrentInbox) {
        setFormError('Choose a different inbox email. This request would not change the location.');
        return;
      }
      requestedChanges.locationInboxEmail = proposedInbox;
      currentSnapshot.locationInboxEmail = targetLoc.locationInboxEmail ?? null;
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
            {formError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">{formError}</p>}
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
              <option value="Other Store Info Update">Other Store Info Update (including shared inbox)</option>
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

          {changeType === 'Other Store Info Update' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Proposed Shared Location Inbox</FormLabel>
                <button type="button" onClick={() => { setClearLocationInboxEmail(true); setNewLocationInboxEmail(''); setFormError(''); }} className="text-[11px] font-semibold text-red-700 hover:underline">
                  Clear inbox
                </button>
              </div>
              {!clearLocationInboxEmail ? (
                <input
                  type="email"
                  value={newLocationInboxEmail}
                  onChange={event => { setNewLocationInboxEmail(event.target.value); setFormError(''); }}
                  placeholder="store@example.com"
                  className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none"
                />
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">This request proposes removing the location inbox. Approval is required before the change is applied.</p>
              )}
              {clearLocationInboxEmail && <button type="button" onClick={() => setClearLocationInboxEmail(false)} className="text-[11px] font-semibold text-neutral-600 hover:underline">Undo clear</button>}
              <p className="text-[11px] text-neutral-500">A shared Location contact only. This does not change a person’s sign-in or send email.</p>
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
