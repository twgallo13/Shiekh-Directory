import { useEffect, useState } from 'react';
import type { Closure, District, Location } from '../types';

interface ClosureBoardItem {
  id: string;
  closureId: string;
  locationId: string;
  storeNumber: string;
  locationName: string;
  districtId: string;
  districtName: string;
  closure: Closure;
}

const REASON_LABELS: Record<string, string> = {
  ac_hvac: 'AC/HVAC Issue',
  power: 'Power/Utility',
  mall_landlord: 'Mall/Landlord Issue',
  safety: 'Safety/Security',
  weather: 'Weather',
  staffing: 'Staffing',
  maintenance: 'Maintenance',
  remodel: 'Remodel',
  relocation: 'Relocation',
  other: 'Other',
};

export function ClosuresBoard() {
  const [items, setItems] = useState<ClosureBoardItem[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'ended' | 'all'>('active');

  useEffect(() => {
    loadClosures();
    loadDistricts();
  }, []);

  const loadClosures = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/app/locations?lifecycle=active');
      if (!response.ok) throw new Error('Failed to load locations');
      const { data: locations } = await response.json();

      const closureItems: ClosureBoardItem[] = [];

      for (const loc of locations as Location[]) {
        const closuresResp = await fetch(`/api/app/edit/locations/${loc.id}/closures`);
        if (closuresResp.ok) {
          const { data: closures } = await closuresResp.json();
          if (closures && Array.isArray(closures)) {
            for (const closure of closures as Closure[]) {
              closureItems.push({
                id: `${loc.id}-${closure.id}`,
                closureId: closure.id,
                locationId: loc.id,
                storeNumber: loc.storeNumber,
                locationName: loc.name,
                districtId: loc.districtId,
                districtName: '', // Will be filled from district lookup
                closure,
              });
            }
          }
        }
      }

      setItems(closureItems);
    } catch (error) {
      console.error('Failed to load closures:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDistricts = async () => {
    try {
      const response = await fetch('/api/app/districts');
      if (!response.ok) throw new Error('Failed to load districts');
      const { data } = await response.json();
      setDistricts(data || []);
    } catch (error) {
      console.error('Failed to load districts:', error);
    }
  };

  const handleEndClosure = async (locationId: string, closureId: string) => {
    try {
      const response = await fetch(`/api/app/edit/locations/${locationId}/closures/${closureId}/end`, {
        method: 'POST',
      });
      if (response.ok) {
        loadClosures();
      }
    } catch (error) {
      console.error('Failed to end closure:', error);
    }
  };

  const handleRenewClosure = async (locationId: string, closureId: string) => {
    try {
      const response = await fetch(`/api/app/edit/locations/${locationId}/closures/${closureId}/renew`, {
        method: 'POST',
      });
      if (response.ok) {
        loadClosures();
      }
    } catch (error) {
      console.error('Failed to renew closure:', error);
    }
  };

  const filteredItems = items.filter(item => {
    if (selectedDistrict && item.districtId !== selectedDistrict) return false;
    if (statusFilter === 'active' && item.closure.status !== 'active') return false;
    if (statusFilter === 'ended' && item.closure.status !== 'ended') return false;
    return true;
  });

  const activeCount = items.filter(i => i.closure.status === 'active').length;
  const endedCount = items.filter(i => i.closure.status === 'ended').length;

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const getReasonLabel = (closure: Closure) => {
    if (closure.reasonCode) {
      return REASON_LABELS[closure.reasonCode] || closure.reasonCode;
    }
    return closure.reason;
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
        Loading closures...
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
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Closures Board</h2>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <select
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              minWidth: '150px',
            }}
          >
            <option value="">All Districts</option>
            {districts.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'active' | 'ended' | 'all')}
            style={{
              padding: '0.5rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
            }}
          >
            <option value="active">Active ({activeCount})</option>
            <option value="ended">Ended ({endedCount})</option>
            <option value="all">All ({items.length})</option>
          </select>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#6b7280',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
        }}>
          {statusFilter === 'active' 
            ? 'No active closures' 
            : statusFilter === 'ended' 
              ? 'No ended closures' 
              : 'No closures found'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredItems.map(item => (
            <div
              key={item.id}
              style={{
                padding: '1rem',
                backgroundColor: item.closure.status === 'active' ? '#fef3c7' : '#f3f4f6',
                borderRadius: '0.5rem',
                border: `1px solid ${item.closure.status === 'active' ? '#fcd34d' : '#e5e7eb'}`,
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {item.storeNumber} · {item.locationName}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#4b5563', marginTop: '0.25rem' }}>
                    {getReasonLabel(item.closure)}
                    {item.closure.reasonNote && (
                      <span style={{ marginLeft: '0.5rem', fontStyle: 'italic' }}>
                        — {item.closure.reasonNote}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem' }}>
                    Started: {formatDate(item.closure.startsAt)}
                    {item.closure.endsAt && (
                      <> · Expires: {formatDate(item.closure.endsAt)}</>
                    )}
                    {item.closure.renewalCount && item.closure.renewalCount > 0 && (
                      <span style={{ marginLeft: '0.5rem', color: '#9333ea' }}>
                        (Renewed {item.closure.renewalCount}x)
                      </span>
                    )}
                  </div>
                  {item.closure.type === 'unknown_end' && item.closure.nextReviewDate && (
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                      Next review: {item.closure.nextReviewDate}
                      {item.closure.ownerName && ` · Owner: ${item.closure.ownerName}`}
                    </div>
                  )}
                </div>
                {item.closure.status === 'active' && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(!item.closure.type || item.closure.type === 'same_day') && (
                      <button
                        onClick={() => handleRenewClosure(item.locationId, item.closureId)}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.75rem',
                          backgroundColor: '#8b5cf6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          minHeight: '44px',
                          minWidth: '44px',
                        }}
                      >
                        Renew
                      </button>
                    )}
                    <button
                      onClick={() => handleEndClosure(item.locationId, item.closureId)}
                      style={{
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.75rem',
                        backgroundColor: '#059669',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        minHeight: '44px',
                        minWidth: '44px',
                      }}
                    >
                      End Closure
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
