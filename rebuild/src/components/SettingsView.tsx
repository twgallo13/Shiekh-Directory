import { useNavigate } from 'react-router-dom';
import { ArrowLeft, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ComingSoonPlaceholder } from './ComingSoonPlaceholder';
import { MyRequestsView } from './MyRequestsView';

export function SettingsView() {
  const navigate = useNavigate();
  const { authUser } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1 hover:bg-blue-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Current User Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{authUser?.displayName || 'User'}</p>
              <p className="text-sm text-gray-500">{authUser?.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">Role: {authUser?.role}</p>
            </div>
          </div>
        </div>

        {/* My Requests */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <MyRequestsView />
        </div>

        {/* Planned Settings */}
        <div className="space-y-4">
          <ComingSoonPlaceholder
            title="My Profile"
            description="Edit your display name, contact preferences, and notification settings."
          />
          
          <ComingSoonPlaceholder
            title="Dark Theme"
            description="Switch between light and dark mode for comfortable viewing."
          />

          <ComingSoonPlaceholder
            title="Print & Hours Template Settings"
            description="Customize the default print layout and hours display format."
          />

          <ComingSoonPlaceholder
            title="Store Inbox Responsibilities"
            description="View and manage which stores you are responsible for monitoring."
          />
        </div>
      </main>
    </div>
  );
}
