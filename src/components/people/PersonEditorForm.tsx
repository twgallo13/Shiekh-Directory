import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ContactPrivacyLevel, LocationRecord, PersonRecord, PersonUpdate } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { formatUsPhone, normalizeUsPhone } from '../../lib/contactNormalization';
import { legacyIndividualEmailCandidate, personEmailEditChangesValue, resolvePersonEmail, resolvePersonPhone, serializePersonContactEdits } from '../../lib/personContacts';
import { PERSON_POSITIONS, personPositions, type PersonPositionId } from '../../lib/personPositions';
import { personProfileImpact } from '../../lib/personProfileImpact';
import { DirectoryCommitError } from '../../lib/directoryClient';
import { normalizePersonEmail } from '../../lib/locationInboxEmail';
import { personLifecycle } from '../../lib/personLifecycle';
import { Button } from '../common/Button';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { FormLabel } from '../common/FormLabel';
import { PersonLocationRelationshipFields } from './PersonLocationRelationshipFields';
import { PersonInboxResponsibilities } from './PersonInboxResponsibilities';
import { sharedPersonEmailKind } from '../../lib/personInboxResponsibilities';
import { useAuth } from '../../context/AuthContext';
import { PositionRemovalReview } from './PositionRemovalReview';
import { OrganizationResponsibilities } from './OrganizationResponsibilities';
import { useOrganizationPersonReview } from './useOrganizationPersonReview';
import { organizationPositionConflicts } from '../../lib/organizationPersonReview';

