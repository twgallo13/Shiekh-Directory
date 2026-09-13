import type { PersonRecord, PersonUpdate } from '../types';
import { formatUsPhone, type NormalizedPhone } from './contactNormalization';

export interface ResolvedPersonPhone {
  value: string;
  extension: string;
  source: 'work' | 'legacy';
}

export function resolvePersonPhone(person: PersonRecord | undefined): ResolvedPersonPhone {
  if (person?.workPhone) {
    return {
      value: person.workPhone,
      extension: person.workPhoneExtension || '',
      source: 'work',
    };
  }
  return {
    value: person?.phone || '',
    extension: person?.phoneExtension || '',
    source: 'legacy',
  };
}

export function resolvePersonEmail(person: PersonRecord | undefined): { value: string; source: 'work' | 'legacy' } {
  if (person?.workEmail) return { value: person.workEmail, source: 'work' };
  return { value: person?.email || '', source: 'legacy' };
}

export function formatPersonPhone(person: PersonRecord | undefined): string {
  const phone = resolvePersonPhone(person);
  return formatUsPhone(phone.value, phone.extension);
}

export function serializePersonContactEdits(
  person: PersonRecord | undefined,
  phone: NormalizedPhone | null,
  email: string,
  phoneTouched: boolean,
  emailTouched: boolean,
): PersonUpdate {
  if (!person) {
    return {
      phone: phone?.e164 || '',
      workPhone: phone?.e164 || '',
      phoneExtension: phone?.extension || '',
      workPhoneExtension: phone?.extension || '',
      email,
      workEmail: email,
    };
  }

  const updates: PersonUpdate = {};
  if (phoneTouched) {
    const resolved = resolvePersonPhone(person);
    if (resolved.source === 'work') {
      updates.workPhone = phone?.e164 || '';
      updates.workPhoneExtension = phone?.extension || '';
    } else {
      updates.phone = phone?.e164 || '';
      updates.phoneExtension = phone?.extension || '';
    }
  }
  if (emailTouched) {
    const resolved = resolvePersonEmail(person);
    if (resolved.source === 'work') updates.workEmail = email;
    else updates.email = email;
  }
  return updates;
}

export function serializePersonUpdate(
  current: PersonRecord,
  updates: PersonUpdate,
): { person: PersonRecord; data: Record<string, unknown> } {
  const person: PersonRecord = { ...current, ...updates };
  if (Object.hasOwn(updates, 'primaryLocationId') && updates.primaryLocationId === null) delete person.primaryLocationId;
  return {
    person,
    data: {
      ...person,
      ...(Object.hasOwn(updates, 'primaryLocationId') && updates.primaryLocationId === null ? { primaryLocationId: null } : {}),
    },
  };
}
