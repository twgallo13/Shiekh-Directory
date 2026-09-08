import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { useDirectory } from './context/DirectoryContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { Toast } from './components/common/Toast';
import {
  TAB_PATHS,
  TAB_TITLES,
  getTabForPath,
  locationPath,
  personPath,
  type NavigationTab,
} from './lib/navigation';
import { LocationRecord, PersonRecord } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthGate } from './components/auth/AuthGate';
import { AccountView } from './components/auth/AccountView';
import { DirectoryBootstrap } from './components/auth/DirectoryBootstrap';

const DashboardView = lazy(() => import('./components/dashboard/DashboardView').then(module => ({ default: module.DashboardView })));
const LocationsView = lazy(() => import('./components/locations/LocationsView').then(module => ({ default: module.LocationsView })));
const LocationDetailModal = lazy(() => import('./components/locations/LocationDetailModal').then(module => ({ default: module.LocationDetailModal })));
const LocationEditModal = lazy(() => import('./components/locations/LocationEditModal').then(module => ({ default: module.LocationEditModal })));
const PeopleView = lazy(() => import('./components/people/PeopleView').then(module => ({ default: module.PeopleView })));
const PersonDetailModal = lazy(() => import('./components/people/PersonDetailModal').then(module => ({ default: module.PersonDetailModal })));
const RequestsView = lazy(() => import('./components/requests/RequestsView').then(module => ({ default: module.RequestsView })));
const NewRequestModal = lazy(() => import('./components/requests/NewRequestModal').then(module => ({ default: module.NewRequestModal })));
const PrintSheetView = lazy(() => import('./components/export/PrintSheetView').then(module => ({ default: module.PrintSheetView })));
const AdminIntegrationsView = lazy(() => import('./components/admin/AdminIntegrationsView').then(module => ({ default: module.AdminIntegrationsView })));
const UniversalSearchModal = lazy(() => import('./components/search/UniversalSearchModal').then(module => ({ default: module.UniversalSearchModal })));

const ViewFallback = () => (
  <div className="flex min-h-48 items-center justify-center text-sm text-neutral-500" role="status">
    Loading directory view...
  </div>
);

const createLocationDraft = (): LocationRecord => ({
  id: 'new-location-draft',
  storeNumber: '',
  name: '',
  type: 'Strip Center / Shopping Center',
  address: '',
  city: '',
  state: 'CA',
  zipCode: '',
  phone: '',
  phonePrivacy: 'Public',
  timeZone: 'America/Los_Angeles',
  operationalStatus: 'Opening Soon — New Store',
  standardHours: {
    monday: { open: '10:00', close: '20:00', isClosed: false },
    tuesday: { open: '10:00', close: '20:00', isClosed: false },
    wednesday: { open: '10:00', close: '20:00', isClosed: false },
    thursday: { open: '10:00', close: '20:00', isClosed: false },
    friday: { open: '10:00', close: '21:00', isClosed: false },
    saturday: { open: '10:00', close: '21:00', isClosed: false },
    sunday: { open: '11:00', close: '18:00', isClosed: false },
  },
  hoursTemplateId: 'standard-mall-70',
  hoursMode: 'template',
  recordStatus: 'Active',
});

