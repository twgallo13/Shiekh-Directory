import React, { useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { Person } from '../../types';
import { Search, Plus, UserRoundSearch, Phone, Mail, MapPin } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { FormLabel } from '../common/FormLabel';
import { PageHeader } from '../common/PageHeader';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatUsPhone, normalizeUsPhone } from '../../lib/contactNormalization';
import { PersonLocationRelationshipFields } from './PersonLocationRelationshipFields';

interface PeopleViewProps {
  onSelectPerson: (person: Person) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ onSelectPerson }) => {
  const { people, locations, currentUser, addPerson } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isAddingPerson, setIsAddingPerson] = useState(false);

  // New person form state
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('Store Manager');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDistrict, setNewDistrict] = useState('');
  const [newPrimaryLocationId, setNewPrimaryLocationId] = useState<string>();
  const [newSupportedLocationIds, setNewSupportedLocationIds] = useState<string[]>([]);
  const [phoneError, setPhoneError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  const canAdd = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const hasPersonDraft = Boolean(
    newName.trim() ||
    newPhone.trim() ||
    newEmail.trim() ||
    newDistrict.trim() ||
    newPrimaryLocationId ||
    newSupportedLocationIds.length > 0 ||
    newTitle !== 'Store Manager'
  );

  const resetPersonDraft = () => {
    setNewName('');
    setNewTitle('Store Manager');
    setNewPhone('');
    setNewEmail('');
    setNewDistrict('');
    setNewPrimaryLocationId(undefined);
    setNewSupportedLocationIds([]);
    setPhoneError('');
    setSaveError('');
  };

  const requestClosePersonModal = () => {
    if (hasPersonDraft) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    setIsAddingPerson(false);
  };

  const filtered = people.filter(p => {
    if (roleFilter !== 'all' && p.jobTitle !== roleFilter && p.role !== roleFilter) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.fullName?.toLowerCase().includes(term) ||
      p.phone?.toLowerCase().includes(term) ||
      p.email?.toLowerCase().includes(term) ||
      p.district?.toLowerCase().includes(term)
    );
  });

  const handleCreatePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    const phone = newPhone ? normalizeUsPhone(newPhone) : null;
    if (newPhone && !phone) {
      setPhoneError('Enter a valid US phone number, such as (555) 123-4567.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    try {
      await addPerson({
        fullName: newName.trim(),
        name: newName.trim(),
        jobTitle: newTitle,
        role: newTitle,
        phone: phone?.e164 || '',
        workPhone: phone?.e164 || '',
        ...(phone?.extension ? { phoneExtension: phone.extension, workPhoneExtension: phone.extension } : {}),
        email: newEmail.trim(),
        workEmail: newEmail.trim(),
        district: newDistrict.trim() || undefined,
        status: 'Active',
        activeStatus: true,
        phonePrivacy: 'Internal',
        ...(newPrimaryLocationId ? { primaryLocationId: newPrimaryLocationId } : {}),
        supportedLocationIds: newSupportedLocationIds,
      });
      resetPersonDraft();
      setIsAddingPerson(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Person could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Personnel Directory"
        description="Manage field leadership, store managers, and corporate contacts"
        actions={canAdd ? (
          <Button variant="primary" size="sm" onClick={() => setIsAddingPerson(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add Person
          </Button>
        ) : undefined}
      />

      <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-neutral-200 shadow-xs">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, role, phone, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500 focus:bg-white"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs text-neutral-800 focus:outline-none cursor-pointer"
        >
          <option value="all">All Roles</option>
          <option value="District Manager">District Managers</option>
          <option value="Store Manager">Store Managers</option>
          <option value="Store Operations Leadership">Operations Leadership</option>
        </select>
      </div>

      {/* Grid of People */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(person => (
          <button
            type="button"
            key={person.id}
            onClick={() => onSelectPerson(person)}
            className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 text-left shadow-xs transition-all hover:border-neutral-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center justify-center font-bold text-xs">
                  {person.fullName?.[0] || 'P'}
                </div>
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm">{person.fullName}</h3>
                  <p className="text-xs text-neutral-500">{person.jobTitle || person.role}</p>
                </div>
              </div>
              <PrivacyBadge level={person.phonePrivacy} />
            </div>

            <div className="space-y-1.5 text-xs pt-2 border-t border-neutral-100">
              <div className="flex items-center gap-2 text-neutral-500">
                <Phone className="w-3.5 h-3.5 text-neutral-400" />
                <span className="font-mono text-neutral-700">{formatUsPhone(person.phone || person.workPhone, person.phone ? person.phoneExtension : person.workPhoneExtension) || 'No direct phone'}</span>
              </div>
              <div className="flex items-center gap-2 text-neutral-500">
                <Mail className="w-3.5 h-3.5 text-neutral-400" />
                <span className="text-neutral-700 truncate">{person.email || person.workEmail || 'No email'}</span>
              </div>
              {person.district && (
                <div className="flex items-center gap-2 text-neutral-500">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="text-neutral-700 font-medium">{person.district}</span>
                </div>
              )}
            </div>
          </button>
        ))}
        </div>
      ) : (
        <EmptyState
          icon={UserRoundSearch}
          title="No personnel found"
          description="Try another name, role, phone number, or clear the current filters."
        />
      )}

      <Modal
        isOpen={isAddingPerson && !isDiscardConfirmOpen}
        title="Add Person"
        description="Create a personnel record for the directory."
        size="sm"
        onClose={requestClosePersonModal}
      >
        <form onSubmit={handleCreatePerson} className="space-y-3 text-xs">
              <div>
                <FormLabel required>Full Name</FormLabel>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rudy Calderon"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <FormLabel>Job Title / Role</FormLabel>
                <select
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="Store Manager">Store Manager</option>
                  <option value="District Manager">District Manager</option>
                  <option value="Store Operations Leadership">Store Operations Leadership</option>
                  <option value="Assistant Store Manager">Assistant Store Manager</option>
                </select>
              </div>

              <div>
                <FormLabel>Work Phone Number</FormLabel>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => { setNewPhone(e.target.value); setPhoneError(''); }}
                  onBlur={(event) => { const phone = normalizeUsPhone(event.target.value); if (phone) setNewPhone(phone.display); else if (event.target.value) setPhoneError('Enter a valid US phone number, such as (555) 123-4567.'); }}
                  placeholder="(555) 000-0000"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs font-mono focus:outline-none focus:border-red-500 focus:bg-white"
                />
                {phoneError && <p className="mt-1 text-xs text-red-600">{phoneError}</p>}
              </div>

              <div>
                <FormLabel>Work Email</FormLabel>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@shiekhshoes.com"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <FormLabel>Assigned Territory / District (Optional)</FormLabel>
                <input
                  type="text"
                  value={newDistrict}
                  onChange={(e) => setNewDistrict(e.target.value)}
                  placeholder="e.g. Inland Empire & Desert"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <PersonLocationRelationshipFields
                locations={locations}
                primaryLocationId={newPrimaryLocationId}
                supportedLocationIds={newSupportedLocationIds}
                onPrimaryLocationChange={setNewPrimaryLocationId}
                onSupportedLocationIdsChange={setNewSupportedLocationIds}
              />

              {saveError && <p role="alert" className="text-xs text-red-700">{saveError}</p>}

              <div className="pt-3 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  onClick={requestClosePersonModal}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  isLoading={isSaving}
                >
                  Save Record
                </Button>
              </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDiscardConfirmOpen}
        title="Discard new person?"
        description="The information entered for this personnel record will be permanently discarded."
        confirmLabel="Discard draft"
        onConfirm={() => {
          resetPersonDraft();
          setIsDiscardConfirmOpen(false);
          setIsAddingPerson(false);
        }}
        onCancel={() => setIsDiscardConfirmOpen(false)}
      />
    </div>
  );
};
