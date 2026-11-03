import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Check, X, ChevronRight, AlertTriangle, Clock, CheckCircle, Ban, RotateCcw, Loader2, MapPin, Building2, BarChart2, ChevronDown, ChevronUp, Mail, MailX, Eye } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { VerificationRequest, LocationListItem, Region, District } from '../types';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Dialog, FormField } from './Dialog';

export function VerificationRequestsView() {
  useDocumentTitle('Verification');
  
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { getIdToken, authUser } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'awaiting_response' | 'in_review' | 'confirmed' | 'expired' | 'cancelled'>('pending');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [locationFilterName, setLocationFilterName] = useState<string | null>(null);
  
  // Item #10: Bulk selection and operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [agingFilter, setAgingFilter] = useState<'all' | '0-3' | '3-7' | '7-14' | '14+'>('all');
  
  // Item #11: Bulk cancel/reissue dialogs
  const [showBulkCancel, setShowBulkCancel] = useState(false);
  const [showBulkReissue, setShowBulkReissue] = useState(false);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  
  // Item #10: Bulk assign/send
  const [showBulkAssign, setShowBulkAssign] = useState(false);
  const [showBulkSend, setShowBulkSend] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Array<{ id: string; fullName: string; workEmail?: string }>>([]); // workEmail is optional
  const [assigneesLoading, setAssigneesLoading] = useState(false); // r27 fix #2: loading state
  const [mailEnabled, setMailEnabled] = useState<boolean | null>(null); // r27 fix #5: mail state
  
  // r27 fix #6: Test data deletion
  const [showDeleteTestData, setShowDeleteTestData] = useState(false);
  const [testDataPreview, setTestDataPreview] = useState<{
    verificationRequests: number;
    dmTasks: number;
    mailLogs: number;
    testTokens: number;
  } | null>(null);
  const [deleteTestDataLoading, setDeleteTestDataLoading] = useState(false);;

  const locationIdFilter = searchParams.get('locationId');

  const isAdminOrSteward = authUser?.role === 'Admin' || authUser?.role === 'Steward';
  const isLeader = authUser?.role === 'Leader';
  const hasAccess = isAdminOrSteward || isLeader;

  const clearLocationFilter = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('locationId');
      return next;
    });
    setLocationFilterName(null);
  };

  const fetchLocationName = useCallback(async () => {
    if (!locationIdFilter) {
      setLocationFilterName(null);
      return;
    }
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/locations/${locationIdFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setLocationFilterName(`#${data.storeNumber} - ${data.name}`);
      } else {
        setLocationFilterName(locationIdFilter);
      }
    } catch {
      setLocationFilterName(locationIdFilter);
    }
  }, [getIdToken, locationIdFilter]);

  useEffect(() => {
    fetchLocationName();
  }, [fetchLocationName]);

  // r27 fix #5: check if mail is enabled
  useEffect(() => {
    const checkMailEnabled = async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/app/email-settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const { data } = await response.json();
          // Mail is considered "enabled" only if effectiveEnabled is true
          // (masterEnabled AND envCutoverEnabled)
          setMailEnabled(data?.effectiveEnabled ?? false);
        }
      } catch {
        setMailEnabled(false);
      }
    };
    if (isAdminOrSteward) {
      checkMailEnabled();
    }
  }, [getIdToken, isAdminOrSteward]);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const params = new URLSearchParams({ status: filter });
      if (locationIdFilter) {
        params.set('locationId', locationIdFilter);
      }
      const response = await fetch(`/api/app/verification?${params}`, {
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
  }, [getIdToken, filter, locationIdFilter]);

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

  // Item #10: Toggle selection
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllSelection = () => {
    if (selectedIds.size === filteredRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRequests.map(r => r.id)));
    }
  };

  // Item #10: Filter by aging bucket
  const filteredRequests = requests.filter(r => {
    if (agingFilter === 'all') return true;
    const daysSinceSent = Math.floor((Date.now() - new Date(r.sentAt).getTime()) / (1000 * 60 * 60 * 24));
    switch (agingFilter) {
      case '0-3': return daysSinceSent < 3;
      case '3-7': return daysSinceSent >= 3 && daysSinceSent < 7;
      case '7-14': return daysSinceSent >= 7 && daysSinceSent < 14;
      case '14+': return daysSinceSent >= 14;
      default: return true;
    }
  });

  // Item #11: Bulk cancel handler
  const handleBulkCancel = async () => {
    if (bulkReason.trim().length < 3) {
      setError('Reason must be at least 3 characters');
      return;
    }
    setBulkProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification/bulk/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          reason: bulkReason.trim(),
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to cancel');
        return;
      }

      setShowBulkCancel(false);
      setBulkReason('');
      setSelectedIds(new Set());
      loadRequests();
      // Show success message
      setError(null);
    } catch {
      setError('Failed to cancel verification requests');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Item #11: Bulk reissue handler
  const handleBulkReissue = async () => {
    if (bulkReason.trim().length < 3) {
      setError('Reason must be at least 3 characters');
      return;
    }
    setBulkProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification/bulk/reissue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          reason: bulkReason.trim(),
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to reissue');
        return;
      }

      setShowBulkReissue(false);
      setBulkReason('');
      setSelectedIds(new Set());
      setFilter('pending');
      loadRequests();
    } catch {
      setError('Failed to reissue verification requests');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Item #10: Load assignees (people) for bulk assign
  const loadAssignees = useCallback(async () => {
    setAssigneesLoading(true); // r27 fix #2
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/people', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const { data } = await response.json();
        setAssignees(data || []);
      }
    } catch {
      // Ignore - assignees list will be empty
    } finally {
      setAssigneesLoading(false); // r27 fix #2
    }
  }, [getIdToken]);

  // Item #10: Bulk assign handler
  const handleBulkAssign = async () => {
    if (!selectedAssigneeId) {
      setError('Please select an assignee');
      return;
    }
    setBulkProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification/bulk/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
          assigneeId: selectedAssigneeId,
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to assign');
        return;
      }

      setShowBulkAssign(false);
      setSelectedAssigneeId(null);
      setAssigneeSearch('');
      setSelectedIds(new Set());
      loadRequests();
    } catch {
      setError('Failed to assign verification requests');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Item #10: Bulk send reminders handler
  const handleBulkSend = async () => {
    setBulkProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification/bulk/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to send reminders');
        return;
      }

      const result = await response.json();
      setShowBulkSend(false);
      setSelectedIds(new Set());
      loadRequests();
      
      // Show success message with counts
      if (result.data) {
        const { sent, skipped, failed } = result.data;
        if (sent > 0) {
          setError(null);
        } else if (skipped > 0 || failed > 0) {
          setError(`Reminders: ${sent} sent, ${skipped} skipped, ${failed} failed`);
        }
      }
    } catch {
      setError('Failed to send reminders');
    } finally {
      setBulkProcessing(false);
    }
  };

  // r27 fix #6: Load test data preview
  const loadTestDataPreview = useCallback(async () => {
    setDeleteTestDataLoading(true);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification/test-data', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dryRun: true }),
      });
      if (response.ok) {
        const data = await response.json();
        setTestDataPreview(data.totals);
      }
    } catch {
      setTestDataPreview(null);
    } finally {
      setDeleteTestDataLoading(false);
    }
  }, [getIdToken]);

  // r27 fix #6: Delete test data
  const handleDeleteTestData = async () => {
    setDeleteTestDataLoading(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/verification/test-data', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ dryRun: false }),
      });
      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to delete test data');
        return;
      }
      setShowDeleteTestData(false);
      setTestDataPreview(null);
      loadRequests();
    } catch {
      setError('Failed to delete test data');
    } finally {
      setDeleteTestDataLoading(false);
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
              <button onClick={() => navigate('/')} aria-label="Back to directory" className="p-2 hover:bg-gray-100 rounded-lg lg:hidden min-h-[44px] min-w-[44px] flex items-center justify-center">
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
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium min-h-[44px]"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Send Request</span>
                <span className="sr-only sm:hidden">Send Request</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-4 lg:py-6">
        {/* Status filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          {([
            { value: 'pending', label: 'Pending' },
            { value: 'awaiting_response', label: 'Awaiting' },
            { value: 'in_review', label: 'In Review' },
            { value: 'confirmed', label: 'Confirmed' },
            { value: 'expired', label: 'Expired' },
            { value: 'cancelled', label: 'Cancelled' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setFilter(value); setSelectedIds(new Set()); }}
              className={`px-3 py-2 min-h-[44px] rounded-full text-sm font-medium ${
                filter === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        
        {/* Item #10: Aging bucket filter - shown for pending/awaiting statuses */}
        {(filter === 'pending' || filter === 'awaiting_response') && isAdminOrSteward && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm text-gray-600">Age:</span>
            {([
              { value: 'all', label: 'All' },
              { value: '0-3', label: '< 3 days' },
              { value: '3-7', label: '3-7 days' },
              { value: '7-14', label: '7-14 days' },
              { value: '14+', label: '14+ days' },
            ] as const).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setAgingFilter(value)}
                className={`px-2 py-1 text-xs rounded-full ${
                  agingFilter === value
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        
        {/* Item #10 & #11: Bulk action buttons */}
        {isAdminOrSteward && selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="text-sm font-medium text-blue-800">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            {(filter === 'pending' || filter === 'awaiting_response') && (
              <>
                <button
                  onClick={() => { loadAssignees(); setShowBulkAssign(true); }}
                  className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 min-h-[36px]"
                >
                  Assign
                </button>
                <button
                  onClick={() => setShowBulkSend(true)}
                  className="px-3 py-1.5 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800 min-h-[36px]"
                >
                  Send Reminders
                </button>
              </>
            )}
            {(filter === 'pending' || filter === 'awaiting_response' || filter === 'in_review') && (
              <button
                onClick={() => setShowBulkCancel(true)}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 min-h-[36px]"
              >
                Cancel
              </button>
            )}
            {(filter === 'cancelled' || filter === 'expired') && (
              <button
                onClick={() => setShowBulkReissue(true)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[36px]"
              >
                Reissue
              </button>
            )}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 min-h-[36px]"
            >
              Clear
            </button>
          </div>
        )}

        {locationIdFilter && (
          <div className="mb-4 flex items-start gap-2 bg-blue-50 text-blue-700 px-4 py-3 rounded-lg">
            <Building2 className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Showing requests for a specific store ({locationFilterName || locationIdFilter}).{' '}
              <button 
                onClick={clearLocationFilter} 
                className="underline hover:no-underline"
              >
                Show all
              </button>
            </span>
          </div>
        )}

        {/* Bulk verification by district/region - Admin/Steward only */}
        {isAdminOrSteward && (
          <BulkVerificationSection getIdToken={getIdToken} onCampaignSent={loadRequests} />
        )}

        {/* r27 fix #6: Test data deletion - Admin only */}
        {authUser?.role === 'Admin' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
            <button
              onClick={() => { loadTestDataPreview(); setShowDeleteTestData(true); }}
              className="w-full flex items-center justify-between text-left min-h-[44px]"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="font-medium text-gray-900 text-base">Delete Test Data</h2>
                  <p className="text-sm text-gray-500">Remove verification requests marked as test data</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-600" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Item #9: Completion rate and aging stats - Admin/Steward only */}
        {isAdminOrSteward && (
          <VerificationStatsSection getIdToken={getIdToken} />
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
        ) : filteredRequests.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No {filter} verification requests{agingFilter !== 'all' ? ` in ${agingFilter} age range` : ''}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Item #10: Select all checkbox - r27 fix #4: real checkbox */}
            {isAdminOrSteward && filteredRequests.length > 0 && (
              <div className="flex items-center gap-2 px-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === filteredRequests.length && filteredRequests.length > 0}
                    onChange={toggleAllSelection}
                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    aria-label={`Select all ${filteredRequests.length} requests`}
                  />
                  <span className="text-sm text-gray-600">
                    {selectedIds.size === filteredRequests.length ? 'Deselect all' : 'Select all'} ({filteredRequests.length})
                  </span>
                </label>
              </div>
            )}
            
            {filteredRequests.map(request => {
              const sentDate = new Date(request.sentAt);
              const daysSinceSent = Math.floor((Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
              const isOverdue = daysSinceSent > 7;
              const statusDisplay = request.status === 'awaiting_response' ? 'Awaiting Response' :
                                   request.status === 'in_review' ? 'In Review' :
                                   request.status.charAt(0).toUpperCase() + request.status.slice(1);
              const isSelected = selectedIds.has(request.id);
              
              return (
                <div
                  key={request.id}
                  className={`bg-white rounded-lg border p-4 cursor-pointer hover:border-blue-300 ${
                    isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Item #10: Row checkbox - r27 fix #4: real checkbox with accessible name */}
                    {isAdminOrSteward && (
                      <div className="flex-shrink-0 mt-0.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(request.id)}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          aria-label={`Select #${request.storeNumber} ${request.locationName}`}
                        />
                      </div>
                    )}
                    <div className="flex-1 min-w-0" onClick={() => setSelectedId(request.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          request.status === 'awaiting_response' ? 'bg-orange-100 text-orange-800' :
                          request.status === 'in_review' ? 'bg-blue-100 text-blue-800' :
                          request.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                          request.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {request.status === 'pending' ? <Clock className="w-3 h-3" /> :
                           request.status === 'awaiting_response' ? <Clock className="w-3 h-3" /> :
                           request.status === 'in_review' ? <Eye className="w-3 h-3" /> :
                           request.status === 'confirmed' ? <CheckCircle className="w-3 h-3" /> :
                           request.status === 'cancelled' ? <Ban className="w-3 h-3" /> :
                           <X className="w-3 h-3" />}
                          {statusDisplay}
                        </span>
                        {/* Item #10: Delivery status indicator */}
                        {request.emailBounced && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                            <MailX className="w-3 h-3" />
                            Bounced
                          </span>
                        )}
                        {request.emailSent === false && !request.emailBounced && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                            <Mail className="w-3 h-3" />
                            Not Sent
                          </span>
                        )}
                        {/* Item #10: Aging indicator - r27 fix #3: improved contrast */}
                        {(request.status === 'pending' || request.status === 'awaiting_response') && daysSinceSent > 0 && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                            isOverdue ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {daysSinceSent}d ago
                          </span>
                        )}
                        {/* Item #10: Store type indicator */}
                        {request.storeType && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                            {request.storeType}
                          </span>
                        )}
                        <span className="font-medium truncate">#{request.storeNumber} {request.locationName}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1 truncate">
                        Sent to {request.sentTo}
                        {/* Item #10: Assignee indicator */}
                        {request.assigneeName && (
                          <span className="ml-2 text-gray-400">· Assigned to {request.assigneeName}</span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-600 mt-0.5">
                        <span>Sent {sentDate.toLocaleDateString()}</span>
                        {request.respondedAt && (
                          <span>Responded {new Date(request.respondedAt).toLocaleDateString()}</span>
                        )}
                        {request.reminderCount && request.reminderCount > 0 && (
                          <span className="text-yellow-600">{request.reminderCount} reminder{request.reminderCount > 1 ? 's' : ''}</span>
                        )}
                      </div>
                      {request.proposedChanges && Object.keys(request.proposedChanges).length > 0 && (
                        <p className="text-xs text-orange-600 mt-1 font-medium">
                          Has proposed changes
                        </p>
                      )}
                      {request.hoursWrongReported && (
                        <p className="text-xs text-red-600 mt-1 font-medium">
                          Hours marked as incorrect
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-600 flex-shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedRequest && (
        <VerificationDetailDialog
          request={selectedRequest}
          isAdminOrSteward={isAdminOrSteward}
          isLeader={isLeader}
          processing={processing}
          cancelling={cancelling}
          onClose={() => setSelectedId(null)}
          onApprove={handleApprove}
          onCancel={handleCancel}
          onReissue={handleReissue}
        />
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

      {/* Item #11: Bulk Cancel Dialog */}
      <Dialog
        isOpen={showBulkCancel}
        onClose={() => { setShowBulkCancel(false); setBulkReason(''); }}
        title="Bulk Cancel Verification Requests"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setShowBulkCancel(false); setBulkReason(''); }}
              disabled={bulkProcessing}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkCancel}
              disabled={bulkProcessing || bulkReason.trim().length < 3}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Cancelling...
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" aria-hidden="true" />
                  Cancel {selectedIds.size} Request{selectedIds.size > 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            You are about to cancel <strong>{selectedIds.size}</strong> verification request{selectedIds.size > 1 ? 's' : ''}.
            This action cannot be undone.
          </p>
          <FormField id="bulk-cancel-reason" label="Reason for cancellation (required)">
            <textarea
              id="bulk-cancel-reason"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Enter reason for cancellation..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </FormField>
          {bulkReason.trim().length > 0 && bulkReason.trim().length < 3 && (
            <p className="text-sm text-red-600">Reason must be at least 3 characters</p>
          )}
        </div>
      </Dialog>

      {/* Item #11: Bulk Reissue Dialog */}
      <Dialog
        isOpen={showBulkReissue}
        onClose={() => { setShowBulkReissue(false); setBulkReason(''); }}
        title="Bulk Reissue Verification Requests"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setShowBulkReissue(false); setBulkReason(''); }}
              disabled={bulkProcessing}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkReissue}
              disabled={bulkProcessing || bulkReason.trim().length < 3}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Reissuing...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  Reissue {selectedIds.size} Request{selectedIds.size > 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            You are about to reissue <strong>{selectedIds.size}</strong> verification request{selectedIds.size > 1 ? 's' : ''}.
            {/* r27 fix #5: text reflects mail state */}
            {mailEnabled === false ? (
              <> New emails will be <strong>queued</strong> (mail is currently off).</>
            ) : (
              <> New emails will be sent to the store contacts.</>
            )}
          </p>
          {mailEnabled === false && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
              <p className="font-medium">Mail is currently off</p>
              <p className="mt-1">Verification requests will be created and logged, but emails will not be delivered until mail is enabled.</p>
            </div>
          )}
          <FormField id="bulk-reissue-reason" label="Reason for reissue (required)">
            <textarea
              id="bulk-reissue-reason"
              value={bulkReason}
              onChange={(e) => setBulkReason(e.target.value)}
              placeholder="Enter reason for reissue..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </FormField>
          {bulkReason.trim().length > 0 && bulkReason.trim().length < 3 && (
            <p className="text-sm text-red-600">Reason must be at least 3 characters</p>
          )}
        </div>
      </Dialog>

      {/* Item #10: Bulk Assign Dialog */}
      <Dialog
        isOpen={showBulkAssign}
        onClose={() => { setShowBulkAssign(false); setSelectedAssigneeId(null); setAssigneeSearch(''); }}
        title="Assign Verification Requests"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setShowBulkAssign(false); setSelectedAssigneeId(null); setAssigneeSearch(''); }}
              disabled={bulkProcessing}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkAssign}
              disabled={bulkProcessing || !selectedAssigneeId}
              className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Assigning...
                </>
              ) : (
                <>Assign {selectedIds.size} Request{selectedIds.size > 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            Select a person to assign to <strong>{selectedIds.size}</strong> verification request{selectedIds.size > 1 ? 's' : ''}.
          </p>
          <FormField id="assignee-search" label="Search by name or email">
            <input
              id="assignee-search"
              type="text"
              value={assigneeSearch}
              onChange={(e) => setAssigneeSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 min-h-[44px]"
            />
          </FormField>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
            {assigneesLoading ? (
              /* r27 fix #2: show loading state */
              <div className="px-4 py-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" aria-label="Loading people..." />
              </div>
            ) : (
              <>
                {assignees
                  .filter(p => {
                    /* r27 fix #1: guard missing fields */
                    if (!assigneeSearch) return true;
                    const searchLower = assigneeSearch.toLowerCase();
                    const nameMatch = p.fullName?.toLowerCase().includes(searchLower) ?? false;
                    const emailMatch = p.workEmail?.toLowerCase().includes(searchLower) ?? false;
                    return nameMatch || emailMatch;
                  })
                  .slice(0, 50)
                  .map(person => (
                    <button
                      key={person.id}
                      onClick={() => setSelectedAssigneeId(person.id)}
                      className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 border-b last:border-b-0 min-h-[44px] ${
                        selectedAssigneeId === person.id ? 'bg-purple-50 border-purple-300' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedAssigneeId === person.id ? 'border-purple-600 bg-purple-600' : 'border-gray-300'
                      }`}>
                        {selectedAssigneeId === person.id && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{person.fullName || 'Unknown'}</p>
                        <p className="text-sm text-gray-500 truncate">{person.workEmail || 'No email'}</p>
                      </div>
                    </button>
                  ))}
                {/* r27 fix #2: only show after loading finishes */}
                {assignees.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No people found
                  </div>
                )}
                {assignees.length > 0 && assignees.filter(p => {
                  if (!assigneeSearch) return true;
                  const searchLower = assigneeSearch.toLowerCase();
                  return (p.fullName?.toLowerCase().includes(searchLower) ?? false) ||
                         (p.workEmail?.toLowerCase().includes(searchLower) ?? false);
                }).length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    No people found
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </Dialog>

      {/* Item #10: Bulk Send Reminders Dialog */}
      <Dialog
        isOpen={showBulkSend}
        onClose={() => setShowBulkSend(false)}
        title="Send Verification Reminders"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => setShowBulkSend(false)}
              disabled={bulkProcessing}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkSend}
              disabled={bulkProcessing}
              className="flex-1 py-2 bg-green-700 text-white rounded-lg text-sm font-medium hover:bg-green-800 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4" aria-hidden="true" />
                  Send {selectedIds.size} Reminder{selectedIds.size > 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-gray-700">
            You are about to send reminder emails to <strong>{selectedIds.size}</strong> store{selectedIds.size > 1 ? 's' : ''}.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800">
            <p className="font-medium">Note:</p>
            <ul className="mt-1 space-y-1 list-disc list-inside">
              <li>Reminders will only be sent to pending/awaiting requests</li>
              <li>Requests with bounced emails will be skipped</li>
              <li>Email delivery depends on SMTP configuration</li>
            </ul>
          </div>
        </div>
      </Dialog>

      {/* r27 fix #6: Delete Test Data Dialog - Admin only */}
      <Dialog
        isOpen={showDeleteTestData}
        onClose={() => { setShowDeleteTestData(false); setTestDataPreview(null); }}
        title="Delete Test Data"
        footer={
          <div className="flex gap-3">
            <button
              onClick={() => { setShowDeleteTestData(false); setTestDataPreview(null); }}
              disabled={deleteTestDataLoading}
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteTestData}
              disabled={deleteTestDataLoading || !testDataPreview || (testDataPreview.verificationRequests === 0)}
              className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {deleteTestDataLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Deleting...
                </>
              ) : (
                <>Delete Test Data</>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
            <p className="font-medium">Warning</p>
            <p className="mt-1">This will permanently delete all verification requests that were marked as test data, along with their related mail logs and DM tasks.</p>
          </div>
          
          {deleteTestDataLoading && !testDataPreview && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          )}
          
          {testDataPreview && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Items to be deleted:</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-600">Verification Requests</dt>
                  <dd className="font-medium text-gray-900">{testDataPreview.verificationRequests}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">DM Tasks</dt>
                  <dd className="font-medium text-gray-900">{testDataPreview.dmTasks}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Mail Log Entries</dt>
                  <dd className="font-medium text-gray-900">{testDataPreview.mailLogs}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-600">Test Tokens</dt>
                  <dd className="font-medium text-gray-900">{testDataPreview.testTokens}</dd>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <dt className="font-medium text-gray-700">Total</dt>
                  <dd className="font-bold text-gray-900">
                    {testDataPreview.verificationRequests + testDataPreview.dmTasks + testDataPreview.mailLogs + testDataPreview.testTokens}
                  </dd>
                </div>
              </dl>
              {testDataPreview.verificationRequests === 0 && (
                <p className="mt-3 text-sm text-gray-500">No test data found. Only verification requests created with the isTest flag can be deleted.</p>
              )}
            </div>
          )}
        </div>
      </Dialog>
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

  const footer = (
    <div className="flex gap-3">
      <button
        onClick={onClose}
        disabled={sending}
        className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
      >
        Cancel
      </button>
      <button
        onClick={handleSend}
        disabled={!selectedLocationId || sending}
        className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
      >
        <Send className="w-4 h-4" aria-hidden="true" />
        {sending ? 'Sending...' : 'Send Request'}
      </button>
    </div>
  );

  return (
    <Dialog isOpen={true} onClose={onClose} title="Send Verification Request" footer={footer}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Select a store to send a verification request. The request will be sent to the store's shared inbox email.
        </p>

        <div>
          <label htmlFor="store-search" className="sr-only">Search stores</label>
          <input
            id="store-search"
            type="text"
            placeholder="Search stores..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[44px]"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
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
          <fieldset>
            <legend className="sr-only">Select a store</legend>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y" role="radiogroup" aria-label="Store selection">
              {filteredLocations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => setSelectedLocationId(loc.id)}
                  role="radio"
                  aria-checked={selectedLocationId === loc.id}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-3 min-h-[44px] ${
                    selectedLocationId === loc.id ? 'bg-blue-50 border-blue-500' : ''
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    selectedLocationId === loc.id ? 'border-blue-600 bg-blue-600' : 'border-gray-300'
                  }`} aria-hidden="true">
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
          </fieldset>
        )}
      </div>
    </Dialog>
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
  const [daysSinceVerification, setDaysSinceVerification] = useState<number | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<CampaignResults | null>(null);
  const [dryRunResults, setDryRunResults] = useState<DryRunResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(false);
  const [hierarchyLoaded, setHierarchyLoaded] = useState(false);

  // Item #5: Load workflow settings to get verificationCycleDays - show loading until it arrives
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const token = await getIdToken();
        const res = await fetch('/api/app/workflow-rules', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const { data } = await res.json();
          const cycleDays = data?.verificationCycleDays ?? 90;
          setDaysSinceVerification(cycleDays);
        } else {
          // Don't fall back to 90, keep null and show loading
          setDaysSinceVerification(90);
        }
      } catch (err) {
        console.error('Failed to load workflow settings:', err);
        // Fall back to 90 only on error, not on initial load
        setDaysSinceVerification(90);
      } finally {
        setSettingsLoaded(true);
      }
    };
    loadSettings();
  }, [getIdToken]);

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

  const handleClose = () => {
    setExpanded(false);
    setDryRunResults(null);
    setResults(null);
    setError(null);
  };

  const renderDialogContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
        </div>
      );
    }

    if (dryRunResults) {
      return (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-medium text-blue-800 mb-2">Campaign Preview</h3>
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
              className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
            >
              Back
            </button>
            <button
              onClick={handleSend}
              disabled={sending || dryRunResults.wouldSend === 0}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" aria-hidden="true" />
                  Send to {dryRunResults.wouldSend} Stores
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    if (results) {
      return (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-2">Campaign Complete</h3>
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
            onClick={handleClose}
            className="w-full py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
          >
            Done
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {error && (
          <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" aria-hidden="true" />
            {error}
          </div>
        )}

        <fieldset>
          <legend className="block text-sm font-medium text-gray-700 mb-2">Campaign Scope</legend>
          <div className="flex gap-2" role="radiogroup" aria-label="Campaign scope">
            <button
              onClick={() => { setScope('district'); setScopeId(''); }}
              role="radio"
              aria-checked={scope === 'district'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors min-h-[44px] ${
                scope === 'district' 
                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <MapPin className="w-4 h-4" aria-hidden="true" />
              District
            </button>
            <button
              onClick={() => { setScope('region'); setScopeId(''); }}
              role="radio"
              aria-checked={scope === 'region'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors min-h-[44px] ${
                scope === 'region' 
                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Building2 className="w-4 h-4" aria-hidden="true" />
              Region
            </button>
            <button
              onClick={() => { setScope('all'); setScopeId(''); }}
              role="radio"
              aria-checked={scope === 'all'}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border text-sm font-medium transition-colors min-h-[44px] ${
                scope === 'all' 
                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              All Stores
            </button>
          </div>
        </fieldset>

        {scope === 'district' && (
          <div>
            <label htmlFor="campaign-district" className="block text-sm font-medium text-gray-700 mb-1">Select District</label>
            <select
              id="campaign-district"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-h-[44px]"
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
            <label htmlFor="campaign-region" className="block text-sm font-medium text-gray-700 mb-1">Select Region</label>
            <select
              id="campaign-region"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 min-h-[44px]"
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
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="skip-recent"
              checked={skipRecentlyVerified}
              onChange={(e) => setSkipRecentlyVerified(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="skip-recent" className="text-sm text-gray-700">
              Skip stores verified in the last
            </label>
            <label htmlFor="days-since" className="sr-only">Days since last verification</label>
            <input
              type="number"
              id="days-since"
              value={daysSinceVerification ?? ''}
              onChange={(e) => setDaysSinceVerification(parseInt(e.target.value) || null)}
              placeholder={!settingsLoaded ? '...' : ''}
              min={1}
              max={365}
              aria-label="Days since last verification"
              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center min-h-[44px]"
              disabled={!skipRecentlyVerified}
            />
            <span className="text-sm text-gray-700">days</span>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={handleClose}
            className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            onClick={handlePreview}
            disabled={sending || !settingsLoaded || ((scope === 'district' || scope === 'region') && !scopeId)}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[44px]"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                Loading...
              </>
            ) : (
              'Preview Campaign'
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-between text-left min-h-[44px]"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Send className="w-5 h-5 text-blue-600" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-medium text-gray-900 text-base">Bulk Verification Campaign</h2>
              <p className="text-sm text-gray-500">Send verification requests to all stores in a district or region</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-600" aria-hidden="true" />
        </button>
      </div>

      <Dialog isOpen={expanded} onClose={handleClose} title="Bulk Verification Campaign" size="lg">
        {renderDialogContent()}
      </Dialog>
    </>
  );
}

interface VerificationDetailDialogProps {
  request: VerificationRequest;
  isAdminOrSteward: boolean;
  isLeader: boolean;
  processing: boolean;
  cancelling: string | null;
  onClose: () => void;
  onApprove: (id: string, applyChanges: boolean) => void;
  onCancel: (id: string) => void;
  onReissue: (locationId: string) => void;
}

function VerificationDetailDialog({
  request,
  isAdminOrSteward,
  isLeader,
  processing,
  cancelling,
  onClose,
  onApprove,
  onCancel,
  onReissue,
}: VerificationDetailDialogProps) {
  const getFooter = () => {
    if (request.status === 'pending' && request.respondedAt && isAdminOrSteward) {
      const hasProposedChanges = request.proposedChanges && Object.keys(request.proposedChanges).length > 0;
      return (
        <div className="space-y-2">
          {hasProposedChanges ? (
            <>
              <button
                onClick={() => onApprove(request.id, true)}
                disabled={processing || cancelling === request.id}
                className="w-full min-h-[44px] py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Approve & Apply Changes
              </button>
              <button
                onClick={() => onApprove(request.id, false)}
                disabled={processing || cancelling === request.id}
                className="w-full min-h-[44px] py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                Mark Verified (No Changes)
              </button>
            </>
          ) : (
            <button
              onClick={() => onApprove(request.id, false)}
              disabled={processing || cancelling === request.id}
              className="w-full min-h-[44px] py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" aria-hidden="true" />
              Mark as Verified
            </button>
          )}
          <button
            onClick={() => onCancel(request.id)}
            disabled={processing || cancelling === request.id}
            className="w-full min-h-[44px] py-2.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Ban className="w-4 h-4" aria-hidden="true" />
            {cancelling === request.id ? 'Cancelling...' : 'Cancel Request'}
          </button>
        </div>
      );
    }
    
    if (request.status === 'pending' && !request.respondedAt && isAdminOrSteward) {
      return (
        <div className="space-y-2">
          <p className="text-sm text-gray-500 text-center mb-2">
            Awaiting store response
          </p>
          <button
            onClick={() => onCancel(request.id)}
            disabled={cancelling === request.id}
            className="w-full min-h-[44px] py-2.5 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Ban className="w-4 h-4" aria-hidden="true" />
            {cancelling === request.id ? 'Cancelling...' : 'Cancel Request'}
          </button>
        </div>
      );
    }
    
    if (request.status === 'pending' && request.respondedAt && isLeader) {
      return (
        <p className="text-sm text-gray-500 text-center">
          Awaiting Steward/Admin review
        </p>
      );
    }
    
    if (request.status === 'cancelled' && isAdminOrSteward) {
      return (
        <button
          onClick={() => onReissue(request.locationId)}
          disabled={processing}
          className="w-full min-h-[44px] py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" aria-hidden="true" />
          {processing ? 'Sending...' : 'Reissue Verification Request'}
        </button>
      );
    }
    
    return undefined;
  };
  
  return (
    <Dialog
      isOpen={true}
      onClose={onClose}
      title={`#${request.storeNumber} Verification`}
      footer={getFooter()}
      size="lg"
    >
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500">Status</span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              request.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
              request.status === 'confirmed' ? 'bg-green-100 text-green-800' :
              request.status === 'cancelled' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-700'
            }`}>
              {request.status}
            </span>
          </div>
          <p className="text-sm mt-2">
            <span className="text-gray-500">Sent to:</span>{' '}
            <span className="font-medium">{request.sentTo}</span>
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {new Date(request.sentAt).toLocaleString()}
          </p>
        </div>

        {request.respondedAt && (
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm font-medium text-blue-800">Store Response</p>
            <p className="text-xs text-blue-600 mt-1">
              Responded {new Date(request.respondedAt).toLocaleString()}
            </p>
            {request.hoursConfirmed && (
              <p className="text-sm text-green-700 mt-2 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                Hours confirmed as accurate
              </p>
            )}
          </div>
        )}

        {request.proposedChanges && Object.keys(request.proposedChanges).length > 0 && (
          <div className="space-y-3">
            <h2 className="font-medium text-gray-900 text-base">Proposed Changes</h2>
            {Object.entries(request.proposedChanges).map(([field, newValue]) => (
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

        {request.reviewedAt && (
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500">Reviewed</p>
            <p className="text-xs text-gray-600">
              {new Date(request.reviewedAt).toLocaleString()}
            </p>
            {request.reviewNotes && (
              <p className="text-sm text-gray-600 mt-2">{request.reviewNotes}</p>
            )}
          </div>
        )}

        {request.cancelledAt && (
          <div className="bg-red-50 rounded-lg p-3">
            <p className="text-sm font-medium text-red-800 flex items-center gap-1">
              <Ban className="w-4 h-4" aria-hidden="true" />
              Cancelled
            </p>
            <p className="text-xs text-red-600 mt-1">
              {new Date(request.cancelledAt).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// Item #9: Completion rate and aging buckets by region/district
interface VerificationStats {
  groupBy: string;
  cycleDays: number;
  cycleStartDate: string;
  groups: Array<{
    id: string;
    name: string;
    totalStores: number;
    confirmedInCycle: number;
    pendingCount: number;
    awaitingResponseCount: number;
    inReviewCount: number;
    completionRate: number;
    agingBuckets: {
      lessThan3Days: number;
      threeTo7Days: number;
      sevenTo14Days: number;
      moreThan14Days: number;
    };
  }>;
  totals: {
    totalStores: number;
    confirmedInCycle: number;
    pendingCount: number;
    awaitingResponseCount: number;
    inReviewCount: number;
    completionRate: number;
    agingBuckets: {
      lessThan3Days: number;
      threeTo7Days: number;
      sevenTo14Days: number;
      moreThan14Days: number;
    };
  };
}

function VerificationStatsSection({ getIdToken }: { getIdToken: () => Promise<string> }) {
  const [expanded, setExpanded] = useState(false);
  const [groupBy, setGroupBy] = useState<'region' | 'district'>('region');
  const [stats, setStats] = useState<VerificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const loadStats = useCallback(async () => {
    if (!expanded) return;
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const res = await fetch(`/api/app/verification/stats?groupBy=${groupBy}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { data } = await res.json();
        setStats(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error?.message || 'Failed to load stats');
      }
    } catch (err) {
      setError('Failed to load verification statistics');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, groupBy, expanded]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const getCompletionColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600 bg-green-100';
    if (rate >= 50) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left min-h-[44px]"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 rounded-lg">
            <BarChart2 className="w-5 h-5 text-purple-600" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-medium text-gray-900 text-base">Completion Statistics</h2>
            <p className="text-sm text-gray-500">View completion rates and aging by region/district</p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-gray-600" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-600" aria-hidden="true" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex gap-2 mb-4" role="group" aria-label="Group by">
            <button
              onClick={() => setGroupBy('region')}
              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                groupBy === 'region'
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              By Region
            </button>
            <button
              onClick={() => setGroupBy('district')}
              className={`px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] ${
                groupBy === 'district'
                  ? 'bg-purple-100 text-purple-700 border border-purple-300'
                  : 'bg-gray-100 text-gray-700 border border-gray-200'
              }`}
            >
              By District
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-600" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              {error}
            </div>
          )}

          {stats && !loading && (
            <div className="space-y-4">
              {/* Overall summary */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">Overall Summary ({stats.cycleDays}-day cycle)</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className={`text-2xl font-bold rounded-lg py-2 ${getCompletionColor(stats.totals.completionRate)}`}>
                      {stats.totals.completionRate}%
                    </div>
                    <div className="text-sm text-gray-500 mt-1">Completion Rate</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">{stats.totals.confirmedInCycle}</div>
                    <div className="text-sm text-gray-500">Confirmed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {stats.totals.pendingCount + stats.totals.awaitingResponseCount + stats.totals.inReviewCount}
                    </div>
                    <div className="text-sm text-gray-500">Pending</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-600">{stats.totals.totalStores}</div>
                    <div className="text-sm text-gray-500">Total Stores</div>
                  </div>
                </div>

                {/* Aging buckets */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Pending Request Aging</h4>
                  <div className="grid grid-cols-4 gap-2 text-center text-sm">
                    <div className="bg-green-50 rounded p-2">
                      <div className="font-bold text-green-700">{stats.totals.agingBuckets.lessThan3Days}</div>
                      <div className="text-xs text-green-600">&lt; 3 days</div>
                    </div>
                    <div className="bg-yellow-50 rounded p-2">
                      <div className="font-bold text-yellow-700">{stats.totals.agingBuckets.threeTo7Days}</div>
                      <div className="text-xs text-yellow-600">3-7 days</div>
                    </div>
                    <div className="bg-orange-50 rounded p-2">
                      <div className="font-bold text-orange-700">{stats.totals.agingBuckets.sevenTo14Days}</div>
                      <div className="text-xs text-orange-600">7-14 days</div>
                    </div>
                    <div className="bg-red-50 rounded p-2">
                      <div className="font-bold text-red-700">{stats.totals.agingBuckets.moreThan14Days}</div>
                      <div className="text-xs text-red-600">&gt; 14 days</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group details */}
              <div>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showDetails ? 'Hide' : 'Show'} {groupBy === 'region' ? 'Region' : 'District'} Details
                </button>

                {showDetails && (
                  <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">{groupBy === 'region' ? 'Region' : 'District'}</th>
                          <th className="text-center px-2 py-2 font-medium">Completion</th>
                          <th className="text-center px-2 py-2 font-medium">Confirmed</th>
                          <th className="text-center px-2 py-2 font-medium">Pending</th>
                          <th className="text-center px-2 py-2 font-medium hidden sm:table-cell">&lt;3d</th>
                          <th className="text-center px-2 py-2 font-medium hidden sm:table-cell">3-7d</th>
                          <th className="text-center px-2 py-2 font-medium hidden sm:table-cell">7-14d</th>
                          <th className="text-center px-2 py-2 font-medium hidden sm:table-cell">&gt;14d</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.groups.map(group => {
                          const totalPending = group.pendingCount + group.awaitingResponseCount + group.inReviewCount;
                          return (
                            <tr key={group.id} className="border-t border-gray-100">
                              <td className="px-3 py-2 font-medium">{group.name}</td>
                              <td className="text-center px-2 py-2">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${getCompletionColor(group.completionRate)}`}>
                                  {group.completionRate}%
                                </span>
                              </td>
                              <td className="text-center px-2 py-2 text-green-600">{group.confirmedInCycle}</td>
                              <td className="text-center px-2 py-2 text-yellow-600">{totalPending}</td>
                              <td className="text-center px-2 py-2 text-green-600 hidden sm:table-cell">{group.agingBuckets.lessThan3Days}</td>
                              <td className="text-center px-2 py-2 text-yellow-600 hidden sm:table-cell">{group.agingBuckets.threeTo7Days}</td>
                              <td className="text-center px-2 py-2 text-orange-600 hidden sm:table-cell">{group.agingBuckets.sevenTo14Days}</td>
                              <td className="text-center px-2 py-2 text-red-600 hidden sm:table-cell">{group.agingBuckets.moreThan14Days}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
