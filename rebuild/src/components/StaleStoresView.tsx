import { useEffect, useState } from 'react';
import { AlertTriangle, Calendar, RefreshCw, Store, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

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

interface StaleStoresResponse {
  staleStores: StaleStoreItem[];
  thresholdDays: number;
  totalCount: number;
}

export function StaleStoresView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<StaleStoresResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');

  const fetchStaleStores = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/app/stale-stores', {
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
  };

  useEffect(() => {
    fetchStaleStores();
  }, [user]);

  const filteredStores = data?.staleStores.filter(store => {
    if (!filterDistrict) return true;
    return store.districtName?.toLowerCase().includes(filterDistrict.toLowerCase()) ||
           store.districtId.toLowerCase().includes(filterDistrict.toLowerCase());
  }) ?? [];

  const districts = [...new Set(data?.staleStores.map(s => s.districtName || s.districtId) ?? [])].sort();

  const handleReissueVerification = async (storeId: string) => {
    navigate(`/verification?locationId=${storeId}`);
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
          className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
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
          <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm text-gray-600">
              <span className="font-semibold text-gray-900">{filteredStores.length}</span> stale stores
              {filterDistrict && ` in filter`}
              {data.totalCount !== filteredStores.length && ` (${data.totalCount} total)`}
            </div>
            {districts.length > 1 && (
              <div className="flex items-center gap-2">
                <label htmlFor="district-filter" className="text-sm text-gray-600">District:</label>
                <select
                  id="district-filter"
                  value={filterDistrict}
                  onChange={(e) => setFilterDistrict(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="">All districts</option>
                  {districts.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading stale stores...</div>
          ) : filteredStores.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Store className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">No stale stores found</p>
              <p className="text-sm mt-1">All stores are within the verification threshold</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredStores.map(store => (
                <div
                  key={store.id}
                  className="p-4 hover:bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/location/${store.id}`)}
                        className="font-medium text-gray-900 hover:text-blue-600 hover:underline truncate"
                      >
                        #{store.storeNumber} - {store.name}
                      </button>
                    </div>
                    <div className="mt-1 text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-1">
                      {store.districtName && <span>{store.districtName}</span>}
                      {store.regionName && <span>{store.regionName}</span>}
                    </div>
                    <div className="mt-1 text-sm flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      {store.daysSinceVerification === null ? (
                        <span className="text-red-600 font-medium">Never verified</span>
                      ) : (
                        <span className={store.daysSinceVerification > 180 ? 'text-red-600 font-medium' : 'text-amber-600'}>
                          {store.daysSinceVerification} days since verification
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    <button
                      onClick={() => handleReissueVerification(store.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reissue Verification
                    </button>
                    <button
                      onClick={() => navigate(`/location/${store.id}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-gray-500">
          <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-400" />
          Loading stale stores...
        </div>
      )}
    </div>
  );
}
