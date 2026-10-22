import { normalizeUsPhone } from './contactNormalization';
import { normalizeLocationInboxEmail } from './locationInboxEmail';
import { LOCATION_OPERATIONAL_STATUSES } from './locationImportSchema';
import { structurallyEqual } from './correctionRequest';

const fields: Record<string, readonly string[]> = {
  'Phone Number Correction': ['phone', 'phoneExtension'],
  'Store Manager Change': ['storeManagerId', 'storeManagerName', 'storeManagerPhone'],
  'Standard Hours Adjustment': ['standardHours'],
  'Operational Status Change': ['operationalStatus', 'activeNotice'],
  'Other Store Info Update': ['locationInboxEmail', 'name'],
};
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const time = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

/** Shared proposal boundary; rejection intentionally does not require historic proposals to be valid. */
export function validateRequestProposal(request: Record<string, unknown>, target: Record<string, unknown>): { changes: Record<string, unknown>; error?: string } {
  const personInfo = request.targetType === 'Person' && request.changeType === 'Other Store Info Update';
  const category = String(request.changeType);
  const allowed = personInfo ? ['fullName', 'primaryLocationId', 'supportedLocationIds'] : Object.hasOwn(fields, category) ? fields[category] : undefined;
  const changes = record(request.requestedChanges) ? structuredClone(request.requestedChanges) : {};
  const fail = (error: string) => ({ changes, error });
  if ((!personInfo && request.targetType !== 'Location') || !allowed) return fail('This correction category or target is unsupported. Reject the old request and submit a supported replacement.');
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(k => !allowed.includes(k))) return fail('The correction contains empty or unsupported fields for its category.');
  if (request.reason != null && (typeof request.reason !== 'string' || request.reason.length > 2000)) return fail('Request notes must be plain text of at most 2,000 characters.');
  if (request.changeType === 'Phone Number Correction') {
    const phone = normalizeUsPhone(changes.phone);
    if (!phone) return fail('Enter a valid US phone number.');
    changes.phone = phone.e164;
    const extension = phone.extension ?? changes.phoneExtension ?? null;
    if (extension !== null && (typeof extension !== 'string' || !/^\d{1,10}$/.test(extension))) return fail('Phone extension must contain 1 to 10 digits.');
    changes.phoneExtension = extension;
  }
  if (request.changeType === 'Store Manager Change' && (keys.length !== 3 || allowed.some(k => typeof changes[k] !== 'string') || !changes.storeManagerId)) return fail('Choose an active Store Manager with canonical identity and contact details.');
  if (request.changeType === 'Standard Hours Adjustment') {
    const schedule = changes.standardHours;
    if (!record(schedule) || Object.keys(schedule).length !== 7 || days.some(day => {
      const hours = schedule[day];
      return !record(hours) || Object.keys(hours).some(k => !['open', 'close', 'isClosed'].includes(k)) || typeof hours.isClosed !== 'boolean'
        || typeof hours.open !== 'string' || typeof hours.close !== 'string' || (!hours.isClosed && (!time(hours.open) || !time(hours.close) || hours.open === hours.close));
    })) return fail('Provide all seven days with valid opening/closing times or an explicit closed day. Equal opening/closing times are ambiguous.');
  }
  if (request.changeType === 'Operational Status Change') {
    if (!LOCATION_OPERATIONAL_STATUSES.includes(changes.operationalStatus as never)) return fail('Choose a supported operational status.');
    if (Object.hasOwn(changes, 'activeNotice')) {
      const notice = changes.activeNotice;
      if (!record(notice) || Object.keys(notice).some(k => !['shortDescription', 'effectiveDate', 'expectedResolutionDate', 'displayUntilDate'].includes(k))
        || typeof notice.shortDescription !== 'string' || !notice.shortDescription.trim() || notice.shortDescription.length > 500
        || !date(notice.effectiveDate) || ['expectedResolutionDate', 'displayUntilDate'].some(k => notice[k] != null && (!date(notice[k]) || String(notice[k]) < String(notice.effectiveDate)))) return fail('Provide a plain-text notice of at most 500 characters and valid ordered dates.');
    }
  }
  if (personInfo) {
    if (Object.hasOwn(changes, 'primaryLocationId') && changes.primaryLocationId !== null && (typeof changes.primaryLocationId !== 'string' || !changes.primaryLocationId.trim())) return fail('Works at must be a Location ID or explicit null.');
    if (Object.hasOwn(changes, 'supportedLocationIds') && (!Array.isArray(changes.supportedLocationIds) || changes.supportedLocationIds.some(x => typeof x !== 'string' || !x.trim()) || new Set(changes.supportedLocationIds).size !== changes.supportedLocationIds.length)) return fail('Supports must contain distinct Location IDs.');
  }
  for (const key of ['name', 'fullName']) if (Object.hasOwn(changes, key) && (typeof changes[key] !== 'string' || !String(changes[key]).trim() || String(changes[key]).length > 200)) return fail('Names must contain 1 to 200 characters.');
  if (request.changeType === 'Other Store Info Update' && Object.hasOwn(changes, 'locationInboxEmail')) {
    if (changes.locationInboxEmail !== null) {
      const inbox = normalizeLocationInboxEmail(changes.locationInboxEmail);
      if (!inbox) return fail('Enter one valid shared location inbox email, or explicitly clear it.');
      changes.locationInboxEmail = inbox.value;
    }
  }
  const baseline = record(request.currentSnapshot) ? request.currentSnapshot : {};
  const required = [...Object.keys(changes), ...(request.changeType === 'Standard Hours Adjustment' ? ['hoursMode', 'hoursTemplateId'] : [])];
  if (required.some(k => !Object.hasOwn(baseline, k))) return fail('The submission baseline is incomplete. Reload and submit a replacement request.');
  if (required.some(k => !structurallyEqual(baseline[k] ?? null, target[k] ?? null))) return fail('The target changed since the submission baseline. Reload and submit a replacement request.');
  const current = { ...target };
  if (request.changeType === 'Phone Number Correction') {
    const phone = normalizeUsPhone(target.phone);
    if (phone) { current.phone = phone.e164; current.phoneExtension = phone.extension ?? target.phoneExtension ?? null; }
  }
  if (Object.hasOwn(changes, 'locationInboxEmail')) current.locationInboxEmail = normalizeLocationInboxEmail(target.locationInboxEmail)?.value ?? target.locationInboxEmail ?? null;
  if (Object.entries(changes).every(([k, v]) => structurallyEqual(v ?? null, current[k] ?? null))) return fail('No change to apply: the normalized values already match the current record.');
  return { changes };
}
