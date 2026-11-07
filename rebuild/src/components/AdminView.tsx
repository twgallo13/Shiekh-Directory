import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Key, Settings, Plus, Copy, Check, X, Loader2, AlertTriangle, Eye, EyeOff, Trash2, Upload, FileSpreadsheet, CheckCircle2, XCircle, RefreshCw, ArrowRight, Mail, History, Clock, Database, Play } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { HoursTemplatesView } from './HoursTemplatesView';
import { EmailSettingsView } from './EmailSettingsView';
import { WorkflowRulesView } from './WorkflowRulesView';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Dialog, FormField } from './Dialog';

type TabId = 'users' | 'api-clients' | 'custom-fields' | 'import' | 'communications' | 'email' | 'workflow-rules' | 'audit-log' | 'hours-templates' | 'backups' | 'data-quality';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  storeLocationId?: string;
  createdAt: string;
}

interface ApiClient {
  id: string;
  name: string;
  scopes: string[];
  active: boolean;
  paused?: boolean;
  pausedAt?: string;
  pausedBy?: string;
  resumedAt?: string;
  resumedBy?: string;
  version: number;
  createdAt: string;
  lastUsedAt?: string;
  rateLimit?: number;
}

interface CustomField {
  id: string;
  name: string;
  type: string;
  options?: string[];
  required: boolean;
  description?: string;
}

interface Store {
  id: string;
  storeNumber: string;
  name: string;
  kind: string;
}

const ROLES = ['Viewer', 'Store', 'Leader', 'Steward', 'Admin'];
const SCOPES = [
  { id: 'locations:read', label: 'Locations (Read)' },
  { id: 'personnel:read', label: 'Personnel (Read)' },
  { id: 'staffing:read', label: 'Staffing (Read)' },
  { id: 'district-leadership:read', label: 'District Leadership (Read)' },
  { id: 'district-leadership:contacts:read', label: 'District Leadership Contacts (Read)' },
];

