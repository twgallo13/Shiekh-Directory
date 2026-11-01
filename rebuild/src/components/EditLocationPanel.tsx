import { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Save, AlertTriangle, FileText } from 'lucide-react';
import type { LocationDetail, StandardHours, Address, DayOfWeek, ClosureType, ClosureReasonCode, StoreTypeCode, HoursTemplate } from '../types';
import { STORE_TYPES } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiPatch, apiPost, apiGet } from '../lib/api';

interface EditLocationPanelProps {
  location: LocationDetail;
  field: 'hours' | 'contact' | 'closure' | 'directions' | 'storeType';
  onSave: () => void;
  onCancel: () => void;
}

const DAYS: DayOfWeek[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const CLOSURE_REASONS: { code: ClosureReasonCode; label: string }[] = [
  { code: 'ac_hvac', label: 'AC/HVAC Issue' },
  { code: 'power', label: 'Power/Utility Failure' },
  { code: 'mall_landlord', label: 'Mall/Landlord Issue' },
  { code: 'safety', label: 'Safety/Security Concern' },
  { code: 'weather', label: 'Weather-Related' },
  { code: 'staffing', label: 'Staffing Shortage' },
  { code: 'maintenance', label: 'Maintenance/Repair' },
  { code: 'remodel', label: 'Remodel/Renovation' },
  { code: 'relocation', label: 'Store Relocation' },
  { code: 'other', label: 'Other (specify)' },
];

const CLOSURE_TYPES: { type: ClosureType; label: string; description: string }[] = [
  { type: 'same_day', label: 'Same-day', description: 'Closes tonight at local midnight' },
  { type: 'multi_day', label: 'Multi-day', description: 'Specify an end date' },
  { type: 'unknown_end', label: 'Unknown end', description: 'Review date required' },
];

const DEFAULT_DAY_HOURS = { closed: true, intervals: [] as { open: string; close: string }[] };

function normalizeHours(hours: StandardHours | undefined | null): StandardHours {
  const defaultHours: StandardHours = {
    monday: DEFAULT_DAY_HOURS,
    tuesday: DEFAULT_DAY_HOURS,
    wednesday: DEFAULT_DAY_HOURS,
    thursday: DEFAULT_DAY_HOURS,
    friday: DEFAULT_DAY_HOURS,
    saturday: DEFAULT_DAY_HOURS,
    sunday: DEFAULT_DAY_HOURS,
  };
  if (!hours) return defaultHours;
  return {
    monday: hours.monday || DEFAULT_DAY_HOURS,
    tuesday: hours.tuesday || DEFAULT_DAY_HOURS,
    wednesday: hours.wednesday || DEFAULT_DAY_HOURS,
    thursday: hours.thursday || DEFAULT_DAY_HOURS,
    friday: hours.friday || DEFAULT_DAY_HOURS,
    saturday: hours.saturday || DEFAULT_DAY_HOURS,
    sunday: hours.sunday || DEFAULT_DAY_HOURS,
  };
}

export function EditLocationPanel({ location, field, onSave, onCancel }: EditLocationPanelProps) {
  const { authUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [phone, setPhone] = useState(location.mainPhone);
  const [email, setEmail] = useState(location.sharedInboxEmail || '');
  const [address, setAddress] = useState<Address>(location.address);
  const [hours, setHours] = useState<StandardHours>(() => normalizeHours(location.standardHours));

  // Directions form state
  const [wayfindingDirections, setWayfindingDirections] = useState(location.wayfindingDirections || '');

  // Store type form state
  const [storeType, setStoreType] = useState<StoreTypeCode | ''>(location.storeType || '');

  // Closure form state
  const [closureReasonCode, setClosureReasonCode] = useState<ClosureReasonCode | ''>('');
  const [closureReasonText, setClosureReasonText] = useState('');
  const [closureReasonNote, setClosureReasonNote] = useState('');
  const [closurePublicExplanation, setClosurePublicExplanation] = useState('');
  const [closureType, setClosureType] = useState<ClosureType>('same_day');
  const [closureEndsAt, setClosureEndsAt] = useState('');
  const [closureOwnerId] = useState('');
  const [closureOwnerName, setClosureOwnerName] = useState('');
  const [closureNextReviewDate, setClosureNextReviewDate] = useState('');

  // Hours template state
  const [templates, setTemplates] = useState<HoursTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [suggestedTemplateId, setSuggestedTemplateId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [templateApplied, setTemplateApplied] = useState(false);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string | null>(null);

  // Fetch templates when editing hours
  const fetchTemplates = useCallback(async () => {
    if (field !== 'hours') return;
    
    setLoadingTemplates(true);
    setTemplateError(null);
    
    try {
      const [templatesRes, suggestRes] = await Promise.all([
        apiGet('/api/app/hours-templates'),
        location.storeType ? apiGet(`/api/app/hours-templates/suggest/${location.storeType}`) : Promise.resolve(null),
      ]);
      
      if (templatesRes.ok) {
        const { data } = await templatesRes.json();
        setTemplates(data || []);
      } else {
        setTemplateError('Failed to load templates');
      }
      
      if (suggestRes?.ok) {
        const { data } = await suggestRes.json();
        if (data.suggestions?.length > 0) {
          const suggestedId = data.suggestions[0].id;
          setSuggestedTemplateId(suggestedId);
          setSelectedTemplateId(suggestedId);
        }
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
      setTemplateError('Failed to load templates');
    } finally {
      setLoadingTemplates(false);
    }
  }, [field, location.storeType]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleApplyTemplate = () => {
    if (!selectedTemplateId) return;
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;
    
    setHours(normalizeHours(template.hours));
    setTemplateApplied(true);
    setAppliedTemplateId(selectedTemplateId);
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId && templateId !== appliedTemplateId) {
      setTemplateApplied(false);
    }
  };

  // Calculate expiry preview for same-day closures
  const expiryPreview = useMemo(() => {
    if (closureType !== 'same_day' || !location.timeZone) return null;
    try {
      const now = new Date();
      // Get timezone abbreviation
      const tzAbbr = new Intl.DateTimeFormat('en-US', { 
        timeZone: location.timeZone, 
        timeZoneName: 'short' 
      }).formatToParts(now).find(p => p.type === 'timeZoneName')?.value || '';
      return `Ends tonight at 11:59 PM ${tzAbbr}`;
    } catch {
      return null;
    }
  }, [closureType, location.timeZone]);

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);
    setSaving(true);

    try {
      let changes: Record<string, unknown> = {};

      if (field === 'contact') {
        if (phone !== location.mainPhone) changes.mainPhone = phone;
        if (email !== (location.sharedInboxEmail || '')) changes.sharedInboxEmail = email || null;
        if (JSON.stringify(address) !== JSON.stringify(location.address)) changes.address = address;
      } else if (field === 'hours') {
        changes.standardHours = hours;
      } else if (field === 'directions') {
        const newDirections = wayfindingDirections.trim().slice(0, 1000);
        if (newDirections !== (location.wayfindingDirections || '')) {
          changes.wayfindingDirections = newDirections || null;
        }
      } else if (field === 'storeType') {
        if (storeType !== (location.storeType || '')) {
          changes.storeType = storeType || null;
        }
      }

      if (Object.keys(changes).length === 0) {
        onCancel();
        return;
      }

      const response = await apiPatch(`/api/app/edit/locations/${location.id}`, {
        changes,
        expectedVersion: location.version,
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error?.code === 'version_conflict') {
          setError('This record was modified by someone else. Please reload and try again.');
        } else {
          setError(result.error?.message || 'Failed to save changes');
        }
        return;
      }

      if (result.data.correctionCreated) {
        setSuccessMessage('Your changes have been submitted for approval.');
        setTimeout(() => {
          onSave();
        }, 2000);
      } else {
        onSave();
      }
    } catch (err) {
      setError('Failed to save changes. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddClosure = async () => {
    // Validation
    if (!closureReasonCode) {
      setError('Please select a reason for the closure');
      return;
    }
    if (closureReasonCode === 'other' && !closureReasonNote.trim()) {
      setError('Please provide details when selecting "Other"');
      return;
    }
    if (closureType === 'multi_day' && !closureEndsAt) {
      setError('Please select an end date for multi-day closure');
      return;
    }
    if (closureType === 'unknown_end' && !closureNextReviewDate) {
      setError('Please select a next review date');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      // Build the reason text from code or custom text
      const reasonLabel = CLOSURE_REASONS.find(r => r.code === closureReasonCode)?.label || closureReasonCode;
      const reason = closureReasonText.trim() || reasonLabel;

      const response = await apiPost(`/api/app/edit/locations/${location.id}/closures`, {
        reason,
        type: closureType,
        reasonCode: closureReasonCode || undefined,
        reasonNote: closureReasonNote.trim() || undefined,
        publicExplanation: closurePublicExplanation.trim() || undefined,
        endsAt: closureType === 'multi_day' ? new Date(closureEndsAt).toISOString() : undefined,
        ownerId: (closureType === 'multi_day' || closureType === 'unknown_end') ? closureOwnerId || undefined : undefined,
        ownerName: (closureType === 'multi_day' || closureType === 'unknown_end') ? closureOwnerName.trim() || undefined : undefined,
        nextReviewDate: closureType === 'unknown_end' ? closureNextReviewDate : undefined,
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to add closure');
        return;
      }

      onSave();
    } catch (err) {
      setError('Failed to add closure. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const updateHours = (day: DayOfWeek, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: value,
        intervals: field === 'closed' && value === true
          ? []
          : field === 'closed'
            ? [{ open: prev[day].intervals[0]?.open || '10:00', close: prev[day].intervals[0]?.close || '21:00' }]
            : [{ 
                open: field === 'open' ? value as string : prev[day].intervals[0]?.open || '10:00',
                close: field === 'close' ? value as string : prev[day].intervals[0]?.close || '21:00',
              }],
      },
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {field === 'hours' ? 'Edit Hours' : field === 'contact' ? 'Edit Contact Info' : field === 'directions' ? 'Edit Directions' : field === 'storeType' ? 'Edit Store Type' : 'Add Temporary Closure'}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg">
              {successMessage}
            </div>
          )}

          {field === 'contact' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="(xxx) xxx-xxxx"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="store@shiekh.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    maxLength={2}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  maxLength={10}
                />
              </div>
              {authUser && (authUser.role === 'Store' || authUser.role === 'Leader') && (
                <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg">
                  Changes to contact information require Steward approval before going live.
                </p>
              )}
            </>
          )}

          {field === 'hours' && (
            <div className="space-y-4">
              {/* Template picker */}
              <div className="bg-gray-50 rounded-lg p-3">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <FileText className="w-4 h-4 inline-block mr-1" />
                  Apply Template
                </label>
                {loadingTemplates ? (
                  <p className="text-sm text-gray-500">Loading templates...</p>
                ) : templateError ? (
                  <p className="text-sm text-red-600">{templateError}</p>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-gray-500">No templates available</p>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      aria-label="Select hours template"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    >
                      <option value="">Select a template...</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.id === suggestedTemplateId ? ' (Suggested)' : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleApplyTemplate}
                      disabled={!selectedTemplateId || selectedTemplateId === appliedTemplateId}
                      className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap ${
                        selectedTemplateId === appliedTemplateId && appliedTemplateId
                          ? 'bg-green-600 text-white'
                          : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      {selectedTemplateId === appliedTemplateId && appliedTemplateId ? 'Applied ✓' : 'Apply'}
                    </button>
                  </div>
                )}
                {templateApplied && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Template applied, review and save
                  </p>
                )}
              </div>

              {/* Hours rows - mobile responsive */}
              <div className="space-y-3">
              {DAYS.map(day => {
                const dayHours = hours[day] ?? { closed: true, intervals: [] };
                const firstInterval = dayHours.intervals?.[0] ?? { open: '10:00', close: '21:00' };
                return (
                <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2 border-b border-gray-100 last:border-b-0">
                  <div className="flex items-center justify-between sm:justify-start gap-2 sm:w-auto">
                    <span className="text-sm font-medium min-w-[80px]">{DAY_LABELS[day]}</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={dayHours.closed ?? false}
                        onChange={(e) => updateHours(day, 'closed', e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm">Closed</span>
                    </label>
                  </div>
                  {!dayHours.closed && (
                    <div className="flex items-center gap-2 pl-0 sm:pl-0">
                      <input
                        type="time"
                        value={firstInterval.open}
                        onChange={(e) => updateHours(day, 'open', e.target.value)}
                        className="flex-1 sm:flex-none px-2 py-1.5 border border-gray-300 rounded text-sm min-w-0"
                      />
                      <span className="text-sm text-gray-500">to</span>
                      <input
                        type="time"
                        value={firstInterval.close}
                        onChange={(e) => updateHours(day, 'close', e.target.value)}
                        className="flex-1 sm:flex-none px-2 py-1.5 border border-gray-300 rounded text-sm min-w-0"
                      />
                    </div>
                  )}
                </div>
                );
              })}
              </div>
            </div>
          )}

          {field === 'directions' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">How to Find Us</label>
                <textarea
                  value={wayfindingDirections}
                  onChange={(e) => setWayfindingDirections(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  maxLength={1000}
                  placeholder="Describe how customers can find your store (e.g., 'Enter through main mall entrance, turn left past food court, store is on the right near Macy's')"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {wayfindingDirections.length}/1000 characters
                </p>
              </div>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                These directions help customers find your store and are included in verification emails.
              </p>
              {authUser && authUser.role === 'Store' && (
                <p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg">
                  Changes to directions require Steward approval before going live.
                </p>
              )}
            </div>
          )}

          {field === 'storeType' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store Type *</label>
                <select
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value as StoreTypeCode | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select store type...</option>
                  {STORE_TYPES.map(t => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
              </div>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                This determines the default hours template suggested for this store.
              </p>
            </div>
          )}

          {field === 'closure' && (
            <>
              {/* Reason Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <select
                  value={closureReasonCode}
                  onChange={(e) => setClosureReasonCode(e.target.value as ClosureReasonCode)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a reason...</option>
                  {CLOSURE_REASONS.map(r => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom reason text (optional override) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason text (optional)</label>
                <input
                  type="text"
                  value={closureReasonText}
                  onChange={(e) => setClosureReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Override default reason text if needed"
                />
              </div>

              {/* Note required for 'other' */}
              {closureReasonCode === 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Details *</label>
                  <textarea
                    value={closureReasonNote}
                    onChange={(e) => setClosureReasonNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Please explain the closure reason..."
                  />
                </div>
              )}

              {/* Internal note (optional for all) */}
              {closureReasonCode && closureReasonCode !== 'other' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Internal note (optional)</label>
                  <textarea
                    value={closureReasonNote}
                    onChange={(e) => setClosureReasonNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Additional details for staff..."
                  />
                </div>
              )}

              {/* Public explanation */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Public explanation (optional)</label>
                <input
                  type="text"
                  value={closurePublicExplanation}
                  onChange={(e) => setClosurePublicExplanation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Safe explanation for customers"
                />
              </div>

              {/* Closure Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Duration *</label>
                <div className="space-y-2">
                  {CLOSURE_TYPES.map(t => (
                    <label
                      key={t.type}
                      className={`flex items-start p-3 rounded-lg border-2 cursor-pointer ${
                        closureType === t.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="closureType"
                        value={t.type}
                        checked={closureType === t.type}
                        onChange={(e) => setClosureType(e.target.value as ClosureType)}
                        className="mt-0.5 mr-3"
                      />
                      <div>
                        <div className="font-medium text-sm">{t.label}</div>
                        <div className="text-xs text-gray-500">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Expiry Preview for same-day */}
              {closureType === 'same_day' && expiryPreview && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-sm text-yellow-800 font-medium">{expiryPreview}</p>
                  <p className="text-xs text-yellow-600 mt-1">
                    The closure will automatically end at local midnight. Use "Renew" to extend.
                  </p>
                </div>
              )}

              {closureType === 'same_day' && !location.timeZone && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-800 font-medium">⚠️ No timezone configured</p>
                  <p className="text-xs text-red-600 mt-1">
                    Same-day closures require a timezone. Please set the store's timezone first, or use a multi-day closure with an explicit end date.
                  </p>
                </div>
              )}

              {/* End date for multi-day */}
              {closureType === 'multi_day' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End date *</label>
                  <input
                    type="datetime-local"
                    value={closureEndsAt}
                    onChange={(e) => setClosureEndsAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Owner and review date for multi-day and unknown-end */}
              {(closureType === 'multi_day' || closureType === 'unknown_end') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Owner name {closureType === 'unknown_end' ? '*' : '(optional)'}
                    </label>
                    <input
                      type="text"
                      value={closureOwnerName}
                      onChange={(e) => setClosureOwnerName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="Who is responsible for this closure?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Next review date {closureType === 'unknown_end' ? '*' : '(optional)'}
                    </label>
                    <input
                      type="date"
                      value={closureNextReviewDate}
                      onChange={(e) => setClosureNextReviewDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      When should we check on this closure?
                    </p>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={field === 'closure' ? handleAddClosure : handleSave}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : field === 'closure' ? 'Add Closure' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
