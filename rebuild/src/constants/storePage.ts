/** Public store page origin. One place so the card and the API agree. */
export const STORE_PAGE_ORIGIN = 'https://qr.shiekh.store';

export function storePageUrl(storeNumber: string): string {
  return `${STORE_PAGE_ORIGIN}/s/${encodeURIComponent(storeNumber)}`;
}

export const COMPANY_TILE_KEYS = ['app', 'launch', 'rewards', 'card', 'instagram', 'returns'] as const;
export type CompanyTileKey = (typeof COMPANY_TILE_KEYS)[number];

export const COMPANY_TILE_ORDER: Record<CompanyTileKey, number> = {
  app: 3,
  launch: 4,
  rewards: 5,
  card: 6,
  instagram: 7,
  returns: 8,
};

export interface AppTileDefault {
  label: string;
  iosUrl: string | null;
  androidUrl: string | null;
  show: boolean;
}

export interface LinkTileDefault {
  label: string;
  url: string | null;
  show: boolean;
}

export interface StorePageTileDefaults {
  app: AppTileDefault;
  launch: LinkTileDefault;
  rewards: LinkTileDefault;
  card: LinkTileDefault;
  instagram: LinkTileDefault;
  returns: LinkTileDefault;
}

/**
 * Used only when settings/storePageDefaults is missing.
 * Instagram matches the pilot example. The Sunbit host is the allowlisted card host.
 * Other links point at the public Shiekh site until an Admin saves the approved URLs.
 * The app tile stays hidden until both store links are set. Live seeding is a separate step.
 */
export const DEFAULT_STORE_PAGE_TILES: StorePageTileDefaults = {
  app: {
    label: 'Shiekh App',
    iosUrl: null,
    androidUrl: null,
    show: false,
  },
  launch: {
    label: 'New Arrivals',
    url: 'https://www.shiekh.com/',
    show: true,
  },
  rewards: {
    label: 'Rewards',
    url: 'https://www.shiekh.com/',
    show: true,
  },
  card: {
    label: 'Shiekh Card',
    url: 'https://get-card.sunbit.com/',
    show: true,
  },
  instagram: {
    label: 'Instagram',
    url: 'https://www.instagram.com/shiekh',
    show: true,
  },
  returns: {
    label: 'Returns',
    url: 'https://www.shiekh.com/',
    show: true,
  },
};

/** Recommended limit for the Dynamic QR key. Polling is once every 15 minutes. */
export const PUBLIC_PROFILE_RATE_LIMIT = 60;
