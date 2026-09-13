import React, { useState } from 'react';
import type { ContactPrivacyLevel, LocationRecord, PersonRecord, PersonUpdate } from '../../types';
import { formatUsPhone, normalizeUsPhone } from '../../lib/contactNormalization';
import { Button } from '../common/Button';
import { FormLabel } from '../common/FormLabel';
import { PersonLocationRelationshipFields } from './PersonLocationRelationshipFields';

interface PersonEditorFormProps {
  person?: PersonRecord;
  locations: LocationRecord[];
  submitLabel: string;
  onSubmit: (updates: PersonUpdate & { fullName: string }) => Promise<void>;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function PersonEditorForm({ person, locations, submitLabel, onSubmit, onCancel, children }: PersonEditorFormProps) {
  const currentPhone = person?.workPhone || person?.phone || '';
  const [fullName, setFullName] = useState(person?.fullName || '');
  const [jobTitle, setJobTitle] = useState(person?.jobTitle || person?.role || '');
  const [department, setDepartment] = useState(person?.department || '');
  const [phone, setPhone] = useState(formatUsPhone(currentPhone));
  const [phoneExtension, setPhoneExtension] = useState(person?.workPhoneExtension || person?.phoneExtension || '');
  const [email, setEmail] = useState(person?.workEmail || person?.email || '');
  const [district, setDistrict] = useState(person?.district || '');
  const [status, setStatus] = useState(person?.status === 'Inactive' || person?.activeStatus === false ? 'Inactive' : 'Active');
  const [phonePrivacy, setPhonePrivacy] = useState<ContactPrivacyLevel>(person?.phonePrivacy || 'Internal');
  const [primaryLocationId, setPrimaryLocationId] = useState(person?.primaryLocationId);
  const [supportedLocationIds, setSupportedLocationIds] = useState(person?.supportedLocationIds || []);
  const [phoneError, setPhoneError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim()) return;
    const phoneInput = phone.trim() ? `${phone.trim()}${phoneExtension.trim() ? ` ext. ${phoneExtension.trim()}` : ''}` : '';
    const normalizedPhone = phoneInput ? normalizeUsPhone(phoneInput) : null;
    if (phoneInput && !normalizedPhone) {
      setPhoneError('Enter a valid US phone number and numeric extension.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    try {
      await onSubmit({
        fullName: fullName.trim(),
        name: fullName.trim(),
        jobTitle: jobTitle.trim(),
        role: jobTitle.trim(),
        department: department.trim(),
        phone: normalizedPhone?.e164 || '',
        workPhone: normalizedPhone?.e164 || '',
        phoneExtension: normalizedPhone?.extension || '',
        workPhoneExtension: normalizedPhone?.extension || '',
        email: email.trim(),
        workEmail: email.trim(),
        district: district.trim(),
        status,
        activeStatus: status === 'Active',
        phonePrivacy,
        primaryLocationId: primaryLocationId || null,
        supportedLocationIds,
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Person could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3 text-xs">
      <div>
        <FormLabel required>Full Name</FormLabel>
        <input required value={fullName} onChange={event => setFullName(event.target.value)} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FormLabel>Job Title</FormLabel>
          <input value={jobTitle} onChange={event => setJobTitle(event.target.value)} placeholder="e.g. Accountant" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
        <div>
          <FormLabel>Department</FormLabel>
          <input value={department} onChange={event => setDepartment(event.target.value)} placeholder="e.g. Finance" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <div>
          <FormLabel>Work Phone</FormLabel>
          <input value={phone} onChange={event => { setPhone(event.target.value); setPhoneError(''); }} onBlur={event => { const normalized = normalizeUsPhone(event.target.value); if (normalized) setPhone(normalized.display); }} placeholder="(555) 000-0000" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
        <div>
          <FormLabel>Extension</FormLabel>
          <input value={phoneExtension} onChange={event => { setPhoneExtension(event.target.value.replace(/\D/g, '')); setPhoneError(''); }} inputMode="numeric" placeholder="123" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 font-mono text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
        </div>
      </div>
      {phoneError && <p role="alert" className="text-xs text-red-700">{phoneError}</p>}

      <div>
        <FormLabel>Work Email</FormLabel>
        <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@shiekhshoes.com" className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:bg-white focus:outline-none" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FormLabel>Active Status</FormLabel>
          <select value={status} onChange={event => setStatus(event.target.value as 'Active' | 'Inactive')} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:outline-none">
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <div>
          <FormLabel>Contact Privacy</FormLabel>
          <select value={phonePrivacy} onChange={event => setPhonePrivacy(event.target.value as ContactPrivacyLevel)} className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-xs text-neutral-900 focus:border-red-500 focus:outline-none">
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
