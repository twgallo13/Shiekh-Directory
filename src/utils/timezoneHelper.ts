import { LocationRecord, DayHours } from '../types';

export interface TodayHoursResult {
  dayName: string;
  hoursString: string;
  isOpenNow: boolean;
  statusBadge: {
    text: string;
    variant: 'open' | 'closed' | 'modified' | 'special';
  };
  timeZoneShort: string;
  localTimeString: string;
}

export function getTodayHoursForLocation(location: LocationRecord): TodayHoursResult {
  const timeZone = location.timeZone || 'America/Los_Angeles';
  
  // Format current local time in location's time zone
  const now = new Date();
  const optionsDate: Intl.DateTimeFormatOptions = { timeZone, weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: true };
  const formatter = new Intl.DateTimeFormat('en-US', optionsDate);
  const parts = formatter.formatToParts(now);
  
  const weekdayPart = parts.find(p => p.type === 'weekday')?.value?.toLowerCase() || 'monday';
  const hourPartStr = parts.find(p => p.type === 'hour')?.value || '12';
  const minPartStr = parts.find(p => p.type === 'minute')?.value || '00';
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value || 'PM';

  const tzShort = timeZone.includes('Chicago') ? 'CT' : 'PT';
  const localTimeString = `${hourPartStr}:${minPartStr} ${dayPeriod} ${tzShort}`;

  // Check if there is an active special hours override for today (YYYY-MM-DD)
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now); // "YYYY-MM-DD"
  
  const activeSpecial = location.specialHours?.find(
    s => s.startDate <= todayIso && s.endDate >= todayIso
  );

  const activeHoliday = location.holidayHours?.find(
    h => h.date === todayIso
  );

  let targetHours: DayHours;
  let isOverride = false;
  let overrideLabel = '';

  if (activeHoliday) {
    targetHours = activeHoliday.hours;
    isOverride = true;
    overrideLabel = `Holiday (${activeHoliday.holidayName})`;
  } else if (activeSpecial) {
    targetHours = activeSpecial.hours;
    isOverride = true;
    overrideLabel = `Special Hours (${activeSpecial.reason})`;
  } else {
    const dayKey = weekdayPart as keyof typeof location.standardHours;
    targetHours = location.standardHours?.[dayKey] || { open: '10:00 AM', close: '09:00 PM' };
  }

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const dayDisplay = capitalize(weekdayPart);

  // If store is permanently closed, temporarily closed, or under remodel
  if (location.operationalStatus === 'Permanently Closed') {
    return {
      dayName: dayDisplay,
      hoursString: 'Permanently Closed',
      isOpenNow: false,
      statusBadge: { text: 'Permanently Closed', variant: 'closed' },
      timeZoneShort: tzShort,
      localTimeString,
    };
  }

  if (location.operationalStatus === 'Temporarily Closed') {
    return {
      dayName: dayDisplay,
      hoursString: 'Temporarily Closed',
      isOpenNow: false,
      statusBadge: { text: 'Temp. Closed', variant: 'closed' },
      timeZoneShort: tzShort,
      localTimeString,
    };
  }

  if (targetHours.isClosed || targetHours.open === 'Closed') {
    return {
      dayName: dayDisplay,
      hoursString: 'Closed Today',
      isOpenNow: false,
      statusBadge: { text: 'Closed Today', variant: 'closed' },
      timeZoneShort: tzShort,
      localTimeString,
    };
  }

  const hoursString = `${targetHours.open} – ${targetHours.close}${isOverride ? ` (${overrideLabel})` : ''}`;

  // Approximate open/close check for badge
  const parseHourTo24 = (hStr: string) => {
    try {
      const match = hStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return 0;
      let hr = parseInt(match[1], 10);
      const min = parseInt(match[2], 10);
      const period = match[3].toUpperCase();
      if (period === 'PM' && hr < 12) hr += 12;
      if (period === 'AM' && hr === 12) hr = 0;
      return hr * 60 + min;
    } catch {
      return 0;
    }
  };

  const currentLocalMinutes = parseHourTo24(`${hourPartStr}:${minPartStr} ${dayPeriod}`);
  const openMinutes = parseHourTo24(targetHours.open);
  const closeMinutes = parseHourTo24(targetHours.close);

  const isOpenNow = currentLocalMinutes >= openMinutes && currentLocalMinutes < closeMinutes;

  return {
    dayName: dayDisplay,
    hoursString,
    isOpenNow,
    statusBadge: {
      text: isOpenNow ? `Open · Closes ${targetHours.close}` : `Closed · Opens ${targetHours.open}`,
      variant: isOpenNow ? 'open' : 'closed',
    },
    timeZoneShort: tzShort,
    localTimeString,
  };
}

export function formatPhoneNumber(phone: string): string {
  return phone.trim();
}
