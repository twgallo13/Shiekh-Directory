import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ChevronDown, Plus, Edit2, Trash2, MapPin, Building, Users, X, Move, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PersonListItem } from '../types';
import { VacantBadge } from './CapacityBadge';

interface HierarchyRegion {
  id: string;
  code: string;
  name: string;
  rmName?: string;
}

interface HierarchyDistrict {
  id: string;
  code: string;
  name: string;
  regionId: string;
  dmName?: string;
}

interface HierarchyLocation {
  id: string;
  storeNumber: string;
  name: string;
  kind: string;
  districtId: string;
  regionId: string;
  smName?: string;
}

interface HierarchyData {
  regions: HierarchyRegion[];
  districts: HierarchyDistrict[];
  locations: HierarchyLocation[];
}

type ModalType = 'region' | 'district' | 'location' | 'move-district' | 'move-location' | 'assign-rm' | 'assign-dm' | null;

interface FormState {
  code: string;
  name: string;
  regionId: string;
  districtId: string;
  storeNumber: string;
  address: { street: string; city: string; state: string; zip: string };
}

interface AssignFormState {
  personId: string;
  slot: 'primary' | 'coverage';
  startDate: string;
}

export function HierarchyView() {
  const [data, setData] = useState<HierarchyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set());
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ code: '', name: '', regionId: '', districtId: '', storeNumber: '', address: { street: '', city: '', state: '', zip: '' } });
  const [assignForm, setAssignForm] = useState<AssignFormState>({ personId: '', slot: 'primary', startDate: '' });
  const [people, setPeople] = useState<PersonListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();

  const canManage = authUser?.role === 'Steward' || authUser?.role === 'Admin';

  const fetchHierarchy = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const response = await fetch('/api/app/hierarchy/tree', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch hierarchy');
      const { data } = await response.json();
      setData(data);
    } catch (err) {
      console.error('Fetch hierarchy error:', err);
      setError('Failed to load hierarchy');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    fetchHierarchy();
  }, [fetchHierarchy]);

  const toggleRegion = (id: string) => {
    setExpandedRegions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDistrict = (id: string) => {
    setExpandedDistricts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openCreateRegion = () => {
    setForm({ code: '', name: '', regionId: '', districtId: '', storeNumber: '', address: { street: '', city: '', state: '', zip: '' } });
    setEditId(null);
    setModalType('region');
  };

  const openCreateDistrict = (regionId: string) => {
    setForm({ code: '', name: '', regionId, districtId: '', storeNumber: '', address: { street: '', city: '', state: '', zip: '' } });
    setEditId(null);
    setModalType('district');
  };

  const openCreateLocation = (districtId: string) => {
    setForm({ code: '', name: '', regionId: '', districtId, storeNumber: '', address: { street: '', city: '', state: '', zip: '' } });
    setEditId(null);
    setModalType('location');
  };

  const openEditRegion = (region: HierarchyRegion) => {
    setForm({ code: region.code, name: region.name, regionId: '', districtId: '', storeNumber: '', address: { street: '', city: '', state: '', zip: '' } });
    setEditId(region.id);
    setModalType('region');
  };

  const openEditDistrict = (district: HierarchyDistrict) => {
    setForm({ code: district.code, name: district.name, regionId: district.regionId, districtId: '', storeNumber: '', address: { street: '', city: '', state: '', zip: '' } });
    setEditId(district.id);
    setModalType('district');
  };

  const openMoveDistrict = (district: HierarchyDistrict) => {
    setForm({ ...form, regionId: district.regionId });
    setEditId(district.id);
    setModalType('move-district');
  };

  const openMoveLocation = (location: HierarchyLocation) => {
    setForm({ ...form, districtId: location.districtId });
    setEditId(location.id);
    setModalType('move-location');
  };

  const fetchPeople = useCallback(async () => {
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/people?lifecycle=active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setPeople(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch people:', err);
    }
  }, [getIdToken]);

  const openAssignRM = (regionId: string) => {
    setEditId(regionId);
    setAssignForm({ personId: '', slot: 'primary', startDate: '' });
    setModalType('assign-rm');
    fetchPeople();
  };

  const openAssignDM = (districtId: string) => {
    setEditId(districtId);
    setAssignForm({ personId: '', slot: 'primary', startDate: '' });
    setModalType('assign-dm');
    fetchPeople();
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      const token = await getIdToken();
      let url = '';
      let method = 'POST';
      let body: Record<string, unknown> = {};

      if (modalType === 'region') {
        url = editId ? `/api/app/hierarchy/regions/${editId}` : '/api/app/hierarchy/regions';
        method = editId ? 'PATCH' : 'POST';
        body = { code: form.code, name: form.name };
      } else if (modalType === 'district') {
        url = editId ? `/api/app/hierarchy/districts/${editId}` : '/api/app/hierarchy/districts';
        method = editId ? 'PATCH' : 'POST';
        body = { code: form.code, name: form.name, regionId: form.regionId };
      } else if (modalType === 'location') {
        url = '/api/app/hierarchy/locations';
        method = 'POST';
        body = { storeNumber: form.storeNumber, name: form.name, districtId: form.districtId, address: form.address };
      } else if (modalType === 'move-district' && editId) {
        url = `/api/app/hierarchy/districts/${editId}`;
        method = 'PATCH';
        body = { regionId: form.regionId };
      } else if (modalType === 'move-location' && editId) {
        url = `/api/app/hierarchy/locations/${editId}/move`;
        method = 'PATCH';
        body = { districtId: form.districtId };
      }

      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Operation failed');
      }

      setModalType(null);
      await fetchHierarchy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed');
    } finally {
      setSaving(false);
    }
  };

  const handleRetire = async (type: 'region' | 'district' | 'location', id: string) => {
    if (!confirm('Are you sure you want to retire this item?')) return;

    try {
      const token = await getIdToken();
      const url = `/api/app/hierarchy/${type}s/${id}/retire`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Retire failed');
      }

      await fetchHierarchy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Retire failed');
    }
  };

  const handleAssign = async () => {
    if (!editId || !assignForm.personId) return;

    try {
      setSaving(true);
      setError(null);
      const token = await getIdToken();
      
      const role = modalType === 'assign-rm' ? 'RM' : 'DM';
      const scopeType = modalType === 'assign-rm' ? 'region' : 'district';
      
      const response = await fetch('/api/app/assignments', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personId: assignForm.personId,
          role,
          scopeType,
          scopeId: editId,
          slot: assignForm.slot,
          startDate: assignForm.startDate || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to create assignment');
      }

      setModalType(null);
      await fetchHierarchy();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assignment failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Organizational Hierarchy</h1>
            {canManage && (
              <button
                onClick={openCreateRegion}
                className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Region
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
            <button onClick={() => setError(null)} className="ml-2 text-red-900 font-medium">Dismiss</button>
          </div>
        )}

        {!data || data.regions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No regions configured. {canManage && 'Click "Add Region" to get started.'}
          </div>
        ) : (
          <div className="space-y-2">
            {data.regions.map(region => {
              const isExpanded = expandedRegions.has(region.id);
              const districts = data.districts.filter(d => d.regionId === region.id);

              return (
                <div key={region.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div
                    className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleRegion(region.id)}
                  >
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                    <Building className="w-5 h-5 text-purple-600" />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-900">{region.name}</span>
                      <span className="ml-2 text-sm text-gray-500">({region.code})</span>
                      {region.rmName ? (
                        <span className="ml-3 text-sm text-purple-600">RM: {region.rmName}</span>
                      ) : (
                        <span className="ml-3 flex items-center gap-1 text-sm">RM: <VacantBadge /></span>
                      )}
                    </div>
                    <span className="text-sm text-gray-500">{districts.length} districts</span>
                    {canManage && (
                      <div className="flex" onClick={e => e.stopPropagation()}>
                        <button onClick={() => openAssignRM(region.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg" title="Assign RM">
                          <UserPlus className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEditRegion(region)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRetire('region', region.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50">
                      {canManage && (
                        <button
                          onClick={() => openCreateDistrict(region.id)}
                          className="w-full p-3 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2 justify-center"
                        >
                          <Plus className="w-4 h-4" /> Add District
                        </button>
                      )}
                      {districts.map(district => {
                        const isDistrictExpanded = expandedDistricts.has(district.id);
                        const locations = data.locations.filter(l => l.districtId === district.id);

                        return (
                          <div key={district.id} className="border-t border-gray-100">
                            <div
                              className="flex items-center gap-3 p-3 pl-8 cursor-pointer hover:bg-gray-100"
                              onClick={() => toggleDistrict(district.id)}
                            >
                              {isDistrictExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                              <Users className="w-4 h-4 text-blue-600" />
                              <div className="flex-1">
                                <span className="font-medium text-gray-800">{district.name}</span>
                                <span className="ml-2 text-sm text-gray-500">({district.code})</span>
                                {district.dmName ? (
                                  <span className="ml-3 text-sm text-blue-600">DM: {district.dmName}</span>
                                ) : (
                                  <span className="ml-3 flex items-center gap-1 text-sm">DM: <VacantBadge /></span>
                                )}
                              </div>
                              <span className="text-xs text-gray-500">{locations.length} stores</span>
                              {canManage && (
                                <div className="flex" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => openAssignDM(district.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" title="Assign DM">
                                    <UserPlus className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openMoveDistrict(district)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Move to another region">
                                    <Move className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openEditDistrict(district)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleRetire('district', district.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>

                            {isDistrictExpanded && (
                              <div className="bg-white">
                                {canManage && (
                                  <button
                                    onClick={() => openCreateLocation(district.id)}
                                    className="w-full p-2 pl-16 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-2"
                                  >
                                    <Plus className="w-4 h-4" /> Add Location
                                  </button>
                                )}
                                {locations.map(location => (
                                  <div
                                    key={location.id}
                                    className="flex items-center gap-3 p-2 pl-16 hover:bg-gray-50 cursor-pointer border-t border-gray-50"
                                    onClick={() => navigate(`/location/${location.id}`)}
                                  >
                                    <MapPin className="w-4 h-4 text-green-600" />
                                    <span className="font-mono text-sm text-gray-700">#{location.storeNumber}</span>
                                    <span className="text-gray-800">{location.name}</span>
                                    {location.smName ? (
                                      <span className="text-sm text-gray-500">SM: {location.smName}</span>
                                    ) : (
                                      <span className="text-sm flex items-center gap-1">SM: <VacantBadge /></span>
                                    )}
                                    {canManage && (
                                      <div className="ml-auto flex" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => openMoveLocation(location)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg" title="Move to another district">
                                          <Move className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleRetire('location', location.id)} className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {modalType === 'region' && (editId ? 'Edit Region' : 'Add Region')}
                {modalType === 'district' && (editId ? 'Edit District' : 'Add District')}
                {modalType === 'location' && 'Add Location'}
                {modalType === 'move-district' && 'Move District'}
                {modalType === 'move-location' && 'Move Location'}
                {modalType === 'assign-rm' && 'Assign Regional Manager'}
                {modalType === 'assign-dm' && 'Assign District Manager'}
              </h2>
              <button onClick={() => setModalType(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {(modalType === 'region' || modalType === 'district') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., WEST or LA-CENTRAL"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., West Region or Los Angeles Central"
                    />
                  </div>
                </>
              )}

              {modalType === 'location' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Store Number *</label>
                    <input
                      type="text"
                      value={form.storeNumber}
                      onChange={(e) => setForm({ ...form, storeNumber: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., 042"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="e.g., Downtown LA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
                    <input
                      type="text"
                      value={form.address.street}
                      onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                      <input
                        type="text"
                        value={form.address.city}
                        onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                      <input
                        type="text"
                        value={form.address.state}
                        onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value.toUpperCase() } })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        maxLength={2}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">ZIP *</label>
                      <input
                        type="text"
                        value={form.address.zip}
                        onChange={(e) => setForm({ ...form, address: { ...form.address, zip: e.target.value } })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                  </div>
                </>
              )}

              {modalType === 'move-district' && data && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Move to Region</label>
                  <select
                    value={form.regionId}
                    onChange={(e) => setForm({ ...form, regionId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {data.regions.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {modalType === 'move-location' && data && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Move to District</label>
                  <select
                    value={form.districtId}
                    onChange={(e) => setForm({ ...form, districtId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {data.districts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {(modalType === 'assign-rm' || modalType === 'assign-dm') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Person *</label>
                    <select
                      value={assignForm.personId}
                      onChange={(e) => setAssignForm({ ...assignForm, personId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="">Select a person...</option>
                      {people.map(p => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slot</label>
                    <select
                      value={assignForm.slot}
                      onChange={(e) => setAssignForm({ ...assignForm, slot: e.target.value as 'primary' | 'coverage' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="primary">Primary</option>
                      <option value="coverage">Coverage</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Start Date (optional)</label>
                    <input
                      type="date"
                      value={assignForm.startDate}
                      onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalType(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={modalType === 'assign-rm' || modalType === 'assign-dm' ? handleAssign : handleSave}
                disabled={saving || ((modalType === 'assign-rm' || modalType === 'assign-dm') && !assignForm.personId)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : (modalType === 'assign-rm' || modalType === 'assign-dm') ? 'Assign' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
