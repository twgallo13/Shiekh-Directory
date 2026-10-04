import React, { useId, useState } from 'react';
import type { ContactPrivacyLevel, LocationRecord, PersonRecord, PersonUpdate } from '../../types';
import { formatUsPhone, normalizeUsPhone } from '../../lib/contactNormalization';
import { resolvePersonEmail, resolvePersonPhone, serializePersonContactEdits } from '../../lib/personContacts';
import { Button } from '../common/Button';
import { FormLabel } from '../common/FormLabel';
import { PersonLocationRelationshipFields } from './PersonLocationRelationshipFields';
import { normalizePersonEmail } from '../../lib/locationInboxEmail';
import { personLifecycle } from '../../lib/personLifecycle';

interface PersonEditorFormProps {
  person?: PersonRecord;
  locations: LocationRecord[];
  submitLabel: string;
  onSubmit: (updates: PersonUpdate & { fullName: string }, expectedVersion?: number) => Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function PersonEditorForm({ person, locations, submitLabel, onSubmit, onCancel, children }: PersonEditorFormProps) {
  const fieldId = useId();
  const currentPhone = resolvePersonPhone(person);
  const currentEmail = resolvePersonEmail(person);
  const [expectedVersion] = useState(person?.version ?? 0);
  const [fullName, setFullName] = useState(person?.fullName || '');
  const [jobTitle, setJobTitle] = useState(person?.jobTitle || person?.role || '');
  const [department, setDepartment] = useState(person?.department || '');
  const [phone, setPhone] = useState(formatUsPhone(currentPhone.value));
  const [phoneExtension, setPhoneExtension] = useState(currentPhone.extension);
  const [email, setEmail] = useState(currentEmail.value);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [district, setDistrict] = useState(person?.district || '');
  const [status, setStatus] = useState(person ? personLifecycle(person) === 'active' ? 'Active' : personLifecycle(person) === 'inactive' ? 'Inactive' : 'Unknown' : 'Active');
  const [statusTouched, setStatusTouched] = useState(false);
  const [phonePrivacy, setPhonePrivacy] = useState<ContactPrivacyLevel>(person?.phonePrivacy || 'Internal');
  const [phonePrivacyTouched, setPhonePrivacyTouched] = useState(false);
  const [primaryLocationId, setPrimaryLocationId] = useState(person?.primaryLocationId);
  const [supportedLocationIds, setSupportedLocationIds] = useState(person?.supportedLocationIds || []);
  const [phoneError, setPhoneError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) return;
    const phoneInput = phone.trim() ? `${phone.trim()}${phoneExtension.trim() ? ` ext. ${phoneExtension.trim()}` : ''}` : '';
    const shouldValidatePhone = !person || phoneTouched;
    const normalizedPhone = shouldValidatePhone && phoneInput ? normalizeUsPhone(phoneInput) : null;
    if (shouldValidatePhone && phoneInput && !normalizedPhone) {
      setPhoneError('Enter a valid US phone number and numeric extension.');
      return;
    }
    if (emailTouched && email.trim() !== currentEmail.value && email.trim() && !normalizePersonEmail(email.trim())) {
      setSaveError('Enter one valid work email address, or leave it blank.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    try {
      await onSubmit({
        fullName: fullName.trim(),
        ...(!person || fullName.trim() !== person.fullName ? { name: fullName.trim() } : {}),
        jobTitle: jobTitle.trim(),
        role: jobTitle.trim(),
        department: department.trim(),
        district: district.trim(),
        ...(!person || statusTouched ? { status, activeStatus: status === 'Active' } : {}),
        ...(!person || phonePrivacyTouched ? { phonePrivacy } : {}),
        primaryLocationId: primaryLocationId || null,
        supportedLocationIds,
        ...serializePersonContactEdits(person, normalizedPhone, email.trim(), phoneTouched, emailTouched),
      }, person ? expectedVersion : undefined);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Person could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3 text-xs">
      <div>
        <FormLabel required htmlFor={`${fieldId}-name`}>Full Name</FormLabel>
        <input id={`${fieldId}-name`} required value={fullName} onChange={event => setFullName(event.target.value)} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FormLabel>Job Title</FormLabel>
          <input value={jobTitle} onChange={event => setJobTitle(event.target.value)} placeholder="e.g. Accountant" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
        <div>
          <FormLabel htmlFor={`${fieldId}-department`}>Department</FormLabel>
          <input id={`${fieldId}-department`} value={department} onChange={event => setDepartment(event.target.value)} placeholder="e.g. Finance" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <FormLabel>Work Phone</FormLabel>
          <input value={phone} onChange={event => { setPhone(event.target.value); setPhoneTouched(true); setPhoneError(''); }} onBlur={event => { const normalized = normalizeUsPhone(event.target.value); if (normalized) setPhone(normalized.display); }} placeholder="(555) 000-0000" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
        <div>
          <FormLabel>Extension</FormLabel>
          <input value={phoneExtension} onChange={event => { setPhoneExtension(event.target.value.replace(/\D/g, '')); setPhoneTouched(true); setPhoneError(''); }} inputMode="numeric" placeholder="123" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
      </div>
      {phoneError && <p role="alert" className="text-xs text-red-700">{phoneError}</p>}

      <div>
        <FormLabel>Work Email</FormLabel>
        <input type="text" inputMode="email" value={email} onChange={event => { setEmail(event.target.value); setEmailTouched(true); }} placeholder="name@example.com" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        {person?.email && Object.hasOwn(person, 'workEmail') && person.email.trim().toLowerCase() !== (person.workEmail || '').trim().toLowerCase() && (
          <p className="mt-1 break-all text-[10px] text-neutral-500">Historical email alias retained for review: {person.email}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FormLabel htmlFor={`${fieldId}-status`}>Active Status</FormLabel>
          <select id={`${fieldId}-status`} value={status} onChange={event => { setStatus(event.target.value); setStatusTouched(true); }} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:outline-none">
            {status === 'Unknown' && <option value="Unknown" disabled>Needs lifecycle review (preserved)</option>}
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div>
          <FormLabel>Contact Privacy</FormLabel>
          <select value={phonePrivacy} onChange={event => { setPhonePrivacy(event.target.value as ContactPrivacyLevel); setPhonePrivacyTouched(true); }} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:outline-none">
            <option value="Public">Public</option>
            <option value="Internal">Internal</option>
            <option value="Restricted">Restricted</option>
          </select>
        </div>
      </div>

      <div>
        <FormLabel>Assigned Territory / District (Compatibility)</FormLabel>
        <input value={district} onChange={event => setDistrict(event.target.value)} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
      </div>

      <PersonLocationRelationshipFields
        locations={locations}
        primaryLocationId={primaryLocationId}
        supportedLocationIds={supportedLocationIds}
        onPrimaryLocationChange={setPrimaryLocationId}
        onSupportedLocationIdsChange={setSupportedLocationIds}
      />

      {children}
      {saveError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{saveError}</p>}

      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3">
        <Button size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" variant="primary" isLoading={isSaving}>{submitLabel}</Button>
      </div>
    </form>
  );
}
