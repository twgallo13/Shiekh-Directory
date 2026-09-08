import type { LocationRecord, PersonRecord } from '../types';

export type NavigationTab = 'dashboard' | 'locations' | 'people' | 'requests' | 'print' | 'admin';

export const TAB_PATHS: Record<NavigationTab, string> = {
  dashboard: '/',
  locations: '/locations',
  people: '/people',
  requests: '/requests',
  print: '/print',
  admin: '/admin',
};

export const TAB_TITLES: Record<NavigationTab, string> = {
  dashboard: 'Dashboard',
  locations: 'Store Locations',
  people: 'People Directory',
  requests: 'Change Requests',
  print: 'Directory PDF',
  admin: 'Admin & Integrations',
};

export const getTabForPath = (pathname: string): NavigationTab => {
  if (pathname.startsWith('/locations')) return 'locations';
  if (pathname.startsWith('/people')) return 'people';
  if (pathname.startsWith('/requests')) return 'requests';
  if (pathname.startsWith('/print')) return 'print';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'dashboard';
};

export const locationPath = (location: LocationRecord) =>
  `/locations/${encodeURIComponent(location.id)}`;

export const personPath = (person: PersonRecord) =>
  `/people/${encodeURIComponent(person.id)}`;
