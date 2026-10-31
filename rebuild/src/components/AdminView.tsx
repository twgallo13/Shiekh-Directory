import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Key, Settings, Plus, Copy, Check, X, Loader2, AlertTriangle, Eye, EyeOff, Trash2, Upload, FileSpreadsheet, CheckCircle2, XCircle, RefreshCw, ArrowRight, Mail, History, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ComingSoonPlaceholder, ComingSoonSection } from './ComingSoonPlaceholder';
import { HoursTemplatesView } from './HoursTemplatesView';

type TabId = 'users' | 'api-clients' | 'custom-fields' | 'import' | 'communications' | 'audit-log' | 'hours-templates';

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
  version: number;
  createdAt: string;
  lastUsedAt?: string;
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
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">Admin</h1>
            </div>
          </div>
          <div className="flex gap-1 mt-3 -mb-px overflow-x-auto">
            <TabButton id="users" active={activeTab === 'users'} onClick={setActiveTab} icon={Users}>
              Users
            </TabButton>
            <TabButton id="api-clients" active={activeTab === 'api-clients'} onClick={setActiveTab} icon={Key}>
              API Clients
            </TabButton>
            <TabButton id="custom-fields" active={activeTab === 'custom-fields'} onClick={setActiveTab} icon={Settings}>
              Custom Fields
            </TabButton>
            <TabButton id="import" active={activeTab === 'import'} onClick={setActiveTab} icon={Upload}>
              Import
            </TabButton>
            <TabButton id="communications" active={activeTab === 'communications'} onClick={setActiveTab} icon={Mail}>
              Communications
            </TabButton>
            <TabButton id="audit-log" active={activeTab === 'audit-log'} onClick={setActiveTab} icon={History}>
              Audit Log
            </TabButton>
            <TabButton id="hours-templates" active={activeTab === 'hours-templates'} onClick={setActiveTab} icon={Clock}>
              Hours Templates
            </TabButton>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === 'users' && <UsersTab getIdToken={getIdToken} />}
        {activeTab === 'api-clients' && <ApiClientsTab getIdToken={getIdToken} />}
        {activeTab === 'custom-fields' && <CustomFieldsTab getIdToken={getIdToken} />}
        {activeTab === 'import' && <ImportTab getIdToken={getIdToken} />}
        {activeTab === 'communications' && <CommunicationsTab />}
        {activeTab === 'audit-log' && <AuditLogTab />}
        {activeTab === 'hours-templates' && <HoursTemplatesTab />}
      </div>
    </div>
  );
}

