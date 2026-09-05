import React, { useState, useEffect } from 'react';
import { DirectoryProvider, useDirectory } from './context/DirectoryContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { EnvironmentBanner } from './components/layout/EnvironmentBanner';
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
import { UatTestModal } from './components/admin/UatTestModal';
import { AuthModal } from './components/auth/AuthModal';
import { LocationRecord, PersonRecord } from './types';

function DirectoryAppContent() {
  const { locations, people } = useDirectory();
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'locations' | 'people' | 'requests' | 'print-sheet' | 'admin'>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Search Modal
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // UAT Matrix Modal
  const [isUatModalOpen, setIsUatModalOpen] = useState(false);

  // Auth / Login Modal (DISPATCH-009)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | undefined>(undefined);
  const [inviteEmail, setInviteEmail] = useState<string | undefined>(undefined);

  // URL Interception & Routing for Onboarding Invitations and Deep Links (DISPATCH-015)
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlInviteToken = params.get('inviteToken');
      const urlEmail = params.get('email');
      const urlView = params.get('view');
      const urlLocationId = params.get('locationId');

      if (urlInviteToken && urlEmail) {
        setInviteToken(urlInviteToken);
        setInviteEmail(urlEmail);
        setIsAuthModalOpen(true);
      }

      if (urlView) {
        if (urlView === 'requests') setCurrentTab('requests');
        else if (urlView === 'directory' || urlView === 'locations') setCurrentTab('locations');
        else if (urlView === 'people') setCurrentTab('people');
        else if (urlView === 'admin') setCurrentTab('admin');
      }

      if (urlLocationId && locations.length > 0) {
        const found = locations.find(l => l.id === urlLocationId || l.storeNumber === urlLocationId);
        if (found) {
          setSelectedLocation(found);
        }
      }
    } catch (e) {
      console.warn('Error parsing URL parameters:', e);
    }
  }, [locations]);

  // Location Modals
  const [selectedLocation, setSelectedLocation] = useState<LocationRecord | null>(null);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [isCreatingLocation, setIsCreatingLocation] = useState(false);

  // Person Modals
  const [selectedPerson, setSelectedPerson] = useState<PersonRecord | null>(null);

  // Request Modals
  const [requestLocation, setRequestLocation] = useState<LocationRecord | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Global keyboard shortcut: Ctrl+K / Cmd+K for universal search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectLocationById = (locId: string) => {
    const found = locations.find(l => l.id === locId);
    if (found) {
      setSelectedLocation(found);
    }
  };

  const handleOpenNewRequest = (loc?: LocationRecord) => {
    setRequestLocation(loc || null);
    setIsRequestModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans antialiased print:bg-white print:text-black print:min-h-0">
      {/* Global Environment Isolation Banner (Sec 22) */}
      <div className="print:hidden">
        <EnvironmentBanner />
      </div>

      {/* Top Header */}
      <div className="print:hidden">
        <Header
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenRequests={() => setCurrentTab('requests')}
          onOpenUatModal={() => setIsUatModalOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          activeTab={currentTab}
          isMobileMenuOpen={isMobileMenuOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen}
        />
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex w-full max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-4 gap-4 overflow-hidden print:max-w-none print:w-full print:p-0 print:m-0 print:gap-0 print:overflow-visible">
        {/* Sidebar */}
        <div className="print:hidden">
          <Sidebar
            currentTab={currentTab}
            onTabChange={setCurrentTab}
            onRequestUpdate={() => handleOpenNewRequest()}
            isMobileMenuOpen={isMobileMenuOpen}
            setIsMobileMenuOpen={setIsMobileMenuOpen}
          />
        </div>

        {/* Dynamic View Content */}
        <main className="flex-1 min-w-0 pb-12 overflow-y-auto print:p-0 print:m-0 print:w-full print:overflow-visible">
          {currentTab === 'dashboard' && (
            <DashboardView
              onNavigateToTab={setCurrentTab}
              onSelectLocation={setSelectedLocation}
              onSelectPerson={setSelectedPerson}
              onOpenSearch={() => setIsSearchOpen(true)}
              onOpenNewRequest={handleOpenNewRequest}
              onAddNewLocation={() => setIsCreatingLocation(true)}
            />
          )}

          {currentTab === 'locations' && (
            <LocationsView
              onSelectLocation={setSelectedLocation}
              onEditLocation={setEditingLocation}
              onAddNewLocation={() => setIsCreatingLocation(true)}
              onRequestCorrection={handleOpenNewRequest}
              onNavigateToPdf={() => setCurrentTab('print-sheet')}
            />
          )}

          {currentTab === 'people' && (
            <PeopleView
              onSelectPerson={setSelectedPerson}
              onSelectLocationById={handleSelectLocationById}
            />
          )}

          {currentTab === 'requests' && (
            <RequestsView
              onOpenNewRequest={() => handleOpenNewRequest()}
              onSelectLocationById={handleSelectLocationById}
            />
          )}

          {currentTab === 'print-sheet' && (
            <PrintSheetView
              onBackToDirectory={() => setCurrentTab('locations')}
            />
          )}

          {currentTab === 'admin' && (
            <AdminIntegrationsView />
          )}
        </main>
      </div>

      {/* Universal Search Modal (Cmd+K) */}
      <UniversalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectLocation={setSelectedLocation}
        onSelectPerson={setSelectedPerson}
        onRequestCorrection={handleOpenNewRequest}
      />

      {/* UAT & Role Matrix Test Modal */}
      <UatTestModal
        isOpen={isUatModalOpen}
        onClose={() => setIsUatModalOpen(false)}
      />

      {/* Location Detail Modal */}
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
      />

      {/* Location Edit Modal (Data Stewards & Admin) */}
      {(editingLocation || isCreatingLocation) && (
        <LocationEditModal
          location={editingLocation}
          isOpen={true}
          onClose={() => {
            setEditingLocation(null);
            setIsCreatingLocation(false);
          }}
        />
      )}

      {/* Person Detail Modal */}
      <PersonDetailModal
        person={selectedPerson}
        onClose={() => setSelectedPerson(null)}
        onSelectLocationById={handleSelectLocationById}
      />

      {/* Request Correction Modal */}
      <NewRequestModal
        location={requestLocation}
        isOpen={isRequestModalOpen}
        onClose={() => {
          setIsRequestModalOpen(false);
          setRequestLocation(null);
        }}
      />

      {/* Shiekh Identity & Sign-In Modal (DISPATCH-009 / DISPATCH-015) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => {
          setIsAuthModalOpen(false);
          setInviteToken(undefined);
          setInviteEmail(undefined);
        }}
        initialInviteToken={inviteToken}
        initialInviteEmail={inviteEmail}
      />
    </div>
  );
}

export default function App() {
  return (
    <DirectoryProvider>
      <DirectoryAppContent />
    </DirectoryProvider>
  );
}
