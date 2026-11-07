import { lazy, Suspense, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppLayout } from './components/AppLayout';
import { ErrorBoundary, RouteErrorBoundary } from './components/ErrorBoundary';

const DirectoryView = lazy(() => import('./components/DirectoryView').then(m => ({ default: m.DirectoryView })));
const LocationDetailView = lazy(() => import('./components/LocationDetailView').then(m => ({ default: m.LocationDetailView })));
const PersonDetailView = lazy(() => import('./components/PersonDetailView').then(m => ({ default: m.PersonDetailView })));
const SignInView = lazy(() => import('./components/SignInView').then(m => ({ default: m.SignInView })));
const CorrectionsQueue = lazy(() => import('./components/CorrectionsQueue').then(m => ({ default: m.CorrectionsQueue })));
const DMTasksView = lazy(() => import('./components/DMTasksView').then(m => ({ default: m.DMTasksView })));
const BulkHolidayManager = lazy(() => import('./components/BulkHolidayManager').then(m => ({ default: m.BulkHolidayManager })));
const VerificationRequestsView = lazy(() => import('./components/VerificationRequestsView').then(m => ({ default: m.VerificationRequestsView })));
const PrintableDirectoryView = lazy(() => import('./components/PrintableDirectoryView').then(m => ({ default: m.PrintableDirectoryView })));
const AdminView = lazy(() => import('./components/AdminView').then(m => ({ default: m.AdminView })));
const PeopleListView = lazy(() => import('./components/PeopleListView').then(m => ({ default: m.PeopleListView })));
const HierarchyView = lazy(() => import('./components/HierarchyView').then(m => ({ default: m.HierarchyView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const ClosuresBoardPage = lazy(() => import('./components/ClosuresBoardPage').then(m => ({ default: m.ClosuresBoardPage })));
const StaleStoresView = lazy(() => import('./components/StaleStoresView').then(m => ({ default: m.StaleStoresView })));
const FinishSignInView = lazy(() => import('./components/FinishSignInView').then(m => ({ default: m.FinishSignInView })));
const StoreSignInView = lazy(() => import('./components/StoreSignInView').then(m => ({ default: m.StoreSignInView })));
const VerifyActionView = lazy(() => import('./components/VerifyActionView').then(m => ({ default: m.VerifyActionView })));
const DMVerifyView = lazy(() => import('./components/DMVerifyView').then(m => ({ default: m.DMVerifyView })));
const StoreHoursChangeView = lazy(() => import('./components/StoreHoursChangeView').then(m => ({ default: m.StoreHoursChangeView })));
const MyRequestsView = lazy(() => import('./components/MyRequestsView').then(m => ({ default: m.MyRequestsView })));
const ApiDocsView = lazy(() => import('./components/ApiDocsView').then(m => ({ default: m.ApiDocsView })));

function PageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

function CorrectionsQueuePage() {
  const navigate = useNavigate();
  return <CorrectionsQueue onBack={() => navigate('/')} />;
}

function ProtectedRoute({ 
  children, 
  withLayout = true,
  storeAllowed = false,
}: { 
  children: React.ReactNode; 
  withLayout?: boolean;
  storeAllowed?: boolean;
}) {
  const { user, loading, isStoreSession, storeSession, authError } = useAuth();
  const isAuthenticated = !!user || isStoreSession;
  
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
  
  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  if (user && !isStoreSession && authError) {
    return <AccountErrorScreen />;
  }
  
  if (isStoreSession && storeSession?.locationId && !storeAllowed) {
    const storeLocationId = storeSession.locationId;
    return <Navigate to={`/location/${storeLocationId}`} replace />;
  }
  
  if (withLayout) {
    return <AppLayout>{children}</AppLayout>;
  }
  
  return <>{children}</>;
}

function StoreLocationRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isStoreSession, storeSession, authError } = useAuth();
  const { id } = useParams<{ id: string }>();
  const isAuthenticated = !!user || isStoreSession;
  
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
  
  if (!isAuthenticated) {
    return <Navigate to="/signin" replace />;
  }

  if (user && !isStoreSession && authError) {
    return <AccountErrorScreen />;
  }
  
  if (isStoreSession && storeSession?.locationId && id !== storeSession.locationId) {
    return <Navigate to={`/location/${storeSession.locationId}`} replace />;
  }
  
  return <AppLayout>{children}</AppLayout>;
}

// D1: clear error instead of silently treating the user as Viewer
function AccountErrorScreen() {
  const { authError, refreshAuthUser, signOut, user } = useAuth();
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div role="alert" className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
        <h1 className="text-lg font-semibold text-gray-900">We couldn't open your account</h1>
        <p className="mt-3 text-sm text-gray-700">{authError?.message}</p>
        {user?.email && <p className="mt-2 text-xs text-gray-500">Signed in as {user.email}</p>}
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={async () => { setRetrying(true); try { await refreshAuthUser(); } finally { setRetrying(false); } }}
            disabled={retrying}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm min-h-[44px] disabled:opacity-50"
          >
            {retrying ? 'Trying again...' : 'Try again'}
          </button>
          <button onClick={() => { void signOut(); }} className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg text-sm min-h-[44px]">
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function OptionalAuthLayout({ children }: { children: React.ReactNode }) {
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
  
  if (user) {
    return <AppLayout>{children}</AppLayout>;
  }
  
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/signin" element={<SignInView />} />
        <Route path="/finish-sign-in" element={<FinishSignInView />} />
        <Route path="/store-signin" element={<StoreSignInView />} />
        <Route path="/verify-action" element={<VerifyActionView />} />
        <Route path="/store-hours-change" element={<StoreHoursChangeView />} />
      <Route path="/dm-verify/:id" element={<OptionalAuthLayout><DMVerifyView /></OptionalAuthLayout>} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <DirectoryView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/location/:id"
        element={
          <StoreLocationRoute>
            <RouteErrorBoundary>
              <LocationDetailView />
            </RouteErrorBoundary>
          </StoreLocationRoute>
        }
      />
      <Route
        path="/person/:id"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <PersonDetailView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/corrections"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <CorrectionsQueuePage />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dm-tasks"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <DMTasksView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/holidays"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <BulkHolidayManager />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/verification"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <VerificationRequestsView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/print"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <PrintableDirectoryView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <AdminView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/people"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <PeopleListView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/hierarchy"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <HierarchyView />
            </RouteErrorBoundary>
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
            <RouteErrorBoundary>
              <ClosuresBoardPage />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stale-stores"
        element={
          <ProtectedRoute>
            <RouteErrorBoundary>
              <StaleStoresView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-requests"
        element={
          <ProtectedRoute storeAllowed>
            <RouteErrorBoundary>
              <MyRequestsView />
            </RouteErrorBoundary>
          </ProtectedRoute>
        }
      />
      <Route
        path="/api-docs"
        element={
          <ProtectedRoute withLayout={false}>
            <ApiDocsView />
          </ProtectedRoute>
        }
      />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ErrorBoundary>
  );
}
