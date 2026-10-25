import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LocationRecord, PersonRecord, UserProfile } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { Mail, MapPin, Pencil, Phone, Store, Trash2, UserX } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatPersonPhone, resolvePersonEmail, resolvePersonPhone } from '../../lib/personContacts';
import { buildPersonLocationRelationships, getPersonDeletionBlockers } from '../../lib/personLocationRelationships';
import { PersonEditorForm } from './PersonEditorForm';
import { normalizeLocationInboxEmail } from '../../lib/locationInboxEmail';
import { personLifecycle } from '../../lib/personLifecycle';
import { personPositionLabel } from '../../lib/personPositions';
import { personProfileImpact } from '../../lib/personProfileImpact';
import { PersonInboxResponsibilities } from './PersonInboxResponsibilities';
import { sharedPersonEmailKind } from '../../lib/personInboxResponsibilities';
import { PersonTransitionReview } from './PersonTransitionReview';

interface PersonDetailModalProps {
  person: PersonRecord | null;
  onClose: () => void;
  onSelectLocation?: (location: LocationRecord) => void;
  onEditLocation?: (location: LocationRecord) => void;
  onSelectUser?: (user: UserProfile) => void;
}

export const PersonDetailModal: React.FC<PersonDetailModalProps> = ({
  person,
  onClose,
  onSelectLocation,
  onEditLocation,
  onSelectUser,
}) => {
  const { locations, districts, regions, users, requests, currentUser, updatePerson, deletePerson } = useDirectory();
  const [isEditing, setIsEditing] = useState(false);
  const editorClose = useRef<(() => void) | null>(null);
  const [editorFooter, setEditorFooter] = useState<HTMLDivElement | null>(null);
  const [pendingAction, setPendingAction] = useState<'inactivate' | 'delete' | null>(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [actionError, setActionError] = useState('');
  const [isActionPending, setIsActionPending] = useState(false);

  useEffect(() => {
    setIsEditing(false);
    setPendingAction(null);
    setConfirmationName('');
    setActionError('');
  }, [person?.id]);

  const relationships = useMemo(
    () => person ? buildPersonLocationRelationships(person, locations, districts) : [],
    [locations, person, districts],
  );
  const blockers = useMemo(
    () => person ? getPersonDeletionBlockers(person, locations, users, districts) : { locations: [], users: [] },
    [locations, person, users, districts],
  );

  if (!person) return null;

  const email = resolvePersonEmail(person);
  const sharedEmail = sharedPersonEmailKind(email.value, locations);
  const invalidEmail = Boolean(email.value && !normalizeLocationInboxEmail(email.value));
  const canEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const impact = personProfileImpact(person, locations, districts, regions, users);
  const ownedDistricts = districts.filter(d => d.districtManagerId === person.id);
  const hasBlockers = blockers.locations.length > 0 || blockers.users.length > 0 || ownedDistricts.length > 0;

  const closeAction = () => {
    if (isActionPending) return;
    setPendingAction(null);
    setConfirmationName('');
    setActionError('');
  };

  const performAction = async () => {
    if (!pendingAction || hasBlockers) return;
    setIsActionPending(true);
    setActionError('');
    try {
      if (pendingAction === 'delete') {
        await deletePerson(person.id);
        onClose();
      } else {
        await updatePerson(person.id, { status: 'Inactive', activeStatus: false });
        setPendingAction(null);
        setConfirmationName('');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : `The person could not be ${pendingAction === 'delete' ? 'deleted' : 'inactivated'}.`);
    } finally {
      setIsActionPending(false);
    }
  };

  const blockerDetails = hasBlockers ? (
    <div className="mt-4 space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      {ownedDistricts.length > 0 && <div><p className="font-semibold">Reassign or vacate District leadership first:</p>{ownedDistricts.map(d => <p key={d.id}>{d.name} · {d.status}</p>)}<a href="/admin?tab=hierarchy-registry" target="_blank" rel="noopener noreferrer" className="underline">Open Organization & leadership settings</a></div>}
      {blockers.locations.length > 0 && <div className="space-y-1.5"><p className="font-semibold">Clear these leadership assignments first:</p>{blockers.locations.map(row => (
        <button key={row.locationId} type="button" disabled={!row.location || !onEditLocation} onClick={() => row.location && onEditLocation?.(row.location)} className="flex w-full items-center justify-between rounded border border-amber-200 bg-white px-2 py-1.5 text-left hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-70">
          <span>{row.location ? `#${row.location.storeNumber} ${row.location.name}` : `Unavailable Location ${row.locationId}`}</span><span className="font-medium">{row.labels.join(', ')}</span>
        </button>
      ))}</div>}
      {blockers.users.length > 0 && <div className="space-y-1.5"><p className="font-semibold">Unlink these user accounts first:</p>{blockers.users.map(user => (
        <button key={user.id} type="button" disabled={!onSelectUser} onClick={() => onSelectUser?.(user)} className="flex w-full items-center justify-between rounded border border-amber-200 bg-white px-2 py-1.5 text-left hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-70">
          <span>{user.name}</span><span className="font-mono text-[10px]">{user.email}</span>
        </button>
      ))}</div>}
    </div>
  ) : null;

  return (
    <>
    <Modal
      isOpen
      title={person.fullName}
      description={personPositionLabel(person)}
      size={isEditing ? 'lg' : 'md'}
      onClose={() => isEditing ? editorClose.current?.() : onClose()}
      icon={(
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-sm font-bold text-red-700">
          {person.fullName?.[0] || 'P'}
        </div>
      )}
      footer={isEditing ? <div ref={setEditorFooter} className="w-full" /> : <div className="flex w-full flex-wrap justify-end gap-2">
        {canEdit && person.status !== 'Inactive' && person.activeStatus !== false && <Button size="sm" variant="danger" onClick={() => setPendingAction('inactivate')}><UserX className="h-3.5 w-3.5" />Inactivate</Button>}
        {canEdit && <Button size="sm" variant="danger" onClick={() => setPendingAction('delete')}><Trash2 className="h-3.5 w-3.5" />Delete</Button>}
        {canEdit && <Button size="sm" variant="primary" onClick={() => setIsEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit Person</Button>}
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>}
    >
      {isEditing ? (
        <PersonEditorForm
          key={person.id}
          person={person}
          registerClose={close => { editorClose.current = close; }}
          footerTarget={editorFooter}
          locations={locations}
          submitLabel="Save Person"
          onCancel={() => setIsEditing(false)}
          onSubmit={async (updates, expectedVersion) => {
            await updatePerson(person.id, updates, expectedVersion);
            setIsEditing(false);
          }}
        />
      ) : (
        <div className="space-y-4 text-xs">
          <p className="text-sm text-neutral-500">{personLifecycle(person) === 'unknown' ? 'Status needs review' : personLifecycle(person) === 'active' ? 'Active' : 'Inactive'}{person.department ? ` · ${person.department}` : ''}</p>
          <dl className="divide-y divide-neutral-100">
            <div className="grid gap-1 py-3 sm:grid-cols-[6rem_1fr] sm:gap-3">
              <dt className="text-xs text-neutral-500">Direct phone</dt><dd className="flex flex-wrap items-center gap-2">
                {resolvePersonPhone(person).value ? <a href={`tel:${resolvePersonPhone(person).value.replace(/[^0-9+]/g, '')}`} className="text-sm font-medium text-red-700 hover:underline">{formatPersonPhone(person)}</a> : <span className="text-sm text-neutral-500">Not recorded</span>}
                <PrivacyBadge level={person.phonePrivacy} />
              </dd>
            </div>
            <div className="grid gap-1 py-3 sm:grid-cols-[6rem_1fr] sm:gap-3">
              <dt className="text-xs text-neutral-500">{sharedEmail ? 'Saved shared contact' : email.source === 'legacy' && email.value ? 'Saved contact' : 'Work email'}</dt><dd className="min-w-0">
                {email.value && !invalidEmail && !sharedEmail && email.source !== 'legacy' ? <a href={`mailto:${encodeURIComponent(email.value)}`} className="break-all text-sm font-medium text-red-700 hover:underline">{email.value}</a> : <span className="break-all text-sm text-neutral-700">{email.value || 'Not assigned'}</span>}
                {(sharedEmail || invalidEmail || (email.source === 'legacy' && email.value)) && <p className="mt-1 text-xs text-amber-900">{sharedEmail ? 'Shared inbox — not an individual address.' : invalidEmail ? 'Saved address needs review.' : 'Historical contact — needs review before use.'}</p>}
                {Object.hasOwn(person, 'workEmail') && person.email && (person.workEmail || '').trim().toLowerCase() !== person.email.trim().toLowerCase() && <details className="mt-2 text-xs text-neutral-500"><summary className="cursor-pointer">Historical contact</summary><p className="mt-1 break-all">{person.email}</p></details>}
              </dd>
            </div>
          </dl>
          <PersonInboxResponsibilities person={person} locations={locations} compact />

          <div className="space-y-2">
            {ownedDistricts.length > 0 && <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"><h3 className="font-semibold">Districts</h3>{impact.responsibilities.filter(r => r.key.startsWith('district:')).map(row => <p key={row.key} className="mt-2">{row.label}</p>)}{canEdit && <a href="/admin?tab=hierarchy-registry" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-red-700 underline">Manage District leadership</a>}</div>}
            {impact.issues.map(issue => <p key={issue} className="text-amber-900">{issue}</p>)}
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Locations ({relationships.length})</div>
            <div className="divide-y divide-neutral-200">
              {relationships.map(row => {
                const hasLeadershipRole = row.labels.some(label => !['Primary workplace', 'Supports'].includes(label));
                return <div key={row.locationId} className={`py-3 ${row.unavailable ? 'border-amber-200 bg-amber-50' : 'border-neutral-200'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" disabled={!row.location} onClick={() => row.location && onSelectLocation?.(row.location)} className="min-w-0 text-left font-medium text-neutral-900 hover:text-red-700 disabled:cursor-not-allowed">
                      {row.location ? <><strong className="text-red-700">#{row.location.storeNumber}</strong> {row.location.name}</> : <>Unavailable Location · {row.locationId}</>}
                      {row.location && <span className="mt-0.5 block text-[10px] font-normal text-neutral-500">{row.location.type}{row.unavailable ? ' · Unavailable' : ''}</span>}
                    </button>
                    {hasLeadershipRole && canEdit && row.location && onEditLocation && <Button size="sm" variant="ghost" onClick={() => onEditLocation(row.location!)}><Pencil className="h-3 w-3" />Edit Assignment</Button>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">{row.labels.map(label => <span key={label} className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">{label}</span>)}</div>
                  {row.location && row.labels.some(label => ['Primary workplace', 'Supports'].includes(label)) && !row.labels.some(label => ['Store Manager', 'Assistant Manager'].includes(label)) && normalizeLocationInboxEmail(row.location.locationInboxEmail) && (
                    <div className="mt-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
                      <div className="text-[10px] font-semibold uppercase text-neutral-500">Workplace contact</div>
                      <a href={`mailto:${encodeURIComponent(normalizeLocationInboxEmail(row.location.locationInboxEmail)!.value)}`} className="mt-0.5 block break-all text-xs text-red-700 hover:underline">
                        {row.location.locationInboxEmail}
                      </a>
                    </div>
                  )}
                </div>;
              })}
              {relationships.length === 0 && <EmptyState icon={Store} title="No Locations assigned" description="Workplace and leadership assignments will appear here." compact />}
            </div>
          </div>
          {canEdit && <PersonTransitionReview person={person} locations={locations} districts={districts} regions={regions} users={users} requests={requests} />}

          {person.district && (
            <details className="rounded-lg border border-neutral-200 p-3"><summary className="cursor-pointer text-xs font-medium text-neutral-600">Historical territory note</summary><div className="mt-2 flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-600">Reference only, not an assignment:</span>
              </div>
              <span className="font-semibold text-neutral-900">{person.district}</span>
            </div></details>
          )}

        </div>
      )}
    </Modal>

    <ConfirmDialog
      isOpen={pendingAction === 'inactivate'}
      title={`Inactivate ${person.fullName}?`}
      description={hasBlockers ? 'This Person cannot be inactivated until the linked records below are updated.' : 'This keeps the Person record in the directory but marks it inactive.'}
      confirmLabel={isActionPending ? 'Inactivating...' : 'Inactivate Person'}
      confirmDisabled={hasBlockers || isActionPending}
      onConfirm={() => void performAction()}
      onCancel={closeAction}
    >
      {blockerDetails}
      {actionError && <p role="alert" className="mt-3 text-xs text-red-700">{actionError}</p>}
    </ConfirmDialog>

    <ConfirmDialog
      isOpen={pendingAction === 'delete'}
      title={`Delete ${person.fullName}?`}
      description={hasBlockers ? 'This Person cannot be deleted until the linked records below are updated.' : 'This permanently deletes the Person record and cannot be undone.'}
      confirmLabel={isActionPending ? 'Deleting...' : 'Delete Person'}
      confirmDisabled={hasBlockers || isActionPending}
      confirmationText={person.fullName}
      confirmationValue={confirmationName}
      onConfirmationValueChange={setConfirmationName}
      onConfirm={() => void performAction()}
      onCancel={closeAction}
    >
      {blockerDetails}
      {actionError && <p role="alert" className="mt-3 text-xs text-red-700">{actionError}</p>}
    </ConfirmDialog>
    </>
  );
};
