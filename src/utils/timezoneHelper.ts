import { LocationRecord, DayHours } from '../types';

export function getTodayHoursForLocation(loc: LocationRecord): {
  dayName: string;
  hoursString: string;
  isOpenNow: boolean;
  isHolidayOverride: boolean;
  holidayName?: string;
} {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
  const now = new Date();
  const dayIndex = now.getDay();
  const dayName = days[dayIndex];
  
  // Format today as YYYY-MM-DD
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const dateNum = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${dateNum}`;

  // Check holiday override
  if (loc.holidayHours && loc.holidayHours.length > 0) {
    const holidayMatch = loc.holidayHours.find(h => h.date === todayStr);
    if (holidayMatch) {
      const hHours = holidayMatch.hours;
      if (hHours.isClosed) {
        return {
          dayName: holidayMatch.holidayName,
          hoursString: 'Closed for Holiday',
          isOpenNow: false,
          isHolidayOverride: true,
          holidayName: holidayMatch.holidayName
        };
      }
      return {
        dayName: holidayMatch.holidayName,
        hoursString: `${formatTime(hHours.open)} – ${formatTime(hHours.close)}`,
        isOpenNow: checkIsOpen(hHours.open, hHours.close),
        isHolidayOverride: true,
        holidayName: holidayMatch.holidayName
      };
    }
  }

  const standardDay: DayHours = loc.standardHours?.[dayName] || { open: '10:00', close: '20:00', isClosed: false };
  if (standardDay.isClosed) {
    return {
      dayName: capitalize(dayName),
      hoursString: 'Closed Today',
      isOpenNow: false,
      isHolidayOverride: false
    };
  }

  return {
    dayName: capitalize(dayName),
    hoursString: `${formatTime(standardDay.open)} – ${formatTime(standardDay.close)}`,
    isOpenNow: checkIsOpen(standardDay.open, standardDay.close),
    isHolidayOverride: false
  };
}

function checkIsOpen(openTimeStr: string, closeTimeStr: string): boolean {
  if (!openTimeStr || !closeTimeStr) return false;
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTotal = currentHour * 60 + currentMin;

  const [oH, oM] = openTimeStr.split(':').map(Number);
  const [cH, cM] = closeTimeStr.split(':').map(Number);
  const openTotal = oH * 60 + (oM || 0);
  const closeTotal = cH * 60 + (cM || 0);

  return currentTotal >= openTotal && currentTotal < closeTotal;
}

export function formatTime(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m === 0 ? '' : `:${String(m).padStart(2, '0')}`;
  return `${displayH}${displayM} ${period}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
