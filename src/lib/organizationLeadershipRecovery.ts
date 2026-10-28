export const ORGANIZATION_RECOVERY_PREFIX = 'shiekh_organization_review_v1:';
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
export function organizationMarkerStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, uid: string, check: () => void) {
  const key = ORGANIZATION_RECOVERY_PREFIX + encodeURIComponent(uid);
  const read = (): string | null => {
    check(); const raw = storage.getItem(key); if (raw === null) return null;
    if (raw.length > 512) throw new Error('An existing review marker needs recovery.');
    let value: any; try { value = JSON.parse(raw); } catch { throw new Error('An existing review marker needs recovery.'); }
    if (!value || Object.keys(value).sort().join(',') !== 'operationId,schemaVersion' || value.schemaVersion !== 1 || !validId(value.operationId)) throw new Error('An existing review marker needs recovery.');
    return value.operationId;
  };
  return {
    read,
    persist(operationId: string) {
      check(); if (!validId(operationId)) throw new Error('Invalid review identity.');
      const previous = read(); if (previous && previous !== operationId) throw new Error('Finish the existing review before starting another.');
      const encoded = JSON.stringify({ schemaVersion: 1, operationId });
      storage.setItem(key, encoded); if (storage.getItem(key) !== encoded) throw new Error('Recovery storage is unavailable. No new review was sent.'); check();
    },
    resolve(operationId: string) {
      check(); const previous = read(); if (previous !== operationId) throw new Error('The saved review marker changed.');
      storage.removeItem(key); if (storage.getItem(key) !== null) throw new Error('The saved review marker could not be cleared.'); check();
    },
  };
}
/** Non-waiting actor lease. This prevents marker overwrite by a second tab, not competing devices. */
export function acquireOrganizationLease(locks: Pick<LockManager, 'request'>, uid: string): Promise<() => void> {
  if (!locks?.request) return Promise.reject(new Error('This browser cannot protect review recovery. Use a supported browser.'));
  return new Promise((resolve, reject) => {
    let release: () => void;
    const held = new Promise<void>(done => { release = done; });
    locks.request(ORGANIZATION_RECOVERY_PREFIX + encodeURIComponent(uid), { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) { reject(new Error('Another tab is managing assignments. Finish or close that review first.')); return; }
      resolve(() => release()); return held;
    }).catch(reject);
  });
}
