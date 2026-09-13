import React, { useEffect, useMemo, useState } from 'react';
import type { LocationRecord, PersonRecord, UserProfile } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { Mail, MapPin, Pencil, Phone, Store, Trash2, UserX } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatUsPhone } from '../../lib/contactNormalization';
import { buildPersonLocationRelationships, getPersonDeletionBlockers } from '../../lib/personLocationRelationships';
import { PersonEditorForm } from './PersonEditorForm';

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
  const { locations, users, currentUser, updatePerson, deletePerson } = useDirectory();
  const [isEditing, setIsEditing] = useState(false);
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
    () => person ? buildPersonLocationRelationships(person, locations) : [],
    [locations, person],
  );
  const blockers = useMemo(
    () => person ? getPersonDeletionBlockers(person, locations, users) : { locations: [], users: [] },
    [locations, person, users],
  );

  if (!person) return null;

  const canEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const hasBlockers = blockers.locations.length > 0 || blockers.users.length > 0;

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
      description={person.jobTitle || person.role || 'Team Member'}
      size="md"
      onClose={onClose}
      icon={(
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-sm font-bold text-red-700">
          {person.fullName?.[0] || 'P'}
        </div>
      )}
      footer={isEditing ? undefined : <div className="flex w-full flex-wrap justify-end gap-2">
        {canEdit && person.status !== 'Inactive' && person.activeStatus !== false && <Button size="sm" variant="danger" onClick={() => setPendingAction('inactivate')}><UserX className="h-3.5 w-3.5" />Inactivate</Button>}
        {canEdit && <Button size="sm" variant="danger" onClick={() => setPendingAction('delete')}><Trash2 className="h-3.5 w-3.5" />Delete</Button>}
        {canEdit && <Button size="sm" variant="primary" onClick={() => setIsEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit Person</Button>}
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>}
    >
      {isEditing ? (
        <PersonEditorForm
          key={`${person.id}:${person.version ?? 0}`}
          person={person}
          locations={locations}
          submitLabel="Save Person"
          onCancel={() => setIsEditing(false)}
          onSubmit={async updates => {
            await updatePerson(person.id, updates);
            setIsEditing(false);
          }}
        />
      ) : (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
              <div className="text-neutral-500 text-[10px] font-semibold uppercase flex items-center gap-1">
                <Phone className="w-3 h-3 text-neutral-400" /> Direct Phone
              </div>
              <div className="font-mono text-neutral-900 font-medium">{formatUsPhone(person.phone || person.workPhone, person.phone ? person.phoneExtension : person.workPhoneExtension) || 'N/A'}</div>
              <PrivacyBadge level={person.phonePrivacy} />
            </div>

            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
              <div className="text-neutral-500 text-[10px] font-semibold uppercase flex items-center gap-1">
                <Mail className="w-3 h-3 text-neutral-400" /> Email Address
              </div>
              <div className="text-neutral-900 font-medium truncate">{person.email || person.workEmail || 'N/A'}</div>
              <div className="text-neutral-400 text-[10px] pt-1">{person.status === 'Inactive' || person.activeStatus === false ? 'Inactive' : 'Active'}{person.department ? ` · ${person.department}` : ''}</div>
            </div>
          </div>

          {person.district && (
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-600">Territory / District:</span>
              </div>
              <span className="font-semibold text-neutral-900">{person.district}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">Locations ({relationships.length})</div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {relationships.map(row => {
                const hasLeadershipRole = row.labels.some(label => !['Primary workplace', 'Supports'].includes(label));
                return <div key={row.locationId} className={`rounded-lg border p-2.5 ${row.unavailable ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-neutral-50'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" disabled={!row.location} onClick={() => row.location && onSelectLocation?.(row.location)} className="min-w-0 text-left font-medium text-neutral-900 hover:text-red-700 disabled:cursor-not-allowed">
                      {row.location ? <><strong className="text-red-700">#{row.location.storeNumber}</strong> {row.location.name}</> : <>Unavailable Location · {row.locationId}</>}
                      {row.location && <span className="mt-0.5 block text-[10px] font-normal text-neutral-500">{row.location.type}{row.unavailable ? ' · Unavailable' : ''}</span>}
                    </button>
                    {hasLeadershipRole && canEdit && row.location && onEditLocation && <Button size="sm" variant="ghost" onClick={() => onEditLocation(row.location!)}><Pencil className="h-3 w-3" />Edit Assignment</Button>}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">{row.labels.map(label => <span key={label} className="rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-neutral-700">{label}</span>)}</div>
                </div>;
              })}
              {relationships.length === 0 && <EmptyState icon={Store} title="No Locations assigned" description="This person has no workplace, support, or leadership Location relationships." compact />}
            </div>
          </div>
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
