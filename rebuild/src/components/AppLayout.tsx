import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Menu, User, LogOut, ClipboardCheck, Calendar, Printer, Users, Network,
  FileCheck, AlertTriangle, Clock, X, Home, FileText, ChevronDown, CheckSquare
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canApproveCorrections, getRoleDisplayName } from '../lib/permissions';
import { OfflineBanner } from './OfflineBanner';
import { HeaderSearch } from './HeaderSearch';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const desktopButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  
  const { signOut, user, authUser, storeSession, isStoreSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const showCorrectionsLink = authUser && canApproveCorrections(authUser);
  const showHolidaysLink = authUser && (authUser.role === 'Admin' || authUser.role === 'Steward');
  const isLeaderOrAbove = authUser?.role === 'Leader' || authUser?.role === 'Steward' || authUser?.role === 'Admin';
  const isStewardOrAdmin = authUser?.role === 'Steward' || authUser?.role === 'Admin';
  const isAdmin = authUser?.role === 'Admin';
  const canPrint = isLeaderOrAbove;

  const hasToolsItems = showHolidaysLink || isLeaderOrAbove || canPrint;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        mobileMenuRef.current &&
        mobileButtonRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        !mobileButtonRef.current.contains(event.target as Node)
      ) {
        setMobileMenuOpen(false);
      }
      if (
        desktopDropdownRef.current &&
        desktopButtonRef.current &&
        !desktopDropdownRef.current.contains(event.target as Node) &&
        !desktopButtonRef.current.contains(event.target as Node)
      ) {
        setDesktopDropdownOpen(false);
      }
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        const accountButton = accountMenuRef.current.previousElementSibling;
        if (accountButton && !accountButton.contains(event.target as Node)) {
          setAccountMenuOpen(false);
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setDesktopDropdownOpen(false);
    setAccountMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileButtonRef.current?.focus();
        return;
      }

      if (e.key !== 'Tab' || !mobileMenuRef.current) return;

      const focusableElements = mobileMenuRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const frame = requestAnimationFrame(() => {
      const first = mobileMenuRef.current?.querySelector<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [mobileMenuOpen]);

  // Escape handler for desktop Tools and Account menus
  useEffect(() => {
    if (!desktopDropdownOpen && !accountMenuOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (desktopDropdownOpen) {
          setDesktopDropdownOpen(false);
          desktopButtonRef.current?.focus();
        }
        if (accountMenuOpen) {
          setAccountMenuOpen(false);
          accountButtonRef.current?.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [desktopDropdownOpen, accountMenuOpen]);

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
    setDesktopDropdownOpen(false);
    setAccountMenuOpen(false);
  };

  const isActivePath = (path: string) => location.pathname === path;

  const displayName = authUser?.displayName || user?.email?.split('@')[0] || authUser?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || authUser?.email || '';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* H6: Skip to content link */}
      <a 
        href="#main" 
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById('main');
          if (main) {
            main.focus();
          }
        }}
      >
        Skip to content
      </a>
      <OfflineBanner />
      <header className="bg-blue-700 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <button
              onClick={() => handleNavigation('/')}
              className="flex items-center hover:opacity-90 transition-opacity min-h-[44px] min-w-[44px]"
              aria-label="Go to directory"
            >
              <img
                src="/shiekh-logo.svg"
                alt="Shiekh"
                className="h-7 brightness-0 invert"
              />
            </button>

            {/* Desktop Navigation - show at xl (1280px) and above */}
            <nav className="hidden xl:flex items-center gap-1">
              <NavLink
                onClick={() => handleNavigation(isStoreSession && storeSession?.locationId ? `/location/${storeSession.locationId}` : '/')}
                isActive={isStoreSession ? isActivePath(`/location/${storeSession?.locationId || ''}`) : isActivePath('/')}
              >
                {isStoreSession ? 'My store' : 'Directory'}
              </NavLink>

              {showCorrectionsLink && (
                <NavLink
                  onClick={() => handleNavigation('/corrections')}
                  isActive={isActivePath('/corrections')}
                >
                  Approvals
                </NavLink>
              )}

              {isLeaderOrAbove && (
                <>
                  <NavLink
                    onClick={() => handleNavigation('/verification')}
                    isActive={isActivePath('/verification')}
                  >
                    Verification
                  </NavLink>
                  <NavLink
                    onClick={() => handleNavigation('/dm-tasks')}
                    isActive={isActivePath('/dm-tasks')}
                  >
                    DM Tasks
                  </NavLink>
                  <NavLink
                    onClick={() => handleNavigation('/closures')}
                    isActive={isActivePath('/closures')}
                  >
                    Closures
                  </NavLink>
                </>
              )}

              {isStewardOrAdmin && (
                <>
                  <NavLink
                    onClick={() => handleNavigation('/people')}
                    isActive={isActivePath('/people')}
                  >
                    People
                  </NavLink>
                  <NavLink
                    onClick={() => handleNavigation('/hierarchy')}
                    isActive={isActivePath('/hierarchy')}
                  >
                    Hierarchy
                  </NavLink>
                </>
              )}

              {isAdmin && (
                <NavLink
                  onClick={() => handleNavigation('/admin')}
                  isActive={isActivePath('/admin')}
                >
                  Admin
                </NavLink>
              )}

              {/* Global Search for staff */}
              {isLeaderOrAbove && (
                <div className="ml-2 w-64">
                  <HeaderSearch />
                </div>
              )}

              {/* Tools dropdown - only show if user has access to any tool */}
              {hasToolsItems && (
                <div className="relative">
                  <button
                    ref={desktopButtonRef}
                    onClick={() => setDesktopDropdownOpen(!desktopDropdownOpen)}
                    aria-expanded={desktopDropdownOpen}
                    aria-haspopup="menu"
                    className={`px-3 py-2 text-sm font-medium rounded-md flex items-center gap-1 transition-colors min-h-[44px] ${
                      desktopDropdownOpen ? 'bg-blue-600' : 'hover:bg-blue-600/50'
                    }`}
                  >
                    Tools
                    <ChevronDown className={`w-4 h-4 transition-transform ${desktopDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  
                  {desktopDropdownOpen && (
                    <div
                      ref={desktopDropdownRef}
                      className="absolute right-0 top-full mt-1 w-56 bg-white text-gray-900 rounded-lg shadow-xl border border-gray-200 py-1 z-50"
                    >
                      {showHolidaysLink && (
                        <DropdownItem
                          icon={Calendar}
                          onClick={() => handleNavigation('/holidays')}
                        >
                          Holidays
                        </DropdownItem>
                      )}
                      {isLeaderOrAbove && (
                        <DropdownItem
                          icon={Clock}
                          onClick={() => handleNavigation('/stale-stores')}
                        >
                          Stale Stores
                        </DropdownItem>
                      )}
                      {canPrint && (
                        <DropdownItem
                          icon={Printer}
                          onClick={() => handleNavigation('/print')}
                        >
                          Print / Export
                        </DropdownItem>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Account Menu */}
              <div className="relative ml-2 pl-2 border-l border-blue-500/50">
                <button
                  ref={accountButtonRef}
                  onClick={() => setAccountMenuOpen(!accountMenuOpen)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${
                    accountMenuOpen ? 'bg-blue-600' : 'hover:bg-blue-600/50'
                  }`}
                  aria-label="Account menu"
                  aria-expanded={accountMenuOpen}
                >
                  <div className="text-right hidden xl:block">
                    <div className="text-sm font-medium truncate max-w-32">
                      {displayName}
                    </div>
                    <div className="text-xs text-blue-200">
                      {authUser ? getRoleDisplayName(authUser.role) : ''}
                      {authUser?.role === 'Store' && storeSession?.storeNumber && ` • Store #${storeSession.storeNumber}`}
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                
                {accountMenuOpen && (
                  <div
                    ref={accountMenuRef}
                    className="absolute right-0 top-full mt-1 w-64 bg-white text-gray-900 rounded-lg shadow-xl border border-gray-200 py-1 z-50"
                  >
                    {/* Profile section */}
                    <div className="px-4 py-3 border-b border-gray-100">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                          <div className="text-xs text-gray-500 truncate">{displayEmail}</div>
                          <div className="text-xs text-gray-500">{authUser ? getRoleDisplayName(authUser.role) : ''}</div>
                        </div>
                      </div>
                    </div>
                    <DropdownItem
                      icon={FileText}
                      onClick={() => handleNavigation('/my-requests')}
                    >
                      My Requests
                    </DropdownItem>
                    <div className="border-t border-gray-100 my-1" />
                    <DropdownItem
                      icon={LogOut}
                      onClick={() => signOut()}
                    >
                      Sign Out
                    </DropdownItem>
                  </div>
                )}
              </div>
            </nav>

            {/* Mobile Menu Button - show below xl (1280px) */}
            <button
              ref={mobileButtonRef}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-2 hover:bg-blue-600 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu - show below xl (1280px) */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40 xl:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={mobileMenuRef}
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
              className="fixed right-0 top-14 w-full sm:w-80 bg-white text-gray-900 shadow-xl border-t border-gray-200 z-50 max-h-[calc(100dvh-56px)] flex flex-col xl:hidden"
            >
              {/* Profile header */}
              <div className="shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">{displayName}</span>
                    <span className="text-xs text-gray-500 block truncate">{displayEmail}</span>
                    {authUser && (
                      <span className="text-xs text-gray-500">{getRoleDisplayName(authUser.role)}</span>
                    )}
                    {authUser?.role === 'Store' && storeSession?.storeNumber && (
                      <span className="text-xs text-blue-600 ml-2">Store #{storeSession.storeNumber}</span>
                    )}
                  </div>
                </div>
              </div>

              <nav className="py-2 overflow-y-auto flex-1">
                {/* Main navigation - Marge's drawer order */}
                <MobileMenuItem
                  icon={Home}
                  label={isStoreSession ? 'My store' : 'Directory'}
                  onClick={() => handleNavigation(isStoreSession && storeSession?.locationId ? `/location/${storeSession.locationId}` : '/')}
                  isActive={isStoreSession ? isActivePath(`/location/${storeSession?.locationId || ''}`) : isActivePath('/')}
                />

                {showCorrectionsLink && (
                  <MobileMenuItem
                    icon={ClipboardCheck}
                    label="Approvals"
                    onClick={() => handleNavigation('/corrections')}
                    isActive={isActivePath('/corrections')}
                  />
                )}

                {isLeaderOrAbove && (
                  <>
                    <MobileMenuItem
                      icon={FileCheck}
                      label="Verification"
                      onClick={() => handleNavigation('/verification')}
                      isActive={isActivePath('/verification')}
                    />
                    <MobileMenuItem
                      icon={CheckSquare}
                      label="DM Tasks"
                      onClick={() => handleNavigation('/dm-tasks')}
                      isActive={isActivePath('/dm-tasks')}
                    />
                    <MobileMenuItem
                      icon={AlertTriangle}
                      label="Closures"
                      onClick={() => handleNavigation('/closures')}
                      isActive={isActivePath('/closures')}
                    />
                  </>
                )}

                {isStewardOrAdmin && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <MobileMenuItem
                      icon={Users}
                      label="People"
                      onClick={() => handleNavigation('/people')}
                      isActive={isActivePath('/people')}
                    />
                    <MobileMenuItem
                      icon={Network}
                      label="Hierarchy"
                      onClick={() => handleNavigation('/hierarchy')}
                      isActive={isActivePath('/hierarchy')}
                    />
                  </>
                )}

                {isAdmin && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <MobileMenuItem
                      icon={User}
                      label="Admin"
                      onClick={() => handleNavigation('/admin')}
                      isActive={isActivePath('/admin')}
                    />
                  </>
                )}

                {/* Tools section - only show if user has access to any tool */}
                {hasToolsItems && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <div className="px-4 py-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tools</span>
                    </div>
                    {showHolidaysLink && (
                      <MobileMenuItem
                        icon={Calendar}
                        label="Holidays"
                        onClick={() => handleNavigation('/holidays')}
                        isActive={isActivePath('/holidays')}
                      />
                    )}
                    {isLeaderOrAbove && (
                      <MobileMenuItem
                        icon={Clock}
                        label="Stale Stores"
                        onClick={() => handleNavigation('/stale-stores')}
                        isActive={isActivePath('/stale-stores')}
                      />
                    )}
                    {canPrint && (
                      <MobileMenuItem
                        icon={Printer}
                        label="Print / Export"
                        onClick={() => handleNavigation('/print')}
                        isActive={isActivePath('/print')}
                      />
                    )}
                  </>
                )}
              </nav>

              {/* Pinned bottom section: My Requests + Sign Out */}
              <div className="shrink-0 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
                <MobileMenuItem
                  icon={FileText}
                  label="My Requests"
                  onClick={() => handleNavigation('/my-requests')}
                  isActive={isActivePath('/my-requests')}
                />
                <MobileMenuItem
                  icon={LogOut}
                  label="Sign Out"
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
    </div>
  );
}

function NavLink({ onClick, isActive, children }: { onClick: () => void; isActive: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors min-h-[44px] ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'text-blue-100 hover:bg-blue-600/50 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function DropdownItem({ icon: Icon, onClick, children }: { icon: typeof Home; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-50 text-gray-700 min-h-[44px]"
    >
      <Icon className="w-4 h-4 text-gray-600" />
      {children}
    </button>
  );
}

function MobileMenuItem({ icon: Icon, label, onClick, isActive }: { icon: typeof Home; label: string; onClick: () => void; isActive?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-current={isActive ? 'page' : undefined}
      className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors min-h-[44px] ${
        isActive
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-600'}`} />
      {label}
    </button>
  );
}
