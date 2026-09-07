import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ShieldCheck, 
  Store,
  Bell, 
  Check, 
  X,
  Menu
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';

interface HeaderProps {
  onOpenSearch: () => void;
  onToggleNavigation: () => void;
  onNavigateToRequests: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSearch,
  onToggleNavigation,
  onNavigateToRequests,
}) => {
  const { currentUser, users, switchUser, requests } = useDirectory();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Close notifications on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationsOpen]);

  // Compile active alerts/notifications
  const pendingRequests = requests.filter(r => r.status === 'Pending');
  
  const systemAlerts = [
    {
      id: 'alert-pending-requests',
      title: `${pendingRequests.length} Pending Review Requests`,
      time: 'Requires steward sign-off',
      severity: 'high',
      isPendingReq: true
    }
  ].filter(a => !dismissedAlerts.includes(a.id) && (a.id !== 'alert-pending-requests' || pendingRequests.length > 0));

  const unreadCount = systemAlerts.length;

  return (
    <header className="h-16 shrink-0 bg-white border-b border-neutral-200 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-50 shadow-xs">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onToggleNavigation}
          aria-label="Toggle navigation"
          className="rounded-lg border border-neutral-200 p-2 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 lg:hidden"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center text-white font-black shadow-md shadow-red-600/20">
          <Store className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-bold text-sm tracking-tight text-neutral-900">Shiekh Store Directory</h1>
          <p className="hidden text-[11px] text-neutral-500 sm:block">Store operations and personnel directory</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-500 transition-colors hover:bg-neutral-200/70 hover:text-neutral-700 sm:w-60 sm:justify-between sm:px-3"
          aria-label="Search stores and personnel"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <span className="hidden sm:inline">Search stores, personnel...</span>
          </div>
          <kbd className="hidden text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-neutral-300 text-neutral-500 shadow-2xs md:inline">
            ⌘K
          </kbd>
        </button>

        {/* User Role Switcher Simulation */}
        <div className="hidden items-center gap-2 bg-neutral-50 p-1 rounded-lg border border-neutral-200 text-xs md:flex">
          <div className="flex items-center gap-1.5 px-2 text-neutral-700">
            <ShieldCheck className="w-3.5 h-3.5 text-red-600" />
            <span className="font-medium">{currentUser.name}</span>
          </div>
          <select
            value={currentUser.id}
            onChange={(e) => switchUser(e.target.value)}
            className="bg-white border border-neutral-300 rounded px-2 py-1 text-xs text-neutral-800 focus:outline-none focus:border-red-500 cursor-pointer shadow-2xs"
          >
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.role} ({u.name.split(' ')[0]})
              </option>
            ))}
          </select>
        </div>

        {/* Notifications Bell */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setIsNotificationsOpen(prev => !prev)}
            title="System notifications & alerts"
            className="p-2 rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 border border-neutral-200 transition-colors cursor-pointer relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4 text-neutral-700" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white ring-2 ring-white animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Popover */}
          {isNotificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 overflow-hidden text-xs">
              <div className="p-3 border-b border-neutral-100 bg-neutral-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-red-600" />
                  <span className="font-bold text-neutral-900 text-xs">Notifications</span>
                  {unreadCount > 0 && (
                    <span className="bg-red-50 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-red-200">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setDismissedAlerts(systemAlerts.map(a => a.id))}
                    className="text-[11px] text-neutral-500 hover:text-neutral-900 hover:underline cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
                {systemAlerts.length === 0 ? (
                  <div className="p-6 text-center text-neutral-400 space-y-1">
                    <Check className="w-6 h-6 text-emerald-500 mx-auto" />
                    <p className="font-medium text-neutral-700">All caught up!</p>
                    <p className="text-[11px]">No unread system alerts or pending reviews.</p>
                  </div>
                ) : (
                  systemAlerts.map(alert => (
                    <div key={alert.id} className="flex items-start gap-1 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (alert.isPendingReq) onNavigateToRequests();
                          setIsNotificationsOpen(false);
                        }}
                        className="flex min-w-0 flex-1 items-start gap-2.5 rounded-md p-1 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
                      >
                        <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          alert.severity === 'high' ? 'bg-red-600 ring-2 ring-red-100' :
                          alert.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-neutral-800 leading-tight">{alert.title}</p>
                          <p className="text-[11px] text-neutral-500 mt-0.5">{alert.time}</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDismissedAlerts(prev => [...prev, alert.id])}
                        className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
                        title="Dismiss"
                        aria-label={`Dismiss ${alert.title}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="p-2 border-t border-neutral-100 bg-neutral-50/50 text-center">
                <span className="text-[10px] text-neutral-400">
                  Directory Operations Engine • v1.0.0
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
