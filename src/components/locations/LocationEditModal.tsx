import React, { useState } from 'react';
import { 
  X, 
  Save, 
  Building, 
  MapPin, 
  Phone, 
  Clock, 
  User, 
  AlertTriangle,
  Plus,
  Trash2
} from 'lucide-react';
import { LocationRecord, LocationType, OperationalStatus } from '../../types';
import { useDirectory } from '../../context/DirectoryContext';

interface LocationEditModalProps {
  location: LocationRecord | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LocationEditModal: React.FC<LocationEditModalProps> = ({
  location,
  isOpen,
  onClose,
}) => {
  const { addLocation, updateLocation, people, currentUser } = useDirectory();

  const isNew = !location;

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
        monday: { open: '10:00 AM', close: '09:00 PM' },
        tuesday: { open: '10:00 AM', close: '09:00 PM' },
        wednesday: { open: '10:00 AM', close: '09:00 PM' },
        thursday: { open: '10:00 AM', close: '09:00 PM' },
        friday: { open: '10:00 AM', close: '09:00 PM' },
        saturday: { open: '10:00 AM', close: '09:00 PM' },
        sunday: { open: '11:00 AM', close: '07:00 PM' },
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

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.storeNumber || !formData.name || !formData.phone || !formData.address) {
      alert('Please fill out required fields: Store #, Name, Phone, and Address.');
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
      updateLocation(location!.id, updatedData, 'Admin Direct Edit');
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-6 animate-fadeIn">
      <div 
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 bg-neutral-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-base">
              {isNew ? 'Create New Authoritative Store Record' : `Edit Store #${formData.storeNumber} (${formData.name})`}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 text-neutral-400 hover:text-white rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
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
                  value={formData.storeNumber}
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
                  value={formData.name}
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
                  value={formData.type}
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
                value={formData.address}
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
                  value={formData.city}
                  onChange={e => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                />
              </div>
              <div>
                <label className="block text-neutral-500 mb-1">State *</label>
                <select
                  value={formData.state}
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
                <label className="block text-neutral-500 mb-1">ZIP Code (Text) *</label>
                <input
                  type="text"
                  required
                  value={formData.zipCode}
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
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(555) 000-0000"
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-500 mb-1">Time Zone (for Today's Hours)</label>
                <select
                  value={formData.timeZone}
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
                  value={formData.district}
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
                  value={amInput}
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
                  value={keyInput}
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

          {/* Section 4: Operational Status & Extended Location Notices (Blueprint Sec 8) */}
          <div className="p-3.5 bg-neutral-50 dark:bg-neutral-800/40 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-3">
            <div className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 text-xs uppercase">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>Operational Status & Extended Location Notices (Blueprint Sec 8)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-neutral-500 mb-1">Current Status</label>
                <select
                  value={formData.operationalStatus}
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
                  value={formData.recordStatus}
                  onChange={e => setFormData({ ...formData, recordStatus: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                >
                  <option value="Active">Active (In Directory)</option>
                  <option value="Inactive">Inactive</option>
                  <option value="Archived">Archived / Decommissioned</option>
                </select>
              </div>
            </div>

            {/* Extended Notice Details Fields */}
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
                    Notice Short Description (Reason for status change / customer notice) *
                  </label>
                  <input
                    type="text"
                    value={noticeDesc}
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
                      value={noticeEffectiveDate}
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
                      value={noticeResolutionDate}
                      onChange={e => setNoticeResolutionDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded text-xs"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="pt-3 border-t border-neutral-200 dark:border-neutral-700 flex items-center justify-end gap-2">
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
        </form>
      </div>
    </div>
  );
};
