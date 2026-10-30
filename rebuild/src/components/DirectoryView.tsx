import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Phone, Copy, MapPin, ChevronRight, Menu, User, LogOut, ClipboardCheck, Calendar } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { LocationListItem, SearchResult, Region, District } from '../types';
import { StatusBadge } from './StatusBadge';
import { canApproveCorrections } from '../lib/permissions';

export function DirectoryView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [locations, setLocations] = useState<LocationListItem[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>(searchParams.get('region') || '');
  const [selectedDistrict, setSelectedDistrict] = useState<string>(searchParams.get('district') || '');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);
  
  const { getIdToken, signOut, user, authUser } = useAuth();
  const navigate = useNavigate();
  
  const showCorrectionsLink = authUser && canApproveCorrections(authUser);
  const showHolidaysLink = authUser && (authUser.role === 'Admin' || authUser.role === 'Steward');
  
  const fetchLocations = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      
      const params = new URLSearchParams();
      if (selectedDistrict) params.set('districtId', selectedDistrict);
      else if (selectedRegion) params.set('regionId', selectedRegion);
      
      const response = await fetch(`/api/app/locations?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) throw new Error('Failed to fetch locations');
      
      const { data } = await response.json();
      setLocations(data);
    } catch (error) {
      console.error('Fetch locations error:', error);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, selectedRegion, selectedDistrict]);
  
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
    } catch (error) {
      console.error('Search error:', error);
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
    setSearchParams(params, { replace: true });
  }, [searchQuery, selectedRegion, selectedDistrict, setSearchParams]);
  
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
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Shiekh Directory</h1>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 hover:bg-blue-600 rounded-lg"
            aria-label="Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
        
        {menuOpen && (
          <div className="absolute right-4 top-14 bg-white text-gray-900 rounded-lg shadow-lg border border-gray-200 py-2 min-w-48">
            <div className="px-4 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <div>
                  <span className="text-sm block">{user?.email || 'User'}</span>
                  {authUser && (
                    <span className="text-xs text-gray-500">{authUser.role}</span>
                  )}
                </div>
              </div>
            </div>
            {showCorrectionsLink && (
              <button
                onClick={() => {
                  navigate('/corrections');
                  setMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
              >
                <ClipboardCheck className="w-4 h-4" />
                Approval Queue
              </button>
            )}
            {showHolidaysLink && (
              <button
                onClick={() => {
                  navigate('/holidays');
                  setMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                Manage Holidays
              </button>
            )}
            <button
              onClick={() => {
                signOut();
                setMenuOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        )}
      </header>
      
      {/* Search */}
      <div className="bg-white border-b border-gray-200 sticky top-[52px] z-10">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
        </div>
      </div>
      
      {/* Filters */}
      {!showSearchResults && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto">
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setSelectedDistrict('');
              }}
              className="px-3 py-1.5 border border-gray-300 rounded-full text-sm bg-white"
            >
              <option value="">All Regions</option>
              {regions.map(region => (
                <option key={region.id} value={region.id}>{region.name}</option>
              ))}
            </select>
            
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-full text-sm bg-white"
            >
              <option value="">All Districts</option>
              {filteredDistricts.map(district => (
                <option key={district.id} value={district.id}>{district.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      
      {/* Content */}
      <main className="max-w-3xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading stores...</p>
          </div>
        ) : showSearchResults ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
            </p>
            {searchResults.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No results found
              </div>
            ) : (
              searchResults.map(result => (
                <div
                  key={`${result.type}-${result.id}`}
                  onClick={() => result.type === 'location' && handleLocationClick(result)}
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleCall(result.phone!, e)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          aria-label="Call"
                        >
                          <Phone className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => handleCopy(result.phone!, e)}
                          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                          aria-label="Copy phone"
                        >
                          <Copy className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              {locations.length} store{locations.length !== 1 ? 's' : ''}
            </p>
            {locations.map(location => (
              <div
                key={location.id}
                onClick={() => handleLocationClick(location)}
                className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
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
                  
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => handleCall(location.phone, e)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                      aria-label="Call"
                    >
                      <Phone className="w-5 h-5" />
                    </button>
                    <button
                      onClick={(e) => handleCopy(location.phoneFormatted, e)}
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                      aria-label="Copy phone"
                    >
                      <Copy className="w-5 h-5" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
      
      {/* Copy Toast */}
      {copiedPhone && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
          Copied {copiedPhone}
        </div>
      )}
    </div>
  );
}
