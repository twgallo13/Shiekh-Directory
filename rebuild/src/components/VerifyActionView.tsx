import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, Edit, ArrowRight, Clock, MapPin, Phone, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { DayHours } from '../types';

interface StorePreview {
  valid: boolean;
  action: string;
  storeNumber: string;
  storeName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  mainPhone?: string;
  sharedInboxEmail?: string;
  standardHours?: Record<string, DayHours>;
  wayfindingDirections?: string;
  lastVerifiedAt?: string;
  email: string;
}

export function VerifyActionView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshStoreSession } = useAuth();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  // Item #12: Preview state for showing current info before confirming
  const [preview, setPreview] = useState<StorePreview | null>(null);
  const [result, setResult] = useState<{
    action: 'confirmed' | 'update';
    storeNumber: string;
    storeName: string;
    message: string;
    locationId?: string;
    email?: string;
  } | null>(null);

  const token = searchParams.get('token');
  const action = searchParams.get('action');
  const [savedToken, setSavedToken] = useState<string | null>(null);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  // Item #12: Load preview first for confirm action
  const loadPreview = useCallback(async (tokenValue: string, actionValue: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/store-auth/one-click-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenValue, action: actionValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Failed to load store information');
        return;
      }

      setPreview(data);
      setSavedToken(tokenValue);
    } catch {
      setError('Failed to load store information');
    } finally {
      setLoading(false);
    }
  }, []);

  const processAction = useCallback(async (tokenValue: string, actionValue: string) => {
    setConfirming(true);
    setError('');

    try {
      const response = await fetch('/api/store-auth/one-click-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: tokenValue, action: actionValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Failed to process verification');
        setConfirming(false);
        return;
      }

      setResult({
        action: data.action,
        storeNumber: data.storeNumber,
        storeName: data.storeName,
        message: data.message,
        locationId: data.locationId,
        email: data.email,
      });
      setPreview(null);

      if (data.action === 'update' && data.sessionId) {
        await refreshStoreSession();
      }
    } catch {
      setError('Failed to process verification');
    } finally {
      setConfirming(false);
    }
  }, [refreshStoreSession]);

  useEffect(() => {
    if (token && action) {
      window.history.replaceState({}, '', window.location.pathname);
      // For confirm action, show preview first
      if (action === 'confirm') {
        loadPreview(token, action);
      } else {
        // For update action, process immediately (they'll be redirected to edit)
        processAction(token, action);
      }
    } else {
      setError('Invalid verification link');
      setLoading(false);
    }
  }, [token, action, loadPreview, processAction]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Processing your verification...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verification Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                This link may have expired or already been used.
              </p>
              <Link
                to="/signin"
                className="inline-flex items-center gap-2 text-blue-600 hover:underline"
              >
                Go to Sign In
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Item #12: Show preview with current info before confirming
  if (preview && action === 'confirm') {
    const formatHours = (hours: Record<string, DayHours> | undefined) => {
      if (!hours) return null;
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
      return days.map(day => {
        const dayHours = hours[day];
        if (!dayHours || dayHours.closed) {
          return { day, display: 'Closed' };
        }
        const intervals = dayHours.intervals ?? [];
        if (intervals.length === 0) {
          return { day, display: 'Not set' };
        }
        return { day, display: intervals.map(i => `${i.open} - ${i.close}`).join(', ') };
      });
    };

    const hoursDisplay = formatHours(preview.standardHours);

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
        <div className="max-w-lg w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-6">
              <Clock className="h-12 w-12 text-blue-500 mx-auto mb-3" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirm Store Hours</h2>
              <p className="text-gray-600">
                Please review the information below and confirm it's accurate.
              </p>
            </div>

            <div className="bg-blue-50 rounded-lg p-4 mb-6">
              <p className="text-lg font-semibold text-gray-900">
                Store {preview.storeNumber}
              </p>
              <p className="text-gray-600">{preview.storeName}</p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              {/* Address */}
              {preview.address && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-700 text-sm">Address</p>
                    <p className="text-gray-900">
                      {preview.address}<br />
                      {preview.city}, {preview.state} {preview.zip}
                    </p>
                  </div>
                </div>
              )}

              {/* Phone */}
              {preview.mainPhone && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-700 text-sm">Phone</p>
                    <p className="text-gray-900">{preview.mainPhone}</p>
                  </div>
                </div>
              )}

              {/* Email */}
              {preview.sharedInboxEmail && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-700 text-sm">Email</p>
                    <p className="text-gray-900">{preview.sharedInboxEmail}</p>
                  </div>
                </div>
              )}

              {/* Hours */}
              {hoursDisplay && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 text-gray-500" />
                    <p className="font-medium text-gray-700 text-sm">Store Hours</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    {hoursDisplay.map(({ day, display }) => (
                      <div key={day} className="flex justify-between">
                        <span className="capitalize text-gray-600">{day}</span>
                        <span className="text-gray-900">{display}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Wayfinding */}
              {preview.wayfindingDirections && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium text-gray-700 text-sm mb-1">Wayfinding Directions</p>
                  <p className="text-gray-900 text-sm">{preview.wayfindingDirections}</p>
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => savedToken && processAction(savedToken, 'confirm')}
                disabled={confirming}
                className="w-full flex items-center justify-center gap-2 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {confirming ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5" />
                    Yes, This Information is Correct
                  </>
                )}
              </button>
              <p className="text-center text-sm text-gray-500">
                Need to make changes? Click the "Update" link in your email instead.
              </p>
            </div>

            {preview.lastVerifiedAt && (
              <p className="text-center text-xs text-gray-400 mt-4">
                Last verified: {new Date(preview.lastVerifiedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (result?.action === 'confirmed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Hours Confirmed!</h2>
            <p className="text-gray-600 mb-2">
              Thank you for confirming your store hours.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 my-6">
              <p className="text-lg font-semibold text-gray-900">
                Store {result.storeNumber}
              </p>
              <p className="text-gray-600">{result.storeName}</p>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Your store's hours are now verified in the directory.
            </p>
            <div className="space-y-3">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700"
              >
                View Directory
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (result?.action === 'update') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <Edit className="h-16 w-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Update Store Information</h2>
            <p className="text-gray-600 mb-2">
              You've been signed in to update your store information.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 my-6">
              <p className="text-lg font-semibold text-gray-900">
                Store {result.storeNumber}
              </p>
              <p className="text-gray-600">{result.storeName}</p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => navigate(`/location/${result.locationId}`)}
                className="inline-flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700"
              >
                <Edit className="h-5 w-5" />
                Edit Store Information
              </button>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50"
              >
                View Directory
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
