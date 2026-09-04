import React, { useState } from 'react';
import { 
  X, 
  Layers, 
  Clock, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Building, 
  ArrowRight, 
  Sparkles,
  Zap,
  Globe
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { 
  LocationRecord, 
  WeeklySchedule, 
  HolidayHoursOverride, 
  OperationalStatus 
} from '../../types';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';

interface BulkUpdateModalProps {
  selectedLocationIds: string[];
  isOpen: boolean;
  onClose: () => void;
  onClearSelection: () => void;
}

type BulkActionType = 'template-hours' | 'custom-hours' | 'holiday-exception' | 'operational-status';

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

export const BulkUpdateModal: React.FC<BulkUpdateModalProps> = ({
  selectedLocationIds,
  isOpen,
  onClose,
  onClearSelection,
}) => {
  const { locations, hoursTemplates, bulkUpdateLocationsHours, currentUser } = useDirectory();

  const [actionType, setActionType] = useState<BulkActionType>('template-hours');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(hoursTemplates[0]?.id || '');
  
  // Custom Hours state
  const [customSchedule, setCustomSchedule] = useState<WeeklySchedule>({
    monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
  });

  // Holiday Exception state
  const [holidayName, setHolidayName] = useState('Thanksgiving Day');
  const [holidayDate, setHolidayDate] = useState(new Date().toISOString().split('T')[0]);
  const [holidayIsClosed, setHolidayIsClosed] = useState(true);
  const [holidayOpen, setHolidayOpen] = useState('10:00 AM');
  const [holidayClose, setHolidayClose] = useState('06:00 PM');

  // Operational Status state
  const [operationalStatus, setOperationalStatus] = useState<OperationalStatus>('Modified Hours');
  const [noticeDescription, setNoticeDescription] = useState('');

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; count: number } | null>(null);

  if (!isOpen) return null;

  const selectedLocations = locations.filter(l => selectedLocationIds.includes(l.id));

  const handleExecute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLocationIds.length === 0) return;

    setIsExecuting(true);

    try {
      let scheduleToApply: WeeklySchedule | undefined;
      let holidayToApply: HolidayHoursOverride | undefined;
      let statusToApply: OperationalStatus | undefined;
      let noticeToApply: string | undefined;

      if (actionType === 'template-hours') {
        const tmpl = hoursTemplates.find(t => t.id === selectedTemplateId);
        if (tmpl) scheduleToApply = tmpl.schedule;
      } else if (actionType === 'custom-hours') {
        scheduleToApply = customSchedule;
      } else if (actionType === 'holiday-exception') {
        holidayToApply = {
          id: `hol-${Date.now().toString(36)}`,
          holidayName,
          date: holidayDate,
          hours: {
            open: holidayIsClosed ? 'Closed' : holidayOpen,
            close: holidayIsClosed ? 'Closed' : holidayClose,
            isClosed: holidayIsClosed,
          }
        };
      } else if (actionType === 'operational-status') {
        statusToApply = operationalStatus;
        noticeToApply = noticeDescription.trim();
      }

      const res = await bulkUpdateLocationsHours({
        locationIds: selectedLocationIds,
        schedule: scheduleToApply,
        holidayException: holidayToApply,
        operationalStatus: statusToApply,
        noticeDescription: noticeToApply,
      });

      setExecutionResult({ success: res.success, count: res.updatedCount });
      setTimeout(() => {
        setIsExecuting(false);
        setExecutionResult(null);
        onClearSelection();
        onClose();
      }, 1800);
    } catch (e) {
      console.error('Bulk update error:', e);
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-bold text-base">
                Bulk Update Engine (DISPATCH-012)
              </h3>
              <p className="text-[11px] text-neutral-400">
                Mass update hours, holiday exceptions, and operational status across {selectedLocations.length} stores
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {executionResult ? (
          <div className="p-10 text-center space-y-3">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto animate-bounce" />
            <h4 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
              Bulk Update Completed!
            </h4>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              Successfully updated <strong>{executionResult.count} store records</strong> via atomic Firestore writeBatch. All records have been queued for Google Business Profile sync (Pending Push).
            </p>
          </div>
        ) : (
          <form onSubmit={handleExecute} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
            {/* Selected Stores Summary Bar */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-800/60 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 dark:text-neutral-200">
                  Target Stores Selected ({selectedLocations.length})
                </span>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="text-[11px] text-red-600 hover:underline"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800">
                {selectedLocations.map(loc => (
                  <span
                    key={loc.id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded text-[10px] font-mono font-semibold"
                  >
                    #{loc.storeNumber} {loc.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Action Type Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'template-hours', label: 'Apply Template', icon: Sparkles },
                { id: 'custom-hours', label: 'Custom 7-Day Hours', icon: Clock },
                { id: 'holiday-exception', label: 'Holiday Exception', icon: Calendar },
                { id: 'operational-status', label: 'Status & Notice', icon: AlertTriangle },
              ].map(tab => {
                const Icon = tab.icon;
                const isSelected = actionType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActionType(tab.id as BulkActionType)}
                    className={`p-3 rounded-lg border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                      isSelected
                        ? 'border-red-600 bg-red-50/50 dark:bg-red-950/20 text-red-600 dark:text-red-400 font-bold shadow-2xs'
                        : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ACTION 1: Apply Template */}
            {actionType === 'template-hours' && (
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs">
                  <Sparkles className="w-4 h-4 text-red-600" />
                  <span>Select Operating Hours Template to Broadcast</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {hoursTemplates.map(tmpl => (
                    <label
                      key={tmpl.id}
                      className={`p-3 rounded-lg border cursor-pointer flex flex-col justify-between transition-all ${
                        selectedTemplateId === tmpl.id
                          ? 'border-red-600 bg-white dark:bg-neutral-900 ring-2 ring-red-500/20 shadow-xs'
                          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/60 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-neutral-900 dark:text-neutral-100 text-xs">
                            {tmpl.name}
                          </div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {tmpl.description}
                          </div>
                        </div>
                        <input
                          type="radio"
                          name="hoursTemplateRadio"
                          checked={selectedTemplateId === tmpl.id}
                          onChange={() => setSelectedTemplateId(tmpl.id)}
                          className="text-red-600 focus:ring-red-500 mt-0.5"
                        />
                      </div>

                      <div className="mt-2 text-[10px] font-mono text-neutral-500 border-t border-neutral-100 dark:border-neutral-700/60 pt-1.5">
                        Mon-Fri: {tmpl.schedule.monday.open} - {tmpl.schedule.monday.close} | Sun: {tmpl.schedule.sunday.isClosed ? 'Closed' : `${tmpl.schedule.sunday.open} - ${tmpl.schedule.sunday.close}`}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ACTION 2: Custom 7-Day Grid */}
            {actionType === 'custom-hours' && (
              <div className="space-y-2">
                <div className="text-xs text-neutral-500">
                  Configure custom 7-day schedule to overwrite operating hours for all {selectedLocations.length} selected stores:
                </div>
                <WeeklyHoursEditor
                  value={customSchedule}
                  onChange={setCustomSchedule}
                  templates={hoursTemplates}
                />
              </div>
            )}

            {/* ACTION 3: Holiday Exception */}
            {actionType === 'holiday-exception' && (
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center justify-between text-xs">
                  <span className="uppercase">Bulk Holiday Exception Definition</span>
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
                    <label className="block text-neutral-500 mb-1">Holiday / Exception Name *</label>
                    <input
                      type="text"
                      required
                      value={holidayName}
                      onChange={e => setHolidayName(e.target.value)}
                      placeholder="e.g. Thanksgiving Day"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-500 mb-1">Exception Date (YYYY-MM-DD) *</label>
                    <input
                      type="date"
                      required
                      value={holidayDate}
                      onChange={e => setHolidayDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={holidayIsClosed}
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
                      <label className="block text-neutral-500 mb-1">Open Time</label>
                      <input
                        type="text"
                        value={holidayOpen}
                        onChange={e => setHolidayOpen(e.target.value)}
                        placeholder="06:00 AM"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-500 mb-1">Close Time</label>
                      <input
                        type="text"
                        value={holidayClose}
                        onChange={e => setHolidayClose(e.target.value)}
                        placeholder="10:00 PM"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ACTION 4: Operational Status & Notice */}
            {actionType === 'operational-status' && (
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs uppercase">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span>Bulk Operational Status & Notice Broadcast</span>
                </div>

                <div>
                  <label className="block text-neutral-500 mb-1 font-semibold">New Operational Status *</label>
                  <select
                    value={operationalStatus}
                    onChange={e => setOperationalStatus(e.target.value as OperationalStatus)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-semibold"
                  >
                    <option value="Open — Normal Operations">Open — Normal Operations</option>
                    <option value="Modified Hours">Modified Hours</option>
                    <option value="Temporarily Closed">Temporarily Closed</option>
                    <option value="Under Remodel">Under Remodel</option>
                    <option value="Maintenance / Repair Issue">Maintenance / Repair Issue</option>
                    <option value="Relocating">Relocating</option>
                    <option value="Closing">Closing</option>
                    <option value="Permanently Closed">Permanently Closed</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-500 mb-1 font-semibold">Extended Notice Description</label>
                  <input
                    type="text"
                    value={noticeDescription}
                    onChange={e => setNoticeDescription(e.target.value)}
                    placeholder="e.g. Operating on modified holiday schedule as approved by District leadership."
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                  />
                </div>
              </div>
            )}

            {/* Governance & Sync Impact Notice */}
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg flex items-start gap-2.5">
              <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 dark:text-amber-200">
                <span className="font-bold">Google Business Profile (GBP) & SoR Synchronization:</span>
                <span className="ml-1 text-amber-800 dark:text-amber-300">
                  Executing this bulk update will immediately commit all changes to the Firestore database via atomic writeBatch, log audit entries under <strong>{currentUser.displayName}</strong>, and flag all {selectedLocations.length} locations as <strong>Pending Push</strong> for Google Business Profile synchronization.
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
              <div className="text-[11px] text-neutral-400">
                Author: <strong className="text-neutral-600 dark:text-neutral-300">{currentUser.displayName}</strong> ({currentUser.role})
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded font-medium text-xs hover:bg-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isExecuting || selectedLocationIds.length === 0}
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-neutral-400 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <Zap className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin' : ''}`} />
                  <span>{isExecuting ? 'Broadcasting Batch...' : `Apply to ${selectedLocations.length} Stores`}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
