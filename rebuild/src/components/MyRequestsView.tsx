import { useEffect, useState } from 'react';
import type { Correction, CorrectionCategory } from '../types';

const CATEGORY_LABELS: Record<CorrectionCategory, string> = {
  address: 'Address',
  suite: 'Suite/Unit',
  directions: 'Directions',
  phone: 'Phone Number',
  hours: 'Hours',
  manager: 'Manager Info',
  other: 'Other',
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#fef3c7', text: '#92400e', label: 'Pending Review' },
  approved: { bg: '#d1fae5', text: '#065f46', label: 'Approved' },
  rejected: { bg: '#fee2e2', text: '#991b1b', label: 'Rejected' },
  cancelled: { bg: '#e5e7eb', text: '#374151', label: 'Cancelled' },
};

export function MyRequestsView() {
  const [requests, setRequests] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const statuses = ['pending', 'approved', 'rejected', 'cancelled'];
      const allRequests: Correction[] = [];

      for (const status of statuses) {
        const response = await fetch(`/api/app/corrections?status=${status}&myRequests=true`);
        if (response.ok) {
          const { data } = await response.json();
          allRequests.push(...(data || []));
        }
      }

      allRequests.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setRequests(allRequests);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) return;

    try {
      setCancelling(id);
      const response = await fetch(`/api/app/corrections/${id}/cancel`, {
        method: 'POST',
      });
      if (response.ok) {
        loadRequests();
      } else {
        const { error } = await response.json();
        alert(error?.message || 'Failed to cancel request');
      }
    } catch (error) {
      console.error('Failed to cancel request:', error);
    } finally {
      setCancelling(null);
    }
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const filteredRequests = statusFilter === 'all' 
    ? requests 
    : requests.filter(r => r.status === statusFilter);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const rejectedCount = requests.filter(r => r.status === 'rejected').length;

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading your requests...
      </div>
    );
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>My Requests</h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            fontSize: '0.875rem',
          }}
        >
          <option value="all">All ({requests.length})</option>
          <option value="pending">Pending ({pendingCount})</option>
          <option value="approved">Approved ({approvedCount})</option>
          <option value="rejected">Rejected ({rejectedCount})</option>
        </select>
      </div>

      {filteredRequests.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#6b7280',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}>
          {requests.length === 0 
            ? 'You haven\'t submitted any correction requests yet.' 
            : 'No requests match the selected filter.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredRequests.map(req => {
            const statusStyle = STATUS_STYLES[req.status] || STATUS_STYLES.pending;
            return (
              <div
                key={req.id}
                style={{
                  padding: '1rem',
                  backgroundColor: 'white',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb',
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ fontWeight: 600 }}>
                        {req.storeNumber} · {req.locationName}
                      </span>
                      <span style={{
                        padding: '0.125rem 0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        borderRadius: '9999px',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text,
                      }}>
                        {statusStyle.label}
                      </span>
                    </div>
                    <div style={{ 
                      fontSize: '0.875rem', 
                      color: '#4b5563', 
                      marginTop: '0.375rem',
                    }}>
                      <strong>Category:</strong> {CATEGORY_LABELS[req.category] || req.category}
                    </div>
                    {req.proposedNote && (
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: '#6b7280', 
                        marginTop: '0.25rem',
                        fontStyle: 'italic',
                      }}>
                        "{req.proposedNote}"
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                      Submitted: {formatDate(req.submittedAt)}
                    </div>
                    {req.reviewedAt && (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        Reviewed: {formatDate(req.reviewedAt)}
                        {req.reviewNotes && (
                          <span style={{ marginLeft: '0.5rem' }}>
                            — {req.reviewNotes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {req.status === 'pending' && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      disabled={cancelling === req.id}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: cancelling === req.id ? 'not-allowed' : 'pointer',
                        opacity: cancelling === req.id ? 0.5 : 1,
                        minHeight: '44px',
                        minWidth: '44px',
                      }}
                    >
                      {cancelling === req.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
