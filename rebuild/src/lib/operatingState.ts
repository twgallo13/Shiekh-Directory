/**
 * Open/Closed Now Precedence Logic
 * 
 * Priority (highest to lowest):
 * 1. Temporary closure (active closure record)
 * 2. Holiday/special exception for the current date
 * 3. Standard weekly hours
 * 
 * If undeterminable, show "Unknown" - never show "Open" when uncertain.
 * 
 * Handles:
 * - Multiple intervals per day (e.g., 10:00-14:00, 17:00-22:00)
 * - Overnight hours (close time < open time, spans midnight)
 * - Time zones (all calculations in location's local time)
 * - DST transitions
 */

import type {
  Location,
  Closure,
  HoursException,
  DayHours,
  OperatingStatus,
  DayOfWeek,
  DaySchedule,
} from '../types';

const DAYS_OF_WEEK: DayOfWeek[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
];

const DAY_NAMES: Record<DayOfWeek, string> = {
  sunday: 'Sunday',
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
};

interface LocalTime {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  dayOfWeek: DayOfWeek;
  epoch: number;
}

function getLocalTime(date: Date, timeZone: string): LocalTime | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const getValue = (type: string) => parts.find(p => p.type === type)?.value || '';
    
    const localDate = `${getValue('year')}-${getValue('month')}-${getValue('day')}`;
    const localTime = `${getValue('hour')}:${getValue('minute')}`;
    
    const dayIndex = new Date(`${localDate}T12:00:00Z`).getUTCDay();
    const dayOfWeek = DAYS_OF_WEEK[dayIndex];
    
    return {
      date: localDate,
      time: localTime,
      dayOfWeek,
      epoch: date.getTime(),
    };
  } catch {
    return null;
  }
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWithinInterval(
  currentTime: string,
  openTime: string,
  closeTime: string
): boolean {
  const current = timeToMinutes(currentTime);
  const open = timeToMinutes(openTime);
  const close = timeToMinutes(closeTime);
  
  if (close > open) {
    return current >= open && current < close;
  } else {
    return current >= open || current < close;
  }
}

function isWithinOvernightFromYesterday(
  currentTime: string,
  yesterdayOpenTime: string,
  yesterdayCloseTime: string
): boolean {
  const close = timeToMinutes(yesterdayCloseTime);
  const open = timeToMinutes(yesterdayOpenTime);
  
  if (close < open) {
    const current = timeToMinutes(currentTime);
    return current < close;
  }
  return false;
}

function findActiveException(
  exceptions: HoursException[],
  localDate: string
): HoursException | null {
  return exceptions.find(ex => 
    ex.startDate <= localDate && ex.endDate >= localDate
  ) || null;
}

function findActiveClosure(
  closures: Closure[],
  now: Date,
  timeZone: string
): Closure | null {
  const nowMs = now.getTime();
  
  for (const closure of closures) {
    if (closure.status !== 'active') continue;
    
    const startsAt = new Date(closure.startsAt).getTime();
    if (startsAt > nowMs) continue;
    
    if (closure.endsAt) {
      const endsAt = new Date(closure.endsAt).getTime();
      if (endsAt <= nowMs) continue;
    } else {
      const localTime = getLocalTime(new Date(closure.startsAt), timeZone);
      if (!localTime) continue;
      
      const nextMidnight = new Date(`${localTime.date}T00:00:00`);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      
      try {
        new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        
        let checkTime = new Date(closure.startsAt).getTime() + 24 * 60 * 60 * 1000;
        const checkLocal = getLocalTime(new Date(checkTime), timeZone);
        if (!checkLocal) continue;
        
        if (checkLocal.time < '00:05' && nowMs >= checkTime) continue;
      } catch {
        continue;
      }
    }
    
    return closure;
  }
  
  return null;
}

