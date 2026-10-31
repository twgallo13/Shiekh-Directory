import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Menu, User, LogOut, ClipboardCheck, Calendar, Printer, Users, Network,
  FileCheck, Settings, AlertTriangle, Clock, Database, X, Home, FileText,
  ChevronDown
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canApproveCorrections } from '../lib/permissions';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const desktopDropdownRef = useRef<HTMLDivElement>(null);
  const desktopButtonRef = useRef<HTMLButtonElement>(null);
  
  const { signOut, user, authUser, storeSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const showCorrectionsLink = authUser && canApproveCorrections(authUser);
  const showHolidaysLink = authUser && (authUser.role === 'Admin' || authUser.role === 'Steward');
  const isLeaderOrAbove = authUser?.role === 'Leader' || authUser?.role === 'Steward' || authUser?.role === 'Admin';
  const isStewardOrAdmin = authUser?.role === 'Steward' || authUser?.role === 'Admin';
  const isAdmin = authUser?.role === 'Admin';

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
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setDesktopDropdownOpen(false);
  }, [location.pathname]);

  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
    setDesktopDropdownOpen(false);
  };

  const isActivePath = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-700 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <button
              onClick={() => handleNavigation('/')}
              className="flex items-center hover:opacity-90 transition-opacity"
              aria-label="Go to directory"
            >
              <img
                src="/shiekh-logo.svg"
                alt="Shiekh"
                className="h-7 brightness-0 invert"
              />
            </button>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              <NavLink
                onClick={() => handleNavigation('/')}
                isActive={isActivePath('/')}
              >
                Directory
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

              {/* More dropdown */}
              <div className="relative">
                <button
                  ref={desktopButtonRef}
                  onClick={() => setDesktopDropdownOpen(!desktopDropdownOpen)}
                  className={`px-3 py-2 text-sm font-medium rounded-md flex items-center gap-1 transition-colors ${
                    desktopDropdownOpen ? 'bg-blue-600' : 'hover:bg-blue-600/50'
                  }`}
                >
                  More
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
                        Manage Holidays
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
                    {isStewardOrAdmin && (
                      <DropdownItem
                        icon={Database}
                        onClick={() => handleNavigation('/admin?tab=backups')}
                      >
                        Backups
                      </DropdownItem>
                    )}
                    <DropdownItem
                      icon={FileText}
                      onClick={() => handleNavigation('/my-requests')}
                    >
                      My Requests
                    </DropdownItem>
                    <DropdownItem
                      icon={Printer}
                      onClick={() => handleNavigation('/print')}
                    >
                      Print / Export
                    </DropdownItem>
                    <div className="border-t border-gray-100 my-1" />
                    <DropdownItem
                      icon={Settings}
                      onClick={() => handleNavigation('/settings')}
                    >
                      Settings
                    </DropdownItem>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div className="ml-2 pl-2 border-l border-blue-500/50 flex items-center gap-2">
                <div className="text-right hidden xl:block">
                  <div className="text-sm font-medium truncate max-w-32">
                    {user?.email?.split('@')[0] || authUser?.email?.split('@')[0] || 'User'}
                  </div>
                  <div className="text-xs text-blue-200">
                    {authUser?.role}
                    {authUser?.role === 'Store' && storeSession?.storeNumber && ` • Store #${storeSession.storeNumber}`}
                  </div>
                </div>
                <button
                  onClick={() => signOut()}
                  className="p-2 hover:bg-blue-600/50 rounded-md transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </nav>

            {/* Mobile Menu Button */}
            <button
              ref={mobileButtonRef}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 hover:bg-blue-600 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40 lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={mobileMenuRef}
              className="fixed right-0 top-14 w-full sm:w-80 bg-white text-gray-900 shadow-xl border-t border-gray-200 z-50 max-h-[calc(100vh-56px)] overflow-y-auto lg:hidden"
            >
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium block truncate">
                      {user?.email || authUser?.email || 'User'}
                    </span>
                    {authUser && (
                      <span className="text-xs text-gray-500">{authUser.role}</span>
                    )}
                    {authUser?.role === 'Store' && storeSession?.storeNumber && (
                      <span className="text-xs text-blue-600 ml-2">Store #{storeSession.storeNumber}</span>
                    )}
                  </div>
                </div>
              </div>

              <nav className="py-2">
                <MobileMenuItem
                  icon={Home}
                  label="Directory"
                  onClick={() => handleNavigation('/')}
                  isActive={isActivePath('/')}
                />

                {showCorrectionsLink && (
                  <MobileMenuItem
                    icon={ClipboardCheck}
                    label="Approval Queue"
                    onClick={() => handleNavigation('/corrections')}
                    isActive={isActivePath('/corrections')}
                  />
                )}

                {showHolidaysLink && (
                  <MobileMenuItem
                    icon={Calendar}
                    label="Manage Holidays"
                    onClick={() => handleNavigation('/holidays')}
                    isActive={isActivePath('/holidays')}
                  />
                )}

                {isLeaderOrAbove && (
                  <>
                    <MobileMenuItem
                      icon={FileCheck}
                      label="Store Verification"
                      onClick={() => handleNavigation('/verification')}
                      isActive={isActivePath('/verification')}
                    />
                    <MobileMenuItem
                      icon={AlertTriangle}
                      label="Closures Board"
                      onClick={() => handleNavigation('/closures')}
                      isActive={isActivePath('/closures')}
                    />
                    <MobileMenuItem
                      icon={Clock}
                      label="Stale Stores"
                      onClick={() => handleNavigation('/stale-stores')}
                      isActive={isActivePath('/stale-stores')}
                    />
                  </>
                )}

                {isStewardOrAdmin && (
                  <MobileMenuItem
                    icon={Database}
                    label="Backups"
                    onClick={() => handleNavigation('/admin?tab=backups')}
                    isActive={location.pathname === '/admin' && location.search.includes('tab=backups')}
                  />
                )}

                <MobileMenuItem
                  icon={FileText}
                  label="My Requests"
                  onClick={() => handleNavigation('/my-requests')}
                  isActive={isActivePath('/my-requests')}
                />

                <MobileMenuItem
                  icon={Printer}
                  label="Print / Export"
                  onClick={() => handleNavigation('/print')}
                  isActive={isActivePath('/print')}
                />

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

                <div className="border-t border-gray-100 my-2" />
                <MobileMenuItem
                  icon={Settings}
                  label="Settings"
                  onClick={() => handleNavigation('/settings')}
                  isActive={isActivePath('/settings')}
                />
                <MobileMenuItem
                  icon={LogOut}
                  label="Sign Out"
                  onClick={() => {
                    signOut();
                    setMobileMenuOpen(false);
                  }}
                />
              </nav>
            </div>
          </>
        )}
      </header>

      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}

function NavLink({ onClick, isActive, children }: { onClick: () => void; isActive: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
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
      className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 hover:bg-gray-50 text-gray-700"
    >
      <Icon className="w-4 h-4 text-gray-400" />
      {children}
    </button>
  );
}

function MobileMenuItem({ icon: Icon, label, onClick, isActive }: { icon: typeof Home; label: string; onClick: () => void; isActive?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors ${
        isActive
          ? 'bg-blue-50 text-blue-700 font-medium'
          : 'hover:bg-gray-50 text-gray-700'
      }`}
    >
      <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
      {label}
    </button>
  );
}
