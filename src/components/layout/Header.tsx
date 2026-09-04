import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Bell, 
  ShieldCheck, 
  Sun, 
  Moon, 
  Monitor,
  ChevronDown,
  CheckCircle2,
  Menu,
  X,
  Play,
  User,
  Check,
  Sparkles,
  Cloud,
  LogOut,
  LogIn
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { UserRole, ThemePreference } from '../../types';

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenRequests?: () => void;
  onOpenUatModal?: () => void;
  onOpenAuthModal?: () => void;
  activeTab: string;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onOpenSearch, 
  onOpenRequests,
  onOpenUatModal,
  onOpenAuthModal,
  activeTab,
  isMobileMenuOpen,
  setIsMobileMenuOpen
}) => {
  const { 
    currentUser, 
    switchRole, 
    requests, 
    themePreference, 
    setThemePreference,
    effectiveTheme,
    cloudSyncStatus,
    activeCloudUser,
    logout,
    isAuthenticated
  } = useDirectory();

  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const themeRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const pendingRequestsCount = requests.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length;

  // Close popovers on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setShowThemeMenu(false);
      }
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) {
        setShowRoleMenu(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const themeOptions: { id: ThemePreference; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'light', label: 'Light Mode', icon: Sun },
    { id: 'dark', label: 'Dark Mode', icon: Moon },
    { id: 'system', label: 'Use System Setting', icon: Monitor },
  ];

  return (
    <header className="h-14 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 px-3 sm:px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Left: Mobile Hamburger & Brand Identity */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger Toggle */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="md:hidden p-1.5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
          aria-label="Toggle Navigation Menu"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-red-600 text-white flex items-center justify-center font-bold text-sm tracking-wider shadow-xs shrink-0">
            SK
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold text-sm md:text-base text-neutral-900 dark:text-neutral-100 tracking-tight">
                SHIEKH
              </span>
              <span className="text-[10px] sm:text-xs font-semibold px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
                DIRECTORY SoR
              </span>
            </div>
            <p className="text-[10px] text-neutral-500 dark:text-neutral-400 hidden sm:block">
              Authoritative Retail Location & Leadership Master
            </p>
          </div>
        </div>

        <div className="hidden lg:flex items-center text-xs text-neutral-400 dark:text-neutral-500 pl-4 border-l border-neutral-200 dark:border-neutral-800">
          <span className="capitalize">{activeTab.replace('-', ' ')}</span>
        </div>
      </div>

      {/* Center: Global Search Bar Trigger */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          onClick={onOpenSearch}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-neutral-50 dark:bg-neutral-800/80 hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md text-xs text-neutral-500 dark:text-neutral-400 transition-colors shadow-2xs"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <span>Search store #, mall, city, manager, district...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded text-neutral-400 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mobile Search Button */}
        <button
          onClick={onOpenSearch}
          className="md:hidden p-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md"
          title="Search Directory"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Requests Notification Badge */}
        {onOpenRequests && (
          <button
            onClick={onOpenRequests}
            className="relative p-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
            title={`${pendingRequestsCount} Pending Change Requests`}
          >
            <Bell className="w-4 h-4" />
            {pendingRequestsCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-amber-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center animate-pulse">
                {pendingRequestsCount}
              </span>
            )}
          </button>
        )}

        {/* UAT Test Suite Trigger Button */}
        {onOpenUatModal && (
          <button
            onClick={onOpenUatModal}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded-md text-xs font-semibold transition-colors"
            title="Launch UAT & Role Matrix Test Suite (DISPATCH-004)"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Run UAT</span>
          </button>
        )}

        {/* Live Cloud Status Indicator */}
        <div 
          className="hidden md:flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300"
          title={`Cloud Firestore Status: ${cloudSyncStatus.toUpperCase()}`}
        >
          <Cloud className="w-3.5 h-3.5 text-amber-500" />
          <span className={`w-1.5 h-1.5 rounded-full ${cloudSyncStatus === 'synced' ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className="hidden lg:inline text-[10px] font-mono">Firestore</span>
        </div>

        {/* Theme Engine Menu (Blueprint Sec 8A) */}
        <div className="relative" ref={themeRef}>
          <button
            onClick={() => setShowThemeMenu(!showThemeMenu)}
            className="p-2 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors flex items-center gap-1"
            title={`Current Theme: ${themePreference} (Click to change)`}
          >
            {themePreference === 'light' && <Sun className="w-4 h-4 text-amber-500" />}
            {themePreference === 'dark' && <Moon className="w-4 h-4 text-sky-400" />}
            {themePreference === 'system' && <Monitor className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />}
          </button>

          {showThemeMenu && (
            <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl py-1.5 z-50 text-xs animate-fadeIn">
              <div className="px-3 py-1 text-[10px] font-bold text-neutral-400 uppercase tracking-wider border-b border-neutral-100 dark:border-neutral-700 mb-1">
                Appearance (Sec 8A)
              </div>
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isSelected = themePreference === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setThemePreference(opt.id);
                      setShowThemeMenu(false);
                    }}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors ${
                      isSelected ? 'font-bold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20' : 'text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{opt.label}</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Role Switcher (Crucial for RBAC Testing) */}
        <div className="relative" ref={roleRef}>
          <button
            onClick={() => setShowRoleMenu(!showRoleMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-700 rounded-md text-xs font-medium text-neutral-800 dark:text-neutral-200 transition-colors"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <span className="hidden sm:inline">{currentUser.role}</span>
            <ChevronDown className="w-3 h-3 text-neutral-400" />
          </button>

          {showRoleMenu && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl py-1.5 z-50 text-xs animate-fadeIn">
              <div className="px-3 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider border-b border-neutral-100 dark:border-neutral-700 mb-1">
                Role-Based Access (Blueprint Sec 9)
              </div>
              {(['Viewer', 'Directory Data Steward', 'Editor', 'System Administrator'] as UserRole[]).map((role) => (
                <button
                  key={role}
                  onClick={() => {
                    switchRole(role);
                    setShowRoleMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors ${
                    currentUser.role === role ? 'font-semibold text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-950/20' : 'text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <div>
                    <div>{role}</div>
                    <div className="text-[10px] text-neutral-400 font-normal">
                      {role === 'Viewer' && 'Read-only, masked phone quarantine, submit requests'}
                      {role === 'Directory Data Steward' && 'Approve requests, unmask/verify contacts, export PDF'}
                      {role === 'Editor' && 'Draft scoped edits'}
                      {role === 'System Administrator' && 'Full RBAC, API tokens, backups & disaster recovery'}
                    </div>
                  </div>
                  {currentUser.role === role && <CheckCircle2 className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Profile Popover */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-neutral-200 dark:border-neutral-800"
            title={`Signed in as ${currentUser.displayName} (${currentUser.email})`}
          >
            <div className="w-7 h-7 rounded-full bg-neutral-800 dark:bg-neutral-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {currentUser.displayName.charAt(0)}
            </div>
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-xl p-3 z-50 text-xs animate-fadeIn space-y-2.5">
              <div className="pb-2 border-b border-neutral-100 dark:border-neutral-700">
                <div className="font-bold text-neutral-900 dark:text-neutral-100">{currentUser.displayName}</div>
                <div className="text-neutral-500 dark:text-neutral-400 text-[11px] truncate">{currentUser.email}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-[10px] px-1.5 py-0.5 bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 font-bold rounded">
                    {currentUser.role}
                  </span>
                  <span className="text-[10px] text-neutral-400">
                    {currentUser.accessScope}
                  </span>
                </div>
              </div>

              {onOpenUatModal && (
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenUatModal();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-700/50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md font-semibold text-xs transition-colors"
                >
                  <Play className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Run UAT Readiness Matrix</span>
                </button>
              )}

              {onOpenAuthModal && (
                <button
                  onClick={() => {
                    setShowProfileMenu(false);
                    onOpenAuthModal();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-neutral-50 hover:bg-neutral-100 dark:bg-neutral-700/50 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-md font-semibold text-xs transition-colors"
                >
                  <LogIn className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span>Switch Account / Sign In</span>
                </button>
              )}

              {/* Prominent Sign Out Action (DISPATCH-009) */}
              <button
                onClick={() => {
                  logout();
                  setShowProfileMenu(false);
                  if (onOpenAuthModal) onOpenAuthModal();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/80 rounded-md font-bold text-xs transition-colors"
              >
                <LogOut className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                <span>Sign Out of Session</span>
              </button>

              <div className="text-[10px] text-neutral-400 pt-1 border-t border-neutral-100 dark:border-neutral-700">
                Auth Method: {currentUser.authMethod === 'google' ? 'Google SSO' : 'Directory Password'}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
