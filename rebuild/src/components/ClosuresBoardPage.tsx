import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ClosuresBoard } from './ClosuresBoard';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { AccessDenied } from './AccessDenied';

export function ClosuresBoardPage() {
  useDocumentTitle('Closures');
  
  const navigate = useNavigate();
  const { authUser } = useAuth();

  const canAccess = authUser && (
    authUser.role === 'Admin' ||
    authUser.role === 'Steward' ||
    authUser.role === 'Leader'
  );

  if (!canAccess) {
    return <AccessDenied />;
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
              <p className="text-sm text-gray-500">These are temporary closures. To close a store for good, open the store and use Close store permanently.</p>
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
