import React, { useState, useEffect } from 'react';
import { DirectoryProvider, useDirectory } from './context/DirectoryContext';
import { Header } from './components/layout/Header';
import { Sidebar, NavigationTab } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { LocationsView } from './components/locations/LocationsView';
import { LocationDetailModal } from './components/locations/LocationDetailModal';
import { LocationEditModal } from './components/locations/LocationEditModal';
import { PeopleView } from './components/people/PeopleView';
import { PersonDetailModal } from './components/people/PersonDetailModal';
import { RequestsView } from './components/requests/RequestsView';
import { NewRequestModal } from './components/requests/NewRequestModal';
import { PrintSheetView } from './components/export/PrintSheetView';
import { AdminIntegrationsView } from './components/admin/AdminIntegrationsView';
import { UniversalSearchModal } from './components/search/UniversalSearchModal';
import { LocationRecord, PersonRecord } from './types';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<PersonRecord | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestTargetLocation, setRequestTargetLocation] = useState<LocationRecord | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { createLocation, currentUser } = useDirectory();

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
    const newLoc = createLocation({
      storeNumber: `${Math.floor(10 + Math.random() * 89)}`,
      name: 'New Shiekh Shoes Store',
      type: 'Strip Center / Shopping Center',
      address: '100 Main Street',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
      phone: '(555) 000-0000',
      phonePrivacy: 'Public',
      timeZone: 'America/Los_Angeles',
      operationalStatus: 'Open — Normal Operations',
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
    setEditingLocation(newLoc);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex flex-col antialiased">
      <Header onOpenSearch={() => setIsSearchOpen(true)} />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-shrink-0">
          <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />
        </div>

        <main className="flex-1 p-6 overflow-y-auto max-w-7xl mx-auto w-full">
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
              onEditLocation={setEditingLocation}
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
        </main>
      </div>

      {/* Detail Modal for Locations */}
      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          onClose={() => setSelectedLocation(null)}
          onEdit={(loc) => {
            setSelectedLocation(null);
            setEditingLocation(loc);
          }}
          onRequestCorrection={(loc) => {
            setSelectedLocation(null);
            handleOpenNewRequest(loc);
          }}
          onSelectPerson={setSelectedPerson}
        />
      )}

      {/* Edit Modal for Locations */}
      {editingLocation && (
        <LocationEditModal
          location={editingLocation}
          onClose={() => setEditingLocation(null)}
        />
      )}

      {/* Detail Modal for Personnel */}
      {selectedPerson && (
        <PersonDetailModal
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onSelectLocation={setSelectedLocation}
        />
      )}

      {/* Change Request Modal */}
      {isRequestModalOpen && (
        <NewRequestModal
          location={requestTargetLocation}
          onClose={() => setIsRequestModalOpen(false)}
        />
      )}

      {/* Universal Search Modal (Cmd+K) */}
      <UniversalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectLocation={setSelectedLocation}
        onSelectPerson={setSelectedPerson}
      />
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
