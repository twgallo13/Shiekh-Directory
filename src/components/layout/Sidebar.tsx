import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  MapPin, 
  Users, 
  GitPullRequest, 
  Printer, 
  Code2, 
  Settings,
  Plus
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: any) => void;
  onRequestUpdate: () => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentTab, 
  onTabChange,
  onRequestUpdate,
  isMobileMenuOpen,
  setIsMobileMenuOpen
}) => {
  const { currentUser, locations, requests } = useDirectory();

  const activeStoresCount = locations.filter(l => l.recordStatus === 'Active' && !l.storeNumber.startsWith('HQ') && !l.storeNumber.startsWith('DC')).length;
  const pendingRequestsCount = requests.filter(r => r.status === 'Submitted' || r.status === 'Under Review').length;

  const canAccessAdmin = currentUser.role === 'Directory Data Steward' || currentUser.role === 'System Administrator';

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard / Home',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'locations',
      label: 'Retail Locations',
      icon: MapPin,
      badge: activeStoresCount,
    },
    {
      id: 'people',
      label: 'People Directory',
      icon: Users,
      badge: null,
    },
    {
      id: 'requests',
      label: 'Change Requests',
      icon: GitPullRequest,
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : null,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      id: 'print-sheet',
      label: 'Printable 1-Sheet',
      icon: Printer,
      badge: 'PDF',
    },
  ];

  if (canAccessAdmin) {
    navItems.push({
      id: 'admin',
      label: 'Admin & Integrations',
      icon: Settings,
      badge: currentUser.role === 'System Administrator' ? 'SysAdmin' : 'Steward',
      badgeColor: 'bg-neutral-800 text-white dark:bg-neutral-700',
    });
  }

  const handleSelectTab = (tabId: string) => {
    onTabChange(tabId);
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar navigation container */}
      <aside className={`
        fixed md:static inset-y-0 left-0 top-14 md:top-0 z-40
        w-64 bg-white dark:bg-neutral-900 border-r md:border border-neutral-200 dark:border-neutral-800 md:rounded-xl
        flex flex-col justify-between shadow-lg md:shadow-xs transition-transform duration-200 ease-in-out shrink-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* Navigation Links */}
        <div className="p-3 space-y-1 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            Directory System of Record
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  isActive 
                    ? 'bg-red-600 text-white shadow-xs font-semibold' 
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 truncate">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}`} />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight shrink-0 ${
                    item.badgeColor ? item.badgeColor : (isActive ? 'bg-red-700 text-white' : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300')
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-3 mt-2 border-t border-neutral-100 dark:border-neutral-800">
            <button
              onClick={() => {
                onRequestUpdate();
                setIsMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 rounded-lg text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-red-600" />
              <span>Submit Correction</span>
            </button>
          </div>
        </div>

        {/* Footer / System Status */}
        <div className="p-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/40 text-xs md:rounded-b-xl">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-[11px] mb-1.5">
            <span>Authoritative SoR</span>
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Synchronized
            </span>
          </div>
          <div className="text-[10px] text-neutral-400 font-mono">
            Partition: Active Master SoR
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5 truncate">
            User: {currentUser.displayName}
          </div>
        </div>
      </aside>
    </>
  );
};
