import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Check, X, ChevronRight, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { Correction } from '../types';

interface CorrectionsQueueProps {
  onBack: () => void;
}

export function CorrectionsQueue({ onBack }: CorrectionsQueueProps) {
  const { getIdToken } = useAuth();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');

  const loadCorrections = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getIdToken();
      const response = await fetch(`/api/app/corrections?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const { data } = await response.json();
        setCorrections(data);
      }
    } catch (err) {
      console.error('Failed to load corrections:', err);
    } finally {
      setLoading(false);
    }
  }, [getIdToken, filter]);

  useEffect(() => {
    loadCorrections();
  }, [loadCorrections]);

  const handleApprove = async (id: string) => {
    setProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/corrections/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const result = await response.json();
        if (result.error?.code === 'version_conflict') {
          setError('The location was modified. Please review manually.');
        } else {
          setError(result.error?.message || 'Failed to approve');
        }
        return;
      }

      setSelectedId(null);
      loadCorrections();
    } catch (err) {
      setError('Failed to approve correction');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (id: string) => {
    setProcessing(true);
    setError(null);
    try {
      const token = await getIdToken();
      const response = await fetch(`/api/app/corrections/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const result = await response.json();
        setError(result.error?.message || 'Failed to reject');
        return;
      }

      setSelectedId(null);
      loadCorrections();
    } catch (err) {
      setError('Failed to reject correction');
    } finally {
      setProcessing(false);
    }
  };

  const selectedCorrection = corrections.find(c => c.id === selectedId);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-blue-600 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Approval Queue</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(['pending', 'approved', 'rejected'] as const).map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

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
        ) : corrections.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No {filter} corrections
          </div>
        ) : (
          <div className="space-y-3">
            {corrections.map(correction => (
              <div
                key={correction.id}
                onClick={() => setSelectedId(correction.id)}
                className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:border-blue-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        correction.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        correction.status === 'approved' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {correction.type}
                      </span>
                      {correction.category && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {correction.category}
                        </span>
                      )}
                      <span className="font-medium">#{correction.storeNumber} {correction.locationName}</span>
                    </div>
                    {correction.proposedNote && (
                      <p className="text-sm text-gray-600 mt-1 italic">
                        "{correction.proposedNote}"
                      </p>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      Submitted by {correction.submittedByEmail}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(correction.submittedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedCorrection && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                #{selectedCorrection.storeNumber} - {selectedCorrection.type} Correction
              </h2>
              <button onClick={() => setSelectedId(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-500">Submitted by</p>
                <p className="font-medium">{selectedCorrection.submittedByEmail}</p>
                <p className="text-xs text-gray-400">
                  {new Date(selectedCorrection.submittedAt).toLocaleString()}
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Proposed Changes</h3>
                {Object.entries(selectedCorrection.proposedChanges).map(([field, newValue]) => (
                  <div key={field} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 font-medium text-sm">{field}</div>
                    <div className="grid grid-cols-2 divide-x divide-gray-200">
                      <div className="p-3">
                        <p className="text-xs text-gray-500 mb-1">Current</p>
                        <pre className="text-sm text-red-700 whitespace-pre-wrap">
                          {formatValue(selectedCorrection.currentValues[field])}
                        </pre>
                      </div>
                      <div className="p-3">
                        <p className="text-xs text-gray-500 mb-1">Proposed</p>
                        <pre className="text-sm text-green-700 whitespace-pre-wrap">
                          {formatValue(newValue)}
                        </pre>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {selectedCorrection.status !== 'pending' && selectedCorrection.reviewedByEmail && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-sm text-gray-500">Reviewed by</p>
                  <p className="font-medium">{selectedCorrection.reviewedByEmail}</p>
                  <p className="text-xs text-gray-400">
                    {selectedCorrection.reviewedAt && new Date(selectedCorrection.reviewedAt).toLocaleString()}
                  </p>
                  {selectedCorrection.reviewNotes && (
                    <p className="text-sm text-gray-600 mt-2">{selectedCorrection.reviewNotes}</p>
                  )}
                </div>
              )}
            </div>

            {selectedCorrection.status === 'pending' && (
              <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3 flex gap-3">
                <button
                  onClick={() => handleReject(selectedCorrection.id)}
                  disabled={processing}
                  className="flex-1 py-2.5 border border-red-300 text-red-700 rounded-lg font-medium hover:bg-red-50 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Reject
                </button>
                <button
                  onClick={() => handleApprove(selectedCorrection.id)}
                  disabled={processing}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Approve
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
