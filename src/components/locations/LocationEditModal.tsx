import React, { useState } from 'react';
import { 
  X, 
  Save, 
  Building, 
  MapPin, 
  Phone, 
  Clock, 
  Calendar,
  User, 
  AlertTriangle,
  Plus,
  Trash2,
  Sparkles,
  Info
} from 'lucide-react';
import { 
  LocationRecord, 
  LocationType, 
  OperationalStatus, 
  WeeklySchedule, 
  HolidayHoursOverride, 
  SpecialHoursOverride 
} from '../../types';
import { useDirectory } from '../../context/DirectoryContext';
import { WeeklyHoursEditor } from '../common/WeeklyHoursEditor';

interface LocationEditModalProps {
  location: LocationRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

type EditTab = 'details' | 'standard-hours' | 'holiday-hours';

const COMMON_HOLIDAY_PRESETS = [
  { name: 'Thanksgiving Day', defaultClosed: true },
  { name: 'Black Friday', defaultOpen: '06:00 AM', defaultClose: '10:00 PM', defaultClosed: false },
  { name: 'Christmas Eve', defaultOpen: '09:00 AM', defaultClose: '06:00 PM', defaultClosed: false },
  { name: 'Christmas Day', defaultClosed: true },
  { name: 'New Year\'s Eve', defaultOpen: '10:00 AM', defaultClose: '06:00 PM', defaultClosed: false },
  { name: 'New Year\'s Day', defaultOpen: '11:00 AM', defaultClose: '07:00 PM', defaultClosed: false },
  { name: 'Memorial Day', defaultOpen: '10:00 AM', defaultClose: '08:00 PM', defaultClosed: false },
  { name: 'Labor Day', defaultOpen: '10:00 AM', defaultClose: '08:00 PM', defaultClosed: false },
  { name: 'Independence Day (4th of July)', defaultOpen: '10:00 AM', defaultClose: '06:00 PM', defaultClosed: false },
];

export const LocationEditModal: React.FC<LocationEditModalProps> = ({
  location,
  isOpen,
  onClose,
}) => {
  const { addLocation, updateLocation, currentUser, hoursTemplates } = useDirectory();

  const isNew = !location;
  const [activeTab, setActiveTab] = useState<EditTab>('details');

  const [formData, setFormData] = useState<Partial<LocationRecord>>(() => {
    if (location) return { ...location };
    return {
      storeNumber: '',
      name: '',
      type: 'Enclosed Mall',
      mallOrCenterName: '',
      address: '',
      city: '',
      state: 'CA',
      zipCode: '',
      phone: '',
      timeZone: 'America/Los_Angeles',
      region: 'Southern California',
      district: 'District 1 (Rudy Calderon)',
      districtManagerName: 'Rudy Calderon',
      storeManagerName: '',
      storeManagerPhone: '',
      assistantStoreManagerNames: [],
      keyHolderNames: [],
      operationalStatus: 'Open — Normal Operations',
      recordStatus: 'Active',
      standardHours: {
        monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
        tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
        wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
        thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
        friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
        saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
        sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
      },
      specialHours: [],
      holidayHours: [],
      activeNotice: undefined,
    };
  });

  const [noticeDesc, setNoticeDesc] = useState<string>(location?.activeNotice?.shortDescription || '');
  const [noticeEffectiveDate, setNoticeEffectiveDate] = useState<string>(
    location?.activeNotice?.effectiveDate || new Date().toISOString().split('T')[0]
  );
  const [noticeResolutionDate, setNoticeResolutionDate] = useState<string>(
    location?.activeNotice?.expectedResolutionDate || ''
  );
  const [hasNotice, setHasNotice] = useState<boolean>(
    Boolean(location?.activeNotice || (location && location.operationalStatus !== 'Open — Normal Operations'))
  );

  const [amInput, setAmInput] = useState('');
  const [keyInput, setKeyInput] = useState('');

  // Sync state when location or modal open state changes
  React.useEffect(() => {
    if (!isOpen) return;
    if (location) {
      setFormData({
        ...location,
        storeNumber: location.storeNumber || '',
        name: location.name || '',
        type: location.type || 'Enclosed Mall',
        mallOrCenterName: location.mallOrCenterName || '',
        address: location.address || '',
        city: location.city || '',
        state: location.state || 'CA',
        zipCode: location.zipCode || '',
        phone: location.phone || '',
        timeZone: location.timeZone || 'America/Los_Angeles',
        region: location.region || 'Southern California',
        district: location.district || 'District 1 (Rudy Calderon)',
        districtManagerName: location.districtManagerName || 'Rudy Calderon',
        storeManagerName: location.storeManagerName || '',
        storeManagerPhone: location.storeManagerPhone || '',
        assistantStoreManagerNames: location.assistantStoreManagerNames || [],
        keyHolderNames: location.keyHolderNames || [],
        operationalStatus: location.operationalStatus || 'Open — Normal Operations',
        recordStatus: location.recordStatus || 'Active',
        standardHours: location.standardHours || {
          monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
        },
        specialHours: location.specialHours || [],
        holidayHours: location.holidayHours || [],
        activeNotice: location.activeNotice,
      });
      setNoticeDesc(location.activeNotice?.shortDescription || '');
      setNoticeEffectiveDate(location.activeNotice?.effectiveDate || new Date().toISOString().split('T')[0]);
      setNoticeResolutionDate(location.activeNotice?.expectedResolutionDate || '');
      setHasNotice(Boolean(location.activeNotice || (location.operationalStatus !== 'Open — Normal Operations')));
    } else {
      setFormData({
        storeNumber: '',
        name: '',
        type: 'Enclosed Mall',
        mallOrCenterName: '',
        address: '',
        city: '',
        state: 'CA',
        zipCode: '',
        phone: '',
        timeZone: 'America/Los_Angeles',
        region: 'Southern California',
        district: 'District 1 (Rudy Calderon)',
        districtManagerName: 'Rudy Calderon',
        storeManagerName: '',
        storeManagerPhone: '',
        assistantStoreManagerNames: [],
        keyHolderNames: [],
        operationalStatus: 'Open — Normal Operations',
        recordStatus: 'Active',
        standardHours: {
          monday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          tuesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          wednesday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          thursday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          friday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          saturday: { open: '10:00 AM', close: '09:00 PM', isClosed: false },
          sunday: { open: '11:00 AM', close: '07:00 PM', isClosed: false },
        },
        specialHours: [],
        holidayHours: [],
        activeNotice: undefined,
      });
      setNoticeDesc('');
      setNoticeEffectiveDate(new Date().toISOString().split('T')[0]);
      setNoticeResolutionDate('');
      setHasNotice(false);
    }
  }, [location, isOpen]);

  // New Holiday Exception inputs
  const [newHolidayName, setNewHolidayName] = useState('Thanksgiving Day');
  const [newHolidayDate, setNewHolidayDate] = useState(new Date().toISOString().split('T')[0]);
  const [newHolidayIsClosed, setNewHolidayIsClosed] = useState(true);
  const [newHolidayOpen, setNewHolidayOpen] = useState('10:00 AM');
  const [newHolidayClose, setNewHolidayClose] = useState('06:00 PM');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.storeNumber || !formData.name || !formData.phone || !formData.address) {
      alert('Please fill out required fields: Store #, Name, Phone, and Address.');
      setActiveTab('details');
      return;
    }

