import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ClosuresBoard } from './ClosuresBoard';

export function ClosuresBoardPage() {
  const navigate = useNavigate();
  const { authUser } = useAuth();

  const canAccess = authUser && (
    authUser.role === 'Admin' ||
    authUser.role === 'Steward' ||
    authUser.role === 'Leader'
  );

  if (!canAccess) {
    return (
      <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center max-w-lg mx-auto">
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

  const districtFilter = authUser.role === 'Leader' && authUser.leaderScope?.districtIds?.[0]
    ? authUser.leaderScope.districtIds[0]
    : undefined;

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-56px)]">
      <div className="bg-white border-b border-gray-200 sticky top-14 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center lg:hidden"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Closures Board</h1>
              {authUser.role === 'Leader' && (
                <p className="text-sm text-gray-500">Showing closures in your district</p>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <ClosuresBoard districtFilter={districtFilter} />
      </div>
    </div>
  );
}
