import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Check, X, ChevronRight, AlertTriangle, Clock, CheckCircle, Ban, RotateCcw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { VerificationRequest, LocationListItem } from '../types';
import { ComingSoonPlaceholder } from './ComingSoonPlaceholder';

export function VerificationRequestsView() {
  const navigate = useNavigate();
  const { getIdToken, authUser } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'expired' | 'cancelled'>('pending');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);

  const isAdminOrSteward = authUser?.role === 'Admin' || authUser?.role === 'Steward';
  const isLeader = authUser?.role === 'Leader';
  const hasAccess = isAdminOrSteward || isLeader;

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const response = await fetch(`/api/app/verification?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const { data } = await response.json();
        setRequests(data);
      }
    } catch (err) {
      console.error('Failed to load verification requests:', err);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, filter]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (id: string, applyChanges: boolean) => {
    setProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/verification/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ applyChanges }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to approve');
        return;
      }

      setSelectedId(null);
      loadRequests();
    } catch (err) {
      setError('Failed to approve verification');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = async (id: string) => {
    setCancelling(id);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/verification/${id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to cancel');
        return;
      }

      setSelectedId(null);
      loadRequests();
    } catch (err) {
      setError('Failed to cancel verification request');
    } finally {
      setCancelling(null);
    }
  };

  const handleReissue = async (locationId: string) => {
    setProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locationId }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to reissue');
        return;
      }

      setSelectedId(null);
      setFilter('pending');
      loadRequests();
    } catch (err) {
      setError('Failed to reissue verification request');
    } finally {
      setProcessing(false);
    }
  };

  const selectedRequest = requests.find(r => r.id === selectedId);

  if (!authUser || !hasAccess) {
    return (
      <div className="bg-gray-50 min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto" />
          <p className="mt-4 text-gray-600">Access denied</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg lg:hidden">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  Store Verification
                </h1>
                {isLeader && <p className="text-sm text-gray-500">Showing your stores only</p>}
              </div>
            </div>
            {isAdminOrSteward && (
              <button
                onClick={() => setShowNewRequest(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send Request</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 lg:py-6">
        <div className="flex flex-wrap gap-2 mb-4">
          {(['pending', 'confirmed', 'expired', 'cancelled'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 min-h-[44px] rounded-full text-sm font-medium ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Bulk verification placeholder - Admin/Steward only */}
        {isAdminOrSteward && (
          <ComingSoonPlaceholder
            title="Bulk Verification by District/Region"
            description="Send verification requests to all stores in a district or region at once."
            className="mb-4"
          />
        )}

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No {filter} verification requests
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(request => (
              <div
                key={request.id}
                onClick={() => setSelectedId(request.id)}
                className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        request.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                        request.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {request.status === 'pending' ? <Clock className="w-3 h-3" /> :
                         request.status === 'confirmed' ? <CheckCircle className="w-3 h-3" /> :
                         request.status === 'cancelled' ? <Ban className="w-3 h-3" /> :
                         <X className="w-3 h-3" />}
                        {request.status}
                      </span>
                      <span className="font-medium">#{request.storeNumber} {request.locationName}</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Sent to {request.sentTo}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Sent {new Date(request.sentAt).toLocaleDateString()}
                      {request.respondedAt && ` • Responded ${new Date(request.respondedAt).toLocaleDateString()}`}
                    </p>
                    {request.proposedChanges && Object.keys(request.proposedChanges).length > 0 && (
                      <p className="text-xs text-orange-600 mt-1 font-medium">
                        Has proposed changes
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                #{selectedRequest.storeNumber} Verification
              </h2>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Status</span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    selectedRequest.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    selectedRequest.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                    selectedRequest.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {selectedRequest.status}
                  </span>
                </div>
                <p className="text-sm mt-2">
                  <span className="text-gray-500">Sent to:</span>{' '}
                  <span className="font-medium">{selectedRequest.sentTo}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(selectedRequest.sentAt).toLocaleString()}
                </p>
              </div>

              {selectedRequest.respondedAt && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-800">Store Response</p>
                  <p className="text-xs text-blue-600 mt-1">
                    Responded {new Date(selectedRequest.respondedAt).toLocaleString()}
                  </p>
                  {selectedRequest.hoursConfirmed && (
                    <p className="text-sm text-green-700 mt-2 flex items-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      Hours confirmed as accurate
                    </p>
                  )}
                </div>
              )}

              {selectedRequest.proposedChanges && Object.keys(selectedRequest.proposedChanges).length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-medium text-gray-900">Proposed Changes</h3>
                  {Object.entries(selectedRequest.proposedChanges).map(([field, newValue]) => (
                    <div key={field} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-3 py-2 font-medium text-sm capitalize">{field}</div>
                      <div className="p-3">
                        <pre className="text-sm text-green-700 whitespace-pre-wrap">
                          {typeof newValue === 'object' ? JSON.stringify(newValue, null, 2) : String(newValue)}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {selectedRequest.reviewedAt && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-500">Reviewed</p>
                  <p className="text-xs text-gray-400">
                    {new Date(selectedRequest.reviewedAt).toLocaleString()}
                  </p>
                  {selectedRequest.reviewNotes && (
                    <p className="text-sm text-gray-600 mt-2">{selectedRequest.reviewNotes}</p>
                  )}
                </div>
              )}

              {selectedRequest.cancelledAt && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 flex items-center gap-1">
                    <Ban className="w-4 h-4" />
                    Cancelled
                  </p>
                  <p className="text-xs text-red-600 mt-1">
                    {new Date(selectedRequest.cancelledAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {selectedRequest.status === 'pending' && selectedRequest.respondedAt && isAdminOrSteward && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 space-y-2">
                {selectedRequest.proposedChanges && Object.keys(selectedRequest.proposedChanges).length > 0 ? (
                  <>
                    <button
                      onClick={() => handleApprove(selectedRequest.id, true)}
                      disabled={processing || cancelling === selectedRequest.id}
                      className="w-full min-h-[44px] py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Approve & Apply Changes
                    </button>
                    <button
                      onClick={() => handleApprove(selectedRequest.id, false)}
                      disabled={processing || cancelling === selectedRequest.id}
                      className="w-full min-h-[44px] py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      Mark Verified (No Changes)
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleApprove(selectedRequest.id, false)}
                    disabled={processing || cancelling === selectedRequest.id}
                    className="w-full min-h-[44px] py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Mark as Verified
                  </button>
                )}
                <button
                  onClick={() => handleCancel(selectedRequest.id)}
                  disabled={processing || cancelling === selectedRequest.id}
                  className="w-full min-h-[44px] py-2.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  {cancelling === selectedRequest.id ? 'Cancelling...' : 'Cancel Request'}
                </button>
              </div>
            )}

            {selectedRequest.status === 'pending' && !selectedRequest.respondedAt && isAdminOrSteward && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 space-y-2">
                <p className="text-sm text-gray-500 text-center mb-2">
                  Awaiting store response
                </p>
                <button
                  onClick={() => handleCancel(selectedRequest.id)}
                  disabled={cancelling === selectedRequest.id}
                  className="w-full min-h-[44px] py-2.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" />
                  {cancelling === selectedRequest.id ? 'Cancelling...' : 'Cancel Request'}
                </button>
              </div>
            )}
            
            {selectedRequest.status === 'pending' && selectedRequest.respondedAt && isLeader && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
                <p className="text-sm text-gray-500 text-center">
                  Awaiting Steward/Admin review
                </p>
              </div>
            )}

            {selectedRequest.status === 'cancelled' && isAdminOrSteward && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
                <button
                  onClick={() => handleReissue(selectedRequest.locationId)}
                  disabled={processing}
                  className="w-full min-h-[44px] py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {processing ? 'Sending...' : 'Reissue Verification Request'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showNewRequest && (
        <NewVerificationRequestModal
          onClose={() => setShowNewRequest(false)}
          onSent={() => {
            setShowNewRequest(false);
            loadRequests();
          }}
        />
      )}
    </div>
  );
}

function NewVerificationRequestModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const { getIdToken } = useAuth();
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLocations = async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/app/locations?kind=store', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const { data } = await response.json();
          const storesWithEmail = data.filter((loc: LocationListItem & { sharedInboxEmail?: string }) => 
            loc.sharedInboxEmail
          );
          setLocations(storesWithEmail);
        }
      } catch (err) {
        console.error('Failed to load locations:', err);
      } finally {
        setLoading(false);
      }
    };
    loadLocations();
  }, [getIdToken]);

  const filteredLocations = locations.filter(loc =>
    loc.storeNumber.toLowerCase().includes(search.toLowerCase()) ||
    loc.name.toLowerCase().includes(search.toLowerCase()) ||
    loc.city.toLowerCase().includes(search.toLowerCase())
  );

  const handleSend = async () => {
    if (!selectedLocationId) return;
    
    setSending(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ locationId: selectedLocationId }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to send request');
        return;
      }

      onSent();
    } catch (err) {
      setError('Failed to send verification request');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Send Verification Request</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600">
            Select a store to send a verification request. The request will be sent to the store's shared inbox email.
          </p>

          <input
            type="text"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : filteredLocations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {search ? 'No matching stores found' : 'No stores with shared inbox email'}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y">
              {filteredLocations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocationId(loc.id)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 ${
                    selectedLocationId === loc.id ? 'bg-blue-50 border-blue-500' : ''
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedLocationId === loc.id ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                  }`}>
                    {selectedLocationId === loc.id && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">#{loc.storeNumber} {loc.name}</p>
                    <p className="text-sm text-gray-500">{loc.city}, {loc.state}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
          <button
            onClick={handleSend}
            disabled={!selectedLocationId || sending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Send className="w-4 h-4" />
            {sending ? 'Sending...' : 'Send Verification Request'}
          </button>
        </div>
      </div>
    </div>
  );
}
