import React, { Suspense, lazy, useState, useEffect } from 'react';
import { DirectoryProvider, useDirectory } from './context/DirectoryContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import type { NavigationTab } from './components/layout/Sidebar';
import { Toast } from './components/common/Toast';
import { LocationRecord, PersonRecord } from './types';

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

function AppContent() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonRecord | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestTargetLocation, setRequestTargetLocation] = useState<LocationRecord | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { currentUser } = useDirectory();

  // Auto-redirect if non-admin attempts to view admin tab
  useEffect(() => {
    const isAdminOrSteward = 
      currentUser.role === 'System Administrator' || 
      currentUser.role === 'Directory Data Steward';
    if (currentTab === 'admin' && !isAdminOrSteward) {
      setCurrentTab('dashboard');
    }
  }, [currentUser.role, currentTab]);

  const handleOpenNewRequest = (loc?: LocationRecord) => {
    setRequestTargetLocation(loc || null);
    setIsRequestModalOpen(true);
  };

  const handleCreateNewLocation = () => {
    setIsCreatingLocation(true);
    setEditingLocation({
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
      recordStatus: 'Active'
    });
  };

  const handleEditLocation = (location: LocationRecord) => {
    setIsCreatingLocation(false);
    setEditingLocation(location);
  };

  const handleCloseLocationEditor = () => {
    setEditingLocation(null);
    setIsCreatingLocation(false);
  };

  const handleSelectTab = (tab: NavigationTab) => {
    setCurrentTab(tab);
    setIsNavigationOpen(false);
  };

  return (
    <div className="h-screen bg-neutral-50 text-neutral-900 flex flex-col antialiased">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onToggleNavigation={() => setIsNavigationOpen(prev => !prev)}
        onNavigateToRequests={() => handleSelectTab('requests')}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {isNavigationOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            className="fixed inset-x-0 bottom-0 top-16 z-30 bg-black/40 lg:hidden"
            onClick={() => setIsNavigationOpen(false)}
          />
        )}
        <div className={`fixed bottom-0 left-0 top-16 z-40 flex-shrink-0 transition-transform duration-200 lg:static lg:translate-x-0 ${isNavigationOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <Sidebar currentTab={currentTab} onSelectTab={handleSelectTab} />
        </div>

        <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          <Suspense fallback={<ViewFallback />}>
            {currentTab === 'dashboard' && (
              <DashboardView
                onSelectLocation={setSelectedLocation}
                onSelectPerson={setSelectedPerson}
                onNavigateToRequests={() => setCurrentTab('requests')}
              />
            )}

            {currentTab === 'locations' && (
              <LocationsView
                onSelectLocation={setSelectedLocation}
                onSelectPerson={setSelectedPerson}
                onEditLocation={handleEditLocation}
                onAddNewLocation={handleCreateNewLocation}
                onRequestCorrection={handleOpenNewRequest}
              />
            )}

            {currentTab === 'people' && (
              <PeopleView onSelectPerson={setSelectedPerson} />
            )}

            {currentTab === 'requests' && (
              <RequestsView onOpenNewRequest={() => handleOpenNewRequest()} />
            )}

            {currentTab === 'print' && <PrintSheetView />}

            {currentTab === 'admin' && <AdminIntegrationsView />}
          </Suspense>
        </main>
      </div>

      {/* Detail Modal for Locations */}
      <Suspense fallback={null}>
        {selectedLocation && (
          <LocationDetailModal
            location={selectedLocation}
            onClose={() => setSelectedLocation(null)}
            onEdit={(loc) => {
              setSelectedLocation(null);
              handleEditLocation(loc);
            }}
            onRequestCorrection={(loc) => {
              setSelectedLocation(null);
              handleOpenNewRequest(loc);
            }}
            onSelectPerson={setSelectedPerson}
          />
        )}

        {editingLocation && (
          <LocationEditModal
            location={editingLocation}
            mode={isCreatingLocation ? 'create' : 'edit'}
            onClose={handleCloseLocationEditor}
            onSaved={setSuccessMessage}
          />
        )}

        {selectedPerson && (
          <PersonDetailModal
            person={selectedPerson}
            onClose={() => setSelectedPerson(null)}
            onSelectLocation={setSelectedLocation}
          />
        )}

        {isRequestModalOpen && (
          <NewRequestModal
            location={requestTargetLocation}
            onClose={() => setIsRequestModalOpen(false)}
          />
        )}

        {isSearchOpen && (
          <UniversalSearchModal
            isOpen
            onClose={() => setIsSearchOpen(false)}
            onSelectLocation={setSelectedLocation}
            onSelectPerson={setSelectedPerson}
          />
        )}
      </Suspense>

      {successMessage && (
        <Toast message={successMessage} onDismiss={() => setSuccessMessage(null)} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <DirectoryProvider>
      <AppContent />
    </DirectoryProvider>
  );
}
