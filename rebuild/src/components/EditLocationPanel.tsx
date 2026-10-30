import { useState } from 'react';
import { X, Save, AlertTriangle } from 'lucide-react';
import type { LocationDetail, StandardHours, Address, DayOfWeek } from '../types';
import { useAuth } from '../context/AuthContext';

interface EditLocationPanelProps {
  location: LocationDetail;
  field: 'hours' | 'contact' | 'closure';
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

export function EditLocationPanel({ location, field, onSave, onCancel }: EditLocationPanelProps) {
  const { getIdToken, authUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [phone, setPhone] = useState(location.mainPhone);
  const [email, setEmail] = useState(location.sharedInboxEmail || '');
  const [address, setAddress] = useState<Address>(location.address);
  const [hours, setHours] = useState<StandardHours>(location.standardHours);

  const [closureReason, setClosureReason] = useState('');
  const [closureEndsAt, setClosureEndsAt] = useState('');

  const handleSave = async () => {
    setError(null);
    setSuccessMessage(null);
    setSaving(true);

    try {
      const token = await getIdToken();
      let changes: Record<string, unknown> = {};

      if (field === 'contact') {
        if (phone !== location.mainPhone) changes.mainPhone = phone;
        if (email !== (location.sharedInboxEmail || '')) changes.sharedInboxEmail = email || null;
        if (JSON.stringify(address) !== JSON.stringify(location.address)) changes.address = address;
      } else if (field === 'hours') {
        changes.standardHours = hours;
      }

      if (Object.keys(changes).length === 0) {
        onCancel();
        return;
      }

      const response = await fetch(`/api/app/edit/locations/${location.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          changes,
          expectedVersion: location.version,
        }),
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
    if (!closureReason.trim()) {
      setError('Please enter a reason for the closure');
      return;
    }

    setError(null);
    setSaving(true);

    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/edit/locations/${location.id}/closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          reason: closureReason,
          endsAt: closureEndsAt || undefined,
        }),
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
            {field === 'hours' ? 'Edit Hours' : field === 'contact' ? 'Edit Contact Info' : 'Add Temporary Closure'}
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
            <div className="space-y-3">
              {DAYS.map(day => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium">{DAY_LABELS[day]}</span>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={hours[day].closed}
                      onChange={(e) => updateHours(day, 'closed', e.target.checked)}
                      className="rounded"
                    />
                    <span className="text-sm">Closed</span>
                  </label>
                  {!hours[day].closed && (
                    <>
                      <input
                        type="time"
                        value={hours[day].intervals[0]?.open || '10:00'}
                        onChange={(e) => updateHours(day, 'open', e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={hours[day].intervals[0]?.close || '21:00'}
                        onChange={(e) => updateHours(day, 'close', e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {field === 'closure' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Closure *</label>
                <input
                  type="text"
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Water damage repair"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Expected End (optional)</label>
                <input
                  type="datetime-local"
                  value={closureEndsAt}
                  onChange={(e) => setClosureEndsAt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to end at local midnight</p>
              </div>
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
