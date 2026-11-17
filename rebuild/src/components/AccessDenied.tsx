import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function AccessDenied() {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-[calc(100vh-56px)] bg-gray-50 flex items-center justify-center">
      <div className="text-center px-4">
        <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
        <h1 className="text-xl font-semibold text-gray-900 mb-2">You don't have access</h1>
        <p className="text-gray-600 mb-4">You don't have permission to view this page.</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 min-h-[44px]"
        >
          Back to Directory
        </button>
      </div>
    </div>
  );
}
