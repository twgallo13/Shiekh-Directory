/** Public store page origin. One place so the card and the API agree. */
export const STORE_PAGE_ORIGIN = 'https://qr.shiekh.store';

export function storePageUrl(storeNumber: string): string {
  return `${STORE_PAGE_ORIGIN}/s/${encodeURIComponent(storeNumber)}`;
}

export const COMPANY_TILE_KEYS = ['app', 'rewards', 'instagram', 'launch', 'card', 'returns'] as const;
export type CompanyTileKey = (typeof COMPANY_TILE_KEYS)[number];

/** Page slots after the per-store review link (1) and the shop tile (2). Shop is not in this list. */
export const COMPANY_TILE_ORDER: Record<CompanyTileKey, number> = {
  app: 3,
  rewards: 4,
  instagram: 5,
  launch: 6,
  card: 7,
  returns: 8,
};

export const COMPANY_TILE_LABELS: Record<CompanyTileKey, string> = {
  app: 'Get the app',
  rewards: 'Legacy rewards',
  instagram: 'Instagram',
  launch: 'Launch Calendar',
  card: 'Sunbit card',
  returns: 'Return policy',
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

/** Blank company tiles. No urls. The public endpoint omits these until an Admin saves an https link. */
export const EMPTY_STORE_PAGE_TILES: StorePageTileDefaults = {
  app: { label: COMPANY_TILE_LABELS.app, iosUrl: null, androidUrl: null, show: false },
  rewards: { label: COMPANY_TILE_LABELS.rewards, url: null, show: false },
  instagram: { label: COMPANY_TILE_LABELS.instagram, url: null, show: false },
  launch: { label: COMPANY_TILE_LABELS.launch, url: null, show: false },
  card: { label: COMPANY_TILE_LABELS.card, url: null, show: false },
  returns: { label: COMPANY_TILE_LABELS.returns, url: null, show: false },
};

/**
 * Requests per minute for a public-profile:read key.
 * A refresh every 15 minutes is 96 list calls a day. One refresh is 1 list,
 * up to 3 retries, and 5 detail calls (9 requests). 120 per minute covers
 * that burst, and another one right after it, without throttling.
 */
export const PUBLIC_PROFILE_RATE_LIMIT = 120;
