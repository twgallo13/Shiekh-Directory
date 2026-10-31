import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DirectoryView } from './components/DirectoryView';
import { LocationDetailView } from './components/LocationDetailView';
import { PersonDetailView } from './components/PersonDetailView';
import { SignInView } from './components/SignInView';
import { CorrectionsQueue } from './components/CorrectionsQueue';
import { BulkHolidayManager } from './components/BulkHolidayManager';
import { VerificationRequestsView } from './components/VerificationRequestsView';
import { PrintableDirectoryView } from './components/PrintableDirectoryView';
import { AdminView } from './components/AdminView';
import { PeopleListView } from './components/PeopleListView';
import { HierarchyView } from './components/HierarchyView';
import { SettingsView } from './components/SettingsView';
import { ClosuresBoardPage } from './components/ClosuresBoardPage';

function CorrectionsQueuePage() {
  const navigate = useNavigate();
  return <CorrectionsQueue onBack={() => navigate('/')} />;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/signin" element={<SignInView />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DirectoryView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/location/:id"
        element={
          <ProtectedRoute>
            <LocationDetailView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/person/:id"
        element={
          <ProtectedRoute>
            <PersonDetailView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/corrections"
        element={
          <ProtectedRoute>
            <CorrectionsQueuePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/holidays"
        element={
          <ProtectedRoute>
            <BulkHolidayManager />
          </ProtectedRoute>
        }
      />
      <Route
        path="/verification"
        element={
          <ProtectedRoute>
            <VerificationRequestsView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/print"
        element={
          <ProtectedRoute>
            <PrintableDirectoryView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/people"
        element={
          <ProtectedRoute>
            <PeopleListView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/hierarchy"
        element={
          <ProtectedRoute>
            <HierarchyView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <SettingsView />
          </ProtectedRoute>
        }
      />
      <Route
        path="/closures"
        element={
          <ProtectedRoute>
            <ClosuresBoardPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
