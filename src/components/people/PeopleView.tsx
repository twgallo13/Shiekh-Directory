import React, { useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { Person } from '../../types';
import { Search, Plus, UserRoundSearch, Phone, Mail, MapPin } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { PageHeader } from '../common/PageHeader';
import { Modal } from '../common/Modal';
import { formatUsPhone } from '../../lib/contactNormalization';
import { PersonEditorForm } from './PersonEditorForm';

interface PeopleViewProps {
  onSelectPerson: (person: Person) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ onSelectPerson }) => {
  const { people, locations, currentUser, addPerson } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isAddingPerson, setIsAddingPerson] = useState(false);

  const canAdd = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

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
        isOpen={isAddingPerson}
        title="Add Person"
        description="Create a personnel record for the directory."
        size="sm"
        onClose={() => setIsAddingPerson(false)}
      >
        <PersonEditorForm
          locations={locations}
          submitLabel="Save Record"
          onCancel={() => setIsAddingPerson(false)}
          onSubmit={async updates => {
            await addPerson(updates);
            setIsAddingPerson(false);
          }}
        />
      </Modal>
    </div>
  );
};
