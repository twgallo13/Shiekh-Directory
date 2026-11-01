import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ChevronDown, Plus, Edit2, Trash2, MapPin, Building, Users, Move, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { PersonListItem, PositionStatus } from '../types';
import { VacantBadge } from './CapacityBadge';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Dialog, FormField } from './Dialog';

interface HierarchyRegion {
  id: string;
  code: string;
  name: string;
  rmName?: string;
  rmStatus?: PositionStatus;
  rmOthers?: string;
}

interface HierarchyDistrict {
  id: string;
  code: string;
  name: string;
  regionId: string;
  dmName?: string;
  dmStatus?: PositionStatus;
  dmOthers?: string;
}

interface HierarchyLocation {
  id: string;
  storeNumber: string;
  name: string;
  kind: string;
  districtId: string;
  regionId: string;
  smName?: string;
  smStatus?: PositionStatus;
  smOthers?: string;
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
  useDocumentTitle('Hierarchy');
  
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
      <div className="bg-gray-50 min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
      <header className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} aria-label="Back to directory" className="text-gray-600 hover:text-gray-900 lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Organizational Hierarchy</h1>
            {canManage && (
              <button
                onClick={openCreateRegion}
                className="ml-auto flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Region
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-4 lg:p-6">
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
                  <div className="flex items-center gap-3 p-4 hover:bg-gray-50">
                    <button
                      onClick={() => toggleRegion(region.id)}
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${region.name}`}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
                    >
                      {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-600" /> : <ChevronRight className="w-5 h-5 text-gray-600" />}
                    </button>
                    <Building className="w-5 h-5 text-purple-600" />
                    <div className="flex-1">
                      <span className="font-semibold text-gray-900">{region.name}</span>
                      <span className="ml-2 text-sm text-gray-500">({region.code})</span>
                      <span className="ml-3 text-sm">
                        RM: {region.rmStatus === 'filled' ? (
                          <span className="text-purple-600">{region.rmName}</span>
                        ) : (
                          <VacantBadge />
                        )}
                        {region.rmOthers && (
                          <span className="ml-2 text-gray-500">+ {region.rmOthers}</span>
                        )}
                      </span>
                    </div>
                    <span className="text-sm text-gray-500">{districts.length} districts</span>
                    {canManage && (
                      <div className="flex">
                        <button onClick={() => openAssignRM(region.id)} aria-label="Assign regional manager" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
                          <UserPlus className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEditRegion(region)} aria-label="Edit region" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleRetire('region', region.id)} aria-label="Delete region" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
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
                            <div className="flex items-center gap-3 p-3 pl-8 hover:bg-gray-100">
                              <button
                                onClick={() => toggleDistrict(district.id)}
                                aria-expanded={isDistrictExpanded}
                                aria-label={`${isDistrictExpanded ? 'Collapse' : 'Expand'} ${district.name}`}
                                className="min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
                              >
                                {isDistrictExpanded ? <ChevronDown className="w-4 h-4 text-gray-600" /> : <ChevronRight className="w-4 h-4 text-gray-600" />}
                              </button>
                              <Users className="w-4 h-4 text-blue-600" />
                              <div className="flex-1">
                                <span className="font-medium text-gray-800">{district.name}</span>
                                <span className="ml-2 text-sm text-gray-500">({district.code})</span>
                                <span className="ml-3 text-sm">
                                  DM: {district.dmStatus === 'filled' ? (
                                    <span className="text-blue-600">{district.dmName}</span>
                                  ) : (
                                    <VacantBadge />
                                  )}
                                  {district.dmOthers && (
                                    <span className="ml-2 text-gray-500">+ {district.dmOthers}</span>
                                  )}
                                </span>
                              </div>
                              <span className="text-xs text-gray-500">{locations.length} stores</span>
                              {canManage && (
                                <div className="flex">
                                  <button onClick={() => openAssignDM(district.id)} aria-label="Assign district manager" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg">
                                    <UserPlus className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openMoveDistrict(district)} aria-label="Move district to another region" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                    <Move className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => openEditDistrict(district)} aria-label="Edit district" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => handleRetire('district', district.id)} aria-label="Delete district" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
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
                                    <span className="text-sm">
                                      SM: {location.smStatus === 'filled' ? (
                                        <span className="text-gray-500">{location.smName}</span>
                                      ) : (
                                        <VacantBadge />
                                      )}
                                      {location.smOthers && (
                                        <span className="ml-2 text-gray-600">+ {location.smOthers}</span>
                                      )}
                                    </span>
                                    {canManage && (
                                      <div className="ml-auto flex">
                                        <button onClick={() => openMoveLocation(location)} aria-label="Move location to another district" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                                          <Move className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleRetire('location', location.id)} aria-label="Delete location" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg">
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

      <HierarchyDialog
        modalType={modalType}
        editId={editId}
        form={form}
        setForm={setForm}
        assignForm={assignForm}
        setAssignForm={setAssignForm}
        data={data}
        people={people}
        saving={saving}
        onClose={() => setModalType(null)}
        onSave={handleSave}
        onAssign={handleAssign}
      />
    </div>
  );
}

interface HierarchyDialogProps {
  modalType: 'region' | 'district' | 'location' | 'move-district' | 'move-location' | 'assign-rm' | 'assign-dm' | null;
  editId: string | null;
  form: {
    code: string;
    name: string;
    regionId: string;
    districtId: string;
    storeNumber: string;
    address: { street: string; city: string; state: string; zip: string };
  };
  setForm: (form: HierarchyDialogProps['form']) => void;
  assignForm: { personId: string; slot: 'primary' | 'coverage'; startDate: string };
  setAssignForm: (form: HierarchyDialogProps['assignForm']) => void;
  data: { regions: HierarchyRegion[]; districts: HierarchyDistrict[] } | null;
  people: PersonListItem[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onAssign: () => void;
}

function HierarchyDialog({ modalType, editId, form, setForm, assignForm, setAssignForm, data, people, saving, onClose, onSave, onAssign }: HierarchyDialogProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  if (!modalType) return null;
  
  const getTitle = () => {
    switch (modalType) {
      case 'region': return editId ? 'Edit Region' : 'Add Region';
      case 'district': return editId ? 'Edit District' : 'Add District';
      case 'location': return 'Add Location';
      case 'move-district': return 'Move District';
      case 'move-location': return 'Move Location';
      case 'assign-rm': return 'Assign Regional Manager';
      case 'assign-dm': return 'Assign District Manager';
      default: return '';
    }
  };
  
  const isAssignment = modalType === 'assign-rm' || modalType === 'assign-dm';
  
  const dialogFooter = (
    <div className="flex gap-3">
      <button onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]">
        Cancel
      </button>
      <button
        onClick={isAssignment ? onAssign : onSave}
        disabled={saving || (isAssignment && !assignForm.personId)}
        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
      >
        {saving ? 'Saving...' : isAssignment ? 'Assign' : 'Save'}
      </button>
    </div>
  );
  
  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title={getTitle()}
      footer={dialogFooter}
      size="md"
      triggerRef={triggerRef}
    >
      <div className="space-y-4">
        {(modalType === 'region' || modalType === 'district') && (
          <>
            <FormField id="hier-code" label="Code" required>
              <input
                id="hier-code"
                type="text"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                placeholder="e.g., WEST or LA-CENTRAL"
              />
            </FormField>
            <FormField id="hier-name" label="Name" required>
              <input
                id="hier-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                placeholder="e.g., West Region or Los Angeles Central"
              />
            </FormField>
          </>
        )}

        {modalType === 'location' && (
          <>
            <FormField id="hier-store-number" label="Store Number" required>
              <input
                id="hier-store-number"
                type="text"
                value={form.storeNumber}
                onChange={(e) => setForm({ ...form, storeNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                placeholder="e.g., 042"
              />
            </FormField>
            <FormField id="hier-loc-name" label="Name" required>
              <input
                id="hier-loc-name"
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                placeholder="e.g., Downtown LA"
              />
            </FormField>
            <FormField id="hier-street" label="Street Address" required>
              <input
                id="hier-street"
                type="text"
                value={form.address.street}
                onChange={(e) => setForm({ ...form, address: { ...form.address, street: e.target.value } })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
              />
            </FormField>
            <div className="grid grid-cols-3 gap-2">
              <FormField id="hier-city" label="City" required>
                <input
                  id="hier-city"
                  type="text"
                  value={form.address.city}
                  onChange={(e) => setForm({ ...form, address: { ...form.address, city: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                />
              </FormField>
              <FormField id="hier-state" label="State" required>
                <input
                  id="hier-state"
                  type="text"
                  value={form.address.state}
                  onChange={(e) => setForm({ ...form, address: { ...form.address, state: e.target.value.toUpperCase() } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                  maxLength={2}
                />
              </FormField>
              <FormField id="hier-zip" label="ZIP" required>
                <input
                  id="hier-zip"
                  type="text"
                  value={form.address.zip}
                  onChange={(e) => setForm({ ...form, address: { ...form.address, zip: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                />
              </FormField>
            </div>
          </>
        )}

        {modalType === 'move-district' && data && (
          <FormField id="hier-move-region" label="Move to Region" required>
            <select
              id="hier-move-region"
              value={form.regionId}
              onChange={(e) => setForm({ ...form, regionId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
            >
              {data.regions.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </FormField>
        )}

        {modalType === 'move-location' && data && (
          <FormField id="hier-move-district" label="Move to District" required>
            <select
              id="hier-move-district"
              value={form.districtId}
              onChange={(e) => setForm({ ...form, districtId: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
            >
              {data.districts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </FormField>
        )}

        {isAssignment && (
          <>
            <FormField id="hier-assign-person" label="Person" required>
              <select
                id="hier-assign-person"
                value={assignForm.personId}
                onChange={(e) => setAssignForm({ ...assignForm, personId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
              >
                <option value="">Select a person...</option>
                {people.map(p => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </FormField>
            <FormField id="hier-assign-slot" label="Slot">
              <select
                id="hier-assign-slot"
                value={assignForm.slot}
                onChange={(e) => setAssignForm({ ...assignForm, slot: e.target.value as 'primary' | 'coverage' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
              >
                <option value="primary">Primary</option>
                <option value="coverage">Coverage</option>
              </select>
            </FormField>
            <FormField id="hier-assign-start" label="Start Date (optional)">
              <input
                id="hier-assign-start"
                type="date"
                value={assignForm.startDate}
                onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
              />
            </FormField>
          </>
        )}
      </div>
    </Dialog>
  );
}