function getYesterdayDate(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getYesterdayDayOfWeek(dayOfWeek: DayOfWeek): DayOfWeek {
  const index = DAYS_OF_WEEK.indexOf(dayOfWeek);
  const yesterdayIndex = (index + 6) % 7;
  return DAYS_OF_WEEK[yesterdayIndex];
}

export function resolveOperatingStatus(
  location: Location,
  closures: Closure[],
  exceptions: HoursException[],
  now: Date = new Date()
): OperatingStatus {
  const timeZone = location.timeZone;
  const localTime = getLocalTime(now, timeZone);
  
  if (!localTime) {
    return {
      state: 'Unknown',
      reason: 'Invalid time zone',
      source: 'unknown',
      hours: null,
      localDate: '',
      localTime: '',
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: null,
    };
  }
  
  const { date: localDate, time: currentTime, dayOfWeek } = localTime;
  
  if (location.lifecycle !== 'active') {
    return {
      state: 'Closed',
      reason: location.lifecycle === 'retired' ? 'Location retired' : 'Location not active',
      source: 'unknown',
      hours: null,
      localDate,
      localTime: currentTime,
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: null,
    };
  }
  
  const activeClosure = findActiveClosure(closures, now, timeZone);
  if (activeClosure) {
    return {
      state: 'Closed',
      reason: activeClosure.reason || 'Temporary closure',
      source: 'closure',
      hours: { closed: true, intervals: [] },
      localDate,
      localTime: currentTime,
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: activeClosure.endsAt || null,
    };
  }
  
  const exception = findActiveException(exceptions, localDate);
  if (exception) {
    if (exception.closed) {
      return {
        state: 'Closed',
        reason: exception.label || 'Closed for holiday/special hours',
        source: 'exception',
        hours: { closed: true, intervals: [] },
        localDate,
        localTime: currentTime,
        timeZone,
        evaluatedAt: now.toISOString(),
        nextTransitionAt: null,
      };
    }
    
    const exceptionHours: DayHours = {
      closed: false,
      intervals: exception.intervals,
    };
    
    for (const interval of exception.intervals) {
      if (isWithinInterval(currentTime, interval.open, interval.close)) {
        return {
          state: 'Open',
          reason: exception.label || 'Holiday/special hours',
          source: 'exception',
          hours: exceptionHours,
          localDate,
          localTime: currentTime,
          timeZone,
          evaluatedAt: now.toISOString(),
          nextTransitionAt: null,
        };
      }
    }
    
    return {
      state: 'Closed',
      reason: `Outside ${exception.label || 'special'} hours`,
      source: 'exception',
      hours: exceptionHours,
      localDate,
      localTime: currentTime,
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: null,
    };
  }

  if (!location.standardHours) {
    return {
      state: 'Unknown',
      reason: 'No hours configured',
      source: 'unknown',
      hours: null,
      localDate,
      localTime: currentTime,
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: null,
    };
  }
  
  const todayHours = location.standardHours[dayOfWeek];
  if (!todayHours) {
    return {
      state: 'Unknown',
      reason: 'No hours configured',
      source: 'unknown',
      hours: null,
      localDate,
      localTime: currentTime,
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: null,
    };
  }
  
  const yesterdayDow = getYesterdayDayOfWeek(dayOfWeek);
  const yesterdayDate = getYesterdayDate(localDate);
  const yesterdayException = findActiveException(exceptions, yesterdayDate);
  
  let yesterdayHours: DayHours | null = null;
  if (yesterdayException && !yesterdayException.closed) {
    yesterdayHours = { closed: false, intervals: yesterdayException.intervals };
  } else if (!yesterdayException && location.standardHours) {
    yesterdayHours = location.standardHours[yesterdayDow] || null;
  }
  
  if (yesterdayHours && !yesterdayHours.closed) {
    for (const interval of yesterdayHours.intervals) {
      if (isWithinOvernightFromYesterday(currentTime, interval.open, interval.close)) {
        return {
          state: 'Open',
          reason: 'Overnight hours from previous day',
          source: 'standard',
          hours: yesterdayHours,
          localDate,
          localTime: currentTime,
          timeZone,
          evaluatedAt: now.toISOString(),
          nextTransitionAt: null,
        };
      }
    }
  }
  
  if (todayHours.closed) {
    return {
      state: 'Closed',
      reason: 'Closed today',
      source: 'standard',
      hours: todayHours,
      localDate,
      localTime: currentTime,
      timeZone,
      evaluatedAt: now.toISOString(),
      nextTransitionAt: null,
    };
  }
  
  for (const interval of todayHours.intervals) {
    if (isWithinInterval(currentTime, interval.open, interval.close)) {
      return {
        state: 'Open',
        reason: 'Within scheduled hours',
        source: 'standard',
        hours: todayHours,
        localDate,
        localTime: currentTime,
        timeZone,
        evaluatedAt: now.toISOString(),
        nextTransitionAt: null,
      };
    }
  }
  
  return {
    state: 'Closed',
    reason: 'Outside scheduled hours',
    source: 'standard',
    hours: todayHours,
    localDate,
    localTime: currentTime,
    timeZone,
    evaluatedAt: now.toISOString(),
    nextTransitionAt: null,
  };
}

export function getScheduleForDate(
  location: Location,
  exceptions: HoursException[],
  dateStr: string
): DaySchedule {
  const date = new Date(`${dateStr}T12:00:00Z`);
  const dayIndex = date.getUTCDay();
  const dayOfWeek = DAYS_OF_WEEK[dayIndex];
  
  const exception = findActiveException(exceptions, dateStr);
  if (exception) {
    return {
      date: dateStr,
      dayName: DAY_NAMES[dayOfWeek],
      hours: exception.closed 
        ? { closed: true, intervals: [] }
        : { closed: false, intervals: exception.intervals },
      source: 'exception',
      label: exception.label,
    };
  }
  
  const standardHours = location.standardHours?.[dayOfWeek];
  return {
    date: dateStr,
    dayName: DAY_NAMES[dayOfWeek],
    hours: standardHours || { closed: true, intervals: [] },
    source: location.standardHours ? 'standard' : 'unknown',
  };
}

export function getWeekSchedule(
  location: Location,
  exceptions: HoursException[],
  startDate: Date,
  timeZone: string
): DaySchedule[] {
  const schedules: DaySchedule[] = [];
  const localTime = getLocalTime(startDate, timeZone);
  if (!localTime) return schedules;
  
  let currentDate = new Date(`${localTime.date}T12:00:00Z`);
  
  for (let i = 0; i < 8; i++) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    schedules.push(getScheduleForDate(location, exceptions, dateStr));
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  
  return schedules;
}

export function formatHoursDisplay(hours: DayHours | null): string {
  if (!hours) return 'Hours not available';
  if (hours.closed) return 'Closed';
  if (hours.intervals.length === 0) return 'Closed';
  
  return hours.intervals
    .map(i => `${formatTime(i.open)} - ${formatTime(i.close)}`)
    .join(', ');
}

export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  const displayMinutes = minutes === 0 ? '' : `:${minutes.toString().padStart(2, '0')}`;
  return `${displayHours}${displayMinutes} ${period}`;
}
