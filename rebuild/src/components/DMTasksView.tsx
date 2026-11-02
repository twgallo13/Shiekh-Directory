import { useState, useEffect, useCallback } from 'react';
import { CheckSquare, Clock, AlertCircle, Check, X, Info, Loader2, ChevronRight } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Dialog } from './Dialog';
import type { DMTask, DMTaskStatus } from '../types';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export function DMTasksView() {
  useDocumentTitle('DM Tasks');
  const { getIdToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locationIdFilter = searchParams.get('locationId');
  
  const [tasks, setTasks] = useState<DMTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<DMTaskStatus | ''>('pending');
  const [selectedTask, setSelectedTask] = useState<DMTask | null>(null);
  const [processing, setProcessing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [actionNote, setActionNote] = useState('');

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await getIdToken();
      const params = new URLSearchParams();
      if (filter) params.set('status', filter);
      if (locationIdFilter) params.set('locationId', locationIdFilter);
      
      const response = await fetch(`/api/app/dm-tasks?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to load tasks');
      }
      
      const { data } = await response.json();
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [getIdToken, filter, locationIdFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const updateTaskStatus = async (taskId: string, status: DMTaskStatus, note?: string) => {
    try {
      setProcessing(true);
      const token = await getIdToken();
      const response = await fetch(`/api/app/dm-tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, note }),
      });
      
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'Failed to update task');
      }
      
      showToast(`Task marked as ${status}`);
      setSelectedTask(null);
      setActionNote('');
      fetchTasks();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update task', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: DMTaskStatus) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Pending</span>;
      case 'in_progress':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">In Progress</span>;
      case 'completed':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Completed</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Cancelled</span>;
      default:
        return null;
    }
  };

  const getTaskTypeLabel = (type: string) => {
    switch (type) {
      case 'hours_wrong':
        return 'Hours Need Correction';
      case 'verification_overdue':
        return 'Verification Overdue';
      default:
        return type;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div role="status" aria-live="polite" className="fixed top-20 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`px-4 py-3 rounded-lg shadow-lg ${
              toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <CheckSquare className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">DM Tasks</h1>
            <p className="text-sm text-gray-600">
              Tasks for District Managers to follow up on
            </p>
          </div>
        </div>
      </div>

      {locationIdFilter && (
        <div className="bg-blue-50 text-blue-700 px-4 py-3 rounded-lg flex items-start gap-2">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>
            Showing tasks for a specific store.{' '}
            <button 
              onClick={() => navigate('/dm-tasks')} 
              className="underline hover:no-underline"
            >
              Show all
            </button>
          </span>
        </div>
      )}

      <div className="flex gap-2">
        {(['pending', 'in_progress', 'completed', 'cancelled', ''] as const).map(status => (
          <button
            key={status || 'all'}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-full text-sm font-medium min-h-[44px] ${
              filter === status
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {status === '' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="h-10 w-10 mx-auto text-blue-600 animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 bg-white rounded-lg border border-gray-200">
          <CheckSquare className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">No tasks found</p>
          <p className="text-sm mt-1">
            {filter ? `No ${filter.replace('_', ' ')} tasks` : 'No DM tasks'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
          {tasks.map(task => (
            <div
              key={task.id}
              onClick={() => setSelectedTask(task)}
              className="p-4 hover:bg-gray-50 cursor-pointer flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {getStatusBadge(task.status)}
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                    {getTaskTypeLabel(task.taskType)}
                  </span>
                </div>
                <p className="font-medium text-gray-900 mt-2">
                  #{task.storeNumber} - {task.storeName}
                </p>
                <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Created {new Date(task.createdAt).toLocaleDateString()}
                  </span>
                  {task.dueAt && (
                    <span className={`flex items-center gap-1 ${
                      new Date(task.dueAt) < new Date() && task.status === 'pending' 
                        ? 'text-red-600 font-medium' 
                        : ''
                    }`}>
                      Due {new Date(task.dueAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {selectedTask && (
        <Dialog
          isOpen={true}
          onClose={() => {
            setSelectedTask(null);
            setActionNote('');
          }}
          title={`Task: ${selectedTask.storeNumber}`}
          size="lg"
          footer={
            selectedTask.status === 'pending' || selectedTask.status === 'in_progress' ? (
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => updateTaskStatus(selectedTask.id, 'cancelled', actionNote)}
                  disabled={processing}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <X className="w-4 h-4" />
                  Close Task
                </button>
                <button
                  onClick={() => updateTaskStatus(selectedTask.id, 'completed', actionNote)}
                  disabled={processing}
                  className="flex-1 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
                >
                  <Check className="w-4 h-4" />
                  Complete Task
                </button>
              </div>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {getStatusBadge(selectedTask.status)}
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                {getTaskTypeLabel(selectedTask.taskType)}
              </span>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500">Store</p>
              <p className="font-medium text-gray-900">
                #{selectedTask.storeNumber} - {selectedTask.storeName}
              </p>
              <button
                onClick={() => navigate(`/location/${selectedTask.locationId}`)}
                className="text-sm text-blue-600 hover:underline mt-1"
              >
                View store details
              </button>
            </div>

            <div>
              <p className="text-sm text-gray-500">Description</p>
              <p className="text-gray-900">{selectedTask.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="text-gray-900">{new Date(selectedTask.createdAt).toLocaleString()}</p>
              </div>
              {selectedTask.dueAt && (
                <div>
                  <p className="text-sm text-gray-500">Due</p>
                  <p className={`${
                    new Date(selectedTask.dueAt) < new Date() && selectedTask.status === 'pending'
                      ? 'text-red-600 font-medium'
                      : 'text-gray-900'
                  }`}>
                    {new Date(selectedTask.dueAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {selectedTask.reportedBy && (
              <div>
                <p className="text-sm text-gray-500">Reported by</p>
                <p className="text-gray-900">{selectedTask.reportedBy}</p>
              </div>
            )}

            {selectedTask.completedAt && (
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-green-700">Completed {new Date(selectedTask.completedAt).toLocaleString()}</p>
                {selectedTask.completedNote && (
                  <p className="text-sm text-green-800 mt-1">{selectedTask.completedNote}</p>
                )}
              </div>
            )}

            {selectedTask.cancelledAt && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Closed {new Date(selectedTask.cancelledAt).toLocaleString()}</p>
                {selectedTask.cancelledReason && (
                  <p className="text-sm text-gray-700 mt-1">{selectedTask.cancelledReason}</p>
                )}
              </div>
            )}

            {(selectedTask.status === 'pending' || selectedTask.status === 'in_progress') && (
              <div>
                <label htmlFor="action-note" className="block text-sm font-medium text-gray-700 mb-1">
                  Note (optional)
                </label>
                <textarea
                  id="action-note"
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Add a note about this task..."
                />
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
