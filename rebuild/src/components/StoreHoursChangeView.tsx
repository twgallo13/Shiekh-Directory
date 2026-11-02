import { useState, useEffect, useCallback } from 'react';
import { Clock, AlertTriangle, CheckCircle, Info, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { StandardHours, DayOfWeek, LocationDetail } from '../types';

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

interface PendingCorrection {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  submittedAt: string;
  proposedChanges: {
    standardHours?: StandardHours;
  };
}

export function StoreHoursChangeView() {
  useDocumentTitle('Submit Hours Change');
  const { getIdToken, storeSession, isStoreSession } = useAuth();
  
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hours, setHours] = useState<StandardHours>(() => normalizeHours(null));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pendingCorrection, setPendingCorrection] = useState<PendingCorrection | null>(null);
  const [note, setNote] = useState('');

  const fetchLocation = useCallback(async () => {
    if (!isStoreSession || !storeSession) {
      setError('Store session required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getIdToken();
      const response = await fetch(`/api/app/locations/${storeSession.locationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        throw new Error('Failed to load store information');
      }
      
      const { data } = await response.json();
      setLocation(data);
      setHours(normalizeHours(data.standardHours));
      
      const correctionRes = await fetch(`/api/app/corrections?myRequests=true&status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (correctionRes.ok) {
        const { data: corrections } = await correctionRes.json();
        const hoursCorrection = corrections.find(
          (c: PendingCorrection) => c.proposedChanges?.standardHours
        );
        if (hoursCorrection) {
          setPendingCorrection(hoursCorrection);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load store information');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, isStoreSession, storeSession]);

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  const updateHours = (day: DayOfWeek, field: 'closed' | 'open' | 'close', value: boolean | string) => {
    setHours(prev => {
      const dayHours = prev[day] ?? { closed: true, intervals: [] };
      const firstInterval = dayHours.intervals?.[0] ?? { open: '10:00', close: '21:00' };
      
      if (field === 'closed') {
        return {
          ...prev,
          [day]: {
            closed: value as boolean,
            intervals: value ? [] : [{ open: '10:00', close: '21:00' }],
          },
        };
      }
      
      return {
        ...prev,
        [day]: {
          closed: false,
          intervals: [{ ...firstInterval, [field]: value as string }],
        },
      };
    });
  };

  const handleSubmit = async () => {
    if (!location) return;
    
    setSubmitting(true);
    setError(null);
    
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/corrections', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locationId: location.id,
          type: 'hours',
          category: 'hours',
          proposedChanges: {
            standardHours: hours,
          },
          proposedNote: note || 'Hours change request submitted from store portal',
        }),
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error?.message || 'Failed to submit request');
      }
      
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isStoreSession) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
          <AlertTriangle className="w-5 h-5 inline-block mr-2" />
          Please sign in as a store to submit hours changes.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <AlertTriangle className="w-5 h-5 inline-block mr-2" />
          {error}
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-green-800 mb-2">Hours Change Submitted</h2>
          <p className="text-green-700">
            Your hours change request has been submitted for approval.
            An administrator will review and approve the changes.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 min-h-[44px]"
          >
            Return to Directory
          </button>
        </div>
      </div>
    );
  }

  if (pendingCorrection) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <Info className="w-12 h-12 text-yellow-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-yellow-800 mb-2 text-center">Pending Hours Change</h2>
          <p className="text-yellow-700 text-center mb-4">
            You already have a pending hours change request submitted on{' '}
            {new Date(pendingCorrection.submittedAt).toLocaleDateString()}.
            Please wait for it to be reviewed before submitting another request.
          </p>
          <div className="flex justify-center">
            <span className="px-3 py-1 bg-yellow-200 text-yellow-800 rounded-full text-sm font-medium">
              Status: {pendingCorrection.status.charAt(0).toUpperCase() + pendingCorrection.status.slice(1)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Submit Hours Change</h1>
          <p className="text-sm text-gray-600">
            Store #{location?.storeNumber} - {location?.name}
          </p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <Info className="w-5 h-5 text-blue-600 inline-block mr-2" />
        <span className="text-blue-800">
          Changes require admin approval before going live. Edit the hours below and submit for review.
        </span>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
        <h2 className="font-medium text-gray-900 mb-4">Weekly Hours</h2>
        
        <div className="space-y-3">
          {DAYS.map(day => {
            const dayHours = hours[day] ?? { closed: true, intervals: [] };
            const firstInterval = dayHours.intervals?.[0] ?? { open: '10:00', close: '21:00' };
            const dayId = `hours-${day}`;
            
            return (
              <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 py-2 border-b border-gray-100 last:border-b-0">
                <div className="flex items-center justify-between sm:justify-start gap-2 sm:w-auto">
                  <span id={`${dayId}-label`} className="text-sm font-medium min-w-[80px]">
                    {DAY_LABELS[day]}
                  </span>
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
                    <label htmlFor={`${dayId}-open`} className="sr-only">
                      {DAY_LABELS[day]} opening time
                    </label>
                    <input
                      id={`${dayId}-open`}
                      type="time"
                      value={firstInterval.open}
                      onChange={(e) => updateHours(day, 'open', e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded text-sm min-h-[44px]"
                    />
                    <span className="text-gray-500">to</span>
                    <label htmlFor={`${dayId}-close`} className="sr-only">
                      {DAY_LABELS[day]} closing time
                    </label>
                    <input
                      id={`${dayId}-close`}
                      type="time"
                      value={firstInterval.close}
                      onChange={(e) => updateHours(day, 'close', e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded text-sm min-h-[44px]"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
        <label htmlFor="change-note" className="block font-medium text-gray-900 mb-2">
          Note (optional)
        </label>
        <textarea
          id="change-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          placeholder="Add any notes about this hours change..."
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => window.history.back()}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit for Approval'
          )}
        </button>
      </div>
    </div>
  );
}
