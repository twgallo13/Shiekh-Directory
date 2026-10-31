import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Menu, User, LogOut, ClipboardCheck, Calendar, Printer, Users, Network,
  FileCheck, Settings, AlertTriangle, Clock, Database, X, Home, FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { canApproveCorrections } from '../lib/permissions';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  const { signOut, user, authUser, storeSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const showCorrectionsLink = authUser && canApproveCorrections(authUser);
  const showHolidaysLink = authUser && (authUser.role === 'Admin' || authUser.role === 'Steward');
  const isStoreUser = authUser?.role === 'Store' || !!storeSession;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleNavigation = (path: string) => {
    navigate(path);
    setMenuOpen(false);
  };

  const isActivePath = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-blue-700 text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
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
          <button
            ref={buttonRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 hover:bg-blue-600 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {menuOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-40 md:hidden"
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={menuRef}
              className="fixed md:absolute right-0 md:right-4 top-14 w-full md:w-72 bg-white text-gray-900 md:rounded-lg shadow-xl border-t md:border border-gray-200 z-50 max-h-[calc(100vh-56px)] overflow-y-auto"
            >
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 md:rounded-t-lg">
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
                    {isStoreUser && storeSession && (
                      <span className="text-xs text-blue-600">Store #{storeSession.storeNumber}</span>
                    )}
                  </div>
                </div>
              </div>

              <nav className="py-2">
                <MenuItem
                  icon={Home}
                  label="Directory"
                  onClick={() => handleNavigation('/')}
                  isActive={isActivePath('/')}
                />

                {showCorrectionsLink && (
                  <MenuItem
                    icon={ClipboardCheck}
                    label="Approval Queue"
                    onClick={() => handleNavigation('/corrections')}
                    isActive={isActivePath('/corrections')}
                  />
                )}

                {showHolidaysLink && (
                  <MenuItem
                    icon={Calendar}
                    label="Manage Holidays"
                    onClick={() => handleNavigation('/holidays')}
                    isActive={isActivePath('/holidays')}
                  />
                )}

                {(authUser?.role === 'Leader' || authUser?.role === 'Steward' || authUser?.role === 'Admin') && (
                  <>
                    <MenuItem
                      icon={FileCheck}
                      label="Store Verification"
                      onClick={() => handleNavigation('/verification')}
                      isActive={isActivePath('/verification')}
                    />
                    <MenuItem
                      icon={AlertTriangle}
                      label="Closures Board"
                      onClick={() => handleNavigation('/closures')}
                      isActive={isActivePath('/closures')}
                    />
                    <MenuItem
                      icon={Clock}
                      label="Stale Stores"
                      onClick={() => handleNavigation('/stale-stores')}
                      isActive={isActivePath('/stale-stores')}
                    />
                  </>
                )}

                {(authUser?.role === 'Steward' || authUser?.role === 'Admin') && (
                  <>
                    <MenuItem
                      icon={Database}
                      label="Backups"
                      onClick={() => handleNavigation('/admin?tab=backups')}
                      isActive={location.pathname === '/admin' && location.search.includes('tab=backups')}
                    />
                  </>
                )}

                <MenuItem
                  icon={FileText}
                  label="My Requests"
                  onClick={() => handleNavigation('/my-requests')}
                  isActive={isActivePath('/my-requests')}
                />

                <MenuItem
                  icon={Printer}
                  label="Print / Export"
                  onClick={() => handleNavigation('/print')}
                  isActive={isActivePath('/print')}
                />

                {(authUser?.role === 'Steward' || authUser?.role === 'Admin') && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <MenuItem
                      icon={Users}
                      label="People"
                      onClick={() => handleNavigation('/people')}
                      isActive={isActivePath('/people')}
                    />
                    <MenuItem
                      icon={Network}
                      label="Hierarchy"
                      onClick={() => handleNavigation('/hierarchy')}
                      isActive={isActivePath('/hierarchy')}
                    />
                  </>
                )}

                {authUser?.role === 'Admin' && (
                  <>
                    <div className="border-t border-gray-100 my-2" />
                    <MenuItem
                      icon={User}
                      label="Admin"
                      onClick={() => handleNavigation('/admin')}
                      isActive={isActivePath('/admin')}
                    />
                  </>
                )}

                <div className="border-t border-gray-100 my-2" />
                <MenuItem
                  icon={Settings}
                  label="Settings"
                  onClick={() => handleNavigation('/settings')}
                  isActive={isActivePath('/settings')}
                />
                <MenuItem
                  icon={LogOut}
                  label="Sign Out"
                  onClick={() => {
                    signOut();
                    setMenuOpen(false);
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

interface MenuItemProps {
  icon: typeof Home;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

function MenuItem({ icon: Icon, label, onClick, isActive }: MenuItemProps) {
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
