import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { 
  CheckCircle, XCircle, AlertTriangle, Loader2, User,
  ChevronRight, Send, Store, Clock, Check
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { DMVerificationRequest, DMVerificationStoreResponse } from '../types';
import { CapacityBadge, VacantBadge } from './CapacityBadge';

interface StoreRosterItem {
  locationId: string;
  storeNumber: string;
  storeName: string;
  lastVerifiedAt?: string;
  sm: { role: string; personId: string; personName: string; capacity: string }[];
  asm: { role: string; personId: string; personName: string; capacity: string }[];
  kh: { role: string; personId: string; personName: string; capacity: string }[];
  verificationStatus: 'confirmed' | 'pending_correction' | 'not_done';
  storeResponse?: DMVerificationStoreResponse;
}

export function DMVerifyView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { getIdToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState<DMVerificationRequest | null>(null);
  const [roster, setRoster] = useState<StoreRosterItem[]>([]);
  const [responses, setResponses] = useState<Record<string, { confirmed: boolean; note?: string }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError('');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (!token) {
        const authToken = await getIdToken();
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const [requestRes, rosterRes] = await Promise.all([
        fetch(`/api/app/dm-verification/${id}${token ? `?token=${token}` : ''}`, { headers }),
        fetch(`/api/app/dm-verification/${id}/roster${token ? `?token=${token}` : ''}`, { headers }),
      ]);

      if (!requestRes.ok) {
        const errData = await requestRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to load verification request');
      }

      if (!rosterRes.ok) {
        const errData = await rosterRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to load roster');
      }

      const [requestData, rosterData] = await Promise.all([
        requestRes.json(),
        rosterRes.json(),
      ]);

      setRequest(requestData.data);
      setRoster(rosterData.data);

      const initialResponses: Record<string, { confirmed: boolean; note?: string }> = {};
      for (const store of rosterData.data) {
        initialResponses[store.locationId] = {
          confirmed: store.storeResponse?.smConfirmed || false,
        };
      }
      setResponses(initialResponses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [id, token, getIdToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConfirm = (locationId: string, confirmed: boolean) => {
    setResponses(prev => ({
      ...prev,
      [locationId]: { ...prev[locationId], confirmed },
    }));
  };

  const handleSubmit = async () => {
    if (!id) return;

    try {
      setSubmitting(true);
      setError('');

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (!token) {
        const authToken = await getIdToken();
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const storeResponses: Partial<DMVerificationStoreResponse>[] = Object.entries(responses).map(
        ([locationId, response]) => ({
          locationId,
          smConfirmed: response.confirmed,
        })
      );

      const res = await fetch(`/api/app/dm-verification/${id}/respond`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeResponses, token }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to submit response');
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading verification request...</p>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900 mt-4">Unable to Load</h1>
          <p className="text-gray-600 mt-2">{error || 'Request not found'}</p>
          <Link
            to="/"
            className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Directory
          </Link>
        </div>
      </div>
    );
  }

  if (submitted) {
    const allConfirmed = Object.values(responses).every(r => r.confirmed);
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900 mt-4">Response Submitted</h1>
          <p className="text-gray-600 mt-2">
            {allConfirmed 
              ? 'All stores have been confirmed. Thank you!'
              : 'Your response has been recorded. Corrections will be reviewed.'}
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Directory
          </Link>
        </div>
      </div>
    );
  }

  if (request.status === 'confirmed') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900 mt-4">Already Confirmed</h1>
          <p className="text-gray-600 mt-2">
            This district verification has already been completed.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Directory
          </Link>
        </div>
      </div>
    );
  }

  if (request.status === 'expired' || new Date(request.expiresAt) < new Date()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
          <h1 className="text-xl font-bold text-gray-900 mt-4">Request Expired</h1>
          <p className="text-gray-600 mt-2">
            This verification request has expired. Please contact operations for a new request.
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Directory
          </Link>
        </div>
      </div>
    );
  }

  const confirmedCount = Object.values(responses).filter(r => r.confirmed).length;
  const totalCount = roster.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">District Verification</h1>
              <p className="text-sm text-gray-600">{request.districtName}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">
                {confirmedCount} of {totalCount} confirmed
              </p>
              <p className="text-xs text-gray-500">
                Expires: {new Date(request.expiresAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            Please review the SM, ASM, and Key Holder assignments for each store. 
            Click <strong>Confirm</strong> if correct, or <strong>Needs Correction</strong> to flag for review.
          </p>
        </div>

        <div className="space-y-4">
          {roster.map((store) => (
            <StoreCard
              key={store.locationId}
              store={store}
              confirmed={responses[store.locationId]?.confirmed ?? false}
              onConfirm={(confirmed) => handleConfirm(store.locationId, confirmed)}
            />
          ))}
        </div>

        <div className="mt-8 sticky bottom-0 bg-gray-50 border-t border-gray-200 -mx-4 px-4 py-4">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="text-sm text-gray-600">
              <span className="font-medium">{confirmedCount}</span> of {totalCount} stores confirmed
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              Submit Response
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StoreCardProps {
  store: StoreRosterItem;
  confirmed: boolean;
  onConfirm: (confirmed: boolean) => void;
}

function StoreCard({ store, confirmed, onConfirm }: StoreCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white rounded-lg border ${confirmed ? 'border-green-200' : 'border-gray-200'} overflow-hidden`}>
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            confirmed ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            {confirmed ? (
              <Check className="w-5 h-5 text-green-600" />
            ) : (
              <Store className="w-5 h-5 text-gray-500" />
            )}
          </div>
          <div>
            <p className="font-medium text-gray-900">{store.storeNumber} - {store.storeName}</p>
            <p className="text-sm text-gray-500">
              {store.sm.length > 0 
                ? `SM: ${store.sm.map(s => s.personName).join(', ')}` 
                : <span className="text-amber-600">No SM assigned</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {store.lastVerifiedAt && (
            <div className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(store.lastVerifiedAt).toLocaleDateString()}
            </div>
          )}
          <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <RoleSection title="Store Manager" holders={store.sm} />
            <RoleSection title="Assistant SM" holders={store.asm} />
            <RoleSection title="Key Holders" holders={store.kh} />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
            <button
              onClick={(e) => { e.stopPropagation(); onConfirm(false); }}
              className={`px-4 py-2 rounded-lg font-medium text-sm ${
                !confirmed 
                  ? 'bg-amber-100 text-amber-800 border-2 border-amber-300' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Needs Correction
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onConfirm(true); }}
              className={`px-4 py-2 rounded-lg font-medium text-sm ${
                confirmed 
                  ? 'bg-green-600 text-white border-2 border-green-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-green-50 hover:text-green-700'
              }`}
            >
              Confirm Correct
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface RoleSectionProps {
  title: string;
  holders: { role: string; personId: string; personName: string; capacity: string }[];
}

function RoleSection({ title, holders }: RoleSectionProps) {
  return (
    <div>
      <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">{title}</h4>
      {holders.length === 0 ? (
        <div className="flex items-center gap-2">
          <VacantBadge />
        </div>
      ) : (
        <div className="space-y-1">
          {holders.map((holder, idx) => (
            <div key={`${holder.personId}-${idx}`} className="flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-900">{holder.personName}</span>
              {holder.capacity !== 'primary' && (
                <CapacityBadge capacity={holder.capacity as 'training' | 'acting'} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
