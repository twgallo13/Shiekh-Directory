import type { DayHours, LocationRecord, TemporaryNotice } from '../types';
import { structurallyEqual } from './correctionRequest';

export interface TemporaryClosure {
  id: string;
  reason: string;
  startsAt: string;
  expiresAt: string;
  timeZone: string;
}
export type OperatingLocation = Partial<LocationRecord> & { temporaryClosure?: TemporaryClosure | null };
export interface OperatingState {
  state: 'Open' | 'Closed' | 'Unknown';
  reason: string;
  scheduleSource: 'weekly' | 'holiday' | 'special' | 'lifecycle' | 'temporary-closure' | 'unknown';
  hours: DayHours | null;
  dayName: string;
  localDate: string | null;
  timeZone: string | null;
  evaluatedAt: string;
  nextTransitionAt: string | null;
  temporaryClosure: TemporaryClosure | null;
  issues: string[];
}
const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    if (formatters.size > 128) formatters.clear();
    formatters.set(zone, f);
  }
  return f;
}
function parts(epoch: number, zone: string) {
  const p = Object.fromEntries(formatter(zone).formatToParts(epoch).map(p => [p.type, p.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}:${p.second}`, wall: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) };
}
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
const dateShift = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const timeValid = (time: unknown): time is string => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
function validHours(hours: unknown): hours is DayHours {
  if (!hours || typeof hours !== 'object') return false;
  const h = hours as DayHours;
  return typeof h.isClosed === 'boolean' && (h.isClosed || (timeValid(h.open) && timeValid(h.close) && h.open !== h.close));
}

/** First instant after today's local date, including 23/25-hour days and midnight offset transitions. */
export function nextLocalMidnight(now: Date, zone: string): Date {
  let low = now.getTime(), high = low + 36 * 3600000;
  const today = parts(low, zone).date;
  if (parts(high, zone).date === today) throw new Error('Unable to resolve next local day.');
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (parts(mid, zone).date === today) low = mid; else high = mid;
  }
  return new Date(high);
}

// Find all real instants for a wall minute. Gaps are invalid; folds use earliest open/latest close.
const offsetsCache = new Map<string, number[]>();
function wallInstants(date: string, time: string, zone: string): number[] {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const key = `${zone}|${date}`;
  let offsets = offsetsCache.get(key);
  if (!offsets) {
    const noon = Date.parse(`${date}T12:00:00Z`);
    offsets = [...new Set([-36, -24, -12, 0, 12, 24, 36].map(h => { const t = noon + h * 3600000; return parts(t, zone).wall - t; }))];
    if (offsetsCache.size > 512) offsetsCache.clear();
    offsetsCache.set(key, offsets);
  }
  return offsets.map(offset => wall - offset).filter(epoch => { const p = parts(epoch, zone); return p.date === date && p.time === `${time}:00`; }).sort((a, b) => a - b);
}

/** Notices are informational: only explicit display-until dates expire them, not expected-resolution estimates. */
export function effectiveNotice(location: OperatingLocation, now = new Date()): TemporaryNotice | null {
  const notice = location.activeNotice;
  try {
    const today = parts(now.getTime(), String(location.timeZone)).date;
    if (!notice || !notice.shortDescription?.trim() || !dateValid(notice.effectiveDate) || notice.effectiveDate > today) return null;
    if (notice.displayUntilDate && (!dateValid(notice.displayUntilDate) || notice.displayUntilDate < today)) return null;
    return notice;
  } catch { return null; }
}

/** One deterministic calculation for UI and explicit current-state API reads. Never modifies persisted legacy values. */
export function resolveOperatingState(location: OperatingLocation, now = new Date()): OperatingState {
  const result: OperatingState = { state: 'Unknown', reason: 'Needs verification', scheduleSource: 'unknown', hours: null, dayName: '', localDate: null, timeZone: typeof location.timeZone === 'string' ? location.timeZone : null, evaluatedAt: now.toISOString(), nextTransitionAt: null, temporaryClosure: null, issues: [] };
  const unknown = (issue: string) => ({ ...result, state: 'Unknown' as const, reason: 'Needs verification', hours: null, scheduleSource: 'unknown' as const, issues: [issue] });
  const lifecycleReason = location.recordStatus === 'Retired' ? 'Retired Location' : ['Permanently Closed', 'Opening Soon — New Store'].includes(String(location.operationalStatus)) ? String(location.operationalStatus) : null;
  let today: string;
  try { if (!result.timeZone) { if (lifecycleReason) return { ...result, state: 'Closed', reason: lifecycleReason, scheduleSource: 'lifecycle', issues: ['Missing Location time zone.'] }; return unknown('Missing Location time zone.'); } today = parts(now.getTime(), result.timeZone).date; }
  catch { return lifecycleReason ? { ...result, state: 'Closed', reason: lifecycleReason, scheduleSource: 'lifecycle', issues: ['Invalid Location time zone.'] } : unknown('Invalid Location time zone.'); }
  const zone = result.timeZone;
  result.localDate = today;
  result.dayName = dayKeys[new Date(`${today}T12:00:00Z`).getUTCDay()];
  result.nextTransitionAt = nextLocalMidnight(now, zone).toISOString();
  if (lifecycleReason) {
    return { ...result, state: 'Closed', reason: lifecycleReason, scheduleSource: 'lifecycle', nextTransitionAt: null };
  }
  if (location.recordStatus !== 'Active') return unknown('Location is not an active published record.');
  const closure = location.temporaryClosure;
  const transitions = [Date.parse(result.nextTransitionAt)];
  if (closure) {
    const start = Date.parse(closure.startsAt), end = Date.parse(closure.expiresAt);
    if (typeof closure.id !== 'string' || typeof closure.reason !== 'string' || !closure.reason.trim() || !Number.isFinite(start) || !Number.isFinite(end) || start >= end) return unknown('Temporary closure data needs verification.');
    try {
      if (nextLocalMidnight(new Date(start), closure.timeZone).getTime() !== end) return unknown('Temporary closure expiry needs verification.');
    } catch { return unknown('Temporary closure time zone needs verification.'); }
    if (closure.timeZone !== zone) result.issues.push('Location time zone changed; the confirmed closure deadline is retained.');
    if (start > now.getTime()) transitions.push(start);
    if (start <= now.getTime() && end > now.getTime()) return { ...result, state: 'Closed', reason: closure.reason, scheduleSource: 'temporary-closure', nextTransitionAt: new Date(Math.min(end, ...transitions)).toISOString(), temporaryClosure: closure };
  }
  if (location.operationalStatus === 'Temporarily Closed — Emergency') return { ...result, state: 'Closed', reason: 'Legacy closure — expiry needs verification', scheduleSource: 'lifecycle', issues: ['Legacy closure has no confirmed expiry; review it explicitly.'] };
  if (location.operationalStatus === 'Under Remodel / Renovation') return unknown('Remodel status does not establish whether this Location is open.');
  if (!['Open — Normal Operations', 'Temporarily Modified Hours'].includes(String(location.operationalStatus))) return unknown('Operational lifecycle needs verification.');
  if ((location.holidayHours != null && !Array.isArray(location.holidayHours)) || (location.specialHours != null && !Array.isArray(location.specialHours))) return unknown('Dated schedules are malformed.');
  if ((location.holidayHours || []).some(h => !h || typeof h.date !== 'string' || !dateValid(h.date))
    || (location.specialHours || []).some(h => !h || typeof h.startDate !== 'string' || typeof h.endDate !== 'string' || !dateValid(h.startDate) || !dateValid(h.endDate) || h.startDate > h.endDate)) return unknown('Dated schedules have invalid or reversed dates.');

  type Schedule = { hours: DayHours; source: 'weekly' | 'holiday' | 'special'; name: string };
  const schedule = (date: string): Schedule | null => {
    const holiday = (location.holidayHours || []).filter(h => h.date === date).map(h => ({ hours: h.hours, source: 'holiday' as const, name: h.holidayName }));
    const special = (location.specialHours || []).filter(h => dateValid(h.startDate) && dateValid(h.endDate) && h.startDate <= date && h.endDate >= date).map(h => ({ hours: h.hours, source: 'special' as const, name: h.description }));
    const overrides = [...holiday, ...special];
    if (overrides.length) return overrides.every(h => validHours(h.hours) && structurallyEqual(h.hours, overrides[0].hours)) ? overrides[0] : null;
    const key = dayKeys[new Date(`${date}T12:00:00Z`).getUTCDay()];
    const hours = location.standardHours?.[key];
    return validHours(hours) ? { hours, source: 'weekly', name: key } : null;
  };
  const current = schedule(today);
  if (!current) return unknown('Missing, invalid or conflicting hours for this local date.');
  result.hours = current.hours; result.scheduleSource = current.source;
  if (location.operationalStatus === 'Temporarily Modified Hours' && current.source === 'weekly') return unknown('Modified-hours status has no verified dated schedule.');
  // A dated closure blocks previous-day spillover. A weekly closed day does not truncate a valid overnight shift.
  if (current.hours.isClosed && current.source !== 'weekly') return { ...result, state: 'Closed', reason: current.name || 'Closed by dated schedule' };
  const intervals: { start: number; end: number; entry: Schedule; date: string }[] = [];
  for (const offset of [-1, 0, 1]) {
    const date = dateShift(today, offset), entry = schedule(date);
    if (!entry) { if (offset <= 0) return unknown('Today or previous-day hours are incomplete/conflicting.'); continue; }
    if (entry.hours.isClosed) continue;
    const endDate = entry.hours.close < entry.hours.open ? dateShift(date, 1) : date;
    const starts = wallInstants(date, entry.hours.open, zone), ends = wallInstants(endDate, entry.hours.close, zone);
    if (!starts.length || !ends.length) { if (offset <= 0) return unknown('Scheduled wall time does not exist at a daylight-saving transition.'); continue; }
    const interval = { start: starts[0], end: ends.at(-1)!, entry, date };
    intervals.push(interval);
    for (const epoch of [interval.start, interval.end]) if (epoch > now.getTime()) transitions.push(epoch);
  }
  result.nextTransitionAt = new Date(Math.min(...transitions)).toISOString();
  const active = intervals.find(i => i.start <= now.getTime() && now.getTime() < i.end);
  if (active) return { ...result, state: 'Open', reason: active.date === today ? 'Within scheduled hours' : 'Previous-day overnight hours', hours: active.entry.hours, scheduleSource: active.entry.source };
  return { ...result, state: 'Closed', reason: current.hours.isClosed ? 'Scheduled closed today' : 'Outside scheduled hours' };
}
