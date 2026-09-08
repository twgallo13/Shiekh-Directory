import type { LocationRecord, Person, HoursTemplate, CorporateHoliday, EmailTemplate, NotificationRule, OutboxLogEntry, SopRunbook } from '../types';

export interface DirectorySeed {
  locations: LocationRecord[];
  people: Person[];
  hoursTemplates: HoursTemplate[];
  corporateHolidays: CorporateHoliday[];
  emailTemplates: EmailTemplate[];
  notificationRules: NotificationRule[];
  outboxLogs: OutboxLogEntry[];
  sopRunbooks: SopRunbook[];
}