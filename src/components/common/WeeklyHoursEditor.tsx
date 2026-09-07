import React from 'react';
import { WeeklySchedule, DayHours } from '../../types';

interface WeeklyHoursEditorProps {
  schedule: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
  disabled?: boolean;
}

const DAYS: { key: keyof WeeklySchedule; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

export const WeeklyHoursEditor: React.FC<WeeklyHoursEditorProps> = ({
  schedule,
  onChange,
  disabled = false,
}) => {
  const handleDayChange = (dayKey: keyof WeeklySchedule, updates: Partial<DayHours>) => {
    onChange({
      ...schedule,
      [dayKey]: {
        ...schedule[dayKey],
        ...updates,
      },
    });
  };

  const copyToAllWeekdays = (fromDay: keyof WeeklySchedule) => {
    const source = schedule[fromDay];
    const weekdays: (keyof WeeklySchedule)[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const newSchedule = { ...schedule };
    weekdays.forEach(d => {
      newSchedule[d] = { ...source };
    });
    onChange(newSchedule);
  };

  return (
    <div className="space-y-2 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
      <div className="flex items-center justify-between text-xs text-neutral-500 pb-2 border-b border-neutral-200">
        <span className="font-semibold text-neutral-800">Standard Weekly Hours</span>
        {!disabled && (
          <button
            type="button"
            onClick={() => copyToAllWeekdays('monday')}
            className="text-[11px] text-red-600 hover:text-red-700 underline cursor-pointer font-medium"
          >
            Copy Mon to Mon–Fri
          </button>
        )}
      </div>

      <div className="divide-y divide-neutral-200">
        {DAYS.map(({ key, label }) => {
          const day = schedule[key] || { open: '10:00', close: '20:00', isClosed: false };
          return (
            <div key={key} className="py-2 flex items-center justify-between gap-3 text-xs">
              <span className="w-24 font-medium text-neutral-800">{label}</span>
              
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer text-neutral-600">
                  <input
                    type="checkbox"
                    checked={day.isClosed}
                    disabled={disabled}
                    onChange={(e) => handleDayChange(key, { isClosed: e.target.checked })}
                    className="rounded border-neutral-300 bg-white text-red-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Closed</span>
                </label>

                {!day.isClosed ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="time"
                      value={day.open}
                      disabled={disabled}
                      onChange={(e) => handleDayChange(key, { open: e.target.value })}
                      className="px-2 py-1 bg-white border border-neutral-300 rounded text-neutral-800 text-xs focus:outline-none focus:border-red-500"
                    />
                    <span className="text-neutral-400">to</span>
                    <input
                      type="time"
                      value={day.close}
                      disabled={disabled}
                      onChange={(e) => handleDayChange(key, { close: e.target.value })}
                      className="px-2 py-1 bg-white border border-neutral-300 rounded text-neutral-800 text-xs focus:outline-none focus:border-red-500"
                    />
                  </div>
                ) : (
                  <span className="text-neutral-400 italic px-2 py-1">Closed all day</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