export function AdminView() {
  useDocumentTitle('Admin');
  
  const [activeTab, setActiveTab] = useState<TabId>('users');
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();

  if (authUser?.role !== 'Admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <p className="mt-4 text-gray-600">Admin access required</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Admin</h1>
          </div>
          <div className="relative mt-3 -mb-px">
            <div className="flex gap-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Admin sections">
              {/* Group 1: Stores */}
              <span className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider pr-2 whitespace-nowrap">Stores</span>
              <TabButton id="data-quality" active={activeTab === 'data-quality'} onClick={setActiveTab} icon={AlertTriangle} panelId="panel-data-quality">
                Data Quality
              </TabButton>
              <TabButton id="hours-templates" active={activeTab === 'hours-templates'} onClick={setActiveTab} icon={Clock} panelId="panel-hours-templates">
                Hours Templates
              </TabButton>
              <span className="w-px bg-gray-200 mx-1 self-stretch" aria-hidden="true" />
              {/* Group 2: Workflows */}
              <span className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider pr-2 whitespace-nowrap">Workflows</span>
              <TabButton id="workflow-rules" active={activeTab === 'workflow-rules'} onClick={setActiveTab} icon={Settings} panelId="panel-workflow-rules">
                Workflow Rules
              </TabButton>
              <span className="w-px bg-gray-200 mx-1 self-stretch" aria-hidden="true" />
              {/* Group 3: Email */}
              <span className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider pr-2 whitespace-nowrap">Email</span>
              <TabButton id="email" active={activeTab === 'email'} onClick={setActiveTab} icon={Mail} panelId="panel-email">
                Settings
              </TabButton>
              <TabButton id="communications" active={activeTab === 'communications'} onClick={setActiveTab} icon={Mail} panelId="panel-communications">
                Send
              </TabButton>
              <span className="w-px bg-gray-200 mx-1 self-stretch" aria-hidden="true" />
              {/* Group 4: People & Access */}
              <span className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider pr-2 whitespace-nowrap">Access</span>
              <TabButton id="users" active={activeTab === 'users'} onClick={setActiveTab} icon={Users} panelId="panel-users">
                Users
              </TabButton>
              <TabButton id="api-clients" active={activeTab === 'api-clients'} onClick={setActiveTab} icon={Key} panelId="panel-api-clients">
                API Clients
              </TabButton>
              <span className="w-px bg-gray-200 mx-1 self-stretch" aria-hidden="true" />
              {/* Group 5: System */}
              <span className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider pr-2 whitespace-nowrap">System</span>
              <TabButton id="custom-fields" active={activeTab === 'custom-fields'} onClick={setActiveTab} icon={Settings} panelId="panel-custom-fields">
                Custom Fields
              </TabButton>
              <TabButton id="import" active={activeTab === 'import'} onClick={setActiveTab} icon={Upload} panelId="panel-import">
                Import
              </TabButton>
              <TabButton id="backups" active={activeTab === 'backups'} onClick={setActiveTab} icon={Database} panelId="panel-backups">
                Backups
              </TabButton>
              <TabButton id="audit-log" active={activeTab === 'audit-log'} onClick={setActiveTab} icon={History} panelId="panel-audit-log">
                Audit Log
              </TabButton>
            </div>
            {/* Scroll hint - gradient fade on right */}
            <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white pointer-events-none sm:hidden" aria-hidden="true" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div id="panel-users" role="tabpanel" aria-labelledby="tab-users" hidden={activeTab !== 'users'}>
          {activeTab === 'users' && <UsersTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-api-clients" role="tabpanel" aria-labelledby="tab-api-clients" hidden={activeTab !== 'api-clients'}>
          {activeTab === 'api-clients' && <ApiClientsTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-custom-fields" role="tabpanel" aria-labelledby="tab-custom-fields" hidden={activeTab !== 'custom-fields'}>
          {activeTab === 'custom-fields' && <CustomFieldsTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-import" role="tabpanel" aria-labelledby="tab-import" hidden={activeTab !== 'import'}>
          {activeTab === 'import' && <ImportTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-communications" role="tabpanel" aria-labelledby="tab-communications" hidden={activeTab !== 'communications'}>
          {activeTab === 'communications' && <CommunicationsTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-email" role="tabpanel" aria-labelledby="tab-email" hidden={activeTab !== 'email'}>
          {activeTab === 'email' && <EmailSettingsView />}
        </div>
        <div id="panel-workflow-rules" role="tabpanel" aria-labelledby="tab-workflow-rules" hidden={activeTab !== 'workflow-rules'}>
          {activeTab === 'workflow-rules' && <WorkflowRulesView />}
        </div>
        <div id="panel-audit-log" role="tabpanel" aria-labelledby="tab-audit-log" hidden={activeTab !== 'audit-log'}>
          {activeTab === 'audit-log' && <AuditLogTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-hours-templates" role="tabpanel" aria-labelledby="tab-hours-templates" hidden={activeTab !== 'hours-templates'}>
          {activeTab === 'hours-templates' && <HoursTemplatesTab />}
        </div>
        <div id="panel-backups" role="tabpanel" aria-labelledby="tab-backups" hidden={activeTab !== 'backups'}>
          {activeTab === 'backups' && <BackupsTab getIdToken={getIdToken} />}
        </div>
        <div id="panel-data-quality" role="tabpanel" aria-labelledby="tab-data-quality" hidden={activeTab !== 'data-quality'}>
          {activeTab === 'data-quality' && <DataQualityTab />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ id, active, onClick, icon: Icon, children, panelId }: {
  id: TabId;
  active: boolean;
  onClick: (id: TabId) => void;
  icon: typeof Users;
  children: React.ReactNode;
  panelId: string;
}) {
  return (
    <button
      id={`tab-${id}`}
      role="tab"
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors min-h-[44px] ${
        active
          ? 'text-blue-700 border-blue-600 bg-blue-50'
          : 'text-gray-700 border-transparent hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {children}
    </button>
  );
}

function UsersTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [users, setUsers] = useState<User[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (roleFilter) params.set('role', roleFilter);
      
      const res = await fetch(`/api/app/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Load users error:', error);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, roleFilter]);

  const loadStores = useCallback(async () => {
    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/admin/stores', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setStores(data.stores || []);
    } catch (error) {
      console.error('Load stores error:', error);
    }
  }, [getIdToken]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadStores(); }, [loadStores]);

  const filteredUsers = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 min-w-[150px] max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            aria-label="Filter by role"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          >
            <option value="">All Roles</option>
            {ROLES.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden md:block bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{user.email}</td>
                    <td className="px-4 py-3 text-gray-600">{user.displayName}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'Steward' ? 'bg-blue-100 text-blue-700' :
                        user.role === 'Leader' ? 'bg-green-100 text-green-700' :
                        user.role === 'Store' ? 'bg-amber-100 text-amber-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="text-blue-600 hover:text-blue-800 text-sm min-h-[44px] min-w-[44px] flex items-center justify-center -m-2"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {filteredUsers.map(user => (
              <div key={user.id} className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 truncate">{user.email}</div>
                    <div className="text-sm text-gray-600 truncate">{user.displayName}</div>
                  </div>
                  <button
                    onClick={() => setEditingUser(user)}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg -m-2"
                  >
                    Edit
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'Steward' ? 'bg-blue-100 text-blue-700' :
                    user.role === 'Leader' ? 'bg-green-100 text-green-700' :
                    user.role === 'Store' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {user.role}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>
                    {user.status || 'active'}
                  </span>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && (
              <div className="bg-white rounded-lg border border-gray-200 px-4 py-8 text-center text-gray-500">
                No users found
              </div>
            )}
          </div>
        </>
      )}

      {showAddModal && (
        <UserModal
          stores={stores}
          getIdToken={getIdToken}
          onClose={() => setShowAddModal(false)}
          onSaved={loadUsers}
        />
      )}
      {editingUser && (
        <UserModal
          user={editingUser}
          stores={stores}
          getIdToken={getIdToken}
          onClose={() => setEditingUser(null)}
          onSaved={loadUsers}
        />
      )}
    </div>
  );
}

function UserModal({ user, stores, getIdToken, onClose, onSaved }: {
  user?: User;
  stores: Store[];
  getIdToken: () => Promise<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState(user?.email || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [role, setRole] = useState(user?.role || 'Viewer');
  const [status, setStatus] = useState(user?.status || 'active');
  const [storeLocationId, setStoreLocationId] = useState(user?.storeLocationId || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const [signInLink, setSignInLink] = useState<{ link: string; expiresAt: string } | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);

  // D3: Admin-only copyable sign-in link while mail is off (expires in 1 hour)
  const handleSignInLink = async (method: 'emailLink' | 'password') => {
    if (!user) return;
    try {
      setLinkLoading(true);
      setError('');
      const token = await getIdToken();
      const res = await fetch(`/api/app/admin/users/${user.id}/signin-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create sign-in link');
      setSignInLink({ link: data.link, expiresAt: data.expiresAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create sign-in link');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      const token = await getIdToken();
      
      const url = user ? `/api/app/admin/users/${user.id}` : '/api/app/admin/users';
      const method = user ? 'PATCH' : 'POST';
      
      const body: Record<string, unknown> = { displayName, role };
      if (!user) body.email = email;
      if (user) body.status = status;
      if (role === 'Store') body.storeLocationId = storeLocationId;

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to save user');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!user) return;
    
    try {
      setDeleting(true);
      setError('');
      const token = await getIdToken();
      
      const res = await fetch(`/api/app/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to delete user');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (showDeleteConfirm) {
    const deleteFooter = (
      <div className="flex justify-end gap-3">
        <button
          onClick={() => setShowDeleteConfirm(false)}
          disabled={deleting}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50 min-h-[44px]"
        >
          {deleting ? 'Deleting...' : 'Delete User'}
        </button>
      </div>
    );

    return (
      <Dialog isOpen={true} onClose={() => setShowDeleteConfirm(false)} title="Delete User" footer={deleteFooter}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-red-600">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-medium">Delete User?</span>
          </div>
          <p className="text-sm text-gray-600">
            This will permanently delete <strong>{user?.email}</strong> and remove their Firebase Auth account. This action cannot be undone.
          </p>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
          )}
        </div>
      </Dialog>
    );
  }

  const footer = (
    <div className="flex items-center justify-between w-full">
      <div>
        {user && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm min-h-[44px]"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 min-h-[44px]"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog isOpen={true} onClose={onClose} title={user ? 'Edit User' : 'Add User'} footer={footer}>
      <div className="space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}
        <FormField id="user-email" label="Email">
          <input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!user}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100 min-h-[44px]"
          />
        </FormField>
        <FormField id="user-displayname" label="Display Name">
          <input
            id="user-displayname"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          />
        </FormField>
        <FormField id="user-role" label="Role">
          <select
            id="user-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          >
            {ROLES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </FormField>
        {role === 'Store' && (
          <FormField id="user-store" label="Store">
            <select
              id="user-store"
              value={storeLocationId}
              onChange={(e) => setStoreLocationId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            >
              <option value="">Select a store...</option>
              {stores.filter(s => s.kind === 'store').map(s => (
                <option key={s.id} value={s.id}>#{s.storeNumber} - {s.name}</option>
              ))}
            </select>
          </FormField>
        )}
        {user && user.role !== 'Store' && (
          <div className="border-t border-gray-200 pt-4">
            <p className="text-sm font-medium text-gray-900">Sign-in link</p>
            <p className="text-xs text-gray-600 mt-1">
              Email is off, so nothing is emailed. Create a one-time link and pass it to the person yourself.
              The passwordless link signs them in directly (they confirm their work email). It is logged and should be used within 1 hour.
            </p>
            {signInLink ? (
              <>
                <TokenDisplay token={signInLink.link} />
                <p className="text-xs text-gray-500 mt-1">Expires {new Date(signInLink.expiresAt).toLocaleString()}</p>
              </>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSignInLink('emailLink')}
                  disabled={linkLoading}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px] disabled:opacity-50"
                >
                  {linkLoading ? 'Creating...' : 'Create passwordless sign-in link'}
                </button>
                <button
                  type="button"
                  onClick={() => handleSignInLink('password')}
                  disabled={linkLoading}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px] disabled:opacity-50"
                >
                  Create set-password link
                </button>
              </div>
            )}
          </div>
        )}
        {user && (
          <FormField id="user-status" label="Status">
            <select
              id="user-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            >
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </FormField>
        )}
      </div>
    </Dialog>
  );
}

function ApiClientsTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newToken, setNewToken] = useState<{ clientId: string; token: string } | null>(null);
  const [editingRateLimit, setEditingRateLimit] = useState<{ client: ApiClient; value: number } | null>(null);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/api-clients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setClients(data.clients || []);
    } catch (error) {
      console.error('Load clients error:', error);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleRevoke = async (clientId: string) => {
    if (!confirm('Are you sure you want to revoke this API client?')) return;
    
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/api-clients/${clientId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        loadClients();
      }
    } catch (error) {
      console.error('Revoke error:', error);
    }
  };

  const handleDelete = async (clientId: string) => {
    if (!confirm('Permanently delete this revoked API client?')) return;
    
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/api-clients/${clientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        loadClients();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const handlePause = async (clientId: string) => {
    if (!confirm('Pause this API client? It can be resumed later without regenerating the token.')) return;
    
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/api-clients/${clientId}/pause`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        loadClients();
      }
    } catch (error) {
      console.error('Pause error:', error);
    }
  };

  const handleResume = async (clientId: string) => {
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/api-clients/${clientId}/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        loadClients();
      }
    } catch (error) {
      console.error('Resume error:', error);
    }
  };

  const handleCreated = (clientId: string, token: string) => {
    setNewToken({ clientId, token });
    setShowAddModal(false);
    loadClients();
  };

  const handleUpdateRateLimit = async () => {
    if (!editingRateLimit) return;
    
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/api-clients/${editingRateLimit.client.id}/rate-limit`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rateLimit: editingRateLimit.value }),
      });
      
      if (res.ok) {
        setEditingRateLimit(null);
        loadClients();
      }
    } catch (error) {
      console.error('Update rate limit error:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Manage API tokens for external integrations
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Create Client
        </button>
      </div>

      {newToken && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-medium text-green-800">API Token Created</h3>
              <p className="text-sm text-green-700 mt-1">
                Copy this token now. It will not be shown again.
              </p>
            </div>
            <button onClick={() => setNewToken(null)} aria-label="Dismiss" className="text-green-600 hover:text-green-800 min-h-[44px] min-w-[44px] flex items-center justify-center -m-2">
              <X className="w-5 h-5" />
            </button>
          </div>
          <TokenDisplay token={newToken.token} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scopes</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rate Limit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Last Used</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {client.scopes.join(', ')}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditingRateLimit({ client, value: client.rateLimit ?? 60 })}
                      className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      disabled={!client.active}
                    >
                      {(client.rateLimit ?? 60) === 0 ? 'Unlimited' : `${client.rateLimit ?? 60}/min`}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      !client.active 
                        ? 'bg-red-100 text-red-700'
                        : client.paused 
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}>
                      {!client.active ? 'Revoked' : client.paused ? 'Paused' : 'Active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {!client.active ? (
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="flex items-center gap-1 text-gray-500 hover:text-red-600 text-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    ) : client.paused ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResume(client.id)}
                          className="text-green-600 hover:text-green-800 text-sm"
                        >
                          Resume
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleRevoke(client.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Revoke
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePause(client.id)}
                          className="text-yellow-600 hover:text-yellow-800 text-sm"
                        >
                          Pause
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleRevoke(client.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No API clients yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <ApiClientModal
          getIdToken={getIdToken}
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}

      {editingRateLimit && (
        <Dialog 
          isOpen={true} 
          onClose={() => setEditingRateLimit(null)} 
          title="Edit Rate Limit"
          size="sm"
          footer={
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setEditingRateLimit(null)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateRateLimit}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 min-h-[44px]"
              >
                Save
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Configure rate limit for <strong>{editingRateLimit.client.name}</strong>
            </p>
            <FormField id="rate-limit-value" label="Requests per minute" hint="Set to 0 for unlimited. Default is 60 requests/min.">
              <input
                id="rate-limit-value"
                type="number"
                min={0}
                max={10000}
                value={editingRateLimit.value}
                onChange={(e) => setEditingRateLimit({ 
                  ...editingRateLimit, 
                  value: parseInt(e.target.value) || 0 
                })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
              />
            </FormField>
          </div>
        </Dialog>
      )}

      {/* API Documentation */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">API Documentation</h3>
              <p className="text-sm text-gray-600 mt-0.5">Interactive documentation for the external API endpoints.</p>
            </div>
            <a
              href="/api-docs"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              View Docs
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function TokenDisplay({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="flex-1 bg-white border border-green-200 rounded px-3 py-2 font-mono text-sm text-gray-800 overflow-x-auto">
        {visible ? token : '•'.repeat(Math.min(token.length, 40))}
      </code>
      <button
        onClick={() => setVisible(!visible)}
        className="p-2 text-gray-500 hover:text-gray-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={visible ? 'Hide token' : 'Show token'}
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        onClick={handleCopy}
        className="p-2 text-green-600 hover:text-green-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={copied ? 'Copied' : 'Copy token'}
        title="Copy"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ApiClientModal({ getIdToken, onClose, onCreated }: {
  getIdToken: () => Promise<string>;
  onClose: () => void;
  onCreated: (clientId: string, token: string) => void;
}) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['locations:read']);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const toggleScope = (scope: string) => {
    setScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (scopes.length === 0) {
      setError('At least one scope is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const token = await getIdToken();
      
      const res = await fetch('/api/app/api-clients', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create client');
      }

      const data = await res.json();
      onCreated(data.client.id, data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onClose}
        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm min-h-[44px]"
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 min-h-[44px]"
      >
        {saving ? 'Creating...' : 'Create'}
      </button>
    </div>
  );

  return (
    <Dialog isOpen={true} onClose={onClose} title="Create API Client" footer={footer}>
      <div className="space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}
        <FormField id="api-client-name" label="Name">
          <input
            id="api-client-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., POS Integration"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          />
        </FormField>
        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">Scopes</legend>
          <div className="space-y-2">
            {SCOPES.map(scope => (
              <label key={scope.id} className="flex items-center gap-2 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.id)}
                  onChange={() => toggleScope(scope.id)}
                  className="rounded border-gray-300 text-blue-600 min-w-[20px] min-h-[20px]"
                />
                <span className="text-sm text-gray-700">{scope.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}

function CustomFieldsTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadFields = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/admin/custom-fields', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setFields(data.fields || []);
    } catch (error) {
      console.error('Load fields error:', error);
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => { loadFields(); }, [loadFields]);

  const handleDelete = async (fieldId: string) => {
    if (!confirm('Are you sure you want to delete this custom field?')) return;
    
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/app/admin/custom-fields/${fieldId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (res.ok) {
        loadFields();
      }
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Define custom metadata fields for locations (available via /api/v1/location-fields)
        </p>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add Field
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Required</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {fields.map(field => (
                <tr key={field.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{field.name}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{field.type}</td>
                  <td className="px-4 py-3">
                    {field.required ? (
                      <Check className="w-4 h-4 text-green-600" />
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {field.description || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(field.id)}
                      className="text-red-600 hover:text-red-800 text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {fields.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No custom fields defined
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <CustomFieldModal
          getIdToken={getIdToken}
          onClose={() => setShowAddModal(false)}
          onSaved={loadFields}
        />
      )}
    </div>
  );
}

function CustomFieldModal({ getIdToken, onClose, onSaved }: {
  getIdToken: () => Promise<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [required, setRequired] = useState(false);
  const [description, setDescription] = useState('');
  const [options, setOptions] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const token = await getIdToken();
      
      const body: Record<string, unknown> = { name, type, required, description };
      if (type === 'select') {
        body.options = options.split(',').map(o => o.trim()).filter(Boolean);
      }

      const res = await fetch('/api/app/admin/custom-fields', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create field');
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onClose}
        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm min-h-[44px]"
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 min-h-[44px]"
      >
        {saving ? 'Creating...' : 'Create'}
      </button>
    </div>
  );

  return (
    <Dialog isOpen={true} onClose={onClose} title="Add Custom Field" footer={footer}>
      <div className="space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
        )}
        <FormField id="field-name" label="Name">
          <input
            id="field-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Mall Name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          />
        </FormField>
        <FormField id="field-type" label="Type">
          <select
            id="field-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="boolean">Yes/No</option>
            <option value="date">Date</option>
            <option value="select">Select (Dropdown)</option>
          </select>
        </FormField>
        {type === 'select' && (
          <FormField id="field-options" label="Options (comma-separated)">
            <input
              id="field-options"
              type="text"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder="Option 1, Option 2, Option 3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            />
          </FormField>
        )}
        <FormField id="field-description" label="Description">
          <input
            id="field-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
          />
        </FormField>
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px]">
          <input
            id="field-required"
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="rounded border-gray-300 text-blue-600 min-w-[20px] min-h-[20px]"
          />
          <span className="text-sm text-gray-700">Required field</span>
        </label>
      </div>
    </Dialog>
  );
}

interface ImportPreview {
  valid: boolean;
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  errorCount: number;
  rows: {
    row: number;
    storeNumber: string;
    action: 'create' | 'update' | 'skip' | 'error';
    message?: string;
    errors?: string[];
    changes?: string[];
  }[];
  timestamp: string;
}

function ImportTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [step, setStep] = useState<'upload' | 'preview' | 'applying' | 'done'>('upload');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    if (file.size > 5_000_000) {
      setError('File size exceeds 5MB limit');
      return;
    }

    const text = await file.text();
    setError('');
    handlePreview(text);
  };

  const handlePreview = async (csv: string) => {
    try {
      setLoading(true);
      setError('');
      const token = await getIdToken();

      const res = await fetch('/api/app/import/legacy/preview', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to preview import');
      }

      const data = await res.json();
      setSessionId(data.sessionId);
      setPreview(data.preview);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!sessionId) return;

    try {
      setApplying(true);
      setStep('applying');
      setError('');
      const token = await getIdToken();

      const res = await fetch(`/api/app/import/legacy/apply/${sessionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to apply import');
      }

      const data = await res.json();
      setResult(data.result);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply');
      setStep('preview');
    } finally {
      setApplying(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setSessionId(null);
    setPreview(null);
    setResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <FileSpreadsheet className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Import Locations from CSV</h2>
            <p className="text-sm text-gray-600">Upload a legacy export CSV to import or update locations</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-600 mb-1">Click to select a CSV file</p>
              <p className="text-xs text-gray-500">or drag and drop</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 mr-2" />
                <span className="text-gray-600">Analyzing CSV...</span>
              </div>
            )}
          </div>
        )}

        {step === 'preview' && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-700">{preview.toCreate}</div>
                <div className="text-sm text-green-600">To Create</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{preview.toUpdate}</div>
                <div className="text-sm text-blue-600">To Update</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">{preview.toSkip}</div>
                <div className="text-sm text-gray-600">No Changes</div>
              </div>
              <div className={`${preview.errorCount > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'} border rounded-lg p-4 text-center`}>
                <div className={`text-2xl font-bold ${preview.errorCount > 0 ? 'text-red-700' : 'text-gray-700'}`}>{preview.errorCount}</div>
                <div className={`text-sm ${preview.errorCount > 0 ? 'text-red-600' : 'text-gray-600'}`}>Errors</div>
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Row</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Store #</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Action</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.rows.slice(0, 50).map((row) => (
                      <tr key={row.row} className={row.action === 'error' ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2 text-gray-600">{row.row}</td>
                        <td className="px-3 py-2 font-mono font-medium">{row.storeNumber}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.action === 'create' ? 'bg-green-100 text-green-700' :
                            row.action === 'update' ? 'bg-blue-100 text-blue-700' :
                            row.action === 'skip' ? 'bg-gray-100 text-gray-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {row.action === 'create' && <Plus className="w-3 h-3" />}
                            {row.action === 'update' && <RefreshCw className="w-3 h-3" />}
                            {row.action === 'error' && <XCircle className="w-3 h-3" />}
                            {row.action}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs">
                          {row.errors?.join('; ') || row.changes?.join('; ') || row.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 50 && (
                <div className="px-3 py-2 bg-gray-50 text-sm text-gray-600 text-center">
                  Showing 50 of {preview.rows.length} rows
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!preview.valid || applying}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {preview.valid ? (
                  <>
                    Apply Import
                    <ArrowRight className="w-4 h-4" />
                  </>
                ) : (
                  'Fix Errors to Continue'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'applying' && (
          <div className="text-center py-12">
            <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600">Applying import changes...</p>
            <p className="text-sm text-gray-500 mt-1">This may take a moment</p>
          </div>
        )}

        {step === 'done' && result && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Import Complete</h3>
            <div className="flex justify-center gap-6 mb-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{result.created}</div>
                <div className="text-sm text-gray-600">Created</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{result.updated}</div>
                <div className="text-sm text-gray-600">Updated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">{result.skipped}</div>
                <div className="text-sm text-gray-600">Skipped</div>
              </div>
            </div>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              Import Another File
            </button>
          </div>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium mb-1">Import Notes</p>
            <ul className="list-disc list-inside space-y-1 text-amber-700">
              <li>Locations are matched by LocationId first, then by StoreNumber</li>
              <li>Store numbers are preserved as-is (including leading zeros like "007")</li>
              <li>An automatic backup is created before applying changes</li>
              <li>Preview shows the first 50 rows - download the full report for large files</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  invitedBy: string;
  invitedByEmail: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
}

function CommunicationsTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Viewer');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const loadInvitations = useCallback(async () => {
    try {
      setLoadingInvitations(true);
      const token = await getIdToken();
      const res = await fetch('/api/app/invitations', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setInvitations(data.invitations || []);
    } catch (error) {
      console.error('Load invitations error:', error);
    } finally {
      setLoadingInvitations(false);
    }
  }, [getIdToken]);

  useEffect(() => { loadInvitations(); }, [loadInvitations]);

  const handleSendInvitation = async () => {
    if (!inviteEmail.trim()) return;
    
    setSending(true);
    setSendError(null);
    
    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/invitations', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          personalMessage: inviteMessage.trim() || undefined,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setSendError(data.error?.message || 'Failed to send invitation');
        return;
      }

      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('Viewer');
      setInviteMessage('');
      loadInvitations();
    } catch (error) {
      setSendError('Failed to send invitation');
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (id: string) => {
    try {
      const token = await getIdToken();
      await fetch(`/api/app/invitations/${id}/resend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadInvitations();
    } catch (error) {
      console.error('Resend error:', error);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invitation?')) return;
    
    try {
      const token = await getIdToken();
      await fetch(`/api/app/invitations/${id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadInvitations();
    } catch (error) {
      console.error('Revoke error:', error);
    }
  };

  const pendingInvitations = invitations.filter(i => i.status === 'pending');

  return (
    <div className="space-y-6">
      {/* User Invitations */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Mail className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">User Invitations</h2>
          </div>
          <button
            onClick={() => setShowInviteModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus className="w-4 h-4" />
            Invite User
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          Send invitation emails to new users. They can sign in with their company Google account.
        </p>

        {loadingInvitations ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-700" />
          </div>
        ) : pendingInvitations.length === 0 ? (
          <div className="text-center py-8 text-gray-700 text-sm">
            No pending invitations
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Expires</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingInvitations.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        inv.role === 'Admin' ? 'bg-red-100 text-red-700' :
                        inv.role === 'Steward' ? 'bg-purple-100 text-purple-700' :
                        inv.role === 'Leader' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {inv.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(inv.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResend(inv.id)}
                          className="text-blue-600 hover:text-blue-800 text-xs"
                        >
                          Resend
                        </button>
                        <span className="text-gray-300">|</span>
                        <button
                          onClick={() => handleRevoke(inv.id)}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Templates - Read-only preview */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Email Templates</h2>
        </div>
        <p className="text-sm text-gray-700 mb-4">
          Preview of built-in email templates used for store verification.
        </p>
        <div className="space-y-3">
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">Verification Request</h3>
              <span className="text-xs text-gray-700 bg-white px-2 py-1 rounded border">Built-in</span>
            </div>
            <p className="text-sm text-gray-700">
              Sent to store shared inbox when hours verification is requested.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">Verification Reminder</h3>
              <span className="text-xs text-gray-700 bg-white px-2 py-1 rounded border">Built-in</span>
            </div>
            <p className="text-sm text-gray-700">
              Sent 3 days after initial request if store has not responded.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">Verification Confirmation</h3>
              <span className="text-xs text-gray-700 bg-white px-2 py-1 rounded border">Built-in</span>
            </div>
            <p className="text-sm text-gray-700">
              Sent to store after steward approves their verification response.
            </p>
          </div>
        </div>
      </div>

      {/* Email Sending Settings - Current Mode */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Email Sending Settings</h2>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="font-medium text-amber-800">Current Mode</span>
          </div>
          <p className="text-sm text-amber-700">
            <strong>Log-only</strong> — emails are not sent until cut-over is enabled.
          </p>
          <p className="text-xs text-amber-800 mt-2">
            Set <code className="bg-amber-100 px-1 py-0.5 rounded">MAIL_CUTOVER_ENABLED=true</code> to enable sending.
          </p>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <Dialog
          isOpen={true}
          onClose={() => setShowInviteModal(false)}
          title="Invite User"
          footer={
            <div className="flex gap-3 w-full">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvitation}
                disabled={sending || !inviteEmail.trim()}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
              >
                {sending ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            {sendError && (
              <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                {sendError}
              </div>
            )}
            <FormField id="invite-email" label="Email Address" hint="Must be a company email address">
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@shiekhshoes.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-h-[44px]"
              />
            </FormField>
            <FormField id="invite-role" label="Role">
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm min-h-[44px]"
              >
                <option value="Viewer">Viewer - View only access</option>
                <option value="Leader">Leader - Manage assigned district</option>
                <option value="Steward">Steward - Manage verifications</option>
                <option value="Admin">Admin - Full access</option>
              </select>
            </FormField>
            <FormField id="invite-message" label="Personal Message (optional)">
              <textarea
                id="invite-message"
                value={inviteMessage}
                onChange={(e) => setInviteMessage(e.target.value)}
                placeholder="Add a personal note to the invitation email..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm resize-none"
              />
            </FormField>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function HoursTemplatesTab() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <HoursTemplatesView />
    </div>
  );
}

interface Snapshot {
  id: string;
  createdAt: string;
  createdBy: string;
  createdByEmail?: string;
  chunkCount?: number;
  collections?: string[];
  status: string;
  documentCount?: number;
}

interface DrillReport {
  drillId: string;
  snapshotId: string;
  startedAt: string;
  completedAt: string;
  status: 'success' | 'failure' | 'partial';
  totalExpected: number;
  totalRestored: number;
}

function BackupsTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [drillReports, setDrillReports] = useState<DrillReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runningDrill, setRunningDrill] = useState<string | null>(null);
  const [deletingSnapshot, setDeletingSnapshot] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      
      const [snapshotsRes, drillsRes] = await Promise.all([
        fetch('/api/app/backups/snapshots', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/app/restore-drill/reports', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (snapshotsRes.ok) {
        const data = await snapshotsRes.json();
        setSnapshots(data.snapshots || []);
      }
      if (drillsRes.ok) {
        const data = await drillsRes.json();
        setDrillReports(data.data || []);
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const createSnapshot = async () => {
    try {
      setCreating(true);
      setError(null);
      const token = await getIdToken();
      const res = await fetch('/api/app/backups/snapshots', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ note: 'Manual snapshot from Admin UI' }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to create snapshot');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create snapshot');
    } finally {
      setCreating(false);
    }
  };

  const runDrill = async (snapshotId: string) => {
    try {
      setRunningDrill(snapshotId);
      setError(null);
      const token = await getIdToken();
      const res = await fetch('/api/app/restore-drill/run', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snapshotId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to run drill');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run drill');
    } finally {
      setRunningDrill(null);
    }
  };

  const deleteSnapshot = async (snapshotId: string) => {
    try {
      setDeletingSnapshot(snapshotId);
      setError(null);
      const token = await getIdToken();
      const res = await fetch(`/api/app/backups/snapshots/${snapshotId}?confirm=true`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Failed to delete snapshot');
      }

      setConfirmDelete(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete snapshot');
    } finally {
      setDeletingSnapshot(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-700" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Snapshots</h2>
            <p className="text-sm text-gray-700">On-demand snapshots for restore drills</p>
          </div>
          <button
            onClick={createSnapshot}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Snapshot
          </button>
        </div>

        {snapshots.length === 0 ? (
          <p className="text-gray-700 text-sm">No snapshots yet. Create one to test restore drills.</p>
        ) : (
          <div className="space-y-2">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{snapshot.id}</p>
                  <p className="text-sm text-gray-700">
                    {new Date(snapshot.createdAt).toLocaleString()} • {snapshot.documentCount ?? '?'} docs • {snapshot.collections?.length || '?'} collections
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => runDrill(snapshot.id)}
                    disabled={runningDrill === snapshot.id}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-700 text-white rounded hover:bg-green-800 disabled:opacity-50"
                  >
                    {runningDrill === snapshot.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                    Run Drill
                  </button>
                  <button
                    onClick={() => setConfirmDelete(snapshot)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
                    title="Delete snapshot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Drill Reports</h2>
        {drillReports.length === 0 ? (
          <p className="text-gray-700 text-sm">No drills have been run yet.</p>
        ) : (
          <div className="space-y-2">
            {drillReports.map((report) => (
              <div
                key={report.drillId}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">{report.drillId}</p>
                  <p className="text-sm text-gray-700">
                    Snapshot: {report.snapshotId} • {new Date(report.completedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-700">
                    {report.totalRestored}/{report.totalExpected} docs
                  </span>
                  <span
                    className={`px-2 py-1 text-xs font-semibold rounded ${
                      report.status === 'success'
                        ? 'bg-green-100 text-green-700'
                        : report.status === 'partial'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {report.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {confirmDelete && (
        <Dialog
          isOpen={true}
          onClose={() => setConfirmDelete(null)}
          title="Delete Snapshot"
          footer={
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={deletingSnapshot === confirmDelete.id}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteSnapshot(confirmDelete.id)}
                disabled={deletingSnapshot === confirmDelete.id}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50 min-h-[44px]"
              >
                {deletingSnapshot === confirmDelete.id ? 'Deleting...' : 'Delete Snapshot'}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <span className="font-medium">Permanently delete this snapshot?</span>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="font-medium text-gray-900">{confirmDelete.id}</p>
              <p className="text-sm text-gray-600 mt-1">
                {confirmDelete.documentCount ?? '?'} documents • {confirmDelete.collections?.length || '?'} collections
              </p>
              <p className="text-sm text-gray-500">
                Created {new Date(confirmDelete.createdAt).toLocaleString()}
              </p>
            </div>
            <p className="text-sm text-gray-600">
              This action cannot be undone. The snapshot and all its data chunks will be permanently deleted.
            </p>
          </div>
        </Dialog>
      )}
    </div>
  );
}

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName: string;
  changes: { field: string; oldValue?: string | number | boolean | null; newValue?: string | number | boolean | null }[];
}

const ENTITY_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'location', label: 'Location' },
  { value: 'person', label: 'Person' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'closure', label: 'Closure' },
  { value: 'correction', label: 'Correction' },
  { value: 'verification', label: 'Verification' },
  { value: 'hours-template', label: 'Hours Template' },
  { value: 'notice', label: 'Notice' },
  { value: 'user', label: 'User' },
  { value: 'store-auth', label: 'Store Auth' },
  { value: 'invitation', label: 'Invitation' },
  { value: 'api-client', label: 'API Client' },
];

function AuditLogTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [limit, setLimit] = useState(50);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const fetchAuditLog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      params.set('limit', String(limit));
      
      const response = await fetch(`/api/app/audit?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to load audit log');
      }
      
      const data = await response.json();
      setEntries(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, entityTypeFilter, limit]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

  const formatTimestamp = (ts: string) => {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAction = (action: string) => {
    return action.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const formatValue = (value: string | number | boolean | null | undefined) => {
    if (value === null || value === undefined) return <span className="text-gray-400 italic">null</span>;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' && value.length > 60) return value.slice(0, 60) + '...';
    return String(value);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Audit Log</h2>
          <p className="text-sm text-gray-700">Track who made changes, when, and what changed.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FormField id="audit-entity-type" label="Filter by type">
            <select
              id="audit-entity-type"
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            >
              {ENTITY_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </FormField>
          <FormField id="audit-limit" label="Show">
            <select
              id="audit-limit"
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </FormField>
          <button
            onClick={fetchAuditLog}
            disabled={loading}
            aria-label="Refresh audit log"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-sm min-h-[44px] mt-6"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-700 mx-auto mb-2" />
          <p className="text-gray-700">Loading audit log...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <History className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-700">No audit entries found</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {entries.map(entry => (
            <div key={entry.id} className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{formatAction(entry.action)}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                      entry.entityType === 'location' ? 'bg-blue-100 text-blue-700' :
                      entry.entityType === 'person' ? 'bg-green-100 text-green-700' :
                      entry.entityType === 'verification' ? 'bg-purple-100 text-purple-700' :
                      entry.entityType === 'closure' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {entry.entityType}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    <span className="font-medium">{entry.entityName}</span>
                    {entry.entityId && <span className="text-gray-500 ml-1 text-xs">({entry.entityId.slice(0, 8)}...)</span>}
                  </div>
                  <div className="mt-1 text-xs text-gray-700">
                    by <span className="font-medium">{entry.userEmail}</span>
                    <span className="mx-1">•</span>
                    <span className={`px-1.5 py-0.5 rounded ${
                      entry.userRole === 'Admin' ? 'bg-purple-50 text-purple-600' :
                      entry.userRole === 'Steward' ? 'bg-blue-50 text-blue-600' :
                      entry.userRole === 'Leader' ? 'bg-green-50 text-green-600' :
                      'bg-gray-50 text-gray-600'
                    }`}>{entry.userRole}</span>
                  </div>
                </div>
                <div className="text-sm text-gray-500 whitespace-nowrap">
                  {formatTimestamp(entry.timestamp)}
                </div>
              </div>

              {entry.changes && entry.changes.length > 0 && (
                <div className="mt-3">
                  <button
                    onClick={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
                    className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 min-h-[44px]"
                  >
                    {expandedEntry === entry.id ? 'Hide' : 'Show'} {entry.changes.length} change{entry.changes.length !== 1 ? 's' : ''}
                  </button>
                  {expandedEntry === entry.id && (
                    <div className="mt-2 bg-gray-50 rounded-lg p-3 space-y-2">
                      {entry.changes.map((change, idx) => (
                        <div key={idx} className="text-xs grid grid-cols-[100px_1fr_1fr] gap-2">
                          <span className="font-medium text-gray-700">{change.field}</span>
                          <div className="text-red-600 line-through">{formatValue(change.oldValue)}</div>
                          <div className="text-green-600">{formatValue(change.newValue)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataQualityTab() {
  const { user } = useAuth();
  const [lastDrill, setLastDrill] = useState<{
    drillId: string;
    completedAt: string;
    status: string;
    totalExpected: number;
    totalRestored: number;
  } | null>(null);
  const [loadingDrill, setLoadingDrill] = useState(true);

  useEffect(() => {
    async function fetchLastDrill() {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/app/admin/last-drill', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setLastDrill(data.lastDrill);
        }
      } catch {
        // Ignore errors - drill status is optional
      } finally {
        setLoadingDrill(false);
      }
    }
    fetchLastDrill();
  }, [user]);

  return (
    <div className="space-y-6">
      <div className="border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Stale Stores</h3>
        <p className="text-sm text-gray-700 mb-4">
          Identify stores with verification older than the configured threshold or never verified. Leaders see only stores in their district.
        </p>
        <a
          href="/stale-stores"
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 min-h-[44px]"
        >
          View Stale Stores
        </a>
      </div>

      <div className="border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Restore Drill Status</h3>
        <p className="text-sm text-gray-700 mb-4">
          Periodic restore drills validate backup integrity without affecting production data.
        </p>
        {loadingDrill ? (
          <p className="text-sm text-gray-700">Loading drill status...</p>
        ) : lastDrill ? (
          <div className="bg-gray-50 rounded-md p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Last Drill:</span>
              <span className="text-sm text-gray-900">{lastDrill.drillId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Completed:</span>
              <span className="text-sm text-gray-900">{new Date(lastDrill.completedAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Status:</span>
              <span className={`text-sm font-semibold ${lastDrill.status === 'success' ? 'text-green-600' : lastDrill.status === 'partial' ? 'text-amber-600' : 'text-red-600'}`}>
                {lastDrill.status.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Documents Validated:</span>
              <span className="text-sm text-gray-900">{lastDrill.totalRestored} / {lastDrill.totalExpected}</span>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
            <p className="text-sm text-amber-800">No restore drills have been run yet.</p>
            <p className="text-xs text-amber-600 mt-1">Run: npx ts-node scripts/restore-drill.ts --project shiekh-directory-v2 --snapshot &lt;id&gt;</p>
          </div>
        )}
      </div>
    </div>
  );
}
