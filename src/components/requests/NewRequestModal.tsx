import React, { useRef, useState } from 'react';
import { LocationRecord, RequestChangeType, Person, OperationalStatus } from '../../types';
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
import { hoursDraft, structurallyEqual } from '../../lib/correctionRequest';
import { personLifecycle } from '../../lib/personLifecycle';
import { validateRequestProposal } from '../../lib/requestValidation';
import { loadSubmission, submissionStorageKey } from '../../lib/requestSubmission';
import { DirectoryCommitError } from '../../lib/directoryClient';
import { formatUsPhone } from '../../lib/contactNormalization';
import { ADDRESS_FIELDS, normalizeAddressValues } from '../../lib/locationAddress';

interface NewRequestModalProps {
  location: LocationRecord | null;
  onClose: () => void;
}

/** Submit proposed Location corrections with selected-person identity and saved-value baselines. */
export const NewRequestModal: React.FC<NewRequestModalProps> = ({ location, onClose }) => {
  const { locations, people, currentUser, submitRequest, cancelRequestSubmission } = useDirectory();
  
  const [selectedLocId, setSelectedLocId] = useState(location?.id || locations[0]?.id || '');
  const [changeType, setChangeType] = useState<RequestChangeType>('Phone Number Correction');
  const [reason, setReason] = useState('');

  // Form field states for requested changes
  const [newPhone, setNewPhone] = useState('');
  const [addressDraft, setAddressDraft] = useState<Partial<LocationRecord>>(() => Object.fromEntries(ADDRESS_FIELDS.map(field => [field, locations.find(l => l.id === (location?.id || locations[0]?.id))?.[field] ?? ''])));
  const [addressBaseline, setAddressBaseline] = useState(() => structuredClone(locations.find(l => l.id === (location?.id || locations[0]?.id))));
  const [newManager, setNewManager] = useState<Person | null>(null);
  const [newStatus, setNewStatus] = useState<OperationalStatus>('Open — Normal Operations');
  const [noticeText, setNoticeText] = useState('');
  const [newHours, setNewHours] = useState(() => hoursDraft(locations.find(item => item.id === (location?.id || locations[0]?.id)), DEFAULT_WEEKLY_HOURS));
  const [hoursBaseline, setHoursBaseline] = useState(() => structuredClone(locations.find(item => item.id === (location?.id || locations[0]?.id))));
  const [newLocationInboxEmail, setNewLocationInboxEmail] = useState('');
  const [clearLocationInboxEmail, setClearLocationInboxEmail] = useState(false);
  const [formError, setFormError] = useState('');
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recovery] = useState(() => { try { return { request: loadSubmission(sessionStorage, currentUser.id), error: '' }; } catch (e) { return { request: null, error: e instanceof Error ? e.message : 'Submission recovery is unavailable.' }; } });
  const [pendingSubmission, setPendingSubmission] = useState(recovery.request);
  const [recoveryMode, setRecoveryMode] = useState(Boolean(recovery.request));
  const storageKey = submissionStorageKey(currentUser.id);
  const submissionBusy = useRef(false);

  const attemptSubmission = async (request: import('../../types').UpdateRequest, recovering: boolean) => {
    if (submissionBusy.current) return;
    submissionBusy.current = true;
    setSubmitting(true);
    try {
      // Fail before sending if recovery cannot be retained across reload/navigation.
      try { sessionStorage.setItem(storageKey, JSON.stringify(request)); }
      catch { setFormError('No new request was sent. This browser tab cannot retain the submission for recovery. Enable session storage and try again; your draft is unchanged.'); return; }
      setPendingSubmission(request);
      await submitRequest(request);
      try { sessionStorage.removeItem(storageKey); } catch { /* A later replay is still safe. */ }
      setPendingSubmission(null);
      onClose();
    } catch (error) {
      const definiteRejection = !recovering && error instanceof DirectoryCommitError && ['invalid_metadata', 'write_not_allowed', 'directory_conflict'].includes(error.code || '');
      if (definiteRejection) { try { sessionStorage.removeItem(storageKey); setPendingSubmission(null); } catch { setRecoveryMode(true); } }
      else setRecoveryMode(true);
      setFormError(`${error instanceof Error ? error.message : 'The save result is unknown.'}${definiteRejection ? '' : ' Recover this exact submission before starting another. Do not create a replacement blindly.'}`);
    } finally { submissionBusy.current = false; setSubmitting(false); }
  };

  const reconcileOrCancel = async () => {
    if (!pendingSubmission || submissionBusy.current) return;
    submissionBusy.current = true; setSubmitting(true);
    try {
      const cancelled = await cancelRequestSubmission(pendingSubmission);
      try { sessionStorage.removeItem(storageKey); } catch { /* The confirmed server state is authoritative; any stored replay remains safe. */ }
      if (!cancelled) { setPendingSubmission(null); onClose(); return; }
      const p = pendingSubmission;
      setSelectedLocId(p.targetId); setChangeType(p.changeType); setReason(p.reason || '');
      setNewPhone(formatUsPhone(p.requestedChanges.phone || '', p.requestedChanges.phoneExtension));
      setNewManager(people.find(person => person.id === p.requestedChanges.storeManagerId) || null);
      setNewStatus(p.requestedChanges.operationalStatus || 'Open — Normal Operations');
      setNoticeText(p.requestedChanges.activeNotice?.shortDescription || '');
      setNewHours(p.requestedChanges.standardHours || hoursDraft(locations.find(l => l.id === p.targetId), DEFAULT_WEEKLY_HOURS));
      setHoursBaseline(structuredClone(locations.find(l => l.id === p.targetId)));
      setNewLocationInboxEmail(p.requestedChanges.locationInboxEmail || '');
      setClearLocationInboxEmail(p.requestedChanges.locationInboxEmail === null);
      setAddressDraft(Object.fromEntries(ADDRESS_FIELDS.map(field => [field, Object.hasOwn(p.requestedChanges, field) ? p.requestedChanges[field] ?? '' : locations.find(l => l.id === p.targetId)?.[field] ?? ''])));
      setAddressBaseline(structuredClone(locations.find(l => l.id === p.targetId)));
      setPendingSubmission(null); setRecoveryMode(false); setFormError('The uncommitted operation is safely cancelled. Review this restored draft against current information before submitting a replacement.');
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Cancellation could not be confirmed. Keep recovering this operation.'); }
    finally { submissionBusy.current = false; setSubmitting(false); }
  };

  const targetLoc = locations.find(l => l.id === selectedLocId);
  const resetProposal = (target: LocationRecord | undefined) => {
    setAddressDraft(Object.fromEntries(ADDRESS_FIELDS.map(field => [field, target?.[field] ?? ''])));
    setAddressBaseline(structuredClone(target));
    setNewPhone(''); setNewManager(null); setNewStatus('Open — Normal Operations');
    setNoticeText(''); setReason(''); setNewLocationInboxEmail(''); setClearLocationInboxEmail(false);
    setNewHours(hoursDraft(target, DEFAULT_WEEKLY_HOURS)); setHoursBaseline(structuredClone(target)); setFormError('');
  };
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

  /** Confirm before discarding an edited draft; close an untouched form immediately. */
  const requestClose = () => {
    if (submitting) return;
    if (pendingSubmission || recovery.error) { onClose(); return; }
    if (hasRequestDraft) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    onClose();
  };

  /** Validate this proposal and retain its draft until the server confirms the submission. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (pendingSubmission || recovery.error) return;
    if (!targetLoc) {
      setFormError('Choose an existing location before submitting a request.');
      return;
    }

    const requestedChanges: import('../../types').UpdateRequest['requestedChanges'] = {};
    const currentSnapshot: import('../../types').UpdateRequest['currentSnapshot'] = {};

    if (changeType === 'Phone Number Correction') {
      requestedChanges.phone = newPhone;
      currentSnapshot.phone = targetLoc.phone ?? null;
      currentSnapshot.phoneExtension = targetLoc.phoneExtension ?? null;
    } else if (changeType === 'Address Update') {
      if (!addressBaseline || addressBaseline.id !== targetLoc.id || ADDRESS_FIELDS.some(field => !structurallyEqual(addressBaseline[field] ?? null, targetLoc[field] ?? null))) { setFormError('The address changed while drafting. Select the Location again and review current information before submitting.'); return; }
      // Compare the raw preloaded values first; an unrelated correction must not
      // normalize or validate untouched historical fields (including null/omitted inputs).
      const edited = Object.fromEntries(ADDRESS_FIELDS.filter(field => addressDraft[field] !== (targetLoc[field] ?? '')).map(field => [field, addressDraft[field]]));
      const normalized = normalizeAddressValues(edited);
      if (normalized.issues.length) { setFormError(normalized.issues.map(issue => issue.message).join(' ')); return; }
      for (const field of ADDRESS_FIELDS) {
        if (!Object.hasOwn(edited, field)) continue;
        const value = normalized.values[field] ?? null;
        if (!structurallyEqual(value, targetLoc[field] ?? null)) {
          Object.assign(requestedChanges, { [field]: value });
          Object.assign(currentSnapshot, { [field]: targetLoc[field] ?? null });
        }
      }
    } else if (changeType === 'Store Manager Change') {
      if (!newManager || personLifecycle(newManager) !== 'active') {
        setFormError('Choose an active Store Manager before submitting this request.');
        return;
      }
      if (newManager.id === targetLoc.storeManagerId) {
        setFormError('Choose a different Store Manager. This request would not change the assignment.');
        return;
      }
      requestedChanges.storeManagerId = newManager.id;
      requestedChanges.storeManagerName = newManager.fullName;
      requestedChanges.storeManagerPhone = resolvePersonPhone(newManager).value;
      Object.assign(currentSnapshot, {
        storeManagerId: targetLoc.storeManagerId ?? null,
        storeManagerName: targetLoc.storeManagerName ?? null,
        storeManagerPhone: targetLoc.storeManagerPhone ?? null,
      });
    } else if (changeType === 'Operational Status Change') {
      requestedChanges.operationalStatus = newStatus;
      if (noticeText) {
        requestedChanges.activeNotice = {
          shortDescription: noticeText,
          effectiveDate: new Date().toISOString().split('T')[0]
        };
      }
      currentSnapshot.operationalStatus = targetLoc.operationalStatus;
      if (noticeText) currentSnapshot.activeNotice = targetLoc.activeNotice ?? null;
    } else if (changeType === 'Standard Hours Adjustment') {
      if (!hoursBaseline || hoursBaseline.id !== targetLoc.id
        || !structurallyEqual(hoursBaseline.standardHours, targetLoc.standardHours)) {
        setFormError('The selected location hours changed while drafting. Select the location again to reset the draft, then review current hours.');
        return;
      }
      if (structurallyEqual(newHours, targetLoc.standardHours)) {
        setFormError('Choose different hours. This request would not change the location.');
        return;
      }
      requestedChanges.standardHours = newHours;
      Object.assign(currentSnapshot, { standardHours: targetLoc.standardHours ?? null, hoursMode: targetLoc.hoursMode ?? null, hoursTemplateId: targetLoc.hoursTemplateId ?? null });
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

    const checked = validateRequestProposal({ changeType, targetType: 'Location', requestedChanges, currentSnapshot, reason }, targetLoc as unknown as Record<string, unknown>);
    if (checked.error) { setFormError(checked.error); return; }
    await attemptSubmission({
        id: `req-${crypto.randomUUID()}`,
        requestedAt: new Date().toISOString(),
        status: 'Pending',
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
        requestedChanges: checked.changes,
        currentSnapshot,
        reason
      }, false);
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
          {recovery.error && <p role="alert">{recovery.error}</p>}
          {recoveryMode && pendingSubmission && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
            <p>Recover submission {pendingSubmission.id} for {pendingSubmission.targetName}: {pendingSubmission.changeType}. Its original content is locked; recovery will not create another request or reopen a reviewed request. You may close this dialog and resume from Submit New Request in this tab.</p>
            {pendingSubmission.reason && <p>Original notes: {pendingSubmission.reason}</p>}
            <details><summary className="cursor-pointer font-semibold">Original proposed changes</summary><dl className="mt-2 space-y-2">{Object.entries(pendingSubmission.requestedChanges).map(([key, value]) => <div key={key}><dt className="font-semibold">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="whitespace-pre-wrap break-words">{value === null ? 'Clear value' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}</dd></div>)}</dl></details>
            <Button type="button" disabled={submitting} onClick={() => void attemptSubmission(pendingSubmission, true)}>Recover saved submission</Button>
            <Button type="button" disabled={submitting} onClick={() => void reconcileOrCancel()}>Check saved state / cancel if not saved</Button>
          </div>}
          {submitting && <p role="status" className="text-neutral-600">Submitting this request. Please wait for confirmation before closing.</p>}
          <fieldset hidden={recoveryMode || Boolean(recovery.error)} disabled={submitting || Boolean(pendingSubmission) || Boolean(recovery.error)} className="space-y-3.5">
          <p className="text-neutral-600">Changing the location or category resets proposed values and notes so one store&apos;s details are not carried into another request.</p>
          <div>
            <FormLabel>Target Location</FormLabel>
            <select
              value={selectedLocId}
              aria-label="Target Location"
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedLocId(newId);
                const loc = locations.find(l => l.id === newId);
                resetProposal(loc);
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
              aria-label="Change Category"
              onChange={(e) => { setChangeType(e.target.value as RequestChangeType); resetProposal(targetLoc); }}
              className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 cursor-pointer"
            >
              <option value="Phone Number Correction">Phone Number Correction</option>
              <option value="Address Update">Address &amp; Finding the Store</option>
              <option value="Store Manager Change">Store Manager Leadership Change</option>
              <option value="Operational Status Change">Lifecycle / Hours Modifier & Notice (approval required)</option>
              <option value="Standard Hours Adjustment">Standard Hours Adjustment</option>
              <option value="Other Store Info Update">Other Store Info Update (including shared inbox)</option>
            </select>
          </div>

          {/* Conditional change inputs */}
          {changeType === 'Address Update' && <div className="space-y-3">
            <p className="text-neutral-600">Published Location information. Corrections require approval. Keep personal information and internal notes out of customer directions.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{([
              ['address', 'Street address', 300, true], ['suite', 'Suite / space', 100, false], ['city', 'City', 100, true], ['state', 'State', 2, true], ['zipCode', 'ZIP code', 10, true], ['mallOrCenterName', 'Mall / center', 200, false],
            ] as const).map(([field, label, maxLength, required]) => <label key={field} className="block font-semibold">{label}{required ? ' *' : ''}<input aria-label={label} value={addressDraft[field] || ''} maxLength={maxLength} required={required} onChange={e => setAddressDraft(previous => ({ ...previous, [field]: e.target.value }))} className="mt-1 w-full rounded-lg border border-neutral-300 p-2 font-normal" /></label>)}</div>
            <label className="block font-semibold">Finding the store<textarea aria-label="Finding the store" rows={3} maxLength={1000} value={addressDraft.wayfindingDirections || ''} onChange={e => setAddressDraft(previous => ({ ...previous, wayfindingDirections: e.target.value }))} placeholder="Second floor, next to Macy’s; use the north entrance." className="mt-1 w-full rounded-lg border border-neutral-300 p-2 font-normal" /></label>
            <p className="text-[11px] text-neutral-500">Optional suite, mall and directions can be cleared by emptying their fields. Street, city, state and ZIP cannot be cleared. Existing store identity and staffing are unchanged.</p>
          </div>}
          <p className="rounded-lg bg-blue-50 p-2 text-blue-900">For a power outage or other immediate closure, open the Location and use Report temporary closure. It expires at store-local midnight and does not wait for correction approval. Holiday exceptions remain managed in the existing holiday settings, not this request form.</p>
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
                value={newManager?.id}
                roleFilter="Store Manager"
                onChange={(p) => { setNewManager(p); setFormError(''); }}
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
                  onChange={(e) => setNewStatus(e.target.value as OperationalStatus)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="Open — Normal Operations">Open — Normal Operations</option>
                  <option value="Temporarily Modified Hours">Temporarily Modified Hours</option>
                  <option value="Under Remodel / Renovation">Under Remodel / Renovation</option>
                  {targetLoc?.operationalStatus === 'Temporarily Closed — Emergency' && <option value="Temporarily Closed — Emergency" disabled>Legacy emergency — review and replace</option>}
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
                onChange={hours => { setNewHours(hours); setFormError(''); }}
              />
              <p className="mt-2 text-neutral-600">Approval applies a custom schedule and clears the template link. Reject or replace requests that no longer change the current hours.</p>
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
              disabled={submitting}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{submitting ? 'Submitting…' : 'Submit for Approval'}</span>
            </Button>
          </div>
          </fieldset>
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
