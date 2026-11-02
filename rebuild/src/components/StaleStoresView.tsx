import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, Calendar, RefreshCw, Store, ExternalLink, Download, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface StaleStoreItem {
  id: string;
  storeNumber: string;
  name: string;
  districtId: string;
  districtName?: string;
  regionId: string;
  regionName?: string;
  lastVerifiedAt?: string;
  daysSinceVerification: number | null;
}

interface District {
  id: string;
  name: string;
}

interface StaleStoresResponse {
  staleStores: StaleStoreItem[];
  thresholdDays: number;
  totalCount: number;
  districts: District[];
}

export function StaleStoresView() {
  useDocumentTitle('Stale Stores');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<StaleStoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDistrictId, setFilterDistrictId] = useState('');
  const [minDaysOverdue, setMinDaysOverdue] = useState('');
  const [maxDaysOverdue, setMaxDaysOverdue] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchStaleStores = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (filterDistrictId) params.set('districtId', filterDistrictId);
      if (minDaysOverdue) params.set('minDaysOverdue', minDaysOverdue);
      if (maxDaysOverdue) params.set('maxDaysOverdue', maxDaysOverdue);
      
      const url = `/api/app/stale-stores${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to load stale stores');
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stale stores');
    } finally {
      setLoading(false);
    }
  }, [user, filterDistrictId, minDaysOverdue, maxDaysOverdue]);

  useEffect(() => {
    fetchStaleStores();
  }, [fetchStaleStores]);

  const handleExportCSV = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (filterDistrictId) params.set('districtId', filterDistrictId);
      if (minDaysOverdue) params.set('minDaysOverdue', minDaysOverdue);
      if (maxDaysOverdue) params.set('maxDaysOverdue', maxDaysOverdue);
      
      const url = `/api/app/stale-stores/export${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to export');
      }
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `stale-stores-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  };

  const handleReissueVerification = async (storeId: string) => {
    navigate(`/verification?locationId=${storeId}`);
  };
  
  const getDaysOverdue = (daysSinceVerification: number | null, thresholdDays: number): number | null => {
    if (daysSinceVerification === null) return null;
    return daysSinceVerification - thresholdDays;
  };

  if (!user) {
    return (
      <div className="p-6 text-center text-gray-500">
        Sign in to view stale stores
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            Stale Stores
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Active stores with verification older than {data?.thresholdDays ?? 90} days or never verified.
            Facilities are excluded.
          </p>
        </div>
        <button
          onClick={fetchStaleStores}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 min-h-[44px]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error}
        </div>
      )}

      {!loading && data && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-4 border-b border-gray-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{data.staleStores.length}</span> stale stores
              </div>
              <button
                onClick={handleExportCSV}
                disabled={exporting || data.staleStores.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 min-h-[44px]"
              >
                <Download className="h-4 w-4" />
                {exporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
            
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-600">Filters:</span>
              </div>
              
              {data.districts.length > 0 && (
                <div className="flex items-center gap-2">
                  <label htmlFor="district-filter" className="text-sm text-gray-600">District:</label>
                  <select
                    id="district-filter"
                    value={filterDistrictId}
                    onChange={(e) => setFilterDistrictId(e.target.value)}
                    className="text-sm border border-gray-300 rounded px-2 py-1 min-h-[44px]"
                  >
                    <option value="">All</option>
                    {data.districts.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <label htmlFor="min-overdue" className="text-sm text-gray-600">Days overdue:</label>
                <input
                  id="min-overdue"
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={minDaysOverdue}
                  onChange={(e) => setMinDaysOverdue(e.target.value)}
                  className="w-20 text-sm border border-gray-300 rounded px-2 py-1 min-h-[44px]"
                />
                <span className="text-gray-400">–</span>
                <input
                  id="max-overdue"
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={maxDaysOverdue}
                  onChange={(e) => setMaxDaysOverdue(e.target.value)}
                  className="w-20 text-sm border border-gray-300 rounded px-2 py-1 min-h-[44px]"
                  aria-label="Maximum days overdue"
                />
              </div>
              
              {(filterDistrictId || minDaysOverdue || maxDaysOverdue) && (
                <button
                  onClick={() => {
                    setFilterDistrictId('');
                    setMinDaysOverdue('');
                    setMaxDaysOverdue('');
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 min-h-[44px] flex items-center"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading stale stores...</div>
          ) : data.staleStores.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Store className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No stale stores found</p>
              <p className="text-sm mt-1">All stores are within the verification threshold or match your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {data.staleStores.map(store => {
                const daysOverdue = getDaysOverdue(store.daysSinceVerification, data.thresholdDays);
                return (
                  <div
                    key={store.id}
                    className="p-4 hover:bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => navigate(`/location/${store.id}`)}
                          className="font-medium text-gray-900 hover:text-blue-600 hover:underline truncate min-h-[44px] flex items-center"
                        >
                          #{store.storeNumber} - {store.name}
                        </button>
                      </div>
                      <div className="mt-1 text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                        {store.districtName && <span>{store.districtName}</span>}
                        {store.regionName && <span>{store.regionName}</span>}
                      </div>
                      <div className="mt-1 text-sm flex items-center gap-4">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-gray-400" />
                          {store.daysSinceVerification === null ? (
                            <span className="text-red-600 font-medium">Never verified</span>
                          ) : (
                            <span className="text-gray-600">
                              {store.daysSinceVerification} days ago
                            </span>
                          )}
                        </span>
                        <span className={`font-medium ${
                          daysOverdue === null || daysOverdue > 30 
                            ? 'text-red-600' 
                            : daysOverdue > 14 
                              ? 'text-amber-600' 
                              : 'text-amber-500'
                        }`}>
                          {daysOverdue === null ? 'Never verified' : `${daysOverdue} days overdue`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:flex-shrink-0">
                      <button
                        onClick={() => handleReissueVerification(store.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 min-h-[44px]"
                        aria-label={`Send verification to ${store.name}`}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Send Verification
                      </button>
                      <button
                        onClick={() => navigate(`/location/${store.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 min-h-[44px]"
                        aria-label={`View details for ${store.name}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-600" />
          Loading stale stores...
        </div>
      )}
    </div>
  );
}
