import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ClosuresBoard } from './ClosuresBoard';

export function ClosuresBoardPage() {
  const navigate = useNavigate();
  const { authUser } = useAuth();

  // Only Admin, Steward, and Leader can access
  const canAccess = authUser && (
    authUser.role === 'Admin' ||
    authUser.role === 'Steward' ||
    authUser.role === 'Leader'
  );

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">Closures Board</h1>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-600 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">Access Restricted</h2>
            <p className="text-yellow-700">
              The Closures Board is only available to Admin, Steward, and Leader users.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // For Leaders, scope to their district(s) - use first district if available
  const districtFilter = authUser.role === 'Leader' && authUser.leaderScope?.districtIds?.[0]
    ? authUser.leaderScope.districtIds[0]
    : undefined;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold">Closures Board</h1>
            {authUser.role === 'Leader' && (
              <p className="text-sm text-gray-500">Showing closures in your district</p>
            )}
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <ClosuresBoard districtFilter={districtFilter} />
      </div>
    </div>
  );
}
