import React, { useRef, useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { Person } from '../../types';
import { Search, Plus, UserRoundSearch, Phone, Mail, MapPin } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { EmptyState } from '../common/EmptyState';
import { PageHeader } from '../common/PageHeader';
import { Modal } from '../common/Modal';
import { formatPersonPhone, resolvePersonEmail } from '../../lib/personContacts';
import { PersonEditorForm } from './PersonEditorForm';
import { listedPosition, personPositions, PERSON_POSITIONS, personPositionLabel } from '../../lib/personPositions';
import { sharedPersonEmailKind } from '../../lib/personInboxResponsibilities';
import { normalizeLocationInboxEmail } from '../../lib/locationInboxEmail';
import { personLifecycle } from '../../lib/personLifecycle';

interface PeopleViewProps {
  onSelectPerson: (person: Person) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ onSelectPerson }) => {
  const { people, locations, districts, currentUser, addPerson } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isAddingPerson, setIsAddingPerson] = useState(false);
  const editorClose = useRef<(() => void) | null>(null);
  const [editorFooter, setEditorFooter] = useState<HTMLDivElement | null>(null);

  const canAdd = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const filtered = people.filter(p => {
    const matchesRole = roleFilter === 'Store Manager' || roleFilter === 'District Manager'
      ? listedPosition(p, roleFilter) : p.jobTitle === roleFilter || p.role === roleFilter;
    if (roleFilter !== 'all' && !matchesRole) {
      return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      p.fullName?.toLowerCase().includes(term) ||
      p.jobTitle?.toLowerCase().includes(term) ||
      PERSON_POSITIONS.some(position => personPositions(p).ids.includes(position.id) && position.label.toLowerCase().includes(term)) ||
      p.phone?.toLowerCase().includes(term) ||
      p.workPhone?.toLowerCase().includes(term) ||
      resolvePersonEmail(p).value.toLowerCase().includes(term) ||
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

      <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, role, phone, or email..."
            aria-label="Search people"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-red-500 focus:bg-white"
          />
        </div>

        <select
          aria-label="Filter people by position"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-1.5 text-xs text-neutral-800 focus:outline-none cursor-pointer"
        >
          <option value="all">All Positions</option>
          <option value="District Manager">District Managers</option>
          <option value="Store Manager">Store Managers</option>
          <option value="Store Operations Leadership">Operations Leadership</option>
        </select>
      </div>

      {/* Grid of People */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(person => {
          const email = resolvePersonEmail(person);
          const shared = sharedPersonEmailKind(email.value, locations);
          const contactLabel = shared ? email.source === 'legacy' ? 'Historical shared contact · needs review' : 'Shared store contact' : email.value && !normalizeLocationInboxEmail(email.value) ? 'Contact needs review' : email.source === 'legacy' ? 'Historical contact · needs review' : 'Work email';
          const workplace = locations.find(location => location.id === person.primaryLocationId);
          const ownedDistricts = districts.filter(district => district.districtManagerId === person.id);
          const lifecycle = personLifecycle(person);
          return (
          <button
            type="button"
            key={person.id}
            onClick={() => onSelectPerson(person)}
            aria-label={`Open profile for ${person.fullName}`}
            className="min-w-0 space-y-3 self-start rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-xs transition-all hover:border-neutral-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between">
              <div className="flex min-w-0 items-center gap-2.5">
                <div aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-xs font-bold text-red-600">
                  {person.fullName?.[0] || 'P'}
                </div>
                <div className="min-w-0 break-words">
                  <h3 className="font-bold text-neutral-900 text-sm">{person.fullName}</h3>
                  <p className="mt-0.5 text-xs text-neutral-500">{personPositionLabel(person)}</p>
                  {lifecycle !== 'active' && <p className="mt-1 text-xs font-medium text-amber-800">{lifecycle === 'inactive' ? 'Inactive' : 'Status needs review'}</p>}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 text-xs pt-2 border-t border-neutral-100">
              <div className="flex flex-wrap items-center gap-2 text-neutral-500">
                <Phone aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="break-words text-neutral-700">{formatPersonPhone(person) || 'No direct phone'}</span>
                {formatPersonPhone(person) && <PrivacyBadge level={person.phonePrivacy} />}
              </div>
              <div className="flex items-center gap-2 text-neutral-500">
                <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                <span className="min-w-0 break-all text-neutral-700">{email.value ? <><span className="block text-[10px] text-neutral-500">{contactLabel}</span>{email.value}</> : 'No email'}</span>
              </div>
              {person.primaryLocationId && <p className="break-words text-neutral-600"><MapPin aria-hidden="true" className="mr-1 inline h-3.5 w-3.5" />Works at: {workplace ? `#${workplace.storeNumber} ${workplace.name}${workplace.recordStatus === 'Retired' ? ' (Retired)' : ''}` : 'Location unavailable'}</p>}
              {ownedDistricts.map(district => <p key={district.id} className="break-words text-neutral-600">District: {district.name || district.id}{district.status === 'Retired' ? ' (Retired)' : ''}</p>)}
            </div>
          </button>
        );})}
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
        footer={<div ref={setEditorFooter} className="w-full" />}
        size="lg"
        onClose={() => editorClose.current?.()}
      >
        <PersonEditorForm
          registerClose={close => { editorClose.current = close; }}
          footerTarget={editorFooter}
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
