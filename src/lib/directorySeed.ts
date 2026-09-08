import type { LocationRecord, Person, UserProfile, UpdateRequest, HoursTemplate, CorporateHoliday, AuditLogEntry, EmailTemplate, NotificationRule, OutboxLogEntry, SopRunbook } from '../types';

export interface DirectorySeed {
  locations: LocationRecord[];
  people: Person[];
  users: UserProfile[];
  requests: UpdateRequest[];
  auditLogs: AuditLogEntry[];
  hoursTemplates: HoursTemplate[];
  corporateHolidays: CorporateHoliday[];
  emailTemplates: EmailTemplate[];
  notificationRules: NotificationRule[];
  outboxLogs: OutboxLogEntry[];
  sopRunbooks: SopRunbook[];
}