    const updatedData: Partial<LocationRecord> = { ...formData };

    // Handle Active Notice assignment
    if (formData.operationalStatus !== 'Open — Normal Operations' || (hasNotice && noticeDesc.trim())) {
      updatedData.activeNotice = {
        status: formData.operationalStatus || 'Temporarily Closed',
        shortDescription: noticeDesc.trim() || `Operational status change: ${formData.operationalStatus}`,
        effectiveDate: noticeEffectiveDate || new Date().toISOString().split('T')[0],
        expectedResolutionDate: noticeResolutionDate.trim() || undefined,
        lastUpdatedDate: new Date().toISOString().split('T')[0],
        updatedBy: currentUser.displayName || 'Data Steward',
      };
    } else {
      updatedData.activeNotice = undefined;
    }

    if (isNew) {
      addLocation(updatedData as LocationRecord);
    } else {
      updateLocation(location!.id, updatedData, 'Authoritative Store Edit & Schedule Update (DISPATCH-012)');
    }
    onClose();
  };

  const addAssistant = () => {
    if (!amInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      assistantStoreManagerNames: [...(prev.assistantStoreManagerNames || []), amInput.trim()]
    }));
    setAmInput('');
  };

  const removeAssistant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      assistantStoreManagerNames: prev.assistantStoreManagerNames?.filter((_, i) => i !== index)
    }));
  };

  const addKeyholder = () => {
    if (!keyInput.trim()) return;
    setFormData(prev => ({
      ...prev,
      keyHolderNames: [...(prev.keyHolderNames || []), keyInput.trim()]
    }));
    setKeyInput('');
  };

  const removeKeyholder = (index: number) => {
    setFormData(prev => ({
      ...prev,
      keyHolderNames: prev.keyHolderNames?.filter((_, i) => i !== index)
    }));
  };

  const handleAddHolidayOverride = () => {
    if (!newHolidayName.trim() || !newHolidayDate) return;

    const newHoliday: HolidayHoursOverride = {
      id: `hol-${Date.now().toString(36)}`,
      holidayName: newHolidayName.trim(),
      date: newHolidayDate,
      hours: {
        open: newHolidayIsClosed ? 'Closed' : newHolidayOpen,
        close: newHolidayIsClosed ? 'Closed' : newHolidayClose,
        isClosed: newHolidayIsClosed,
      }
    };

    setFormData(prev => ({
      ...prev,
      holidayHours: [
        ...(prev.holidayHours || []).filter(h => h.date !== newHolidayDate),
        newHoliday
      ]
    }));
  };

  const handleRemoveHolidayOverride = (id: string) => {
    setFormData(prev => ({
      ...prev,
      holidayHours: (prev.holidayHours || []).filter(h => h.id !== id)
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-red-500" />
            <div>
              <h3 className="font-bold text-base">
                {isNew ? 'Create New Authoritative Store Record' : `Edit Store #${formData.storeNumber} (${formData.name})`}
              </h3>
              <p className="text-[11px] text-neutral-400">
                Authoritative Master Record & GBP Operating Hours Engine (DISPATCH-012)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Distinct Tabs (DISPATCH-012) */}
        <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 px-4 pt-2 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`px-3.5 py-2 font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'details'
                ? 'border-red-600 text-red-600 dark:text-red-400 font-bold bg-white dark:bg-neutral-900 rounded-t-md'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            <span>Store Details & Status</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('standard-hours')}
            className={`px-3.5 py-2 font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'standard-hours'
                ? 'border-red-600 text-red-600 dark:text-red-400 font-bold bg-white dark:bg-neutral-900 rounded-t-md'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Standard Hours (7-Day Grid)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('holiday-hours')}
            className={`px-3.5 py-2 font-medium border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'holiday-hours'
                ? 'border-red-600 text-red-600 dark:text-red-400 font-bold bg-white dark:bg-neutral-900 rounded-t-md'
                : 'border-transparent text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Holiday & Special Hours</span>
            {formData.holidayHours && formData.holidayHours.length > 0 && (
              <span className="px-1.5 py-0.2 bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 font-bold text-[10px] rounded-full">
                {formData.holidayHours.length}
              </span>
            )}
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs flex-1">
          {/* TAB 1: Store Details & Status */}
          {activeTab === 'details' && (
            <div className="space-y-4">
              {/* Section 1: Identification */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs uppercase">
                  <span>Core Identification</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Store / Location # *</label>
                    <input
                      type="text"
                      required
                      value={formData.storeNumber || ''}
                      onChange={e => setFormData({ ...formData, storeNumber: e.target.value })}
                      placeholder="e.g. 42"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-neutral-500 mb-1">Store Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Mission St. Flagship"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Location Type</label>
                    <select
                      value={formData.type || 'Enclosed Mall'}
                      onChange={e => setFormData({ ...formData, type: e.target.value as LocationType })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
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
                    <label className="block text-neutral-500 mb-1">Mall / Shopping Center Name</label>
                    <input
                      type="text"
                      value={formData.mallOrCenterName || ''}
                      onChange={e => setFormData({ ...formData, mallOrCenterName: e.target.value })}
                      placeholder="Optional center name"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Address & Phone */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs uppercase">
                  <span>Address, Phone & Timezone</span>
                </div>
                <div>
                  <label className="block text-neutral-500 mb-1">Street Address *</label>
                  <input
                    type="text"
                    required
                    value={formData.address || ''}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    placeholder="123 Main St, Suite #100"
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-neutral-500 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={formData.city || ''}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-500 mb-1">State *</label>
                    <select
                      value={formData.state || 'CA'}
                      onChange={e => setFormData({ ...formData, state: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    >
                      <option value="CA">CA (California)</option>
                      <option value="NV">NV (Nevada)</option>
                      <option value="WA">WA (Washington)</option>
                      <option value="OR">OR (Oregon)</option>
                      <option value="TX">TX (Texas)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-500 mb-1">ZIP Code *</label>
                    <input
                      type="text"
                      required
                      value={formData.zipCode || ''}
                      onChange={e => setFormData({ ...formData, zipCode: e.target.value })}
                      placeholder="94110"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-500 mb-1">Store Phone *</label>
                    <input
                      type="text"
                      required
                      value={formData.phone || ''}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(555) 000-0000"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Time Zone (for Today's Hours & Local Clocks)</label>
                    <select
                      value={formData.timeZone || 'America/Los_Angeles'}
                      onChange={e => setFormData({ ...formData, timeZone: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    >
                      <option value="America/Los_Angeles">Pacific Time (CA, NV, WA, OR)</option>
                      <option value="America/Chicago">Central Time (TX)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-500 mb-1">District / Region</label>
                    <select
                      value={formData.district || 'District 1 (Rudy Calderon)'}
                      onChange={e => {
                        const dist = e.target.value;
                        let dm = 'Rudy Calderon';
                        if (dist.includes('David Castro')) dm = 'David Castro';
                        if (dist.includes('Karlo Llovido')) dm = 'Karlo Llovido';
                        setFormData({ ...formData, district: dist, districtManagerName: dm });
                      }}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    >
                      <option value="District 1 (Rudy Calderon)">District 1 (Rudy Calderon - NorCal / NV / WA / OR / TX)</option>
                      <option value="District 2 (David Castro)">District 2 (David Castro - Central Valley & LA Central)</option>
                      <option value="District 3 (Karlo Llovido)">District 3 (Karlo Llovido - Inland Empire / South Bay / SD)</option>
                      <option value="Non-Retail / Corporate">Non-Retail / Corporate</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 3: Leadership Assignment */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs uppercase">
                  <span>Store Leadership Assignment</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Store Manager Name</label>
                    <input
                      type="text"
                      value={formData.storeManagerName || ''}
                      onChange={e => setFormData({ ...formData, storeManagerName: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-500 mb-1">Store Manager Directory Phone</label>
                    <input
                      type="text"
                      value={formData.storeManagerPhone || ''}
                      onChange={e => setFormData({ ...formData, storeManagerPhone: e.target.value })}
                      placeholder="(555) 000-0000"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Assistant Managers Tag List */}
                <div>
                  <label className="block text-neutral-500 mb-1">Assistant Store Managers</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={amInput || ''}
                      onChange={e => setAmInput(e.target.value)}
                      placeholder="Assistant Manager name"
                      className="flex-1 px-2.5 py-1 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={addAssistant}
                      className="px-2.5 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs font-medium hover:bg-neutral-300"
                    >
                      Add AM
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.assistantStoreManagerNames?.map((am, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs">
                        <span>{am}</span>
                        <button type="button" onClick={() => removeAssistant(i)} className="text-neutral-400 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Key Holders Tag List */}
                <div>
                  <label className="block text-neutral-500 mb-1">Key Holders / 2nd / 3rd Keys</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={keyInput || ''}
                      onChange={e => setKeyInput(e.target.value)}
                      placeholder="Key holder name"
                      className="flex-1 px-2.5 py-1 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={addKeyholder}
                      className="px-2.5 py-1 bg-neutral-200 dark:bg-neutral-700 rounded text-xs font-medium hover:bg-neutral-300"
                    >
                      Add Key
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {formData.keyHolderNames?.map((kh, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-xs">
                        <span>{kh}</span>
                        <button type="button" onClick={() => removeKeyholder(i)} className="text-neutral-400 hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 4: Operational Status & Extended Location Notices */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs uppercase">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span>Operational Status & Extended Location Notices</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Current Status</label>
                    <select
                      value={formData.operationalStatus || 'Open — Normal Operations'}
                      onChange={e => {
                        const newStatus = e.target.value as OperationalStatus;
                        setFormData({ ...formData, operationalStatus: newStatus });
                        if (newStatus !== 'Open — Normal Operations') {
                          setHasNotice(true);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-semibold"
                    >
                      <option value="Open — Normal Operations">Open — Normal Operations</option>
                      <option value="Opening Soon">Opening Soon</option>
                      <option value="Temporarily Closed">Temporarily Closed</option>
                      <option value="Modified Hours">Modified Hours</option>
                      <option value="Under Remodel">Under Remodel</option>
                      <option value="Maintenance / Repair Issue">Maintenance / Repair Issue</option>
                      <option value="Relocating">Relocating</option>
                      <option value="Closing">Closing</option>
                      <option value="Permanently Closed">Permanently Closed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-neutral-500 mb-1">Record Lifecycle</label>
                    <select
                      value={formData.recordStatus || 'Active'}
                      onChange={e => setFormData({ ...formData, recordStatus: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    >
                      <option value="Active">Active (In Directory)</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Archived">Archived / Decommissioned</option>
                    </select>
                  </div>
                </div>

                {(formData.operationalStatus !== 'Open — Normal Operations' || hasNotice) && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-lg space-y-3">
                    <div className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center justify-between">
                      <span>Extended Notice Details & Resolution Timeline</span>
                      {formData.operationalStatus === 'Open — Normal Operations' && (
                        <button
                          type="button"
                          onClick={() => {
                            setHasNotice(false);
                            setNoticeDesc('');
                            setNoticeResolutionDate('');
                          }}
                          className="text-[10px] text-red-600 hover:underline"
                        >
                          Clear Notice
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                        Notice Short Description *
                      </label>
                      <input
                        type="text"
                        value={noticeDesc || ''}
                        onChange={e => setNoticeDesc(e.target.value)}
                        placeholder="e.g. Store temporarily closed for HVAC renovation and interior remodeling."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-amber-300 dark:border-amber-800 rounded text-xs text-neutral-900 dark:text-neutral-100"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                          Effective Date
                        </label>
                        <input
                          type="date"
                          value={noticeEffectiveDate || ''}
                          onChange={e => setNoticeEffectiveDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 mb-1">
                          Expected Resolution / Reopening Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={noticeResolutionDate || ''}
                          onChange={e => setNoticeResolutionDate(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Standard Hours (7-Day Visual Grid) */}
          {activeTab === 'standard-hours' && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-lg flex items-start gap-2">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 dark:text-blue-200">
                  <p className="font-semibold">Authoritative Regular Operating Hours</p>
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-0.5">
                    Configure standard weekly operating hours for store #{formData.storeNumber}. These hours automatically power the directory's "Today's Hours" badge and Google Business Profile (GBP) synchronization.
                  </p>
                </div>
              </div>

              <WeeklyHoursEditor
                value={formData.standardHours as WeeklySchedule}
                onChange={newSched => setFormData({ ...formData, standardHours: newSched })}
                templates={hoursTemplates}
              />
            </div>
          )}

          {/* TAB 3: Holiday & Special Hours */}
          {activeTab === 'holiday-hours' && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-lg flex items-start gap-2">
                <Calendar className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="text-xs text-red-800 dark:text-red-200">
                  <p className="font-semibold">Holiday & Special Hours Exceptions (GBP Schema)</p>
                  <p className="text-[11px] text-red-700 dark:text-red-300 mt-0.5">
                    Add specific calendar exceptions (e.g., Thanksgiving, Black Friday, Christmas Eve). On these dates, the directory and Google Maps will display the exception instead of regular standard hours.
                  </p>
                </div>
              </div>

              {/* Add Exception Form */}
              <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
                <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center justify-between text-xs">
                  <span className="uppercase">Add Calendar Exception</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-neutral-400">Quick preset:</span>
                    <select
                      onChange={e => {
                        const p = COMMON_HOLIDAY_PRESETS.find(x => x.name === e.target.value);
                        if (p) {
                          setNewHolidayName(p.name);
                          setNewHolidayIsClosed(p.defaultClosed);
                          if (p.defaultOpen) setNewHolidayOpen(p.defaultOpen);
                          if (p.defaultClose) setNewHolidayClose(p.defaultClose);
                        }
                      }}
                      className="px-2 py-0.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-[10px]"
                    >
                      {COMMON_HOLIDAY_PRESETS.map(p => (
                        <option key={p.name} value={p.name}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-neutral-500 mb-1">Holiday / Exception Name</label>
                    <input
                      type="text"
                      value={newHolidayName || ''}
                      onChange={e => setNewHolidayName(e.target.value)}
                      placeholder="e.g. Thanksgiving Day"
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-500 mb-1">Exception Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      value={newHolidayDate || ''}
                      onChange={e => setNewHolidayDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-end pb-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={Boolean(newHolidayIsClosed)}
                        onChange={e => setNewHolidayIsClosed(e.target.checked)}
                        className="rounded border-neutral-300 dark:border-neutral-700 text-red-600 focus:ring-red-500 w-4 h-4"
                      />
                      <span className={newHolidayIsClosed ? 'font-bold text-red-600 dark:text-red-400' : 'text-neutral-600 dark:text-neutral-300'}>
                        Closed All Day
                      </span>
                    </label>
                  </div>
                </div>

                {!newHolidayIsClosed && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <div>
                      <label className="block text-neutral-500 mb-1">Open Time</label>
                      <input
                        type="text"
                        value={newHolidayOpen || ''}
                        onChange={e => setNewHolidayOpen(e.target.value)}
                        placeholder="06:00 AM"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-500 mb-1">Close Time</label>
                      <input
                        type="text"
                        value={newHolidayClose || ''}
                        onChange={e => setNewHolidayClose(e.target.value)}
                        placeholder="10:00 PM"
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddHolidayOverride}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-semibold text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Exception to Schedule</span>
                </button>
              </div>

              {/* List of Configured Exceptions */}
              <div className="space-y-2">
                <div className="font-semibold text-neutral-700 dark:text-neutral-300 text-xs">
                  Active Holiday Exceptions ({formData.holidayHours?.length || 0})
                </div>

                {(!formData.holidayHours || formData.holidayHours.length === 0) ? (
                  <div className="p-6 text-center border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-400 text-xs">
                    No holiday hours configured for this store yet. Add holiday overrides above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {formData.holidayHours.map(hol => (
                      <div
                        key={hol.id}
                        className="p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-red-50 dark:bg-red-950/40 rounded text-red-600 dark:text-red-400">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-neutral-900 dark:text-neutral-100 text-xs">
                              {hol.holidayName}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono">
                              Date: {hol.date}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                            hol.hours.isClosed || hol.hours.open === 'Closed'
                              ? 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}>
                            {hol.hours.isClosed || hol.hours.open === 'Closed'
                              ? 'CLOSED ALL DAY'
                              : `${hol.hours.open} – ${hol.hours.close}`}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveHolidayOverride(hol.id)}
                            className="p-1 text-neutral-400 hover:text-red-500 rounded transition-colors"
                            title="Remove exception"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-between">
            <div className="text-[11px] text-neutral-400">
              {activeTab === 'details' && 'Step 1 of 3: Core Information & Notice'}
              {activeTab === 'standard-hours' && 'Step 2 of 3: 7-Day Weekly Grid'}
              {activeTab === 'holiday-hours' && 'Step 3 of 3: Holiday Exceptions'}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded font-medium text-xs hover:bg-neutral-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-bold text-xs flex items-center gap-1.5 shadow-xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Authoritative Record</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
