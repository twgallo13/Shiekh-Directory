import type { AuthUser } from '../types';

/** Client-side flash guard. The server 403 is the real check. */
export function canSeeStorePageCard(user: AuthUser | null | undefined, locationId: string): boolean {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Steward') return true;
  if (user.role === 'Store') return !!user.storeLocationId && user.storeLocationId === locationId;
  if (user.role === 'Leader') return !!user.leaderScope?.locationIds?.includes(locationId);
  return false;
}
