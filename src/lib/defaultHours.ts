import type { WeeklySchedule } from '../types';

export const DEFAULT_WEEKLY_HOURS: WeeklySchedule = {
  monday: { open: '10:00', close: '20:00', isClosed: false },
  tuesday: { open: '10:00', close: '20:00', isClosed: false },
  wednesday: { open: '10:00', close: '20:00', isClosed: false },
  thursday: { open: '10:00', close: '20:00', isClosed: false },
  friday: { open: '10:00', close: '21:00', isClosed: false },
  saturday: { open: '10:00', close: '21:00', isClosed: false },
  sunday: { open: '11:00', close: '18:00', isClosed: false },
};