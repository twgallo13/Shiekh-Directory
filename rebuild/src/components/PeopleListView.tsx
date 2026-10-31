import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, User, UserPlus, Mail, X, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PersonListItem } from '../types';

interface CreatePersonForm {
  fullName: string;
  workEmail: string;
  workPhone: string;
  mobilePhone: string;
}

export function PeopleListView() {
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePersonForm>({ fullName: '', workEmail: '', workPhone: '', mobilePhone: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();

  const canManage = authUser?.role === 'Steward' || authUser?.role === 'Admin';

  const fetchPeople = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (searchQuery) params.set('search', searchQuery);
      params.set('lifecycle', showInactive ? 'all' : 'active');

      const response = await fetch(`/api/app/people?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch people');
      const { data } = await response.json();
      setPeople(data);
    } catch (err) {
      console.error('Fetch people error:', err);
      setError('Failed to load people');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, searchQuery, showInactive]);

  useEffect(() => {
    fetchPeople();
  }, [fetchPeople]);

  const handleCreate = async () => {
    if (!createForm.fullName.trim()) return;

    try {
      setCreating(true);
      const token = await getIdToken();
      const response = await fetch('/api/app/people', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(createForm),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to create person');
      }

      const { data } = await response.json();
      setShowCreateModal(false);
      setCreateForm({ fullName: '', workEmail: '', workPhone: '', mobilePhone: '' });
      navigate(`/person/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create person');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
      <header className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-900 lg:hidden">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">People</h1>
            {canManage && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <UserPlus className="w-4 h-4" />
                Add Person
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 lg:p-6">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-gray-300"
            />
            Show inactive
          </label>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          </div>
        ) : people.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            {searchQuery ? 'No people match your search' : 'No people found'}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => (
              <button
                key={person.id}
                onClick={() => navigate(`/person/${person.id}`)}
                className="w-full bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{person.fullName}</span>
                      {person.lifecycle === 'inactive' && (
                        <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">Inactive</span>
                      )}
                    </div>
                    {person.workEmail && (
                      <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="truncate">{person.workEmail}</span>
                      </div>
                    )}
                    {person.primaryRole && (
                      <div className="flex items-center gap-1 text-sm text-blue-600 mt-1">
                        <Building className="w-3.5 h-3.5" />
                        <span>{person.primaryRole} - {person.primaryScopeName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Person</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
                <input
                  type="email"
                  value={createForm.workEmail}
                  onChange={(e) => setCreateForm({ ...createForm, workEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="jsmith@shiekh.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Phone</label>
                <input
                  type="tel"
                  value={createForm.workPhone}
                  onChange={(e) => setCreateForm({ ...createForm, workPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                <input
                  type="tel"
                  value={createForm.mobilePhone}
                  onChange={(e) => setCreateForm({ ...createForm, mobilePhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="(555) 987-6543"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.fullName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