interface PersonEditorFormProps {
  person?: PersonRecord; locations: LocationRecord[]; submitLabel: string;
  onSubmit: (updates: PersonUpdate & { fullName: string }, expectedVersion?: number) => Promise<void>;
  onCancel: () => void; registerClose?: (close: (() => void) | null) => void; footerTarget?: HTMLElement | null; children?: React.ReactNode;
}
const inputClass = 'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500';
const sectionClass = 'space-y-3 border-b border-neutral-200 pb-5';
const text = (value: unknown) => typeof value === 'string' ? value : '';
function TextField({ id, label, value, onChange, required = false }: { id: string; label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <div><FormLabel required={required} htmlFor={id}>{label}</FormLabel><input id={id} required={required} value={value} onChange={event => onChange(event.target.value)} className={inputClass} /></div>;
}

/** Changed-field-only editing with explicit position mapping and dependency review. */
export function PersonEditorForm({ person, locations, submitLabel, onSubmit, onCancel, registerClose, footerTarget, children }: PersonEditorFormProps) {
  const id = useId();
  const { districts, regions, users } = useDirectory();
  const { account } = useAuth();
  const canCoordinate = account?.role === 'System Administrator' && account.accessScope === 'Company-wide';
  const [removalOpen, setRemovalOpen] = useState(false), [recoveryOnly, setRecoveryOnly] = useState(false);
  const removalClose = useRef<(() => void) | null>(null);
  const [organizationOpen, setOrganizationOpen] = useState(false);
  const organizationClose = useRef<(() => void) | null>(null);
  const organization = useOrganizationPersonReview(person?.id, Boolean(person));
  const phone = resolvePersonPhone(person), email = resolvePersonEmail(person), positionState = personPositions(person || {});
  const [expectedVersion] = useState(person?.version ?? 0);
  const [draft, setDraft] = useState(() => ({
    fullName: text(person?.fullName), jobTitle: text(person?.jobTitle || person?.role), department: text(person?.department),
    phone: formatUsPhone(phone.value), extension: phone.extension, email: email.value,
    status: person ? personLifecycle(person) === 'active' ? 'Active' : personLifecycle(person) === 'inactive' ? 'Inactive' : 'Unknown' : 'Active',
    privacy: person ? person.phonePrivacy || 'Unspecified' : 'Internal', positionIds: [...positionState.ids] as PersonPositionId[],
    primaryLocationId: typeof person?.primaryLocationId === 'string' ? person.primaryLocationId : undefined,
    supportedLocationIds: Array.isArray(person?.supportedLocationIds) ? person.supportedLocationIds.filter(item => typeof item === 'string') : [],
  }));
  const [touched, setTouched] = useState(new Set<string>());
  const [emailMappingReview, setEmailMappingReview] = useState(false);
  const [mappedLegacyEmail, setMappedLegacyEmail] = useState<string | null>(null);
  const legacyEmailCandidate = legacyIndividualEmailCandidate(person, locations);
  const [reviewed, setReviewed] = useState(false), [discard, setDiscard] = useState(false);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: 'nearest' }); } }, [error]);
  const impact = personProfileImpact(person, locations, districts, regions, users);
  const impactKey = JSON.stringify([impact.responsibilities, impact.issues, impact.accounts.map(account => [account.id, account.role, account.status])]);
  useEffect(() => { setReviewed(false); }, [impactKey]);
  const positionChanged = touched.has('positionIds');
  const conflicts = positionChanged ? impact.responsibilities.filter(row => !draft.positionIds.includes(row.requiredPosition)) : [];
  const edit = <K extends keyof typeof draft>(field: K, value: typeof draft[K]) => {
    if (field === 'email') setMappedLegacyEmail(null);
    setDraft(previous => ({ ...previous, [field]: value })); setTouched(previous => new Set(previous).add(field)); setReviewed(false); setError('');
  };
  const cancel = () => { if (organizationOpen) { organizationClose.current?.(); return; } if (removalOpen) { removalClose.current?.(); return; } if (busy.current) return; if (emailMappingReview) { setEmailMappingReview(false); return; } if (touched.size || uncertain) setDiscard(true); else onCancel(); };
  useEffect(() => { registerClose?.(cancel); return () => registerClose?.(null); });

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || uncertain || emailMappingReview) return;
    const changingAuthority = positionChanged || touched.has('status') || touched.has('fullName');
    if (changingAuthority && organization.review && ['loading', 'unavailable'].includes(organization.review.phase)) { setError('Check management responsibilities before changing this person’s name, positions or status. Your draft is kept.'); return; }
    if (positionChanged && organizationPositionConflicts(organization.review?.units || [], draft.positionIds).length) { setError('Reassign or end the affected District/Region responsibilities first. Your selected positions are kept in this draft.'); return; }
    if (organization.review?.units.length && (touched.has('status') && draft.status !== 'Active' || touched.has('fullName') && draft.fullName.trim() !== person?.fullName)) { setError('Review management responsibilities before inactivation. Assigned manager name changes also require a coordinated update; no changes were sent. Your draft is kept.'); return; }
    if (!draft.fullName.trim()) { setError('Enter a full name.'); return; }
    if (!person && !draft.positionIds.length) { setError('Select a position, including Other / corporate if appropriate.'); return; }
    if (conflicts.length) { setError('Retain the listed positions explicitly, or reassign/vacate their responsibilities before changing positions.'); return; }
    if (positionChanged && impact.responsibilities.length && draft.status !== 'Active') { setError('Resolve Active Status before confirming controlled positions with management responsibilities.'); return; }
    if (positionChanged && !reviewed) { setError('Review and acknowledge the position change before saving.'); return; }
    if (draft.status === 'Inactive' && touched.has('status') && (impact.responsibilities.length || impact.accounts.length)) {
      setError('Reassign/vacate management responsibilities and review linked accounts before inactivation. No changes were sent.'); return;
    }
    const phoneInput = draft.phone.trim() ? draft.phone.trim() + (draft.extension.trim() ? ' ext. ' + draft.extension.trim() : '') : '';
    const phoneTouched = touched.has('phone') || touched.has('extension');
    const normalizedPhone = phoneInput && (!person || phoneTouched) ? normalizeUsPhone(phoneInput) : null;
    if ((!person || phoneTouched) && ((phoneInput && !normalizedPhone) || (!draft.phone.trim() && draft.extension.trim()))) { setError('Enter a valid US phone number and numeric extension, or clear both fields.'); return; }
    if (mappedLegacyEmail && mappedLegacyEmail !== legacyEmailCandidate) { setError('The saved legacy contact or known shared inboxes changed. Reload the saved record and review the email mapping again. No changes were sent.'); return; }
    const emailChanged = Boolean(mappedLegacyEmail) || !person || (touched.has('email') && personEmailEditChangesValue(person, draft.email));
    if (emailChanged && draft.email.trim() && !normalizePersonEmail(draft.email.trim())) { setError('Enter one valid work email address, or leave it blank.'); return; }
    if (emailChanged && sharedPersonEmailKind(draft.email, locations)) { setError('This is a shared store inbox, not an individual work email. Leave this optional field blank or use an individually assigned work address. Store inbox responsibilities are shown separately.'); return; }
    const updates: PersonUpdate & { fullName: string } = { fullName: touched.has('fullName') || !person ? draft.fullName.trim() : person.fullName };
    if (!person || touched.has('fullName')) updates.name = draft.fullName.trim();
    for (const field of ['jobTitle', 'department'] as const) if (!person || touched.has(field)) updates[field] = draft[field].trim();
    if (!person || positionChanged) updates.positionIds = PERSON_POSITIONS.filter(p => draft.positionIds.includes(p.id)).map(p => p.id);
    if (!person || touched.has('status')) { updates.status = draft.status; updates.activeStatus = draft.status === 'Active'; }
    if (!person || touched.has('privacy')) updates.phonePrivacy = draft.privacy as ContactPrivacyLevel;
    if (!person || touched.has('primaryLocationId')) updates.primaryLocationId = draft.primaryLocationId || null;
    if (!person || touched.has('supportedLocationIds')) updates.supportedLocationIds = draft.supportedLocationIds;
    Object.assign(updates, serializePersonContactEdits(person, normalizedPhone, draft.email.trim(), phoneTouched, emailChanged));
    busy.current = true; setSaving(true); setError('');
    try { await onSubmit(updates, person ? expectedVersion : undefined); }
    catch (failure) {
      const known = failure instanceof DirectoryCommitError && ['invalid_metadata', 'write_not_allowed', 'directory_conflict'].includes(failure.code || '');
      setUncertain(!known);
      setError((failure instanceof Error ? failure.message : 'Save could not be confirmed.') + (known ? ' Your draft is retained.' : ' Outcome unknown: do not repeat this change or create another Person blindly. Check the saved record before starting a replacement. Refreshing discards this draft.'));
    } finally { busy.current = false; setSaving(false); }
  };

  const openRemoval = (recover = false) => {
    if (!person || !canCoordinate || busy.current || uncertain) return;
    if ([...touched].some(field => field !== 'positionIds') || recover && touched.size) { setError('Save or discard your other profile edits before opening staffing recovery or replacement review. Your draft is kept.'); return; }
    if (!recover && (draft.status !== 'Active' || personLifecycle(person) !== 'active')) { setError('Resolve Active Status before a position handover. This review does not inactivate people or change account access.'); return; }
    setRecoveryOnly(recover); setRemovalOpen(true);
  };
  if (organizationOpen && person) return <OrganizationResponsibilities personId={person.id} footerTarget={footerTarget} registerClose={close => { organizationClose.current = close; }} onClose={() => { setOrganizationOpen(false); setReviewed(false); organization.refresh(); }} />;
  if (removalOpen && person) return <PositionRemovalReview footerTarget={footerTarget} personId={person.id} expectedVersion={expectedVersion} originalPositions={[...positionState.ids]} desiredPositions={draft.positionIds} recoveryOnly={recoveryOnly} registerClose={close => { removalClose.current = close; }} onClose={() => setRemovalOpen(false)} onSaved={onCancel} />;
  const actions = <div className="flex flex-wrap justify-end gap-2"><Button size="sm" disabled={saving} onClick={cancel}>Cancel</Button>{conflicts.length > 0 && canCoordinate ? <Button size="sm" variant="primary" disabled={saving || uncertain} onClick={() => openRemoval()}>Review replacement or vacancy</Button> : <Button form={id + '-form'} type="submit" size="sm" variant="primary" isLoading={saving} disabled={uncertain}>{submitLabel}</Button>}</div>;
  return <>
    <form id={id + '-form'} onSubmit={save} className="space-y-4 text-sm">
      <fieldset disabled={saving || uncertain} className="min-w-0 space-y-4 disabled:opacity-70">
        <section className={sectionClass} aria-label="Profile and positions">
          <h3 className="font-semibold text-neutral-900">Profile & positions</h3>
          <TextField id={id + '-name'} label="Full Name" required value={draft.fullName} onChange={value => edit('fullName', value)} />
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-neutral-700">Linked positions</legend>
            {organization.review && <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs">
              {organization.review.phase === 'loading' ? <p role="status">Checking management responsibilities…</p> : organization.review.phase === 'unavailable' ? <><p role="alert">Management responsibilities could not be checked. Your draft is kept.</p><Button size="sm" onClick={organization.refresh}>Retry responsibility check</Button></> : organization.review.phase === 'ready' ? <>
                <p className="font-semibold">District & Region responsibilities</p>
                {organization.review.units.length ? organization.review.units.map(unit => <p key={JSON.stringify([unit.unitType, unit.id])}>{unit.name} · {unit.unitType === 'district' ? 'District' : 'Region'} · {unit.members.find(m => m.personId === person?.id)?.isPrimary ? 'Primary' : 'Additional'}</p>) : <p>No current District or Region assignments.</p>}
                <p>Positions determine eligibility. Ending a responsibility is a separate reviewed change.</p>
                <Button size="sm" onClick={() => setOrganizationOpen(true)}>Review management responsibilities</Button>
              </> : <p>District & Region roster management is not enabled on this release.</p>}
            </div>}
            <p className="text-xs text-neutral-500">Choose every position this person holds. Assign stores and districts separately.</p>
            <div className="grid grid-cols-2 gap-2">
              {PERSON_POSITIONS.map(p => <label key={p.id} className={'flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ' + (draft.positionIds.includes(p.id) ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-white')}>
                <input type="checkbox" checked={draft.positionIds.includes(p.id)} onChange={e => edit('positionIds', e.target.checked ? [...draft.positionIds, p.id] : draft.positionIds.filter(value => value !== p.id))} className="mt-0.5 accent-red-700" /><span>{p.label}</span>
              </label>)}
            </div>
            {person && positionState.source !== 'controlled' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
              <p>{positionState.source === 'invalid' ? 'Saved positions need review.' : 'These positions are suggestions from the historical title.'} Confirm them before changing positions.</p>
              <Button size="sm" className="mt-2" onClick={() => edit('positionIds', [...draft.positionIds])}>Review and link these positions</Button>
            </div>}
          </fieldset>
          {positionChanged && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"><h4 className="font-semibold">Review position change</h4><p>Selected: {PERSON_POSITIONS.filter(p => draft.positionIds.includes(p.id)).map(p => p.label).join(', ') || 'No positions'}. Existing assignments and accounts stay unchanged.</p>
            {conflicts.map(row => <p key={row.key} role="alert">Retain {PERSON_POSITIONS.find(p => p.id === row.requiredPosition)!.label} or reassign/vacate: {row.label}.</p>)}
            <label className="flex items-start gap-2"><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-0.5 accent-red-700" />I reviewed the responsibilities. Save positions only; do not change assignments or access.</label>
          </div>}

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id={id + '-title'} label="Display title (optional)" value={draft.jobTitle} onChange={value => edit('jobTitle', value)} />
            <TextField id={id + '-department'} label="Department" value={draft.department} onChange={value => edit('department', value)} />
          </div>
          <p className="text-xs text-neutral-500">Optional display labels. Linked positions above determine assignment eligibility.</p>
          {person?.role && person.role !== person.jobTitle && <details className="text-xs text-neutral-500"><summary className="cursor-pointer">Historical title</summary><p className="mt-2 break-words">Historical role alias retained for review: {person.role}. Display-title edits do not overwrite it.</p></details>}
        </section>
        <section className={sectionClass} aria-label="Contact and privacy">
          <h3 className="font-semibold text-neutral-900">Contact details</h3>
          <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_8rem]">
            <TextField id={id + '-phone'} label="Work Phone" value={draft.phone} onChange={value => edit('phone', value)} />
            <TextField id={id + '-extension'} label="Extension" value={draft.extension} onChange={value => edit('extension', value)} />
            <div className="col-span-2 sm:col-span-1"><FormLabel htmlFor={id + '-privacy'}>Phone visibility</FormLabel><select id={id + '-privacy'} value={draft.privacy} onChange={e => edit('privacy', e.target.value as ContactPrivacyLevel)} className={inputClass}>{!['Public', 'Internal', 'Restricted'].includes(draft.privacy) && <option value={draft.privacy}>Historical value (review)</option>}{['Public', 'Internal', 'Restricted'].map(value => <option key={value}>{value}</option>)}</select></div>
          </div>
          <TextField id={id + '-email'} label="Individual work email (optional)" value={draft.email} onChange={value => edit('email', value)} />
          <p className="text-xs text-neutral-500">Optional individual company address, separate from the shared store inbox.</p>
          {legacyEmailCandidate && !personEmailEditChangesValue(person, draft.email) && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <p>{mappedLegacyEmail ? 'Email mapping staged, not saved. Save Person to apply it.' : 'Historical contact. It stays unchanged unless you explicitly map it below.'}</p>
            {mappedLegacyEmail ? <Button size="sm" onClick={() => { setMappedLegacyEmail(null); setDraft(previous => ({ ...previous, email: email.value })); setTouched(previous => { const next = new Set(previous); next.delete('email'); return next; }); setError(''); }}>Undo email mapping</Button> : <Button size="sm" onClick={() => setEmailMappingReview(true)}>Use as individual work email</Button>}
          </div>}
          {person?.email && Object.hasOwn(person, 'workEmail') && person.email.trim().toLowerCase() !== (person.workEmail || '').trim().toLowerCase() && <details className="text-xs text-neutral-500"><summary className="cursor-pointer">Historical email</summary><p className="mt-2 break-all">Historical email alias retained for review: {person.email}</p></details>}
          {sharedPersonEmailKind(draft.email, locations) && <p className="text-xs text-amber-900">This is a shared store inbox, not an individual address. Keep it unchanged, or clear/replace it intentionally. Store inboxes and assignments are unaffected.</p>}
          <PersonInboxResponsibilities person={person} locations={locations} compact />
        </section>
        <section className={sectionClass}>
          <PersonLocationRelationshipFields locations={locations} primaryLocationId={draft.primaryLocationId} supportedLocationIds={draft.supportedLocationIds} onPrimaryLocationChange={value => edit('primaryLocationId', value)} onSupportedLocationIdsChange={value => edit('supportedLocationIds', value)} />
        </section>
        <section className={sectionClass} aria-label="Management responsibilities">
          <h3 className="font-semibold text-neutral-900">{organization.review?.phase === 'ready' ? 'Store & saved leadership references' : 'Management responsibilities'}</h3>
          <p className="text-xs text-neutral-500">{organization.review?.phase === 'ready' ? 'District and Region responsibilities are reviewed above. Store assignments are managed separately.' : "Change a district's manager once in Organization settings. Its stores inherit that manager."}</p>
          {impact.responsibilities.length ? <details open={positionChanged} className="rounded-lg border border-neutral-200 p-3 text-xs">
            <summary className="cursor-pointer font-medium text-neutral-700">Current management assignments · {impact.responsibilities.length}</summary>
            <ul className="mt-3 divide-y divide-neutral-100">{impact.responsibilities.map(row => <li key={row.key} className="py-2"><a href={row.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-red-700 underline">{row.label}</a><p className="mt-1 text-neutral-500">{row.source}</p></li>)}</ul>
          </details> : <p className="text-xs text-neutral-500">{organization.review?.phase === 'ready' ? 'No other saved leadership references.' : 'No linked management assignments.'}</p>}
          {impact.issues.map(issue => <p key={issue} className="text-xs text-amber-900">{issue}</p>)}
          {person?.district && <details className="text-xs text-neutral-500"><summary className="cursor-pointer">Historical territory note</summary><p className="mt-2 break-words">Legacy territory/district text (reference only): {person.district}. Not an assignment; preserved.</p></details>}
          <a href="/admin?tab=hierarchy-registry" target="_blank" rel="noopener noreferrer" className="inline-block py-1 text-xs font-semibold text-red-700 underline">Open Organization & leadership settings</a>
          {person && canCoordinate && <Button size="sm" disabled={saving || uncertain} onClick={() => openRemoval(true)}>Recover interrupted staffing change</Button>}
        </section>
        <section className={sectionClass} aria-label="Lifecycle and account access">
          <h3 className="font-semibold text-neutral-900">Status & linked accounts</h3>
          <div><FormLabel htmlFor={id + '-status'}>Active Status</FormLabel><select id={id + '-status'} value={draft.status} onChange={e => edit('status', e.target.value)} className={inputClass}>{draft.status === 'Unknown' && <option value="Unknown" disabled>Needs lifecycle review (preserved)</option>}<option>Active</option><option>Inactive</option></select></div>
          <p className="text-xs text-neutral-600">Making someone inactive does not disable their login. Review assignments and linked accounts first.</p>
          {impact.accounts.length ? <ul className="space-y-1 text-xs">{impact.accounts.map(account => <li key={account.id}>{account.name} · {account.role} · {account.status}</li>)}</ul> : <p className="text-xs text-neutral-500">No linked Directory account found.</p>}
        </section>
        {children}
      </fieldset>
      {error && <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p ref={errorRef} tabIndex={-1} role="alert">{error}</p>{uncertain && <a href={person ? '/people/' + encodeURIComponent(person.id) : '/people'} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-semibold underline">Check the saved Directory in another tab (draft kept here)</a>}</div>}
      {!footerTarget && actions}
    </form>
    {footerTarget && createPortal(actions, footerTarget)}
    <ConfirmDialog isOpen={emailMappingReview} title="Review individual email mapping" description="Only use an address assigned to this person, not a shared store inbox. This stages a draft change; Save Person is still required. It does not verify ownership, create a mailbox or grant sign-in/app access." confirmLabel="Stage email mapping" tone="primary" confirmDisabled={!legacyEmailCandidate || saving || uncertain} onConfirm={() => { if (!legacyEmailCandidate || busy.current || uncertain) return; setMappedLegacyEmail(legacyEmailCandidate); setDraft(previous => ({ ...previous, email: legacyEmailCandidate })); setTouched(previous => new Set(previous).add('email')); setError(''); setEmailMappingReview(false); }} onCancel={() => setEmailMappingReview(false)}>
      <div className="mt-3 space-y-2 text-xs text-neutral-700"><p>Source: historical email (retained)</p><p>Destination: individual work email</p><p className="break-all font-mono">{legacyEmailCandidate || 'No eligible saved individual contact. Reload and review.'}</p><p>Person ID, staffing assignments, store inboxes and account access stay unchanged. API contact eligibility and grants still apply.</p></div>
    </ConfirmDialog>
    <ConfirmDialog isOpen={discard} title="Leave this Person draft?" description={uncertain ? 'The save outcome is unknown. Leaving does not cancel an in-flight save. Check the saved record before making another change.' : 'Unsaved profile changes will be discarded. Management assignments and accounts have not been changed by this draft.'} confirmLabel="Leave draft" onConfirm={onCancel} onCancel={() => setDiscard(false)} />
  </>;
}
