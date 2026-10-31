import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Check, AlertTriangle, Store, ChevronDown, ChevronUp, CheckSquare, Square, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Holiday {
  id: string;
  name: string;
  date: string;
  closed: boolean;
}

interface PreviewStore {
  id: string;
  storeNumber: string;
  name: string;
  state: string;
  alreadyHasException: boolean;
}

interface BulkPreviewResult {
  holiday: Holiday;
  targetStores: PreviewStore[];
  storesWithExisting: number;
  storesToCreate: number;
}

interface BulkApplyResult {
  success: boolean;
  created: number;
  skipped: number;
  errors: string[];
}

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' }, { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' }, { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' }, { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' }, { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' }, { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' }, { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' }, { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' }, { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' }, { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' }, { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' }, { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' }, { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' }, { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' }, { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' }, { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
];

export function BulkHolidayManager() {
  const navigate = useNavigate();
  const { getIdToken, authUser } = useAuth();

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [selectedHoliday, setSelectedHoliday] = useState<string>('');
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<BulkPreviewResult | null>(null);
  const [result, setResult] = useState<BulkApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statesExpanded, setStatesExpanded] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const canManageHolidays = authUser?.role === 'Admin' || authUser?.role === 'Steward';

  const fetchHolidays = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const response = await fetch(`/api/app/hours-exceptions/holidays?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Failed to fetch holidays');
      const { data } = await response.json();
      setHolidays(data);
    } catch (err) {
      setError('Failed to load holidays');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, year]);

  useEffect(() => {
    fetchHolidays();
  }, [fetchHolidays]);

  const handlePreview = async () => {
    if (!selectedHoliday) return;

    try {
      setPreviewing(true);
      setPreview(null);
      setResult(null);
      setError(null);
      
      const token = await getIdToken();
      const response = await fetch('/api/app/hours-exceptions/bulk/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          holidayId: selectedHoliday,
          states: selectedStates.length > 0 ? selectedStates : undefined,
          year,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Preview failed');
      }

      const { data } = await response.json();
      setPreview(data);
      setPreviewExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;

    try {
      setApplying(true);
      setError(null);
      
      const token = await getIdToken();
      const response = await fetch('/api/app/hours-exceptions/bulk/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          holidayId: selectedHoliday,
          states: selectedStates.length > 0 ? selectedStates : undefined,
          year,
          skipExisting: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Apply failed');
      }

      const { data } = await response.json();
      setResult(data);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  };

  const toggleState = (stateCode: string) => {
    setSelectedStates(prev =>
      prev.includes(stateCode)
        ? prev.filter(s => s !== stateCode)
        : [...prev, stateCode]
    );
    setPreview(null);
    setResult(null);
  };

  const clearStates = () => {
    setSelectedStates([]);
    setPreview(null);
    setResult(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  const selectedHolidayData = holidays.find(h => h.id === selectedHoliday);

  if (!canManageHolidays) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6 text-center max-w-md">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600 mb-4">Only Admin and Steward users can manage bulk holidays.</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Return to Directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-blue-600 rounded-lg -ml-2"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold">Bulk Holiday Manager</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Year and Holiday Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div className="flex items-center gap-2 text-gray-700">
            <Calendar className="w-5 h-5" />
            <span className="font-medium">Select Holiday</span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => {
                  setYear(parseInt(e.target.value));
                  setPreview(null);
                  setResult(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                {[year - 1, year, year + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Holiday</label>
              <select
                value={selectedHoliday}
                onChange={(e) => {
                  setSelectedHoliday(e.target.value);
                  setPreview(null);
                  setResult(null);
                }}
                disabled={loading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a holiday...</option>
                {holidays.map(holiday => (
                  <option key={holiday.id} value={holiday.id}>
                    {holiday.name} ({formatDate(holiday.date)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedHolidayData && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="font-medium">{selectedHolidayData.name}</div>
                <div className="text-sm text-gray-600">{formatDate(selectedHolidayData.date)}</div>
              </div>
              <span className={`px-2 py-1 rounded text-sm font-medium ${
                selectedHolidayData.closed
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {selectedHolidayData.closed ? 'Closed' : 'Special Hours'}
              </span>
            </div>
          )}
        </div>

        {/* State Filter */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <button
            onClick={() => setStatesExpanded(!statesExpanded)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2 text-gray-700">
              <Store className="w-5 h-5" />
              <span className="font-medium">
                Filter by State
                {selectedStates.length > 0 && (
                  <span className="ml-2 text-blue-600">({selectedStates.length} selected)</span>
                )}
              </span>
            </div>
            {statesExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          {statesExpanded && (
            <div className="mt-4 space-y-3">
              {selectedStates.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">
                    Selected: {selectedStates.join(', ')}
                  </span>
                  <button
                    onClick={clearStates}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Clear all
                  </button>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                {US_STATES.map(state => (
                  <button
                    key={state.code}
                    onClick={() => toggleState(state.code)}
                    className={`px-2 py-1.5 text-sm rounded border flex items-center gap-1 transition-colors ${
                      selectedStates.includes(state.code)
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {selectedStates.includes(state.code)
                      ? <CheckSquare className="w-3.5 h-3.5" />
                      : <Square className="w-3.5 h-3.5" />
                    }
                    {state.code}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500">
                Leave empty to apply to all stores, or select specific states.
              </p>
            </div>
          )}
        </div>

        {/* Preview Button */}
        <button
          onClick={handlePreview}
          disabled={!selectedHoliday || previewing}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {previewing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating Preview...
            </>
          ) : (
            'Preview Affected Stores'
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="text-red-700">{error}</div>
          </div>
        )}

        {/* Preview Results */}
        {preview && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-900">Preview: {preview.holiday.name}</h3>
              <p className="text-sm text-gray-600">{formatDate(preview.holiday.date)}</p>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{preview.storesToCreate}</div>
                  <div className="text-sm text-green-600">Stores to Update</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-700">{preview.storesWithExisting}</div>
                  <div className="text-sm text-gray-600">Already Have Holiday</div>
                </div>
              </div>

              <button
                onClick={() => setPreviewExpanded(!previewExpanded)}
                className="w-full flex items-center justify-between py-2 text-gray-600 hover:text-gray-900"
              >
                <span className="text-sm">
                  {preview.targetStores.length} stores in {selectedStates.length > 0 ? selectedStates.join(', ') : 'all states'}
                </span>
                {previewExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {previewExpanded && (
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  {preview.targetStores.map(store => (
                    <div
                      key={store.id}
                      className={`px-3 py-2 flex items-center justify-between border-b border-gray-100 last:border-b-0 ${
                        store.alreadyHasException ? 'bg-gray-50' : ''
                      }`}
                    >
                      <div>
                        <span className="font-medium">#{store.storeNumber}</span>
                        <span className="text-gray-600 ml-2">{store.name}</span>
                        <span className="text-gray-400 ml-2 text-sm">{store.state}</span>
                      </div>
                      {store.alreadyHasException && (
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                          Already set
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {preview.storesToCreate > 0 && (
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Apply to {preview.storesToCreate} Stores
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Success Result */}
        {result && (
          <div className="bg-white rounded-lg border border-green-200 overflow-hidden">
            <div className="p-4 bg-green-50 flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-900">Holiday Applied Successfully</h3>
                <p className="text-sm text-green-700">
                  {result.created} stores updated, {result.skipped} skipped
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="p-4 border-t border-green-200">
                <h4 className="text-sm font-medium text-amber-700 mb-2">Some errors occurred:</h4>
                <ul className="text-sm text-amber-600 space-y-1">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="p-4 border-t border-green-200">
              <button
                onClick={() => {
                  setResult(null);
                  setSelectedHoliday('');
                }}
                className="w-full py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium"
              >
                Apply Another Holiday
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
