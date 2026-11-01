import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Check, X, ChevronRight, AlertTriangle, Clock, CheckCircle, Ban, RotateCcw, Loader2, MapPin, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { VerificationRequest, LocationListItem, Region, District } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function VerificationRequestsView() {
  useDocumentTitle('Verification');
  
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
      setError(null);
      const token = await getIdToken();
      const response = await fetch(`/api/app/verification?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const { data } = await response.json();
        setRequests(data);
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to load requests');
      }
    } catch (err) {
      console.error('Failed to load verification requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to load verification requests');
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

        {/* Bulk verification by district/region - Admin/Steward only */}
        {isAdminOrSteward && (
          <BulkVerificationSection getIdToken={getIdToken} onCampaignSent={loadRequests} />
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
                    <p className="text-xs text-gray-600 mt-0.5">
                      Sent {new Date(request.sentAt).toLocaleDateString()}
                      {request.respondedAt && ` • Responded ${new Date(request.respondedAt).toLocaleDateString()}`}
                    </p>
                    {request.proposedChanges && Object.keys(request.proposedChanges).length > 0 && (
                      <p className="text-xs text-orange-600 mt-1 font-medium">
                        Has proposed changes
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-600" />
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
                <p className="text-xs text-gray-600 mt-1">
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
                  <p className="text-xs text-gray-600">
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
        setError(null);
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
        } else {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to load stores');
        }
      } catch (err) {
        console.error('Failed to load locations:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stores');
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

interface CampaignResults {
  total: number;
  sent: number;
  logOnly: number;
  skipped: number;
  failed: number;
  skippedReasons: {
    noEmail: number;
    recentlyVerified: number;
    pendingRequest: number;
  };
}

interface DryRunResults {
  total: number;
  wouldSend: number;
  skipped: number;
  skippedReasons: {
    noEmail: number;
    recentlyVerified: number;
    pendingRequest: number;
  };
  targetStores: { storeNumber: string; name: string; email: string }[];
}

function BulkVerificationSection({ 
  getIdToken, 
  onCampaignSent 
}: { 
  getIdToken: () => Promise<string>; 
  onCampaignSent: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [scope, setScope] = useState<'district' | 'region' | 'all'>('district');
  const [scopeId, setScopeId] = useState('');
  const [skipRecentlyVerified, setSkipRecentlyVerified] = useState(true);
  const [daysSinceVerification, setDaysSinceVerification] = useState(90);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<CampaignResults | null>(null);
  const [dryRunResults, setDryRunResults] = useState<DryRunResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [hierarchyLoaded, setHierarchyLoaded] = useState(false);

  const loadHierarchy = useCallback(async () => {
    if (hierarchyLoaded) return;
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const [regionsRes, districtsRes] = await Promise.all([
        fetch('/api/app/regions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/app/districts', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      
      if (regionsRes.ok) {
        const { data } = await regionsRes.json();
        setRegions(data || []);
      } else {
        throw new Error('Failed to load regions');
      }
      if (districtsRes.ok) {
        const { data } = await districtsRes.json();
        setDistricts(data || []);
      } else {
        throw new Error('Failed to load districts');
      }
      setHierarchyLoaded(true);
    } catch (err) {
      console.error('Failed to load hierarchy:', err);
      setError(err instanceof Error ? err.message : 'Failed to load hierarchy data');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, hierarchyLoaded]);

  useEffect(() => {
    if (expanded) {
      loadHierarchy();
    }
  }, [expanded, loadHierarchy]);

  const handlePreview = async () => {
    if ((scope === 'district' || scope === 'region') && !scopeId) {
      setError(`Please select a ${scope}`);
      return;
    }

    setSending(true);
    setError(null);
    setDryRunResults(null);

    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/verification/campaigns', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope,
          scopeId: scope !== 'all' ? scopeId : undefined,
          skipRecentlyVerified,
          daysSinceVerification,
          dryRun: true,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Failed to preview campaign');
        return;
      }

      setDryRunResults(data.results);
    } catch (err) {
      setError('Failed to preview campaign');
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if ((scope === 'district' || scope === 'region') && !scopeId) {
      setError(`Please select a ${scope}`);
      return;
    }

    const scopeName = scope === 'all' 
      ? 'all stores' 
      : scope === 'district' 
        ? districts.find(d => d.id === scopeId)?.name 
        : regions.find(r => r.id === scopeId)?.name;

    const storeCount = dryRunResults?.wouldSend ?? '?';
    if (!confirm(`Send verification requests to ${scopeName}?\n\nThis will send emails to ${storeCount} stores${skipRecentlyVerified ? ` not verified in the last ${daysSinceVerification} days` : ''}.`)) {
      return;
    }

    setSending(true);
    setError(null);
    setResults(null);
    setDryRunResults(null);

    try {
      const token = await getIdToken();
      const res = await fetch('/api/app/verification/campaigns', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scope,
          scopeId: scope !== 'all' ? scopeId : undefined,
          skipRecentlyVerified,
          daysSinceVerification,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message || 'Failed to send campaign');
        return;
      }

      setResults(data.results);
      onCampaignSent();
    } catch (err) {
      setError('Failed to send campaign');
    } finally {
      setSending(false);
    }
  };

  if (!expanded) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900">Bulk Verification Campaign</h3>
              <p className="text-sm text-gray-500">Send verification requests to all stores in a district or region</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900">Bulk Verification Campaign</h3>
        <button onClick={() => setExpanded(false)} className="text-gray-600 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      ) : dryRunResults ? (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">Campaign Preview</h4>
            <div className="grid grid-cols-2 gap-4 text-center mb-3">
              <div>
                <div className="text-2xl font-bold text-blue-600">{dryRunResults.wouldSend}</div>
                <div className="text-sm text-blue-700">Would Send</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">{dryRunResults.skipped}</div>
                <div className="text-sm text-gray-500">Skipped</div>
              </div>
            </div>
            {dryRunResults.skipped > 0 && (
              <div className="text-sm text-blue-700 mb-3">
                <p className="font-medium mb-1">Skipped reasons:</p>
                <ul className="space-y-0.5">
                  {dryRunResults.skippedReasons.noEmail > 0 && (
                    <li>No email: {dryRunResults.skippedReasons.noEmail}</li>
                  )}
                  {dryRunResults.skippedReasons.recentlyVerified > 0 && (
                    <li>Recently verified: {dryRunResults.skippedReasons.recentlyVerified}</li>
                  )}
                  {dryRunResults.skippedReasons.pendingRequest > 0 && (
                    <li>Pending request: {dryRunResults.skippedReasons.pendingRequest}</li>
                  )}
                </ul>
              </div>
            )}
            {dryRunResults.targetStores.length > 0 && (
              <div className="max-h-40 overflow-y-auto border border-blue-200 rounded bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-blue-100 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-1 font-medium">Store</th>
                      <th className="text-left px-2 py-1 font-medium">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRunResults.targetStores.map(store => (
                      <tr key={store.storeNumber} className="border-t border-blue-100">
                        <td className="px-2 py-1">#{store.storeNumber} {store.name}</td>
                        <td className="px-2 py-1 text-gray-500">{store.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setDryRunResults(null)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSend}
              disabled={sending || dryRunResults.wouldSend === 0}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send to {dryRunResults.wouldSend} Stores
                </>
              )}
            </button>
          </div>
        </div>
      ) : results ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-2">Campaign Complete</h4>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{results.sent}</div>
                <div className="text-xs text-green-700">Sent</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{results.logOnly}</div>
                <div className="text-xs text-yellow-700">Log Only</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-600">{results.skipped}</div>
                <div className="text-xs text-gray-500">Skipped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{results.failed}</div>
                <div className="text-xs text-red-500">Failed</div>
              </div>
            </div>
            {results.logOnly > 0 && (
              <div className="mt-3 pt-3 border-t border-green-200 text-sm text-yellow-700 bg-yellow-50 -mx-4 px-4 py-2">
                <p className="font-medium">
                  {results.logOnly} emails logged only (MAIL_CUTOVER_ENABLED is not set)
                </p>
              </div>
            )}
            {results.skipped > 0 && (
              <div className="mt-3 pt-3 border-t border-green-200 text-sm text-green-700">
                <p className="font-medium mb-1">Skipped reasons:</p>
                <ul className="space-y-0.5">
                  {results.skippedReasons.noEmail > 0 && (
                    <li>No email: {results.skippedReasons.noEmail}</li>
                  )}
                  {results.skippedReasons.recentlyVerified > 0 && (
                    <li>Recently verified: {results.skippedReasons.recentlyVerified}</li>
                  )}
                  {results.skippedReasons.pendingRequest > 0 && (
                    <li>Pending request: {results.skippedReasons.pendingRequest}</li>
                  )}
                </ul>
              </div>
            )}
          </div>
          <button
            onClick={() => { setResults(null); setExpanded(false); }}
            className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Scope</label>
            <div className="flex gap-2">
              <button
                onClick={() => { setScope('district'); setScopeId(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  scope === 'district' 
                    ? 'bg-blue-50 border-blue-300 text-blue-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <MapPin className="w-4 h-4" />
                District
              </button>
              <button
                onClick={() => { setScope('region'); setScopeId(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  scope === 'region' 
                    ? 'bg-blue-50 border-blue-300 text-blue-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Building2 className="w-4 h-4" />
                Region
              </button>
              <button
                onClick={() => { setScope('all'); setScopeId(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  scope === 'all' 
                    ? 'bg-blue-50 border-blue-300 text-blue-700' 
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                All Stores
              </button>
            </div>
          </div>

          {scope === 'district' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select District</label>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a district...</option>
                {districts
                  .filter(d => d.lifecycle === 'active')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
              </select>
            </div>
          )}

          {scope === 'region' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Region</label>
              <select
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Choose a region...</option>
                {regions
                  .filter(r => r.lifecycle === 'active')
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
              </select>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={skipRecentlyVerified}
                onChange={(e) => setSkipRecentlyVerified(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Skip stores verified in the last
                <input
                  type="number"
                  value={daysSinceVerification}
                  onChange={(e) => setDaysSinceVerification(parseInt(e.target.value) || 90)}
                  min={1}
                  max={365}
                  className="mx-2 w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
                  disabled={!skipRecentlyVerified}
                />
                days
              </span>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setExpanded(false)}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handlePreview}
              disabled={sending || ((scope === 'district' || scope === 'region') && !scopeId)}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                'Preview Campaign'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
