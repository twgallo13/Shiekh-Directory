import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Users, 
  Phone, 
  Mail, 
  Building, 
  Briefcase, 
  ShieldCheck, 
  UserCheck, 
  Plus, 
  ExternalLink,
  ChevronRight,
  Lock
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { PersonRecord } from '../../types';
import { PrivacyBadge } from '../common/StatusBadge';

interface PeopleViewProps {
  onSelectPerson: (person: PersonRecord) => void;
  onSelectLocationById: (locId: string) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({
  onSelectPerson,
  onSelectLocationById,
}) => {
  const { people, locations, currentUser, addPerson } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // New Person state
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('Store Manager');
  const [newDept, setNewDept] = useState('Store Operations');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDistrict, setNewDistrict] = useState('District 1 (Rudy Calderon)');

  const canEdit = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';
  const isViewer = currentUser.role === 'Viewer';

  const departments = useMemo(() => {
    const set = new Set(people.map(p => p.department));
    return Array.from(set);
  }, [people]);

  const filteredPeople = useMemo(() => {
    return people.filter(p => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch = !term || (
        p.name.toLowerCase().includes(term) ||
        p.jobTitle.toLowerCase().includes(term) ||
        p.department.toLowerCase().includes(term) ||
        (p.district && p.district.toLowerCase().includes(term)) ||
        p.workPhone.includes(term) ||
        p.workEmail.toLowerCase().includes(term)
      );

      const matchesDept = selectedDept === 'all' || p.department === selectedDept;

      return matchesSearch && matchesDept;
    });
  }, [people, searchTerm, selectedDept]);

  const handleCreatePerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    addPerson({
      id: `per-${Date.now().toString(36)}`,
      name: newName.trim(),
      jobTitle: newTitle,
      department: newDept,
      workPhone: newPhone.trim(),
      workEmail: newEmail.trim() || `${newName.toLowerCase().replace(/\s+/g, '.')}@shiekhshoes.com`,
      district: newDistrict,
      phoneVisibility: 'Directory Public',
      isPhoneVerified: true,
      activeStatus: true,
    });

    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Company People & Leadership Directory
            </h1>
            <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-xs font-bold text-neutral-700 dark:text-neutral-300">
              {filteredPeople.length} contacts
            </span>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Store Managers, Assistant Managers, Field Leadership, and Corporate Support Contacts.
          </p>
        </div>

        {canEdit && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Person</span>
          </button>
        )}
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white dark:bg-neutral-900 p-3.5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by person name, job title, department, work phone, email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 outline-hidden focus:border-red-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedDept}
              onChange={e => setSelectedDept(e.target.value)}
              className="w-full sm:w-auto px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs text-neutral-700 dark:text-neutral-300"
            >
              <option value="all">All Departments ({people.length})</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* People Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredPeople.map(person => {
          const storeCount = locations.filter(l => 
            l.districtManagerName?.includes(person.name) || 
            l.storeManagerName === person.name
          ).length;

          const isQuarantined = person.phoneVisibility === 'Pending Review' || person.isPhoneVerified === false;
          const isManagementOnly = person.phoneVisibility === 'Internal Management Only';
          const shouldMaskPhone = (isQuarantined || isManagementOnly) && isViewer;

          return (
            <div
              key={person.id}
              onClick={() => onSelectPerson(person)}
              className="bg-white dark:bg-neutral-900 p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-2xs hover:shadow-xs hover:border-red-500 cursor-pointer transition-all flex flex-col justify-between group"
            >
              <div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 flex items-center justify-center font-bold text-sm shrink-0">
                    {person.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100 truncate group-hover:text-red-600 dark:group-hover:text-red-400">
                        {person.name}
                      </h3>
                      {person.isTemporary && (
                        <span className="text-[9px] px-1 py-0.2 bg-amber-500 text-white rounded font-semibold">
                          Temp
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400 font-medium truncate">
                      {person.jobTitle}
                    </div>
                    <div className="text-[11px] text-neutral-400 truncate">
                      {person.department}
                    </div>
                  </div>
                </div>

                {/* Direct Contacts with Privacy Level Badges */}
                <div className="mt-3.5 pt-2.5 border-t border-neutral-100 dark:border-neutral-800 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400 flex items-center gap-1">
                      Phone:
                    </span>
                    <div className="flex items-center gap-1.5">
                      {shouldMaskPhone ? (
                        <span className="font-mono text-neutral-400 font-semibold tracking-wider flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5 text-amber-500" />
                          (•••) •••-••••
                        </span>
                      ) : (
                        <a
                          href={`tel:${person.workPhone}`}
                          onClick={e => e.stopPropagation()}
                          className="font-bold text-neutral-800 dark:text-neutral-200 hover:text-red-600"
                        >
                          {person.workPhone}
                        </a>
                      )}
                      <PrivacyBadge 
                        visibility={person.phoneVisibility || (person.isPhoneVerified === false ? 'Pending Review' : 'Directory Public')} 
                        isVerified={person.isPhoneVerified ?? true}
                        size="sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Email:</span>
                    <a
                      href={`mailto:${person.workEmail}`}
                      onClick={e => e.stopPropagation()}
                      className="text-neutral-600 dark:text-neutral-400 hover:text-red-600 truncate max-w-[170px]"
                    >
                      {person.workEmail}
                    </a>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
                <span>{storeCount > 0 ? `${storeCount} Assigned Store${storeCount > 1 ? 's' : ''}` : (person.district || 'Corporate')}</span>
                <span className="text-red-600 dark:text-red-400 font-semibold group-hover:underline">
                  Profile →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Person Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
              Add New Person to Directory
            </h3>
            <form onSubmit={handleCreatePerson} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-500 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newName || ''}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-neutral-500 mb-1">Job Title</label>
                  <input
                    type="text"
                    value={newTitle || ''}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-neutral-500 mb-1">Department</label>
                  <input
                    type="text"
                    value={newDept || ''}
                    onChange={e => setNewDept(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-neutral-500 mb-1">Work Directory Phone *</label>
                <input
                  type="text"
                  required
                  value={newPhone || ''}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded font-mono text-neutral-900 dark:text-neutral-100"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1">Work Email</label>
                <input
                  type="email"
                  value={newEmail || ''}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="name@shiekhshoes.com"
                  className="w-full px-2.5 py-1.5 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-neutral-900 dark:text-neutral-100"
                />
              </div>

              <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded font-medium text-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 text-white rounded font-bold hover:bg-red-700"
                >
                  Save Person Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
