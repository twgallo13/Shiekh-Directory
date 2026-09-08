import { INITIAL_LOCATIONS, INITIAL_PEOPLE, INITIAL_HOURS_TEMPLATES, INITIAL_CORPORATE_HOLIDAYS, INITIAL_EMAIL_TEMPLATES, INITIAL_NOTIFICATION_RULES, INITIAL_OUTBOX_LOGS, INITIAL_SOP_RUNBOOKS } from '../src/data/initialData';
import type { DirectorySeed } from '../src/lib/directorySeed';

export const directorySeed: DirectorySeed = {
  locations: INITIAL_LOCATIONS,
  people: INITIAL_PEOPLE,
  hoursTemplates: INITIAL_HOURS_TEMPLATES,
  corporateHolidays: INITIAL_CORPORATE_HOLIDAYS,
  emailTemplates: INITIAL_EMAIL_TEMPLATES,
  notificationRules: INITIAL_NOTIFICATION_RULES,
  outboxLogs: INITIAL_OUTBOX_LOGS,
  sopRunbooks: INITIAL_SOP_RUNBOOKS,
};