function TabButton({ id, active, onClick, icon: Icon, children }: {
  id: TabId;
  active: boolean;
  onClick: (id: TabId) => void;
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
        active
          ? 'text-blue-600 border-blue-600 bg-blue-50/50'
          : 'text-gray-600 border-transparent hover:text-gray-900 hover:bg-gray-50'
      }`}
    >
      <Icon className="w-4 h-4" />
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
            className="flex-1 min-w-[150px] max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Roles</option>
            {ROLES.map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">{user ? 'Edit User' : 'Add User'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {showDeleteConfirm ? (
          <div className="p-4 space-y-4">
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
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete User'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!!user}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              {role === 'Store' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Store</label>
                  <select
                    value={storeLocationId}
                    onChange={(e) => setStoreLocationId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">Select a store...</option>
                    {stores.filter(s => s.kind === 'store').map(s => (
                      <option key={s.id} value={s.id}>#{s.storeNumber} - {s.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {user && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div>
                {user && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ApiClientsTab({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newToken, setNewToken] = useState<{ clientId: string; token: string } | null>(null);

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

  const handleCreated = (clientId: string, token: string) => {
    setNewToken({ clientId, token });
    setShowAddModal(false);
    loadClients();
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
            <button onClick={() => setNewToken(null)} className="text-green-600 hover:text-green-800">
              <X className="w-5 h-5" />
            </button>
          </div>
          <TokenDisplay token={newToken.token} />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Scopes</th>
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
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      client.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {client.active ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {client.active ? (
                      <button
                        onClick={() => handleRevoke(client.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDelete(client.id)}
                        className="flex items-center gap-1 text-gray-500 hover:text-red-600 text-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
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

      {/* Planned API features */}
      <div className="space-y-3 mt-6 pt-6 border-t border-gray-200">
        <ComingSoonPlaceholder
          title="Edit Client Permissions"
          description="Modify scopes and access settings for existing API clients."
        />
        <ComingSoonPlaceholder
          title="Pause / Resume Clients"
          description="Temporarily disable an API client without revoking its token."
        />
        <ComingSoonPlaceholder
          title="API Documentation"
          description="Interactive documentation for the external API endpoints."
        />
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
        className="p-2 text-gray-500 hover:text-gray-700"
        title={visible ? 'Hide' : 'Show'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        onClick={handleCopy}
        className="p-2 text-green-600 hover:text-green-700"
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Create API Client</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., POS Integration"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scopes</label>
            <div className="space-y-2">
              {SCOPES.map(scope => (
                <label key={scope.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope.id)}
                    onChange={() => toggleScope(scope.id)}
                    className="rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-sm text-gray-700">{scope.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
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
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
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
                      <span className="text-gray-400">-</span>
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Add Custom Field</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mall Name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Yes/No</option>
              <option value="date">Date</option>
              <option value="select">Select (Dropdown)</option>
            </select>
          </div>
          {type === 'select' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Options (comma-separated)</label>
              <input
                type="text"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="rounded border-gray-300 text-blue-600"
            />
            <span className="text-sm text-gray-700">Required field</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
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
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
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

function CommunicationsTab() {
  return (
    <div className="space-y-6">
      {/* Email Templates - Read-only preview */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Email Templates</h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Preview of built-in email templates used for store verification.
        </p>
        <div className="space-y-3">
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">Verification Request</h3>
              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border">Built-in</span>
            </div>
            <p className="text-sm text-gray-600">
              Sent to store shared inbox when hours verification is requested.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">Verification Reminder</h3>
              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border">Built-in</span>
            </div>
            <p className="text-sm text-gray-600">
              Sent 3 days after initial request if store has not responded.
            </p>
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-800">Verification Confirmation</h3>
              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded border">Built-in</span>
            </div>
            <p className="text-sm text-gray-600">
              Sent to store after steward approves their verification response.
            </p>
          </div>
        </div>
      </div>

      {/* Email Sending Settings - Current Mode */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-5 h-5 text-gray-600" />
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
          <p className="text-xs text-amber-600 mt-2">
            Set <code className="bg-amber-100 px-1 py-0.5 rounded">MAIL_CUTOVER_ENABLED=true</code> to enable sending.
          </p>
        </div>
      </div>

      {/* Planned Features */}
      <div className="space-y-4">
        <ComingSoonPlaceholder
          title="Notification Rules"
          description="Configure when and how notifications are sent for different events."
        />
        <ComingSoonPlaceholder
          title="Sent Mail Log"
          description="View history of all sent emails with delivery status and timestamps."
        />
        <ComingSoonPlaceholder
          title="User Invitations"
          description="Send invitation emails to new users to set up their accounts."
        />
      </div>
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

function AuditLogTab() {
  return (
    <div className="space-y-6">
      <ComingSoonSection
        title="All-Store Audit Log"
        description="View a unified timeline of all changes across all stores, including hours edits, closures, assignments, and verification responses."
      />
      
      <div className="space-y-6">
        <div className="border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Data Quality / Stale Stores</h3>
          <p className="text-sm text-gray-600 mb-4">
            Identify stores with verification older than 90 days or never verified. Leaders see only stores in their district.
          </p>
          <a
            href="/stale-stores"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          >
            View Stale Stores
          </a>
        </div>

        <DrillStatusCard />
      </div>
    </div>
  );
}

function DrillStatusCard() {
  const { user } = useAuth();
  const [lastDrill, setLastDrill] = useState<{
    drillId: string;
    completedAt: string;
    status: string;
    totalExpected: number;
    totalRestored: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

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
        setLoading(false);
      }
    }
    fetchLastDrill();
  }, [user]);

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Restore Drill Status</h3>
      <p className="text-sm text-gray-600 mb-4">
        Periodic restore drills validate backup integrity without affecting production data.
        See <a href="https://github.com/shiekh-directory/docs/restore-drill.md" className="text-blue-600 underline">restore-drill.md</a> for the runbook.
      </p>
      {loading ? (
        <p className="text-sm text-gray-500">Loading drill status...</p>
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
  );
}
