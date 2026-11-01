import { Link } from 'react-router-dom';
import { User, FileText, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function SettingsView() {
  useDocumentTitle('Settings');
  
  const { authUser } = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h1 className="sr-only">Settings</h1>
      {/* Current User Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <User className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="font-medium text-gray-900">{authUser?.displayName || 'User'}</p>
            <p className="text-sm text-gray-600">{authUser?.email}</p>
            <p className="text-sm text-gray-600 mt-0.5">Role: {authUser?.role}</p>
          </div>
        </div>
      </div>

      {/* My Requests Link */}
      <Link
        to="/my-requests"
        className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 transition-colors min-h-[44px]"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <FileText className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="font-medium text-gray-900">My Requests</h2>
            <p className="text-sm text-gray-600">View and manage your submitted requests</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-600" />
      </Link>
    </div>
  );
}
