import React from 'react';
import { 
  LayoutDashboard, 
  Store, 
  Users, 
  GitPullRequest, 
  Printer, 
  Sliders,
  UserRound
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import type { NavigationTab } from '../../lib/navigation';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { requests, locations, currentUser } = useDirectory();
  const pendingRequestsCount = requests.filter(r => r.status === 'Pending').length;

  const isAdminOrSteward = 
    currentUser.role === 'System Administrator' || 
    currentUser.role === 'Directory Data Steward';

  const navItems = [
    { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'locations' as const, label: 'Store Locations', icon: Store, badge: locations.length },
    { id: 'people' as const, label: 'People Directory', icon: Users },
    { 
      id: 'requests' as const, 
      label: 'Change Requests', 
      icon: GitPullRequest, 
      badge: pendingRequestsCount > 0 ? pendingRequestsCount : undefined,
      badgeColor: 'bg-red-600 text-white'
    },
    { id: 'print' as const, label: '1-Sheet Directory PDF', icon: Printer },
    { id: 'account' as const, label: 'My Profile', icon: UserRound },
    ...(isAdminOrSteward ? [
      { id: 'admin' as const, label: 'Admin & Integrations', icon: Sliders }
    ] : [])
  ];

  return (
    <aside className="h-full w-64 flex-shrink-0 bg-white border-r border-neutral-200 flex flex-col py-4 shadow-xs">
      <div className="space-y-1 px-3">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                isActive
                  ? 'bg-red-50 text-red-600 border border-red-100 font-semibold shadow-2xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-red-600' : 'text-neutral-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.badgeColor || 'bg-neutral-100 text-neutral-700'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </aside>
  );
};
