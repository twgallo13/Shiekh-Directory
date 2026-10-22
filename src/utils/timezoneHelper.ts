import type { LocationRecord } from '../types';
import { resolveOperatingState } from '../lib/operatingState';

/** Compatibility view of the shared resolver; no viewer-local dates or fabricated default hours. */
export function getTodayHoursForLocation(location: LocationRecord, now = new Date()) {
  const state = resolveOperatingState(location, now);
  return {
    ...state,
    dayName: state.dayName ? state.dayName[0].toUpperCase() + state.dayName.slice(1) : 'Unknown local day',
    hoursString: state.hours ? state.hours.isClosed ? 'Closed Today' : `${formatTime(state.hours.open)} – ${formatTime(state.hours.close)}` : state.scheduleSource === 'temporary-closure' ? 'Closed temporarily' : state.state === 'Closed' ? state.reason : 'Hours need verification',
    isOpenNow: state.state === 'Open',
    isHolidayOverride: state.scheduleSource === 'holiday' || state.scheduleSource === 'special',
    holidayName: state.scheduleSource === 'holiday' ? 'Holiday schedule' : undefined,
  };
}

export function formatTime(time: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return '';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour >= 12 ? 'PM' : 'AM'}`;
}
