import React from 'react';
import { Clock, Copy, Sparkles, Check } from 'lucide-react';
import { WeeklySchedule, DayHours, HoursTemplate } from '../../types';

export const TIME_OPTIONS: string[] = [
  '06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM',
  '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
  '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM',
  '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM',
  '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM',
  '12:00 AM'
];

export const DAYS_OF_WEEK: Array<{ key: keyof WeeklySchedule; label: string; short: string }> = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
];

interface WeeklyHoursEditorProps {
  value: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
  templates?: HoursTemplate[];
  disabled?: boolean;
}

export const WeeklyHoursEditor: React.FC<WeeklyHoursEditorProps> = ({
  value,
  onChange,
  templates = [],
  disabled = false,
}) => {
  const schedule = value || {
    monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
    sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
  };

  const handleDayChange = (day: keyof WeeklySchedule, updates: Partial<DayHours>) => {
    if (disabled) return;
    const currentDay = schedule[day] || { open: '10:00 AM', close: '09:00 PM', isClosed: false };
    const updatedDay: DayHours = {
      ...currentDay,
      ...updates,
    };

    if (updatedDay.isClosed) {
      updatedDay.open = 'Closed';
      updatedDay.close = 'Closed';
    } else if (updatedDay.open === 'Closed' || !updatedDay.open) {
      updatedDay.open = '10:00 AM';
      updatedDay.close = '09:00 PM';
    }

    onChange({
      ...schedule,
      [day]: updatedDay,
    });
  };

  // Shortcut 1: Copy Monday to Monday-Friday
  const handleCopyMonToWeekdays = () => {
    if (disabled) return;
    const mon = schedule.monday || { open: '10:00 AM', close: '09:00 PM', isClosed: false };
    onChange({
      ...schedule,
      tuesday: { ...mon },
      wednesday: { ...mon },
      thursday: { ...mon },
      friday: { ...mon },
    });
  };

  // Shortcut 2: Copy Monday to All 7 Days
  const handleCopyMonToAll = () => {
    if (disabled) return;
    const mon = schedule.monday || { open: '10:00 AM', close: '09:00 PM', isClosed: false };
    onChange({
      monday: { ...mon },
      tuesday: { ...mon },
      wednesday: { ...mon },
      thursday: { ...mon },
      friday: { ...mon },
      saturday: { ...mon },
      sunday: { ...mon },
    });
  };

  // Apply Template Shortcut
  const handleSelectTemplate = (templateId: string) => {
    if (disabled || !templateId) return;
    const tmpl = templates.find(t => t.id === templateId);
    if (tmpl && tmpl.schedule) {
      onChange(JSON.parse(JSON.stringify(tmpl.schedule)));
    }
  };

  return (
    <div className="space-y-3">
      {/* Action shortcuts bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-neutral-100 dark:bg-neutral-800/80 rounded-lg border border-neutral-200 dark:border-neutral-700 text-xs">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-neutral-500" />
          <span className="font-semibold text-neutral-800 dark:text-neutral-200">7-Day Weekly Grid</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && (
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <select
                onChange={e => {
                  handleSelectTemplate(e.target.value);
                  e.target.value = '';
                }}
                defaultValue=""
                disabled={disabled}
                className="px-2 py-1 bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded text-[11px] text-neutral-700 dark:text-neutral-300 cursor-pointer"
                title="Apply a pre-configured store schedule template"
              >
                <option value="" disabled>Apply Hours Template...</option>
                {templates.map(tmpl => (
                  <option key={tmpl.id} value={tmpl.id}>
                    {tmpl.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyMonToWeekdays}
            disabled={disabled}
            className="px-2 py-1 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-[11px] font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1 shadow-2xs transition-colors disabled:opacity-50"
            title="Copy Monday's open/close times to Tue, Wed, Thu, and Fri"
          >
            <Copy className="w-3 h-3 text-neutral-500" />
            <span>Copy Mon to Mon–Fri</span>
          </button>

          <button
            type="button"
            onClick={handleCopyMonToAll}
            disabled={disabled}
            className="px-2 py-1 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-[11px] font-medium text-neutral-700 dark:text-neutral-300 flex items-center gap-1 shadow-2xs transition-colors disabled:opacity-50"
            title="Copy Monday's open/close times to all 7 days"
          >
            <Copy className="w-3 h-3 text-neutral-500" />
            <span>Copy Mon to All</span>
          </button>
        </div>
      </div>

      {/* 7-Day Visual Grid */}
      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden divide-y divide-neutral-200 dark:divide-neutral-800">
        {DAYS_OF_WEEK.map(({ key, label, short }) => {
          const day = schedule[key] || { open: '10:00 AM', close: '09:00 PM', isClosed: false };
          const isClosed = Boolean(day.isClosed || day.open === 'Closed');

          return (
            <div
              key={key}
              className={`p-2.5 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                isClosed
                  ? 'bg-neutral-50/70 dark:bg-neutral-900/40 text-neutral-400'
                  : 'hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30'
              }`}
            >
              {/* Day Name & Status indicator */}
              <div className="flex items-center justify-between sm:justify-start gap-3 w-36 shrink-0">
                <span className={`font-semibold text-xs ${isClosed ? 'text-neutral-400 dark:text-neutral-500 line-through' : 'text-neutral-900 dark:text-neutral-100'}`}>
                  {label}
                </span>

                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[11px]">
                  <input
                    type="checkbox"
                    checked={isClosed}
                    disabled={disabled}
                    onChange={e => handleDayChange(key, { isClosed: e.target.checked })}
                    className="rounded border-neutral-300 dark:border-neutral-700 text-red-600 focus:ring-red-500 w-3.5 h-3.5"
                  />
                  <span className={isClosed ? 'font-bold text-red-600 dark:text-red-400' : 'text-neutral-500 dark:text-neutral-400'}>
                    Closed
                  </span>
                </label>
              </div>

              {/* Time Pickers or Closed State */}
              <div className="flex items-center gap-2 flex-1 justify-end">
                {isClosed ? (
                  <div className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded border border-neutral-200 dark:border-neutral-700 text-neutral-400 dark:text-neutral-500 font-mono text-[11px] italic w-full sm:w-auto text-center sm:text-right">
                    Closed all day
                  </div>
                ) : (
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex items-center gap-1 flex-1 sm:flex-initial">
                      <span className="text-[10px] text-neutral-400 uppercase font-medium">Open</span>
                      <select
                        value={day.open || '10:00 AM'}
                        disabled={disabled}
                        onChange={e => handleDayChange(key, { open: e.target.value })}
                        className="w-full sm:w-32 px-2 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        {TIME_OPTIONS.map(time => (
                          <option key={`open-${time}`} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>

                    <span className="text-neutral-400 font-bold">to</span>

                    <div className="flex items-center gap-1 flex-1 sm:flex-initial">
                      <span className="text-[10px] text-neutral-400 uppercase font-medium">Close</span>
                      <select
                        value={day.close || '09:00 PM'}
                        disabled={disabled}
                        onChange={e => handleDayChange(key, { close: e.target.value })}
                        className="w-full sm:w-32 px-2 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-1 focus:ring-red-500"
                      >
                        {TIME_OPTIONS.map(time => (
                          <option key={`close-${time}`} value={time}>{time}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
