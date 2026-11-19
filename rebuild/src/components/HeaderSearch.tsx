import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Store, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface SearchResult {
  id: string;
  type: 'store' | 'person';
  title: string;
  subtitle?: string;
}

interface HeaderSearchProps {
  className?: string;
}

export function HeaderSearch({ className = '' }: HeaderSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { getIdToken, authUser } = useAuth();
  const navigate = useNavigate();

  const canSearchPeople = authUser && ['Admin', 'Steward', 'Leader'].includes(authUser.role);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const token = await getIdToken();
      const searchResults: SearchResult[] = [];

      const locationsResponse = await fetch(`/api/app/locations/search?q=${encodeURIComponent(searchQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (locationsResponse.ok) {
        const { data } = await locationsResponse.json();
        const locationResults = (data || []).slice(0, 5).map((loc: { id: string; storeNumber: string; title: string; city?: string; state?: string }) => ({
          id: loc.id,
          type: 'store' as const,
          title: `#${loc.storeNumber} ${loc.title}`,
          subtitle: loc.city && loc.state ? `${loc.city}, ${loc.state}` : undefined,
        }));
        searchResults.push(...locationResults);
      }

      if (canSearchPeople) {
        const peopleResponse = await fetch(`/api/app/people?search=${encodeURIComponent(searchQuery)}&lifecycle=active`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (peopleResponse.ok) {
          const { data } = await peopleResponse.json();
          const peopleResults = (data || []).slice(0, 5).map((person: { id: string; fullName: string; workEmail?: string }) => ({
            id: person.id,
            type: 'person' as const,
            title: person.fullName,
            subtitle: person.workEmail,
          }));
          searchResults.push(...peopleResults);
        }
      }

      setResults(searchResults);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, canSearchPeople]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        search(query);
      } else {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, search]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length > 0) {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          selectResult(results[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const selectResult = (result: SearchResult) => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);

    if (result.type === 'store') {
      navigate(`/location/${result.id}`);
    } else {
      navigate(`/person/${result.id}`);
    }
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const listboxId = 'header-search-listbox';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search stores, people..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
          role="combobox"
          aria-expanded={isOpen && results.length > 0}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
          aria-autocomplete="list"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {isOpen && (query.trim().length >= 2 || results.length > 0) && (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-80 overflow-auto"
          aria-label="Search results"
        >
          {loading ? (
            <li className="px-4 py-3 text-gray-500 text-sm" role="status">
              Searching...
            </li>
          ) : results.length === 0 && query.trim().length >= 2 ? (
            <li className="px-4 py-3 text-gray-500 text-sm">
              No results found
            </li>
          ) : (
            results.map((result, index) => (
              <li
                key={`${result.type}-${result.id}`}
                id={`search-result-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => selectResult(result)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`px-4 py-3 cursor-pointer flex items-center gap-3 ${
                  index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className={`p-2 rounded-full ${result.type === 'store' ? 'bg-blue-100' : 'bg-green-100'}`}>
                  {result.type === 'store' ? (
                    <Store className={`w-4 h-4 ${result.type === 'store' ? 'text-blue-600' : ''}`} />
                  ) : (
                    <User className="w-4 h-4 text-green-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{result.title}</p>
                  {result.subtitle && (
                    <p className="text-sm text-gray-500 truncate">{result.subtitle}</p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${
                  result.type === 'store' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {result.type === 'store' ? 'Store' : 'Person'}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
