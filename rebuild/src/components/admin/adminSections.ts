import {
  AlertTriangle, Clock, Lock, ListChecks, Mail, Users, UserPlus, Key,
  SlidersHorizontal, Upload, Database, History,
} from 'lucide-react';

/**
 * Admin page sections: one list drives the menu, the URLs (/admin/<id>),
 * the document titles and the tests. Ids are unchanged from the old tabs so
 * existing ids keep working; only labels and grouping changed.
 * Access is unchanged: the whole page is Admin-only (AdminView + server).
 */
export type AdminSectionId =
  | 'data-quality' | 'hours-templates' | 'store-page-defaults' | 'workflow-rules'
  | 'email'
  | 'users' | 'communications' | 'api-clients'
  | 'custom-fields' | 'import' | 'backups' | 'audit-log';

export type AdminGroupId = 'stores' | 'email' | 'people' | 'system';

export interface AdminSection {
  id: AdminSectionId;
  label: string;
  group: AdminGroupId;
  icon: typeof Mail;
}

export const ADMIN_GROUPS: { id: AdminGroupId; label: string }[] = [
  { id: 'stores', label: 'Stores' },
  { id: 'email', label: 'Email' },
  { id: 'people', label: 'People & access' },
  { id: 'system', label: 'Data & system' },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  { id: 'data-quality', label: 'Data quality', group: 'stores', icon: AlertTriangle },
  { id: 'hours-templates', label: 'Hours templates', group: 'stores', icon: Clock },
  { id: 'store-page-defaults', label: 'Store landing page defaults', group: 'stores', icon: Lock },
  { id: 'workflow-rules', label: 'Workflow rules', group: 'stores', icon: ListChecks },
  { id: 'email', label: 'Email setup', group: 'email', icon: Mail },
  { id: 'users', label: 'Users', group: 'people', icon: Users },
  { id: 'communications', label: 'Invitations', group: 'people', icon: UserPlus },
  { id: 'api-clients', label: 'API clients', group: 'people', icon: Key },
  { id: 'custom-fields', label: 'Custom fields', group: 'system', icon: SlidersHorizontal },
  { id: 'import', label: 'Import', group: 'system', icon: Upload },
  { id: 'backups', label: 'Backups', group: 'system', icon: Database },
  { id: 'audit-log', label: 'Change history', group: 'system', icon: History },
];

export const DEFAULT_ADMIN_SECTION: AdminSectionId = 'users';

/** Width (px) at and above which the left sidebar is used. Matches Dynamic QR (Tailwind `lg`). */
export const ADMIN_WIDE_MIN_PX = 1024;

export function findAdminSection(id: string | undefined): AdminSection | undefined {
  if (!id) return undefined;
  return ADMIN_SECTIONS.find((s) => s.id === id);
}

export function adminSectionPath(id: AdminSectionId): string {
  return `/admin/${id}`;
}

/** True for /admin and any /admin/... page (used to keep the top-bar Admin item highlighted). */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}
