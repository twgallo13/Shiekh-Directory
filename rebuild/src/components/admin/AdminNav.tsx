import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ADMIN_GROUPS, ADMIN_SECTIONS, adminSectionPath, type AdminSectionId } from './adminSections';
import { useAdminNavigate } from './AdminUnsavedChanges';

/**
 * Admin section menu.
 * - variant "sidebar": left column at 1024px and wider.
 * - variant "list": full-width list below 1024px (phones, tablets in portrait).
 * Real links, so Tab reaches every item and Enter opens it.
 */
export function AdminNav({ activeId, variant }: { activeId?: AdminSectionId; variant: 'sidebar' | 'list' }) {
  const adminNavigate = useAdminNavigate();

  const onClick = (event: MouseEvent<HTMLAnchorElement>, to: string) => {
    // Let new-tab / new-window clicks behave normally.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    adminNavigate(to);
  };

  const isList = variant === 'list';

  return (
    <nav aria-label="Admin sections" data-admin-nav={variant}>
      <div className={isList ? 'space-y-6' : 'space-y-5'}>
        {ADMIN_GROUPS.map((group) => {
          const items = ADMIN_SECTIONS.filter((s) => s.group === group.id);
          const headingId = `admin-nav-${variant}-${group.id}`;
          return (
            <div key={group.id} role="group" aria-labelledby={headingId}>
              <p id={headingId} className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                {group.label}
              </p>
              <ul className={isList ? 'bg-white rounded-lg border border-gray-200 divide-y divide-gray-100' : 'space-y-0.5'}>
                {items.map((section) => {
                  const active = section.id === activeId;
                  const to = adminSectionPath(section.id);
                  const Icon = section.icon;
                  return (
                    <li key={section.id}>
                      <Link
                        to={to}
                        onClick={(e) => onClick(e, to)}
                        aria-current={active ? 'page' : undefined}
                        title={section.label}
                        data-section-id={section.id}
                        className={
                          isList
                            ? 'flex items-center gap-3 px-4 min-h-[52px] text-base text-gray-900 hover:bg-gray-50'
                            : `flex items-center gap-3 pl-3 pr-2 min-h-[44px] rounded-r-lg border-l-4 text-sm whitespace-nowrap transition-colors ${
                                active
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold'
                                  : 'border-transparent text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                              }`
                        }
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-blue-600' : 'text-gray-500'}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate whitespace-nowrap">{section.label}</span>
                        {isList && <ChevronRight className="w-5 h-5 shrink-0 text-gray-400" aria-hidden="true" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
