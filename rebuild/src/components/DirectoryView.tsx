import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Phone, Copy, MapPin, ChevronRight, Building2, Warehouse, Store, User, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { LocationListItem, SearchResult, Region, District, LocationKind } from '../types';
import { STORE_TYPES } from '../types';
import { StatusBadge } from './StatusBadge';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const KIND_ICONS: Record<LocationKind, typeof Store> = {
  store: Store,
  warehouse: Warehouse,
  office: Building2,
  facility: Building2,
};

export function DirectoryView() {
  useDocumentTitle('Directory');
  
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>(searchParams.get('region') || '');
  const [selectedDistrict, setSelectedDistrict] = useState<string>(searchParams.get('district') || '');
  const [selectedKind, setSelectedKind] = useState<string>(searchParams.get('kind') || 'store');
  const [selectedStoreType, setSelectedStoreType] = useState<string>(searchParams.get('storeType') || '');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  
  const { getIdToken } = useAuth();
  const navigate = useNavigate();
  
  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      
      const params = new URLSearchParams();
      if (selectedKind) params.set('kind', selectedKind);
      if (selectedDistrict) params.set('districtId', selectedDistrict);
      else if (selectedRegion) params.set('regionId', selectedRegion);
      if (selectedStoreType) params.set('storeType', selectedStoreType);
      
      const response = await fetch(`/api/app/locations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error?.message || 'Failed to fetch locations');
      }
      
      const { data } = await response.json();
      setLocations(data);
    } catch (err) {
      console.error('Fetch locations error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, selectedRegion, selectedDistrict, selectedKind, selectedStoreType]);
  
  const fetchFilters = useCallback(async () => {
    try {
      const token = await getIdToken();
      
      const [regionsRes, districtsRes] = await Promise.all([
        fetch('/api/app/regions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/app/districts', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      
      if (regionsRes.ok) {
        const { data } = await regionsRes.json();
        setRegions(data || []);
      }
      
      if (districtsRes.ok) {
        const { data } = await districtsRes.json();
        setDistricts(data || []);
      }
    } catch {
    }
  }, [getIdToken]);
  
  const searchLocations = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    try {
      setSearching(true);
      const token = await getIdToken();
      
      const response = await fetch(`/api/app/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const { data } = await response.json();
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  }, [getIdToken]);
  
  useEffect(() => {
    fetchLocations();
    fetchFilters();
  }, [fetchLocations, fetchFilters]);
  
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      searchLocations(searchQuery);
    }, 200);
    
    return () => clearTimeout(debounceTimer);
  }, [searchQuery, searchLocations]);
  
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('q', searchQuery);
    if (selectedRegion) params.set('region', selectedRegion);
    if (selectedDistrict) params.set('district', selectedDistrict);
    if (selectedKind && selectedKind !== 'store') params.set('kind', selectedKind);
    if (selectedStoreType) params.set('storeType', selectedStoreType);
    setSearchParams(params, { replace: true });
  }, [searchQuery, selectedRegion, selectedDistrict, selectedKind, selectedStoreType, setSearchParams]);
  
  const handleCall = (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `tel:${phone}`;
  };
  
  const handleCopy = async (phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      setTimeout(() => setCopiedPhone(null), 2000);
    } catch {
    }
  };
  
  const handleLocationClick = (location: LocationListItem | SearchResult) => {
    navigate(`/location/${location.id}`);
  };
  
  const filteredDistricts = selectedRegion
    ? districts.filter(d => d.regionId === selectedRegion)
    : districts;
  
  const showSearchResults = searchQuery.trim().length > 0;
  
  const totalPages = Math.ceil(locations.length / PAGE_SIZE);
  const paginatedLocations = locations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  
  useEffect(() => {
    setPage(1);
  }, [selectedRegion, selectedDistrict, selectedKind, selectedStoreType]);
  
  return (
    <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
      <h1 className="sr-only">Store Directory</h1>
      {/* Search and Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 lg:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by store #, name, city, or phone..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
              {searching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
            
            {/* Filters - inline on desktop */}
            {!showSearchResults && (
              <div className="flex flex-wrap gap-2 lg:gap-3">
                <select
                  value={selectedRegion}
                  onChange={(e) => {
                    setSelectedRegion(e.target.value);
                    setSelectedDistrict('');
                  }}
                  aria-label="Filter by region"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-h-[44px] lg:min-h-[40px]"
                >
                  <option value="">All Regions</option>
                  {regions.map(region => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
                
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  aria-label="Filter by district"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-h-[44px] lg:min-h-[40px]"
                >
                  <option value="">All Districts</option>
                  {filteredDistricts.map(district => (
                    <option key={district.id} value={district.id}>{district.name}</option>
                  ))}
                </select>
                
                <select
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value)}
                  aria-label="Filter by location type"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-h-[44px] lg:min-h-[40px]"
                >
                  <option value="store">Stores</option>
                  <option value="facility">Facilities</option>
                  <option value="all">All Locations</option>
                </select>
                
                <select
                  value={selectedStoreType}
                  onChange={(e) => setSelectedStoreType(e.target.value)}
                  aria-label="Filter by store type"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-h-[44px] lg:min-h-[40px]"
                >
                  <option value="">All Types</option>
                  {STORE_TYPES.map(t => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-4 lg:py-6 min-h-[60vh]">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading stores...</p>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
            <p className="mt-4 text-gray-900 font-medium">Failed to load locations</p>
            <p className="mt-2 text-gray-600">{error}</p>
            <button
              onClick={() => fetchLocations()}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        ) : showSearchResults ? (
          <div>
            <p className="text-sm text-gray-500 mb-4">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No results found
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {searchResults.map(result => (
                  <SearchResultCard
                    key={`${result.type}-${result.id}`}
                    result={result}
                    onCall={handleCall}
                    onCopy={handleCopy}
                    onClick={handleLocationClick}
                    copiedPhone={copiedPhone}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">
                {locations.length} {selectedKind === 'all' ? 'location' : selectedKind}{locations.length !== 1 ? 's' : ''}
              </p>
            </div>
            
            {locations.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <Store className="w-12 h-12 text-gray-300 mx-auto" />
                <p className="mt-4 text-gray-900 font-medium">No locations found</p>
                <p className="mt-2 text-gray-500 text-sm">
                  {selectedDistrict || selectedRegion || selectedStoreType
                    ? 'Try adjusting your filters'
                    : 'No stores have been added yet'}
                </p>
              </div>
            ) : (
            <>
            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Store</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Manager</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phone</th>
                      <th className="px-4 py-3"><span className="sr-only">Open</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedLocations.map(location => {
                      const KindIcon = KIND_ICONS[location.kind] || Store;
                      return (
                        <tr
                          key={location.id}
                          onClick={() => handleLocationClick(location)}
                          className="hover:bg-gray-50 cursor-pointer"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {selectedKind === 'all' && (
                                <KindIcon className="w-4 h-4 text-gray-600" />
                              )}
                              <div>
                                <div className="font-medium text-gray-900">#{location.storeNumber}</div>
                                <div className="text-sm text-gray-500">{location.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-sm text-gray-600">
                              <MapPin className="w-3.5 h-3.5 text-gray-600" />
                              {location.city}, {location.state}
                            </div>
                            {location.districtName && (
                              <div className="text-xs text-gray-600">{location.districtName}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {location.smName ? (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <User className="w-3.5 h-3.5 text-gray-600" />
                                {location.smName}
                              </div>
                            ) : (
                              <span className="text-sm text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={location.statusNow.state} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => handleCall(location.phone, e)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                                aria-label="Call"
                              >
                                <Phone className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => handleCopy(location.phoneFormatted, e)}
                                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                                aria-label="Copy phone"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                              <span className="text-sm text-gray-600 ml-1">{location.phoneFormatted}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Mobile Card View */}
            <div className="lg:hidden space-y-3">
              {paginatedLocations.map(location => {
                const KindIcon = KIND_ICONS[location.kind] || Store;
                return (
                  <div
                    key={location.id}
                    onClick={() => handleLocationClick(location)}
                    className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {selectedKind === 'all' && (
                            <KindIcon className="w-4 h-4 text-gray-600" />
                          )}
                          <h3 className="font-medium text-gray-900">
                            #{location.storeNumber} {location.name}
                          </h3>
                          <StatusBadge status={location.statusNow.state} />
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {location.city}, {location.state}
                        </p>
                        {location.smName && (
                          <p className="text-sm text-gray-500 mt-0.5">
                            SM: {location.smName}
                          </p>
                        )}
                      </div>
                    
                      <div className="flex items-center">
                        <button
                          onClick={(e) => handleCall(location.phone, e)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg"
                          aria-label="Call"
                        >
                          <Phone className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => handleCopy(location.phoneFormatted, e)}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg"
                          aria-label="Copy phone"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                        <ChevronRight className="w-5 h-5 text-gray-600" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
            )}
          </div>
        )}
        
        {/* Pagination Controls */}
        {!showSearchResults && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 min-h-[44px]"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600 px-4">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 min-h-[44px]"
            >
              Next
            </button>
          </div>
        )}
      </div>
      
      {/* Copy Toast */}
      {copiedPhone && (
        <div role="status" aria-live="polite" className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          Copied {copiedPhone}
        </div>
      )}
    </div>
  );
}

interface SearchResultCardProps {
  result: SearchResult;
  onCall: (phone: string, e: React.MouseEvent) => void;
  onCopy: (phone: string, e: React.MouseEvent) => void;
  onClick: (result: SearchResult) => void;
  copiedPhone: string | null;
}

function SearchResultCard({ result, onCall, onCopy, onClick }: SearchResultCardProps) {
  return (
    <div
      onClick={() => result.type === 'location' && onClick(result)}
      className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-gray-900 truncate">{result.title}</h3>
            {result.statusNow && (
              <StatusBadge status={result.statusNow.state} />
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
            {result.type === 'location' ? (
              <>
                <MapPin className="w-3.5 h-3.5" />
                {result.subtitle}
              </>
            ) : (
              result.subtitle
            )}
          </p>
        </div>
        
        {result.phone && (
          <div className="flex items-center">
            <button
              onClick={(e) => onCall(result.phone!, e)}
              className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-blue-600 hover:bg-blue-50 rounded-lg"
              aria-label="Call"
            >
              <Phone className="w-5 h-5 lg:w-4 lg:h-4" />
            </button>
            <button
              onClick={(e) => onCopy(result.phone!, e)}
              className="min-w-[44px] min-h-[44px] lg:min-w-[36px] lg:min-h-[36px] flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-lg"
              aria-label="Copy phone"
            >
              <Copy className="w-5 h-5 lg:w-4 lg:h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
