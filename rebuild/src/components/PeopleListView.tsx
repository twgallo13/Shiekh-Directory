import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, User, UserPlus, Mail, Building } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PersonListItem } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Dialog, FormField } from './Dialog';

interface CreatePersonForm {
  fullName: string;
  workEmail: string;
  workPhone: string;
  mobilePhone: string;
}

export function PeopleListView() {
  useDocumentTitle('People');
  
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreatePersonForm>({ fullName: '', workEmail: '', workPhone: '', mobilePhone: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();

  const canManage = authUser?.role === 'Steward' || authUser?.role === 'Admin';
  
  const totalPages = Math.ceil(people.length / PAGE_SIZE);
  const paginatedPeople = people.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  
  useEffect(() => {
    setPage(1);
  }, [searchQuery, showInactive]);

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
            <button onClick={() => navigate('/')} aria-label="Back to directory" className="text-gray-600 hover:text-gray-900 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2">
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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
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
          <>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {paginatedPeople.map((person) => (
                <button
                  key={person.id}
                  onClick={() => navigate(`/person/${person.id}`)}
                  className="w-full bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors text-left min-h-[44px]"
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
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 min-h-[44px]"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600 px-4">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 min-h-[44px]"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <CreatePersonDialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        createForm={createForm}
        setCreateForm={setCreateForm}
        creating={creating}
        onSubmit={handleCreate}
      />
    </div>
  );
}

interface CreatePersonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  createForm: CreatePersonForm;
  setCreateForm: (form: CreatePersonForm) => void;
  creating: boolean;
  onSubmit: () => void;
}

function CreatePersonDialog({ isOpen, onClose, createForm, setCreateForm, creating, onSubmit }: CreatePersonDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  const dialogFooter = (
    <div className="flex gap-3">
      <button
        onClick={onClose}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]"
      >
        Cancel
      </button>
      <button
        onClick={onSubmit}
        disabled={creating || !createForm.fullName.trim()}
        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
      >
        {creating ? 'Creating...' : 'Create'}
      </button>
    </div>
  );
  
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Add Person"
      footer={dialogFooter}
      size="md"
      triggerRef={triggerRef}
    >
      <div className="space-y-4">
        <FormField id="create-person-name" label="Full Name" required>
          <input
            id="create-person-name"
            type="text"
            value={createForm.fullName}
            onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            placeholder="John Smith"
          />
        </FormField>
        <FormField id="create-person-email" label="Work Email">
          <input
            id="create-person-email"
            type="email"
            value={createForm.workEmail}
            onChange={(e) => setCreateForm({ ...createForm, workEmail: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            placeholder="jsmith@shiekh.com"
          />
        </FormField>
        <FormField id="create-person-work-phone" label="Work Phone">
          <input
            id="create-person-work-phone"
            type="tel"
            value={createForm.workPhone}
            onChange={(e) => setCreateForm({ ...createForm, workPhone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            placeholder="(555) 123-4567"
          />
        </FormField>
        <FormField id="create-person-mobile" label="Mobile Phone">
          <input
            id="create-person-mobile"
            type="tel"
            value={createForm.mobilePhone}
            onChange={(e) => setCreateForm({ ...createForm, mobilePhone: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
            placeholder="(555) 987-6543"
          />
        </FormField>
      </div>
    </Dialog>
  );
}
