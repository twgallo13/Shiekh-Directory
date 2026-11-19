import { useState, useMemo, useEffect, useCallback } from 'react';
import { Save, AlertTriangle } from 'lucide-react';
import type { LocationDetail, StandardHours, Address, DayOfWeek, ClosureType, ClosureReasonCode, StoreTypeCode, HoursTemplate } from '../types';
import { STORE_TYPES } from '../types';
import { useAuth } from '../context/AuthContext';
import { apiPatch, apiPost, apiGet } from '../lib/api';
import { Dialog, FormField } from './Dialog';

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

  const dialogTitle = field === 'hours' ? 'Edit Hours' : field === 'contact' ? 'Edit Contact Info' : field === 'directions' ? 'Edit Directions' : field === 'storeType' ? 'Edit Store Type' : 'Add Temporary Closure';

  const footer = (
    <div className="flex gap-3">
      <button
        onClick={onCancel}
        className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
        disabled={saving}
      >
        Cancel
      </button>
      <button
        onClick={field === 'closure' ? handleAddClosure : handleSave}
        disabled={saving}
        className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : field === 'closure' ? 'Add Closure' : 'Save Changes'}
      </button>
    </div>
  );

  return (
    <Dialog isOpen={true} onClose={onCancel} title={dialogTitle} footer={footer}>
      <div className="space-y-4">
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
              <FormField id="edit-phone" label="Phone">
                <input
                  id="edit-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  placeholder="(xxx) xxx-xxxx"
                />
              </FormField>
              <FormField id="edit-email" label="Store Email">
                <input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  placeholder="store@shiekh.com"
                />
              </FormField>
              <FormField id="edit-street" label="Street Address">
                <input
                  id="edit-street"
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField id="edit-city" label="City">
                  <input
                    id="edit-city"
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </FormField>
                <FormField id="edit-state" label="State">
                  <input
                    id="edit-state"
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    maxLength={2}
                  />
                </FormField>
              </div>
              <FormField id="edit-zip" label="ZIP Code">
                <input
                  id="edit-zip"
                  type="text"
                  value={address.zip}
                  onChange={(e) => setAddress({ ...address, zip: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  maxLength={10}
                />
              </FormField>
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
                <FormField id="hours-template" label="Apply Template" hint="Select a template to auto-fill hours">
                  {loadingTemplates ? (
                    <p className="text-sm text-gray-500">Loading templates...</p>
                  ) : templateError ? (
                    <p className="text-sm text-red-600">{templateError}</p>
                  ) : templates.length === 0 ? (
                    <p className="text-sm text-gray-500">No templates available</p>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        id="hours-template"
                        value={selectedTemplateId}
                        onChange={(e) => handleTemplateChange(e.target.value)}
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
                        className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap min-h-[44px] ${
                          selectedTemplateId === appliedTemplateId && appliedTemplateId
                            ? 'bg-green-600 text-white'
                            : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                      >
                        {selectedTemplateId === appliedTemplateId && appliedTemplateId ? 'Applied ✓' : 'Apply'}
                      </button>
                    </div>
                  )}
                </FormField>
                {templateApplied && (
                  <p className="text-sm text-blue-600 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Template applied, review and save
                  </p>
                )}
              </div>

              {/* Hours rows - mobile responsive */}
              <fieldset>
                <legend className="sr-only">Store hours by day</legend>
                <div className="space-y-3">
                  {DAYS.map(day => {
                    const dayHours = hours[day] ?? { closed: true, intervals: [] };
                    const firstInterval = dayHours.intervals?.[0] ?? { open: '10:00', close: '21:00' };
                    const dayId = `hours-${day}`;
                    return (
                      <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2 border-b border-gray-100 last:border-b-0">
                        <div className="flex items-center justify-between sm:justify-start gap-2 sm:w-auto">
                          <span id={`${dayId}-label`} className="text-sm font-medium min-w-[80px]">{DAY_LABELS[day]}</span>
                          <div className="flex items-center gap-2">
                            <input
                              id={`${dayId}-closed`}
                              type="checkbox"
                              checked={dayHours.closed ?? false}
                              onChange={(e) => updateHours(day, 'closed', e.target.checked)}
                              className="rounded min-w-[20px] min-h-[20px]"
                              aria-labelledby={`${dayId}-label`}
                            />
                            <label htmlFor={`${dayId}-closed`} className="text-sm">Closed</label>
                          </div>
                        </div>
                        {!dayHours.closed && (
                          <div className="flex items-center gap-2 pl-0 sm:pl-0">
                            <label htmlFor={`${dayId}-open`} className="sr-only">{DAY_LABELS[day]} opening time</label>
                            <input
                              id={`${dayId}-open`}
                              type="time"
                              value={firstInterval.open}
                              onChange={(e) => updateHours(day, 'open', e.target.value)}
                              className="flex-1 sm:flex-none px-2 py-1.5 border border-gray-300 rounded text-sm min-w-0 min-h-[44px]"
                            />
                            <span className="text-sm text-gray-500" aria-hidden="true">to</span>
                            <label htmlFor={`${dayId}-close`} className="sr-only">{DAY_LABELS[day]} closing time</label>
                            <input
                              id={`${dayId}-close`}
                              type="time"
                              value={firstInterval.close}
                              onChange={(e) => updateHours(day, 'close', e.target.value)}
                              className="flex-1 sm:flex-none px-2 py-1.5 border border-gray-300 rounded text-sm min-w-0 min-h-[44px]"
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {field === 'directions' && (
            <div className="space-y-4">
              <FormField id="edit-directions" label="How to Find Us" hint={`${wayfindingDirections.length}/1000 characters`}>
                <textarea
                  id="edit-directions"
                  value={wayfindingDirections}
                  onChange={(e) => setWayfindingDirections(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={4}
                  maxLength={1000}
                  placeholder="Describe how customers can find your store (e.g., 'Enter through main mall entrance, turn left past food court, store is on the right near Macy's')"
                />
              </FormField>
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
              <FormField id="edit-store-type" label="Store Type" required>
                <select
                  id="edit-store-type"
                  value={storeType}
                  onChange={(e) => setStoreType(e.target.value as StoreTypeCode | '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                >
                  <option value="">Select store type...</option>
                  {STORE_TYPES.map(t => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
              </FormField>
              <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                This determines the default hours template suggested for this store.
              </p>
            </div>
          )}

          {field === 'closure' && (
            <>
              {/* Reason Selection */}
              <FormField id="closure-reason" label="Reason" required>
                <select
                  id="closure-reason"
                  value={closureReasonCode}
                  onChange={(e) => setClosureReasonCode(e.target.value as ClosureReasonCode)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                >
                  <option value="">Select a reason...</option>
                  {CLOSURE_REASONS.map(r => (
                    <option key={r.code} value={r.code}>{r.label}</option>
                  ))}
                </select>
              </FormField>

              {/* Custom reason text (optional override) */}
              <FormField id="closure-reason-text" label="Reason text (optional)">
                <input
                  id="closure-reason-text"
                  type="text"
                  value={closureReasonText}
                  onChange={(e) => setClosureReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  placeholder="Override default reason text if needed"
                />
              </FormField>

              {/* Note required for 'other' */}
              {closureReasonCode === 'other' && (
                <FormField id="closure-details" label="Details" required>
                  <textarea
                    id="closure-details"
                    value={closureReasonNote}
                    onChange={(e) => setClosureReasonNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Please explain the closure reason..."
                  />
                </FormField>
              )}

              {/* Internal note (optional for all) */}
              {closureReasonCode && closureReasonCode !== 'other' && (
                <FormField id="closure-internal-note" label="Internal note (optional)">
                  <textarea
                    id="closure-internal-note"
                    value={closureReasonNote}
                    onChange={(e) => setClosureReasonNote(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="Additional details for staff..."
                  />
                </FormField>
              )}

              {/* Public explanation */}
              <FormField id="closure-public" label="Public explanation (optional)">
                <input
                  id="closure-public"
                  type="text"
                  value={closurePublicExplanation}
                  onChange={(e) => setClosurePublicExplanation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  placeholder="Safe explanation for customers"
                />
              </FormField>

              {/* Closure Type */}
              <fieldset>
                <legend className="block text-sm font-medium text-gray-700 mb-2">Duration <span className="text-red-500" aria-hidden="true">*</span></legend>
                <div className="space-y-2" role="radiogroup" aria-label="Closure duration">
                  {CLOSURE_TYPES.map(t => (
                    <label
                      key={t.type}
                      className={`flex items-start p-3 rounded-lg border-2 cursor-pointer min-h-[44px] ${
                        closureType === t.type ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="closureType"
                        value={t.type}
                        checked={closureType === t.type}
                        onChange={(e) => setClosureType(e.target.value as ClosureType)}
                        className="mt-0.5 mr-3 min-w-[16px] min-h-[16px]"
                      />
                      <div>
                        <div className="font-medium text-sm">{t.label}</div>
                        <div className="text-xs text-gray-500">{t.description}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

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
                <FormField id="closure-end-date" label="End date" required>
                  <input
                    id="closure-end-date"
                    type="datetime-local"
                    value={closureEndsAt}
                    onChange={(e) => setClosureEndsAt(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </FormField>
              )}

              {/* Owner and review date for multi-day and unknown-end */}
              {(closureType === 'multi_day' || closureType === 'unknown_end') && (
                <>
                  <FormField 
                    id="closure-owner" 
                    label={`Owner name ${closureType === 'unknown_end' ? '' : '(optional)'}`}
                    required={closureType === 'unknown_end'}
                  >
                    <input
                      id="closure-owner"
                      type="text"
                      value={closureOwnerName}
                      onChange={(e) => setClosureOwnerName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                      placeholder="Who is responsible for this closure?"
                    />
                  </FormField>
                  <FormField 
                    id="closure-review-date" 
                    label={`Next review date ${closureType === 'unknown_end' ? '' : '(optional)'}`}
                    required={closureType === 'unknown_end'}
                    hint="When should we check on this closure?"
                  >
                    <input
                      id="closure-review-date"
                      type="date"
                      value={closureNextReviewDate}
                      onChange={(e) => setClosureNextReviewDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    />
                  </FormField>
                </>
              )}
            </>
          )}
        </div>
    </Dialog>
  );
}
