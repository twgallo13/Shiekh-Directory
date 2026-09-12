import React, { useEffect, useState } from 'react';
import { PersonRecord, LocationRecord, ContactPrivacyLevel } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { ExternalLink, Mail, Phone, MapPin, Store } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { Modal } from '../common/Modal';
import { formatUsPhone } from '../../lib/contactNormalization';
import { PersonLocationRelationshipFields } from './PersonLocationRelationshipFields';

interface PersonDetailModalProps {
  person: PersonRecord | null;
  onClose: () => void;
  onSelectLocation?: (location: LocationRecord) => void;
}

export const PersonDetailModal: React.FC<PersonDetailModalProps> = ({
  person,
  onClose,
  onSelectLocation,
}) => {
  const { locations, currentUser, togglePersonPhonePrivacy, updatePerson } = useDirectory();
  const [isEditingRelationships, setIsEditingRelationships] = useState(false);
  const [primaryLocationId, setPrimaryLocationId] = useState<string>();
  const [supportedLocationIds, setSupportedLocationIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setIsEditingRelationships(false);
    setPrimaryLocationId(person?.primaryLocationId);
    setSupportedLocationIds(person?.supportedLocationIds || []);
    setSaveError('');
  }, [person?.id]);

  if (!person) return null;

  const assignedLocs = locations.filter(l => 
    l.storeManagerId === person.id || 
    l.districtManagerId === person.id ||
    l.regionalManagerId === person.id ||
    l.assistantStoreManagerIds?.includes(person.id) ||
    l.keyHolderIds?.includes(person.id)
  );

  const canEditPrivacy = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const primaryLocation = person.primaryLocationId ? locations.find(location => location.id === person.primaryLocationId) : undefined;

  const beginRelationshipEdit = () => {
    setPrimaryLocationId(person.primaryLocationId);
    setSupportedLocationIds(person.supportedLocationIds || []);
    setSaveError('');
    setIsEditingRelationships(true);
  };

  const saveRelationships = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      await updatePerson(person.id, {
        primaryLocationId: primaryLocationId || null,
        supportedLocationIds,
      });
      setIsEditingRelationships(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Employment relationships could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const locationRelationship = (locationId: string) => {
    const location = locations.find(item => item.id === locationId);
    if (!location) return <span className="text-amber-800">Unavailable Location · {locationId}</span>;
    return (
      <button
        type="button"
        onClick={() => onSelectLocation?.(location)}
        className="flex w-full items-center justify-between gap-3 text-left font-medium text-neutral-900 hover:text-red-700"
      >
        <span><strong className="text-red-700">#{location.storeNumber}</strong> {location.name}</span>
        <span className="inline-flex items-center gap-1 text-[10px] text-neutral-500">{location.type}{location.recordStatus === 'Retired' ? ' · Unavailable' : ''}<ExternalLink className="h-3 w-3" /></span>
      </button>
    );
  };

  return (
    <Modal
      isOpen={Boolean(person)}
      title={person.fullName}
      description={person.jobTitle || person.role || 'Team Member'}
      size="md"
      onClose={onClose}
      icon={(
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-red-200 bg-red-50 text-sm font-bold text-red-700">
          {person.fullName?.[0] || 'P'}
        </div>
      )}
      footer={<div className="flex justify-end gap-2">
        {canEditPrivacy && !isEditingRelationships && <Button size="sm" variant="primary" onClick={beginRelationshipEdit}>Edit Relationships</Button>}
        {isEditingRelationships && <>
          <Button size="sm" onClick={() => setIsEditingRelationships(false)}>Cancel</Button>
          <Button size="sm" variant="primary" isLoading={isSaving} onClick={() => void saveRelationships()}>Save Relationships</Button>
        </>}
        {!isEditingRelationships && <Button size="sm" onClick={onClose}>Close</Button>}
      </div>}
    >
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
              <div className="text-neutral-500 text-[10px] font-semibold uppercase flex items-center gap-1">
                <Phone className="w-3 h-3 text-neutral-400" /> Direct Phone
              </div>
              <div className="font-mono text-neutral-900 font-medium">{formatUsPhone(person.phone || person.workPhone, person.phone ? person.phoneExtension : person.workPhoneExtension) || 'N/A'}</div>
              <div className="pt-1 flex items-center justify-between">
                <PrivacyBadge level={person.phonePrivacy} />
                {canEditPrivacy && (
                  <select
                    value={person.phonePrivacy || 'Public'}
                    onChange={(e) => togglePersonPhonePrivacy(person.id, e.target.value as ContactPrivacyLevel)}
                    className="bg-white border border-neutral-300 text-[10px] rounded px-1.5 py-0.5 text-neutral-700 cursor-pointer"
                  >
                    <option value="Public">Public</option>
                    <option value="Internal">Internal</option>
                    <option value="Restricted">Restricted</option>
                  </select>
                )}
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-1">
              <div className="text-neutral-500 text-[10px] font-semibold uppercase flex items-center gap-1">
                <Mail className="w-3 h-3 text-neutral-400" /> Email Address
              </div>
              <div className="text-neutral-900 font-medium truncate">{person.email || person.workEmail || 'N/A'}</div>
              <div className="text-neutral-400 text-[10px] pt-1">Company Workspace</div>
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

          {isEditingRelationships ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <PersonLocationRelationshipFields
                locations={locations}
                primaryLocationId={primaryLocationId}
                supportedLocationIds={supportedLocationIds}
                onPrimaryLocationChange={setPrimaryLocationId}
                onSupportedLocationIdsChange={setSupportedLocationIds}
              />
              {saveError && <p role="alert" className="mt-2 text-xs text-red-700">{saveError}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Works at</div>
                <div className={`rounded-lg border p-2.5 ${person.primaryLocationId && (!primaryLocation || primaryLocation.recordStatus === 'Retired') ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-neutral-50'}`}>
                  {person.primaryLocationId ? locationRelationship(person.primaryLocationId) : <span className="italic text-neutral-500">Unassigned</span>}
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Supports</div>
                <div className="space-y-1.5">
                  {(person.supportedLocationIds || []).map((locationId, index) => (
                    <div key={`${locationId}-${index}`} className={`rounded-lg border p-2.5 ${!locations.some(location => location.id === locationId && location.recordStatus !== 'Retired') ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-neutral-50'}`}>
                      {locationRelationship(locationId)}
                    </div>
                  ))}
                  {(person.supportedLocationIds || []).length === 0 && <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 italic text-neutral-500">No additional support locations</div>}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider">
              Retail Leadership Assignments ({assignedLocs.length})
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {assignedLocs.map(loc => (
                <button
                  type="button"
                  key={loc.id}
                  onClick={() => {
                    if (onSelectLocation) {
                      onSelectLocation(loc);
                    }
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-left transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                >
                  <div>
                    <span className="font-bold text-red-600 mr-2">#{loc.storeNumber}</span>
                    <span className="font-medium text-neutral-900">{loc.name}</span>
                  </div>
                  <span className="text-[11px] text-neutral-500">{loc.city}, {loc.state}</span>
                </button>
              ))}
              {assignedLocs.length === 0 && (
                <EmptyState
                  icon={Store}
                  title="No leadership assignments"
                  description="This person does not hold a retail leadership slot in the directory."
                  compact
                />
              )}
            </div>
          </div>
        </div>
    </Modal>
  );
};
