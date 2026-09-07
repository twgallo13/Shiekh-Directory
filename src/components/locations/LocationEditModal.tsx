import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LocationRecord, OperationalStatus, LocationType, HolidayHoursOverride, WeeklySchedule, DayHours } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { OperationalStatusBadge } from '../common/StatusBadge';
import { useDialogFocus } from '../common/useDialogFocus';
import { 
  X, 
  Save, 
  Clock, 
  Globe, 
  Star, 
  Archive, 
  RotateCcw, 
  AlertTriangle,
  Store,
  MapPin,
  Briefcase,
  Plus,
  Trash2,
  Calendar,
  Info
} from 'lucide-react';

interface LocationEditModalProps {
  location: LocationRecord | null;
  mode?: 'create' | 'edit';
  onClose: () => void;
  onSaved?: (message: string) => void;
}

export type EditModalTab = 'details' | 'hours' | 'holidays';

const DAYS: { key: keyof WeeklySchedule; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const normalizeLocation = (location: LocationRecord): LocationRecord => ({
  ...location,
  assistantStoreManagerNames: location.assistantStoreManagerNames || [],
  keyHolderNames: location.keyHolderNames || [],
  holidayHours: location.holidayHours || [],
});

export const LocationEditModal: React.FC<LocationEditModalProps> = ({
  location,
  mode = 'edit',
  onClose,
  onSaved,
}) => {
  const { 
    updateLocation, 
    createLocation,
    hoursTemplates, 
    corporateHolidays,
    people 
  } = useDirectory();

  const [formData, setFormData] = useState<LocationRecord | null>(() => location ? normalizeLocation(location) : null);
  const [activeTab, setActiveTab] = useState<EditModalTab>('details');
  const [confirmation, setConfirmation] = useState<'discard' | 'retire' | 'reactivate' | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isCreating = mode === 'create';

  useEffect(() => {
    if (location) {
      setFormData(normalizeLocation(location));
      setActiveTab('details');
      setConfirmation(null);
    }
  }, [location]);

  const isDirty = useMemo(() => {
    if (!location || !formData) return false;
    return JSON.stringify(formData) !== JSON.stringify(normalizeLocation(location));
  }, [formData, location]);

  const requestClose = useCallback(() => {
    if (isDirty) {
      setConfirmation('discard');
      return;
    }
    onClose();
  }, [isDirty, onClose]);

  useDialogFocus(Boolean(location) && confirmation === null, requestClose, dialogRef);

  // Extract District Managers and Store Managers for dropdowns
  const districtManagers = useMemo(() => {
    return people
      .filter(p => p.jobTitle === 'District Manager' || p.role === 'District Manager' || (p.department && p.department.includes('District')))
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }, [people]);

  const storeManagers = useMemo(() => {
    return people
      .filter(p => p.jobTitle === 'Store Manager' || p.role === 'Store Manager' || (p.department && p.department.includes('Store')))
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }, [people]);

  const otherPersonnel = useMemo(() => {
    return people
      .filter(p => 
        p.jobTitle !== 'District Manager' && 
        p.role !== 'District Manager' && 
        p.jobTitle !== 'Store Manager' && 
        p.role !== 'Store Manager'
      )
      .sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
  }, [people]);

  if (!location || !formData) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clean up empty entries in dynamic arrays
    const sanitizedData: LocationRecord = {
      ...formData,
      assistantStoreManagerNames: (formData.assistantStoreManagerNames || []).filter(name => name.trim().length > 0),
      keyHolderNames: (formData.keyHolderNames || []).filter(name => name.trim().length > 0),
      holidayHours: (formData.holidayHours || []).filter(h => h.holidayName.trim().length > 0 || h.date.trim().length > 0)
    };

    if (isCreating) {
      const { id: _draftId, ...newLocationData } = sanitizedData;
      createLocation(newLocationData);
      onSaved?.(`Store #${sanitizedData.storeNumber} was created.`);
    } else {
      updateLocation(location.id, sanitizedData);
      onSaved?.(`Store #${sanitizedData.storeNumber} was saved.`);
    }
    onClose();
  };

  const handleApplyTemplate = (templateId: string) => {
    const template = hoursTemplates.find(t => t.id === templateId);
    if (template) {
      setFormData(prev => prev ? ({ ...prev, standardHours: { ...template.schedule } }) : null);
    }
  };

  const handleCopyMonToWeekdays = () => {
    if (!formData.standardHours) return;
    const monHours = formData.standardHours.monday;
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        standardHours: {
          ...prev.standardHours,
          tuesday: { ...monHours },
          wednesday: { ...monHours },
          thursday: { ...monHours },
          friday: { ...monHours },
        }
      };
    });
  };

  const handleCopyMonToAll = () => {
    if (!formData.standardHours) return;
    const monHours = formData.standardHours.monday;
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        standardHours: {
          monday: { ...monHours },
          tuesday: { ...monHours },
          wednesday: { ...monHours },
          thursday: { ...monHours },
          friday: { ...monHours },
          saturday: { ...monHours },
          sunday: { ...monHours },
        }
      };
    });
  };

  const handleDayHoursChange = (dayKey: keyof WeeklySchedule, updates: Partial<DayHours>) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        standardHours: {
          ...prev.standardHours,
          [dayKey]: {
            ...prev.standardHours[dayKey],
            ...updates,
          }
        }
      };
    });
  };

  const handleToggleRetire = () => {
    setConfirmation(formData.recordStatus === 'Retired' ? 'reactivate' : 'retire');
  };

  const handleConfirm = () => {
    if (confirmation === 'discard') {
      onClose();
      return;
    }

    if (confirmation === 'reactivate') {
      setFormData(prev => prev ? ({
        ...prev,
        recordStatus: 'Active',
        operationalStatus: 'Open — Normal Operations',
      }) : null);
    }

    if (confirmation === 'retire') {
      setFormData(prev => prev ? ({
        ...prev,
        recordStatus: 'Retired',
        operationalStatus: 'Permanently Closed',
      }) : null);
    }

    setConfirmation(null);
  };

  // Assistant Manager dynamic list handlers
  const handleAddAssistantManager = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        assistantStoreManagerNames: [...(prev.assistantStoreManagerNames || []), '']
      };
    });
  };

  const handleUpdateAssistantManager = (index: number, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const updated = [...(prev.assistantStoreManagerNames || [])];
      updated[index] = value;
      return { ...prev, assistantStoreManagerNames: updated };
    });
  };

  const handleRemoveAssistantManager = (index: number) => {
    setFormData(prev => {
      if (!prev) return null;
      const updated = (prev.assistantStoreManagerNames || []).filter((_, i) => i !== index);
      return { ...prev, assistantStoreManagerNames: updated };
    });
  };

  // Key Holder dynamic list handlers
  const handleAddKeyHolder = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        keyHolderNames: [...(prev.keyHolderNames || []), '']
      };
    });
  };

  const handleUpdateKeyHolder = (index: number, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const updated = [...(prev.keyHolderNames || [])];
      updated[index] = value;
      return { ...prev, keyHolderNames: updated };
    });
  };

  const handleRemoveKeyHolder = (index: number) => {
    setFormData(prev => {
      if (!prev) return null;
      const updated = (prev.keyHolderNames || []).filter((_, i) => i !== index);
      return { ...prev, keyHolderNames: updated };
    });
  };

  // Holiday override dynamic list handlers
  const handleAddHolidayOverride = () => {
    setFormData(prev => {
      if (!prev) return null;
      const newOverride: HolidayHoursOverride = {
        id: `hol-${Date.now()}`,
        holidayName: '',
        date: new Date().toISOString().slice(0, 10),
        hours: { open: '10:00', close: '18:00', isClosed: false }
      };
      return {
        ...prev,
        holidayHours: [...(prev.holidayHours || []), newOverride]
      };
    });
  };

  const handleApplyHolidayPreset = (presetHolidayId: string) => {
    const preset = corporateHolidays.find(h => h.id === presetHolidayId);
    if (!preset) return;

    setFormData(prev => {
      if (!prev) return null;
      const existing = prev.holidayHours || [];
      // Check if already present
      const alreadyHas = existing.some(h => h.holidayName.toLowerCase() === preset.name.toLowerCase() || h.date === preset.date);
      if (alreadyHas) return prev;

      const newOverride: HolidayHoursOverride = {
        id: `hol-${Date.now()}-${preset.id}`,
        holidayName: preset.name,
        date: preset.date,
        hours: preset.hours ? { ...preset.hours } : { open: '10:00', close: '18:00', isClosed: preset.status.includes('Closed') }
      };

      return {
        ...prev,
        holidayHours: [...existing, newOverride]
      };
    });
  };

  const handleUpdateHolidayOverride = (id: string, updates: Partial<HolidayHoursOverride>) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        holidayHours: (prev.holidayHours || []).map(h => h.id === id ? { ...h, ...updates } : h)
      };
    });
  };

  const handleRemoveHolidayOverride = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        holidayHours: (prev.holidayHours || []).filter(h => h.id !== id)
      };
    });
  };

  // Find currently assigned manager IDs if matching names exist
  const currentDmId = formData.districtManagerId || 
    districtManagers.find(d => d.fullName?.toLowerCase() === (formData.districtManagerName || '').toLowerCase())?.id || 
    '';

  const currentSmId = formData.storeManagerId || 
    storeManagers.find(s => s.fullName?.toLowerCase() === (formData.storeManagerName || '').toLowerCase())?.id || 
    '';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      {/* Modal Container: Wide, spacious chassis with clean white background and minimal borders */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-editor-title"
        tabIndex={-1}
        className="bg-white border border-neutral-200 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative"
      >
        
        {/* Premium Dark Header (Parity with Detail Modal) */}
        <div className="sticky top-0 z-20 bg-neutral-900 text-white p-6 border-b border-neutral-800 shrink-0 shadow-md">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-0">
              {/* Top Flex Row: Store Number in red badge, Location Type in muted text, Status in green badge */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="bg-red-700 text-white px-2 py-1 rounded text-xs font-mono font-bold">
                  STORE #{formData.storeNumber || location.storeNumber}
                </span>
                <span className="text-xs text-neutral-400 font-medium">
                  {formData.type || location.type}
                </span>
                <OperationalStatusBadge status={formData.operationalStatus} surface="dark" />
              </div>

              {/* Title: Large, bold white text */}
              <h2 id="location-editor-title" className="text-2xl font-bold text-white tracking-tight truncate">
                {formData.name || (isCreating ? 'New Store Location' : location.name)}
              </h2>

              {/* Subtitle: Muted city/state and ID string below the title */}
              <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-normal">
                <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span>
                  {formData.city || 'City'}, {formData.state || 'State'} {isCreating ? '• New directory record' : `• ID: ${location.id}`}
                </span>
              </div>
            </div>

            {/* Right Header Action / Close */}
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider bg-neutral-800 border border-neutral-700 px-3 py-1 rounded-md hidden sm:inline-block">
                {isCreating ? 'Create Store Record' : 'Edit Store Record'}
              </span>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close modal"
                className="p-1.5 text-neutral-400 hover:text-white cursor-pointer rounded-lg hover:bg-neutral-800 transition-colors"
                title="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Tab Navigation: Clean white tab row with bottom border */}
        <div className="sticky top-[106px] z-10 bg-white px-6 border-b border-neutral-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('details')}
              className={`flex items-center gap-2 px-4 py-3 text-xs border-b-2 transition-all cursor-pointer ${
                activeTab === 'details'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              <span>Store Details & Status</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('hours')}
              className={`flex items-center gap-2 px-4 py-3 text-xs border-b-2 transition-all cursor-pointer ${
                activeTab === 'hours'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Standard Hours</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('holidays')}
              className={`flex items-center gap-2 px-4 py-3 text-xs border-b-2 transition-all cursor-pointer ${
                activeTab === 'holidays'
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 font-medium'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Holiday & Special Hours</span>
              {formData.holidayHours && formData.holidayHours.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-neutral-100 text-neutral-700">
                  {formData.holidayHours.length}
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-neutral-400 font-mono hidden md:block">
            {isCreating ? 'New Location Entity' : `Location Entity: ${location.id}`}
          </div>
        </div>

        {/* Scrollable Form Body: Flat, clean white background and minimal borders */}
        <form id="location-edit-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 bg-white">
          
          {/* Lifecycle / Status Notice if Retired */}
          {formData.recordStatus === 'Retired' && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-amber-900 text-xs mb-6">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  This store record is currently <strong>Retired</strong> and hidden from the standard active directory.
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleRetire}
                className="px-3 py-1.5 bg-white hover:bg-neutral-50 text-neutral-800 border border-amber-300 rounded-lg font-semibold cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Reactivate Store</span>
              </button>
            </div>
          )}

          {/* TAB 1: STORE DETAILS & STATUS */}
          {activeTab === 'details' && (
            <div className="space-y-8">
              
              {/* Section 1: Core Identification */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-neutral-200">
                  <Store className="w-4 h-4 text-neutral-600" />
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Core Identification
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Store Number *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.storeNumber}
                      onChange={(e) => setFormData({ ...formData, storeNumber: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                      placeholder="e.g. 054, DC-01"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Location Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                      placeholder="e.g. Glendale Galleria, Shiekh Shoes"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Location Type
                    </label>
                    <select
                      value={formData.type || 'Enclosed Mall'}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as LocationType })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 cursor-pointer"
                    >
                      <option value="Enclosed Mall">Enclosed Mall</option>
                      <option value="Strip Center / Shopping Center">Strip Center / Shopping Center</option>
                      <option value="Street / Standalone Location">Street / Standalone Location</option>
                      <option value="Corporate Office">Corporate Office</option>
                      <option value="Warehouse / Distribution Center">Warehouse / Distribution Center</option>
                      <option value="Other Company Location">Other Company Location</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Operational Status
                    </label>
                    <select
                      value={formData.operationalStatus}
                      onChange={(e) => setFormData({ ...formData, operationalStatus: e.target.value as OperationalStatus })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 cursor-pointer font-medium"
                    >
                      <option value="Open — Normal Operations">Open — Normal Operations</option>
                      <option value="Temporarily Modified Hours">Temporarily Modified Hours</option>
                      <option value="Under Remodel / Renovation">Under Remodel / Renovation</option>
                      <option value="Opening Soon — New Store">Opening Soon — New Store</option>
                      <option value="Temporarily Closed — Emergency">Temporarily Closed — Emergency</option>
                      <option value="Permanently Closed">Permanently Closed</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Time Zone
                    </label>
                    <select
                      value={formData.timeZone || 'America/Los_Angeles'}
                      onChange={(e) => setFormData({ ...formData, timeZone: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 cursor-pointer font-mono"
                    >
                      <option value="America/Los_Angeles">America/Los_Angeles (Pacific Time - PT)</option>
                      <option value="America/Denver">America/Denver (Mountain Time - MT)</option>
                      <option value="America/Chicago">America/Chicago (Central Time - CT)</option>
                      <option value="America/New_York">America/New_York (Eastern Time - ET)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Mall / Center Name (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Glendale Galleria, Lakewood Center"
                      value={formData.mallOrCenterName || ''}
                      onChange={(e) => setFormData({ ...formData, mallOrCenterName: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Address & Contact */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-neutral-200">
                  <MapPin className="w-4 h-4 text-neutral-600" />
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Address & Phone
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Physical Street Address *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 2148 Glendale Galleria, Space 2148"
                      value={formData.address || ''}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      City *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.city || ''}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                        State *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="CA"
                        maxLength={2}
                        value={formData.state || ''}
                        onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm uppercase focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 text-center font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                        Zip Code *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="91210"
                        value={formData.zipCode || ''}
                        onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Store Main Phone *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="(818) 500-0000"
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Store Website URL
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        placeholder="https://www.shiekh.com/stores/..."
                        value={formData.storePageUrl || ''}
                        onChange={(e) => setFormData({ ...formData, storePageUrl: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-xs focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Google Review URL
                    </label>
                    <div className="relative">
                      <Star className="w-4 h-4 text-amber-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="url"
                        placeholder="https://g.page/r/.../review"
                        value={formData.googleReviewUrl || ''}
                        onChange={(e) => setFormData({ ...formData, googleReviewUrl: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-xs focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Store Leadership Assignment */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-neutral-200">
                  <Briefcase className="w-4 h-4 text-neutral-600" />
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Store Leadership Assignment
                  </h3>
                </div>

                {/* Primary Management Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      District Manager
                    </label>
                    <select
                      value={currentDmId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) {
                          setFormData(prev => prev ? ({
                            ...prev,
                            districtManagerId: undefined,
                            districtManagerName: ''
                          }) : null);
                        } else {
                          const dm = people.find(p => p.id === selectedId);
                          setFormData(prev => prev ? ({
                            ...prev,
                            districtManagerId: dm?.id,
                            districtManagerName: dm?.fullName || '',
                            district: dm?.district ? dm.district : prev.district
                          }) : null);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 cursor-pointer"
                    >
                      <option value="">-- Unassigned / Vacant --</option>
                      {districtManagers.map(dm => (
                        <option key={dm.id} value={dm.id}>
                          {dm.fullName} {dm.district ? `(${dm.district})` : ''}
                        </option>
                      ))}
                      {formData.districtManagerName && !districtManagers.some(d => d.id === currentDmId || d.fullName === formData.districtManagerName) && (
                        <option value={currentDmId || 'custom_dm'}>
                          {formData.districtManagerName} (Current Assignment)
                        </option>
                      )}
                      {otherPersonnel.length > 0 && (
                        <optgroup label="Other Field Personnel">
                          {otherPersonnel.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.fullName} ({p.jobTitle || p.role || 'Staff'})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      District / Region Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Northern California, Nevada & Texas"
                      value={formData.district || ''}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Store Manager
                    </label>
                    <select
                      value={currentSmId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        if (!selectedId) {
                          setFormData(prev => prev ? ({
                            ...prev,
                            storeManagerId: undefined,
                            storeManagerName: ''
                          }) : null);
                        } else {
                          const sm = people.find(p => p.id === selectedId);
                          setFormData(prev => prev ? ({
                            ...prev,
                            storeManagerId: sm?.id,
                            storeManagerName: sm?.fullName || '',
                            storeManagerPhone: sm ? (sm.phone || sm.workPhone || prev.storeManagerPhone) : prev.storeManagerPhone
                          }) : null);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 cursor-pointer"
                    >
                      <option value="">-- Vacant / In Transition --</option>
                      {storeManagers.map(sm => (
                        <option key={sm.id} value={sm.id}>
                          {sm.fullName}
                        </option>
                      ))}
                      {formData.storeManagerName && !storeManagers.some(s => s.id === currentSmId || s.fullName === formData.storeManagerName) && (
                        <option value={currentSmId || 'custom_sm'}>
                          {formData.storeManagerName} (Current Assignment)
                        </option>
                      )}
                      {otherPersonnel.length > 0 && (
                        <optgroup label="Other Field Personnel">
                          {otherPersonnel.map(p => (
                            <option key={p.id} value={p.id}>
                              {p.fullName} ({p.jobTitle || p.role || 'Staff'})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                      Store Manager Direct Phone
                    </label>
                    <input
                      type="text"
                      placeholder="(555) 000-0000"
                      value={formData.storeManagerPhone || ''}
                      onChange={(e) => setFormData({ ...formData, storeManagerPhone: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                    />
                  </div>
                </div>

                {/* Assistant Managers Dynamic List */}
                <div className="pt-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-xs font-semibold text-neutral-800 block">
                        Assistant Managers (AM)
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Designated Assistant Store Managers on authoritative roster.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddAssistantManager}
                      className="border border-neutral-300 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 flex items-center gap-1.5 cursor-pointer bg-white text-neutral-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Add AM</span>
                    </button>
                  </div>

                  {(formData.assistantStoreManagerNames || []).length === 0 ? (
                    <div className="py-2 text-xs text-neutral-400 italic">
                      No Assistant Managers currently assigned.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(formData.assistantStoreManagerNames || []).map((amName, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={amName}
                            onChange={(e) => handleUpdateAssistantManager(idx, e.target.value)}
                            placeholder="Full name of Assistant Manager..."
                            className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveAssistantManager(idx)}
                            className="p-2 text-neutral-400 hover:text-red-700 cursor-pointer rounded hover:bg-neutral-100 transition-colors"
                            title="Remove Assistant Manager"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Designated Key Holders Dynamic List */}
                <div className="pt-4 border-t border-neutral-200">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-xs font-semibold text-neutral-800 block">
                        Designated Key Holders (KH)
                      </span>
                      <span className="text-[11px] text-neutral-500">
                        Authorized physical keyholders and shift leads.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddKeyHolder}
                      className="border border-neutral-300 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 flex items-center gap-1.5 cursor-pointer bg-white text-neutral-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Add Key</span>
                    </button>
                  </div>

                  {(formData.keyHolderNames || []).length === 0 ? (
                    <div className="py-2 text-xs text-neutral-400 italic">
                      No Designated Key Holders registered.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(formData.keyHolderNames || []).map((khName, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={khName}
                            onChange={(e) => handleUpdateKeyHolder(idx, e.target.value)}
                            placeholder="Full name of Key Holder..."
                            className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyHolder(idx)}
                            className="p-2 text-neutral-400 hover:text-red-700 cursor-pointer rounded hover:bg-neutral-100 transition-colors"
                            title="Remove Key Holder"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: STANDARD HOURS RESTORATION */}
          {activeTab === 'hours' && (
            <div className="space-y-6">
              
              {/* Light blue Authoritative Regular Operating Hours info banner */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-xs text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-900">Authoritative Regular Operating Hours</h4>
                  <p className="text-blue-800 mt-0.5 leading-relaxed">
                    Set the baseline weekly operating schedule for Store #{formData.storeNumber || location.storeNumber}. 
                    These hours automatically populate customer QR landing portals, external directories, and Google Business Profiles.
                  </p>
                </div>
              </div>

              {/* Horizontal Template Control Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-neutral-700">Apply Template:</span>
                  <select
                    onChange={(e) => handleApplyTemplate(e.target.value)}
                    defaultValue=""
                    className="bg-white border border-neutral-300 text-neutral-800 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                  >
                    <option value="" disabled>Select hours template...</option>
                    {hoursTemplates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyMonToWeekdays}
                    className="border border-neutral-300 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 text-neutral-700 cursor-pointer bg-white transition-colors"
                  >
                    Copy Mon to Mon–Fri
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyMonToAll}
                    className="border border-neutral-300 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 text-neutral-700 cursor-pointer bg-white transition-colors"
                  >
                    Copy Mon to All
                  </button>
                </div>
              </div>

              {/* Flat 7-Day Grid: When "Closed" checked, label turns red and displays "Closed all day" */}
              <div className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
                {DAYS.map(({ key, label }) => {
                  const day = formData.standardHours?.[key] || { open: '10:00', close: '20:00', isClosed: false };
                  return (
                    <div key={key} className="py-3 flex items-center justify-between gap-4 text-xs">
                      <span className={`w-28 font-medium transition-colors ${day.isClosed ? 'text-red-600 font-semibold' : 'text-neutral-900'}`}>
                        {label}
                      </span>
                      
                      <div className="flex items-center gap-4 flex-1 justify-end">
                        <label className="flex items-center gap-1.5 cursor-pointer text-neutral-600">
                          <input
                            type="checkbox"
                            checked={day.isClosed}
                            onChange={(e) => handleDayHoursChange(key, { isClosed: e.target.checked })}
                            className="rounded border-neutral-300 bg-white text-red-600 focus:ring-0 cursor-pointer"
                          />
                          <span className={day.isClosed ? 'text-red-600 font-semibold' : ''}>Closed</span>
                        </label>

                        {!day.isClosed ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="time"
                              value={day.open}
                              onChange={(e) => handleDayHoursChange(key, { open: e.target.value })}
                              className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md text-neutral-900 text-xs focus:outline-none focus:border-red-500 font-mono"
                            />
                            <span className="text-neutral-400">to</span>
                            <input
                              type="time"
                              value={day.close}
                              onChange={(e) => handleDayHoursChange(key, { close: e.target.value })}
                              className="px-2.5 py-1.5 bg-white border border-neutral-300 rounded-md text-neutral-900 text-xs focus:outline-none focus:border-red-500 font-mono"
                            />
                          </div>
                        ) : (
                          <span className="text-red-600 font-medium italic px-2 py-1">Closed all day</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

          {/* TAB 3: HOLIDAY & SPECIAL HOURS TAB RESTORATION */}
          {activeTab === 'holidays' && (
            <div className="space-y-6">
              
              {/* Header with Quick Preset Dropdown & Add Button */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-neutral-200">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Holiday Hours & Special Overrides
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Define special operating hours or planned full-day closures on calendar dates.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Quick Preset Dropdown */}
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleApplyHolidayPreset(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    className="bg-white border border-neutral-300 text-neutral-800 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                  >
                    <option value="" disabled>Quick preset...</option>
                    {corporateHolidays.map(h => (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.date}) — {h.status}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleAddHolidayOverride}
                    className="border border-neutral-300 rounded-md px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 flex items-center gap-1.5 cursor-pointer bg-white text-neutral-700 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Add Exception</span>
                  </button>
                </div>
              </div>

              {/* Clean Inline Date/Time Exception Inputs */}
              {(formData.holidayHours || []).length === 0 ? (
                <div className="p-8 border border-dashed border-neutral-300 rounded-lg text-center space-y-2">
                  <Calendar className="w-8 h-8 text-neutral-300 mx-auto" />
                  <p className="text-xs text-neutral-600 font-medium">No holiday hours overrides defined for this location.</p>
                  <p className="text-[11px] text-neutral-400">
                    Select an item from the "Quick preset" dropdown above or click [Add Exception] to create a custom override.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-200 border-t border-b border-neutral-200">
                  {(formData.holidayHours || []).map((h) => (
                    <div key={h.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                      {/* Name & Date */}
                      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                        <input
                          type="text"
                          value={h.holidayName}
                          onChange={(e) => handleUpdateHolidayOverride(h.id, { holidayName: e.target.value })}
                          placeholder="Holiday / Occasion name..."
                          className="px-3 py-1.5 bg-white border border-neutral-300 rounded-md text-neutral-900 text-xs focus:outline-none focus:border-red-600 flex-1 min-w-[160px]"
                        />
                        <input
                          type="date"
                          value={h.date}
                          onChange={(e) => handleUpdateHolidayOverride(h.id, { date: e.target.value })}
                          className="px-3 py-1.5 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-xs focus:outline-none focus:border-red-600 w-36"
                        />
                      </div>

                      {/* Closed toggle & Time Inputs */}
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer text-neutral-700">
                          <input
                            type="checkbox"
                            checked={h.hours.isClosed}
                            onChange={(e) => handleUpdateHolidayOverride(h.id, {
                              hours: { ...h.hours, isClosed: e.target.checked }
                            })}
                            className="rounded border-neutral-300 text-red-600 focus:ring-0 cursor-pointer"
                          />
                          <span className={h.hours.isClosed ? 'text-red-600 font-semibold' : ''}>Closed</span>
                        </label>

                        {!h.hours.isClosed ? (
                          <div className="flex items-center gap-1.5 font-mono">
                            <input
                              type="time"
                              value={h.hours.open}
                              onChange={(e) => handleUpdateHolidayOverride(h.id, {
                                hours: { ...h.hours, open: e.target.value }
                              })}
                              className="px-2 py-1 bg-white border border-neutral-300 rounded-md text-xs"
                            />
                            <span className="text-neutral-400">to</span>
                            <input
                              type="time"
                              value={h.hours.close}
                              onChange={(e) => handleUpdateHolidayOverride(h.id, {
                                hours: { ...h.hours, close: e.target.value }
                              })}
                              className="px-2 py-1 bg-white border border-neutral-300 rounded-md text-xs"
                            />
                          </div>
                        ) : (
                          <span className="text-red-600 italic px-2 py-1 font-medium">Closed all day</span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleRemoveHolidayOverride(h.id)}
                          className="p-1.5 text-neutral-400 hover:text-red-700 cursor-pointer rounded hover:bg-neutral-100 transition-colors"
                          title="Remove exception"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Temporary Notice Section - Clean & Flat */}
              <div className="pt-4 border-t border-neutral-200 space-y-3">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-neutral-500" />
                  <h4 className="text-xs font-semibold text-neutral-800">
                    Temporary Operating Notice (Optional)
                  </h4>
                </div>
                <p className="text-xs text-neutral-500">
                    Broadcasts a temporary notification on public directory pages and internal store cards.
                </p>

                <div className="space-y-3">
                  <textarea
                    rows={2}
                    placeholder="e.g. Center concourse renovation in progress. Please enter through west mall entrance."
                    value={formData.activeNotice?.shortDescription || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val.trim()) {
                        setFormData({ ...formData, activeNotice: undefined });
                      } else {
                        setFormData({
                          ...formData,
                          activeNotice: {
                            shortDescription: val,
                            effectiveDate: formData.activeNotice?.effectiveDate || new Date().toISOString().slice(0, 10),
                            expectedResolutionDate: formData.activeNotice?.expectedResolutionDate
                          }
                        });
                      }
                    }}
                    className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-md text-neutral-900 text-sm focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                  />

                  {formData.activeNotice && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Effective Date
                        </label>
                        <input
                          type="date"
                          value={formData.activeNotice.effectiveDate}
                          onChange={(e) => setFormData({
                            ...formData,
                            activeNotice: {
                              ...formData.activeNotice!,
                              effectiveDate: e.target.value
                            }
                          })}
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Expected Resolution Date
                        </label>
                        <input
                          type="date"
                          value={formData.activeNotice.expectedResolutionDate || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            activeNotice: {
                              ...formData.activeNotice!,
                              expectedResolutionDate: e.target.value || undefined
                            }
                          })}
                          className="w-full px-3 py-1.5 bg-white border border-neutral-300 rounded-md text-neutral-900 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

        </form>

        {/* Sticky Action Footer */}
        <div className="sticky bottom-0 z-20 bg-white border-t border-neutral-200 p-4 flex items-center justify-between shrink-0 shadow-sm">
          <div>
            {!isCreating && formData.recordStatus === 'Active' ? (
              <button
                type="button"
                onClick={handleToggleRetire}
                className="px-3 py-2 bg-white hover:bg-neutral-100 text-neutral-700 border border-neutral-300 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              >
                <Archive className="w-3.5 h-3.5 text-neutral-500" />
                <span>Retire Store</span>
              </button>
            ) : !isCreating ? (
              <button
                type="button"
                onClick={handleToggleRetire}
                className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
              >
                <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                <span>Reactivate Store</span>
              </button>
            ) : <div />}
          </div>

          {/* Flex right-aligned buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={requestClose}
              className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="location-edit-form"
              className="bg-red-700 hover:bg-red-800 text-white shadow-sm rounded-md px-5 py-2 text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{isCreating ? 'Create Location' : 'Save Authoritative Record'}</span>
            </button>
          </div>
        </div>

      </div>

      <ConfirmDialog
        isOpen={confirmation !== null}
        title={confirmation === 'discard'
          ? 'Discard unsaved changes?'
          : confirmation === 'retire'
          ? 'Retire this store?'
          : 'Reactivate this store?'}
        description={confirmation === 'discard'
          ? 'Your changes have not been saved and will be permanently discarded.'
          : confirmation === 'retire'
          ? 'The store will be marked permanently closed and hidden from the active directory after you save the record.'
          : 'The store will return to the active directory with normal operating status after you save the record.'}
        confirmLabel={confirmation === 'discard'
          ? 'Discard changes'
          : confirmation === 'retire'
          ? 'Retire store'
          : 'Reactivate store'}
        tone={confirmation === 'reactivate' ? 'primary' : 'danger'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
};