function AppContent() {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { currentUser, locations, people, persistenceError, clearPersistenceError } = useDirectory();
  const currentTab = getTabForPath(routeLocation.pathname);
  const isAdminOrSteward =
    currentUser.role === 'System Administrator' ||
    currentUser.role === 'Directory Data Steward';

  const isCreatingLocation = routeLocation.pathname === '/locations/new';
  const locationEditMatch = matchPath('/locations/:locationId/edit', routeLocation.pathname);
  const locationDetailMatch = isCreatingLocation
    ? null
    : matchPath('/locations/:locationId', routeLocation.pathname);
  const personDetailMatch = matchPath('/people/:personId', routeLocation.pathname);
  const newLocationDraft = useMemo(createLocationDraft, []);
  const selectedLocation = locationDetailMatch
    ? locations.find(location => location.id === locationDetailMatch.params.locationId) || null
    : null;
  const editingLocation = isCreatingLocation
    ? newLocationDraft
    : locations.find(location => location.id === locationEditMatch?.params.locationId) || null;
  const selectedPerson = personDetailMatch
    ? people.find(person => person.id === personDetailMatch.params.personId) || null
    : null;
  const isRequestModalOpen = routeLocation.pathname === '/requests/new';
  const requestedLocationId = new URLSearchParams(routeLocation.search).get('locationId');
  const requestTargetLocation = locations.find(location => location.id === requestedLocationId) || null;
  const isSearchOpen = routeLocation.pathname === '/search';

  useEffect(() => {
    const recordName = selectedLocation?.name || selectedPerson?.fullName;
    const title = recordName || (isSearchOpen ? 'Search' : TAB_TITLES[currentTab]);
    document.title = `${title} | Shiekh Store Directory`;
  }, [currentTab, isSearchOpen, selectedLocation?.name, selectedPerson?.fullName]);

  useEffect(() => {
    const missingLocationId = locationDetailMatch?.params.locationId || locationEditMatch?.params.locationId;
    if (missingLocationId && !locations.some(location => location.id === missingLocationId)) {
      navigate('/locations', { replace: true });
    }
  }, [locationDetailMatch?.params.locationId, locationEditMatch?.params.locationId, locations, navigate]);

  useEffect(() => {
    const personId = personDetailMatch?.params.personId;
    if (personId && !people.some(person => person.id === personId)) {
      navigate('/people', { replace: true });
    }
  }, [navigate, people, personDetailMatch?.params.personId]);

  const navigateBack = (fallback = '/') => {
    const historyIndex = window.history.state?.idx;
    if (typeof historyIndex === 'number' && historyIndex > 0) {
      navigate(-1);
    } else {
      navigate(fallback, { replace: true });
    }
  };

  const handleOpenNewRequest = (loc?: LocationRecord) => {
    const search = loc ? `?locationId=${encodeURIComponent(loc.id)}` : '';
    navigate(`/requests/new${search}`);
  };

  const handleCreateNewLocation = () => {
    navigate('/locations/new');
  };

  const handleEditLocation = (location: LocationRecord) => {
    navigate(`/locations/${encodeURIComponent(location.id)}/edit`);
  };

  const handleSelectTab = (tab: NavigationTab) => {
    navigate(TAB_PATHS[tab]);
    setIsNavigationOpen(false);
  };

  const dashboardView = (
    <DashboardView
      onSelectLocation={location => navigate(locationPath(location))}
      onSelectPerson={person => navigate(personPath(person))}
      onNavigateToLocations={() => handleSelectTab('locations')}
      onNavigateToPeople={() => handleSelectTab('people')}
      onNavigateToRequests={() => handleSelectTab('requests')}
    />
  );

  const locationsView = (
    <LocationsView
      onSelectLocation={location => navigate(locationPath(location))}
      onSelectPerson={person => navigate(personPath(person))}
      onEditLocation={handleEditLocation}
      onAddNewLocation={handleCreateNewLocation}
      onRequestCorrection={handleOpenNewRequest}
    />
  );

  const peopleView = <PeopleView onSelectPerson={person => navigate(personPath(person))} />;

  const requestsView = <RequestsView onOpenNewRequest={() => handleOpenNewRequest()} />;

  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900 antialiased print:block print:h-auto print:overflow-visible print:bg-white">
      <Header
        onOpenSearch={() => navigate('/search')}
        onToggleNavigation={() => setIsNavigationOpen(prev => !prev)}
        onNavigateToRequests={() => handleSelectTab('requests')}
        onNavigateBack={() => navigateBack('/')}
        showBackButton={routeLocation.pathname !== '/'}
      />

      {persistenceError && (
        <div role="alert" className="flex items-center justify-between gap-4 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden">
          <span>{persistenceError} Reload the page before making another change.</span>
          <button type="button" onClick={clearPersistenceError} className="font-semibold underline">Dismiss</button>
        </div>
      )}

      <div className="relative mx-auto flex w-full max-w-[1536px] flex-1 overflow-hidden print:block print:max-w-none print:overflow-visible">
        {isNavigationOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/40 print:hidden lg:hidden"
            onClick={() => setIsNavigationOpen(false)}
          />
        )}
        <div className={`fixed bottom-0 left-0 top-16 z-40 flex-shrink-0 transition-transform duration-200 print:hidden lg:static lg:translate-x-0 ${isNavigationOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar currentTab={currentTab} onSelectTab={handleSelectTab} />
        </div>

        <main className="min-w-0 flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto w-full max-w-7xl p-4 print:max-w-none print:p-0 sm:p-6">
            <Suspense fallback={<ViewFallback />}>
              <Routes>
                <Route path="/" element={dashboardView} />
                <Route path="/search" element={dashboardView} />
                <Route path="/locations" element={locationsView} />
                <Route path="/locations/new" element={locationsView} />
                <Route path="/locations/:locationId" element={locationsView} />
                <Route path="/locations/:locationId/edit" element={locationsView} />
                <Route path="/people" element={peopleView} />
                <Route path="/people/:personId" element={peopleView} />
                <Route path="/requests" element={requestsView} />
                <Route path="/requests/new" element={requestsView} />
                <Route path="/print" element={<PrintSheetView />} />
                <Route path="/account" element={<AccountView />} />
                <Route
                  path="/admin"
                  element={isAdminOrSteward ? <AdminIntegrationsView /> : <Navigate to="/" replace />}
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>

      {/* Detail Modal for Locations */}
      <Suspense fallback={null}>
        {selectedLocation && (
          <LocationDetailModal
            location={selectedLocation}
            onClose={() => navigateBack('/locations')}
            onEdit={handleEditLocation}
            onRequestCorrection={handleOpenNewRequest}
            onSelectPerson={person => navigate(personPath(person))}
          />
        )}

        {editingLocation && isAdminOrSteward && (
          <LocationEditModal
            location={editingLocation}
            mode={isCreatingLocation ? 'create' : 'edit'}
            onClose={() => navigateBack('/locations')}
            onSaved={setSuccessMessage}
          />
        )}

        {selectedPerson && (
          <PersonDetailModal
            person={selectedPerson}
            onClose={() => navigateBack('/people')}
            onSelectLocation={location => navigate(locationPath(location))}
          />
        )}

        {isRequestModalOpen && (
          <NewRequestModal
            location={requestTargetLocation}
            onClose={() => navigateBack('/requests')}
          />
        )}

        {isSearchOpen && (
          <UniversalSearchModal
            isOpen
            onClose={() => navigateBack('/')}
            onSelectLocation={location => navigate(locationPath(location), { replace: true })}
            onSelectPerson={person => navigate(personPath(person), { replace: true })}
          />
        )}
      </Suspense>

      {successMessage && (
        <Toast message={successMessage} onDismiss={() => setSuccessMessage(null)} />
      )}
    </div>
  );
}

function AuthorizedDirectory() {
  const { account } = useAuth();
  if (!account) return null;
  return (
    <DirectoryBootstrap key={account.uid}>
      <AppContent />
    </DirectoryBootstrap>
  );
}

export default function App() {
  return <ThemeProvider><AuthProvider><AuthGate><AuthorizedDirectory /></AuthGate></AuthProvider></ThemeProvider>;
}
