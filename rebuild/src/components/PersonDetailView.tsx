import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, User, Mail, Phone, Briefcase, MapPin, Building, AlertTriangle, Edit2, Plus, X, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PersonDetail, PersonAssignment, Region, District, LocationListItem } from '../types';
import { canViewMobilePhones } from '../lib/permissions';

const ROLE_LABELS: Record<string, string> = {
  SM: 'Store Manager',
  ASM: 'Assistant Store Manager',
  KH: 'Key Holder',
  DM: 'District Manager',
  RM: 'Regional Manager',
  OTHER: 'Other',
};

const SCOPE_ICONS: Record<string, typeof MapPin> = {
  location: MapPin,
  district: Building,
  region: Building,
};

function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function AssignmentCard({ 
  assignment, 
  onEnd, 
  canManage 
}: { 
  assignment: PersonAssignment;
  onEnd: (id: string) => void;
  canManage: boolean;
}) {
  const ScopeIcon = SCOPE_ICONS[assignment.scopeType] || Briefcase;
  
  return (
    <div className={`p-3 rounded-lg border ${assignment.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">
              {ROLE_LABELS[assignment.role] || assignment.role}
            </span>
            {assignment.slot === 'primary' ? (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Primary</span>
            ) : (
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                {assignment.label || 'Additional'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
            <ScopeIcon className="w-3.5 h-3.5" />
            {assignment.scopeType === 'location' ? (
              <Link 
                to={`/location/${assignment.scopeId}`}
                className="text-blue-600 hover:underline"
              >
                {assignment.scopeName}
              </Link>
            ) : (
              <span>{assignment.scopeName}</span>
            )}
          </div>
        </div>
        {assignment.isActive && canManage && (
          <button
            onClick={(e) => { e.stopPropagation(); onEnd(assignment.id); }}
            className="p-1 text-gray-400 hover:text-red-600"
            title="End assignment"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {!assignment.isActive && (
          <span className="text-xs text-gray-500">Ended</span>
        )}
      </div>
      <div className="mt-2 text-xs text-gray-500">
        {assignment.startDate}
        {assignment.endDate && ` – ${assignment.endDate}`}
      </div>
    </div>
  );
}

interface EditPersonForm {
  fullName: string;
  workEmail: string;
  workPhone: string;
  mobilePhone: string;
  version: number;
}

interface NewAssignmentForm {
  role: string;
  scopeType: 'location' | 'district' | 'region';
  scopeId: string;
  slot: 'primary' | 'coverage';
  label: string;
  startDate: string;
}

export function PersonDetailView() {
  const { id } = useParams<{ id: string }>();
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [editForm, setEditForm] = useState<EditPersonForm>({ fullName: '', workEmail: '', workPhone: '', mobilePhone: '', version: 1 });
  const [assignForm, setAssignForm] = useState<NewAssignmentForm>({ role: 'SM', scopeType: 'location', scopeId: '', slot: 'primary', label: '', startDate: '' });
  const [saving, setSaving] = useState(false);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();
  const canViewMobile = authUser ? canViewMobilePhones(authUser) : false;
  const canManage = authUser?.role === 'Steward' || authUser?.role === 'Admin';
  
  const fetchPerson = useCallback(async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      
      const response = await fetch(`/api/app/people/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          setError('Person not found');
        } else {
          setError('Failed to load person');
        }
        return;
      }
      
      const { data } = await response.json();
      setPerson(data);
      setEditForm({
        fullName: data.fullName,
        workEmail: data.workEmail || '',
        workPhone: data.workPhone || '',
        mobilePhone: data.mobilePhone || '',
        version: data.version || 1,
      });
    } catch {
      setError('Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [id, getIdToken]);

  const fetchScopes = useCallback(async () => {
    try {
      const token = await getIdToken();
      const [regionsRes, districtsRes, locationsRes] = await Promise.all([
        fetch('/api/app/regions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/app/districts', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/app/locations?kind=store', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (regionsRes.ok) {
        const { data } = await regionsRes.json();
        setRegions(data || []);
      }
      if (districtsRes.ok) {
        const { data } = await districtsRes.json();
        setDistricts(data || []);
      }
      if (locationsRes.ok) {
        const { data } = await locationsRes.json();
        setLocations(data || []);
      }
    } catch (err) {
      console.error('Failed to load scopes:', err);
    }
  }, [getIdToken]);
  
  useEffect(() => {
    fetchPerson();
    fetchScopes();
  }, [fetchPerson, fetchScopes]);

  const handleSaveEdit = async () => {
    if (!person || !editForm.fullName.trim()) return;
    
    setSaving(true);
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/people/${person.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editForm),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to update');
      }

      setShowEditModal(false);
      await fetchPerson();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignment = async () => {
    if (!person || !assignForm.scopeId) return;
    
    setSaving(true);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/assignments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personId: person.id,
          role: assignForm.role,
          scopeType: assignForm.scopeType,
          scopeId: assignForm.scopeId,
          slot: assignForm.slot,
          label: assignForm.slot === 'coverage' ? assignForm.label : undefined,
          startDate: assignForm.startDate || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to create assignment');
      }

      setShowAssignModal(false);
      setAssignForm({ role: 'SM', scopeType: 'location', scopeId: '', slot: 'primary', label: '', startDate: '' });
      await fetchPerson();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add assignment');
    } finally {
      setSaving(false);
    }
  };

  const handleEndAssignment = async (assignmentId: string) => {
    if (!confirm('End this assignment?')) return;

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/assignments/${assignmentId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to end assignment');
      }

      await fetchPerson();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end assignment');
    }
  };

  const handleRetire = async () => {
    if (!person || !confirm(`Retire ${person.fullName}? This will end all active assignments.`)) return;

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/people/${person.id}/retire`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to retire');
      }

      await fetchPerson();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retire');
    }
  };

  const handleReactivate = async () => {
    if (!person) return;

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/people/${person.id}/reactivate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to reactivate');
      }

      await fetchPerson();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate');
    }
  };

  const roleOptions = assignForm.scopeType === 'region' 
    ? [{ value: 'RM', label: 'Regional Manager' }]
    : assignForm.scopeType === 'district'
    ? [{ value: 'DM', label: 'District Manager' }]
    : [
        { value: 'SM', label: 'Store Manager' },
        { value: 'ASM', label: 'Assistant Store Manager' },
        { value: 'KH', label: 'Key Holder' },
        { value: 'OTHER', label: 'Other' },
      ];
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-700 text-white sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Loading...</h1>
          </div>
        </header>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </div>
    );
  }
  
  if (error || !person) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-blue-700 text-white sticky top-0 z-20">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Error</h1>
          </div>
        </header>
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
          <p className="mt-4 text-gray-600">{error || 'Person not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 text-blue-600 hover:underline"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }
  
  const activeAssignments = person.assignments.filter(a => a.isActive);
  const pastAssignments = person.assignments.filter(a => !a.isActive);
  
  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-blue-600 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{person.fullName}</h1>
          </div>
          {canManage && (
            <button
              onClick={() => setShowEditModal(true)}
              className="p-1.5 hover:bg-blue-600 rounded-lg"
              title="Edit person"
            >
              <Edit2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>
      
      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Basic Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900">{person.fullName}</h2>
              <p className={`text-sm ${person.lifecycle === 'active' ? 'text-green-600' : 'text-gray-500'}`}>
                {person.lifecycle === 'active' ? 'Active' : 'Inactive'}
              </p>
            </div>
            {canManage && person.lifecycle === 'active' && (
              <button
                onClick={handleRetire}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
              >
                Retire
              </button>
            )}
            {canManage && person.lifecycle === 'inactive' && (
              <button
                onClick={handleReactivate}
                className="px-3 py-1.5 text-sm text-green-600 hover:bg-green-50 rounded-lg"
              >
                Reactivate
              </button>
            )}
          </div>
        </div>
        
        {/* Contact Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Contact Information</h3>
          <div className="space-y-3">
            {person.workEmail && (
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-gray-400" />
                <a href={`mailto:${person.workEmail}`} className="text-blue-600 hover:underline">
                  {person.workEmail}
                </a>
              </div>
            )}
            {person.workPhone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <a href={`tel:${person.workPhone}`} className="text-blue-600 hover:underline">
                  {formatPhoneNumber(person.workPhone)}
                </a>
                <span className="text-xs text-gray-500">Work</span>
              </div>
            )}
            {canViewMobile && person.mobilePhone && (
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-gray-400" />
                <a href={`tel:${person.mobilePhone}`} className="text-blue-600 hover:underline">
                  {formatPhoneNumber(person.mobilePhone)}
                </a>
                <span className="text-xs text-gray-500">Mobile</span>
              </div>
            )}
            {!person.workEmail && !person.workPhone && (!canViewMobile || !person.mobilePhone) && (
              <p className="text-gray-500 text-sm">No contact information available</p>
            )}
          </div>
        </div>
        
        {/* Current Responsibilities */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              Current Responsibilities
            </h3>
            {canManage && person.lifecycle === 'active' && (
              <button
                onClick={() => setShowAssignModal(true)}
                className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            )}
          </div>
          {activeAssignments.length > 0 ? (
            <div className="space-y-2">
              {activeAssignments.map(assignment => (
                <AssignmentCard 
                  key={assignment.id} 
                  assignment={assignment} 
                  onEnd={handleEndAssignment}
                  canManage={canManage}
                />
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No current assignments</p>
          )}
        </div>
        
        {/* Past Assignments */}
        {pastAssignments.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Past Assignments</h3>
            <div className="space-y-2">
              {pastAssignments.map(assignment => (
                <AssignmentCard 
                  key={assignment.id} 
                  assignment={assignment} 
                  onEnd={handleEndAssignment}
                  canManage={false}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Edit Person Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit Person</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editForm.fullName}
                  onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Email</label>
                <input
                  type="email"
                  value={editForm.workEmail}
                  onChange={(e) => setEditForm({ ...editForm, workEmail: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Phone</label>
                <input
                  type="tel"
                  value={editForm.workPhone}
                  onChange={(e) => setEditForm({ ...editForm, workPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Phone</label>
                <input
                  type="tel"
                  value={editForm.mobilePhone}
                  onChange={(e) => setEditForm({ ...editForm, mobilePhone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editForm.fullName.trim()}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Assignment Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Assignment</h2>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope Type</label>
                <select
                  value={assignForm.scopeType}
                  onChange={(e) => {
                    const scopeType = e.target.value as 'location' | 'district' | 'region';
                    const role = scopeType === 'region' ? 'RM' : scopeType === 'district' ? 'DM' : 'SM';
                    setAssignForm({ ...assignForm, scopeType, scopeId: '', role });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="location">Store</option>
                  <option value="district">District</option>
                  <option value="region">Region</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {assignForm.scopeType === 'location' ? 'Store' : assignForm.scopeType === 'district' ? 'District' : 'Region'}
                </label>
                <select
                  value={assignForm.scopeId}
                  onChange={(e) => setAssignForm({ ...assignForm, scopeId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select...</option>
                  {assignForm.scopeType === 'location' && locations.map(loc => (
                    <option key={loc.id} value={loc.id}>#{loc.storeNumber} {loc.name}</option>
                  ))}
                  {assignForm.scopeType === 'district' && districts.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                  {assignForm.scopeType === 'region' && regions.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={assignForm.role}
                  onChange={(e) => setAssignForm({ ...assignForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {roleOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
                <select
                  value={assignForm.slot}
                  onChange={(e) => setAssignForm({ ...assignForm, slot: e.target.value as 'primary' | 'coverage' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="primary">Primary</option>
                  <option value="coverage">Coverage</option>
                </select>
              </div>

              {assignForm.slot === 'coverage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Label (optional)</label>
                  <input
                    type="text"
                    value={assignForm.label}
                    onChange={(e) => setAssignForm({ ...assignForm, label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Backup, Temporary"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (optional)</label>
                <input
                  type="date"
                  value={assignForm.startDate}
                  onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAssignModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddAssignment}
                disabled={saving || !assignForm.scopeId}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
