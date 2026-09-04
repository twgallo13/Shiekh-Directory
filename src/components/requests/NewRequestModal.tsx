import React, { useState } from 'react';
import { 
  X, 
  Send, 
  AlertTriangle, 
  Building, 
  User, 
  Phone, 
  Clock, 
  Calendar,
  CheckCircle2,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { 
  LocationRecord, 
  RequestChangeType, 
  WeeklySchedule, 
  HolidayHoursOverride 
} from '../../types';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';

interface NewRequestModalProps {
  location: LocationRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

const COMMON_HOLIDAY_PRESETS = [
  { name: 'Thanksgiving Day', defaultClosed: true },
  { name: 'Black Friday', defaultOpen: '06:00 AM', defaultClose: '10:00 PM', defaultClosed: false },
  { name: 'Christmas Eve', defaultOpen: '09:00 AM', defaultClose: '06:00 PM', defaultClosed: false },
  { name: 'Christmas Day', defaultClosed: true },
  { name: 'New Year\'s Eve', defaultOpen: '10:00 AM', defaultClose: '06:00 PM', defaultClosed: false },
  { name: 'New Year\'s Day', defaultOpen: '11:00 AM', defaultClose: '07:00 PM', defaultClosed: false },
  { name: 'Memorial Day', defaultOpen: '10:00 AM', defaultClose: '08:00 PM', defaultClosed: false },
  { name: 'Labor Day', defaultOpen: '10:00 AM', defaultClose: '08:00 PM', defaultClosed: false },
];

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  location,
  isOpen,
  onClose,
}) => {
  const { locations, currentUser, submitUpdateRequest, hoursTemplates } = useDirectory();

  const [selectedLocId, setSelectedLocId] = useState(location?.id || locations[0]?.id || '');
  const [changeType, setChangeType] = useState<RequestChangeType>('Store Hours Update');
  
  const targetLoc = locations.find(l => l.id === (location?.id || selectedLocId));

  // Dynamic fields
  const [newManagerName, setNewManagerName] = useState('');
  const [newManagerPhone, setNewManagerPhone] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newStatus, setNewStatus] = useState('Open — Normal Operations');
  const [notes, setNotes] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Structured Hours Builder State (DISPATCH-012 & DISPATCH-013)
  const [hoursSource, setHoursSource] = useState<string>('Custom Hours');
  const [requestedSchedule, setRequestedSchedule] = useState<WeeklySchedule>(() => {
    if (targetLoc?.standardHours) {
      return JSON.parse(JSON.stringify(targetLoc.standardHours));
    }
    return {
      monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
      sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
    };
  });

  // Holiday Exception State
  const [holidayName, setHolidayName] = useState('Thanksgiving Day');
  const [holidayDate, setHolidayDate] = useState(new Date().toISOString().split('T')[0]);
  const [holidayIsClosed, setHolidayIsClosed] = useState(true);
  const [holidayOpen, setHolidayOpen] = useState('10:00 AM');
  const [holidayClose, setHolidayClose] = useState('06:00 PM');

  // Update requested schedule if target location changes
  React.useEffect(() => {
    if (targetLoc?.standardHours) {
      setRequestedSchedule(JSON.parse(JSON.stringify(targetLoc.standardHours)));
    }
  }, [selectedLocId, location]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLoc) return;

    const requestedChanges: Record<string, any> = {};
    const currentSnapshot: Record<string, any> = {};

    if (changeType === 'Store Hours Update') {
      currentSnapshot.standardHours = targetLoc.standardHours;
      requestedChanges.standardHours = requestedSchedule;
      requestedChanges.hoursSource = hoursSource || 'Custom Hours';
    } else if (changeType === 'Holiday / Special Hours') {
      const newException: HolidayHoursOverride = {
        id: `hol-${Date.now().toString(36)}`,
        holidayName,
        date: holidayDate,
        hours: {
          open: holidayIsClosed ? 'Closed' : holidayOpen,
          close: holidayIsClosed ? 'Closed' : holidayClose,
          isClosed: holidayIsClosed,
        }
      };
      currentSnapshot.holidayHours = targetLoc.holidayHours || [];
      requestedChanges.holidayHours = [
        ...(targetLoc.holidayHours || []).filter(h => h.date !== holidayDate),
        newException
      ];
      requestedChanges.hoursSource = `Holiday Preset: ${holidayName}`;
    } else if (changeType === 'Store Manager Change') {
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

    setIsSubmitting(true);
    try {
      await submitUpdateRequest({
        targetType: 'Location',
        targetId: targetLoc.id,
        targetName: `Store #${targetLoc.storeNumber} (${targetLoc.name})`,
        targetStoreNumber: targetLoc.storeNumber,
        changeType,
        hoursSource: changeType === 'Store Hours Update' ? (hoursSource || 'Custom Hours') : changeType === 'Holiday / Special Hours' ? `Holiday: ${holidayName}` : undefined,
        currentSnapshot,
        requestedChanges,
        notes: notes.trim() || `Proposed structured update for ${changeType}`,
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
    } catch (err: any) {
      console.error('Failed to submit update request:', err);
      alert(`Error submitting request: ${err.message || String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isHoursChange = changeType === 'Store Hours Update' || changeType === 'Holiday / Special Hours';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full ${
          isHoursChange ? 'max-w-3xl' : 'max-w-lg'
        } overflow-hidden flex flex-col max-h-[90vh]`}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="font-bold text-sm sm:text-base">
                Request Directory Update or Correction
              </h3>
              <p className="text-[11px] text-neutral-400">
                Data Governance & Authoritative Change Queue (DISPATCH-012)
              </p>
            </div>
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
          <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs overflow-y-auto flex-1">
            {/* Target Location Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-500 mb-1 font-semibold">Select Store / Location *</label>
                <select
                  value={location?.id || selectedLocId || ''}
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
                  value={changeType || 'Store Hours Update'}
                  onChange={e => setChangeType(e.target.value as RequestChangeType)}
                  className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs text-neutral-900 dark:text-neutral-100 font-semibold"
                >
                  <option value="Store Hours Update">Store Hours Change (7-Day Visual Builder)</option>
                  <option value="Holiday / Special Hours">Holiday or Special Event Exception</option>
                  <option value="Store Manager Change">Store Manager Change / Promotion</option>
                  <option value="Assistant Manager Change">Assistant Manager / Keyholder Update</option>
                  <option value="Phone Number Correction">Store Phone Number Correction</option>
                  <option value="Address Correction">Store Address / Suite Correction</option>
                  <option value="Operational Status Change">Operational Status (Remodel, Closure, Relocation)</option>
                  <option value="New Location Proposal">New Store / Location Addition</option>
                </select>
              </div>
            </div>

            {/* Contextual Visual Hours Builder (DISPATCH-012 Requirement 2) */}
            {changeType === 'Store Hours Update' && (
              <div className="space-y-2">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-lg flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                    <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <span>Configure proposed 7-day schedule for Store #{targetLoc?.storeNumber}</span>
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">Structured Payload</span>
                </div>

                <WeeklyHoursEditor
                  value={requestedSchedule}
                  onChange={setRequestedSchedule}
                  templates={hoursTemplates}
                  onTemplateSelect={(_id, name) => setHoursSource(name)}
                />
              </div>
            )}

            {/* Holiday / Special Hours Builder (DISPATCH-012 Requirement 2) */}
            {changeType === 'Holiday / Special Hours' && (
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center justify-between text-xs">
                  <span className="uppercase">Proposed Holiday Exception</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-neutral-400">Preset:</span>
                    <select
                      onChange={e => {
                        const p = COMMON_HOLIDAY_PRESETS.find(x => x.name === e.target.value);
                        if (p) {
                          setHolidayName(p.name);
                          setHolidayIsClosed(p.defaultClosed);
                          if (p.defaultOpen) setHolidayOpen(p.defaultOpen);
                          if (p.defaultClose) setHolidayClose(p.defaultClose);
                        }
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-[10px]"
                    >
                      {COMMON_HOLIDAY_PRESETS.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Holiday / Exception Name</label>
                    <input
                      type="text"
                      required
                      value={holidayName || ''}
                      onChange={e => setHolidayName(e.target.value)}
                      placeholder="e.g. Thanksgiving Day"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-500 mb-1">Exception Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      required
                      value={holidayDate || ''}
                      onChange={e => setHolidayDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(holidayIsClosed)}
                        onChange={e => setHolidayIsClosed(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-red-600 focus:ring-red-500 w-4 h-4"
                      />
                      <span className={holidayIsClosed ? 'font-bold text-red-600 dark:text-red-400' : 'text-neutral-600 dark:text-neutral-300'}>
                        Closed All Day
                      </span>
                    </label>
                  </div>
                </div>

                {!holidayIsClosed && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <div>
                      <label className="block text-neutral-500 mb-1">Proposed Open Time</label>
                      <input
                        type="text"
                        value={holidayOpen || ''}
                        onChange={e => setHolidayOpen(e.target.value)}
                        placeholder="06:00 AM"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-500 mb-1">Proposed Close Time</label>
                      <input
                        type="text"
                        value={holidayClose || ''}
                        onChange={e => setHolidayClose(e.target.value)}
                        placeholder="10:00 PM"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Store Manager Change Fields */}
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
                    value={newManagerName || ''}
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
                    value={newManagerPhone || ''}
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
                  value={newPhone || ''}
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
                  value={newAddress || ''}
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
                  value={newStatus || 'Open — Normal Operations'}
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

            {/* Notes / Business Justification */}
            <div>
              <label className="block text-neutral-500 mb-1 font-semibold">
                {isHoursChange ? 'Additional Notes / Effective Start Date (Optional)' : 'Reason / Details & Effective Date *'}
              </label>
              <textarea
                required={!isHoursChange}
                rows={2}
                value={notes || ''}
                onChange={e => setNotes(e.target.value)}
                placeholder={isHoursChange ? 'e.g. Approved by Regional VP for Q4 Holiday Schedule...' : 'Explain the background, effective start date, authorization details...'}
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
                disabled={isSubmitting}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting to Data Steward...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit to Data Steward</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
