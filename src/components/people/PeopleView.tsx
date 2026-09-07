import React, { useState } from 'react';
import { useDirectory } from '../../context/DirectoryContext';
import { Person } from '../../types';
import { Search, Plus, User, Phone, Mail, MapPin } from 'lucide-react';
import { PrivacyBadge } from '../common/StatusBadge';

interface PeopleViewProps {
  onSelectPerson: (person: Person) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ onSelectPerson }) => {
  const { people, currentUser, addPerson } = useDirectory();
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [isAddingPerson, setIsAddingPerson] = useState(false);

  // New person form state
  const [newName, setNewName] = useState('');
  const [newTitle, setNewTitle] = useState('Store Manager');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDistrict, setNewDistrict] = useState('');

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

  const handleCreatePerson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    addPerson({
      fullName: newName.trim(),
      name: newName.trim(),
      jobTitle: newTitle,
      role: newTitle,
      phone: newPhone.trim(),
      workPhone: newPhone.trim(),
      email: newEmail.trim(),
      workEmail: newEmail.trim(),
      district: newDistrict.trim() || undefined,
      status: 'Active',
      activeStatus: true,
      phonePrivacy: 'Internal'
    });

    setNewName('');
    setNewPhone('');
    setNewEmail('');
    setNewDistrict('');
    setIsAddingPerson(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Canonical Personnel Directory</h2>
          <p className="text-xs text-neutral-500">Manage field leadership, store managers, and corporate contacts</p>
        </div>

        {canAdd && (
          <button
            type="button"
            onClick={() => setIsAddingPerson(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Person</span>
          </button>
        )}
      </div>

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(person => (
          <div
            key={person.id}
            onClick={() => onSelectPerson(person)}
            className="p-4 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 cursor-pointer transition-all hover:shadow-sm space-y-3 shadow-xs"
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
                <span className="font-mono text-neutral-700">{person.phone || person.workPhone || 'No direct phone'}</span>
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
          </div>
        ))}
      </div>

      {/* Modal to Add Person */}
      {isAddingPerson && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl max-w-md w-full p-5 shadow-xl">
            <h3 className="text-base font-bold text-neutral-900 mb-3">Add Personnel to Directory</h3>
            <form onSubmit={handleCreatePerson} className="space-y-3 text-xs">
              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Full Name *</label>
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
                <label className="block text-neutral-700 font-semibold mb-1">Job Title / Role</label>
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
                <label className="block text-neutral-700 font-semibold mb-1">Work Phone Number</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs font-mono focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Work Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@shiekhshoes.com"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-neutral-700 font-semibold mb-1">Assigned Territory / District (Optional)</label>
                <input
                  type="text"
                  value={newDistrict}
                  onChange={(e) => setNewDistrict(e.target.value)}
                  placeholder="e.g. Inland Empire & Desert"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-neutral-900 text-xs focus:outline-none focus:border-red-500 focus:bg-white"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingPerson(false)}
                  className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 rounded-lg text-neutral-700 font-semibold cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
