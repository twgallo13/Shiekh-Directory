export const ORGANIZATION_RECOVERY_PREFIX = 'shiekh_organization_review_v1:';
export const ORGANIZATION_MOVE_RECOVERY_PREFIX = 'shiekh_organization_move_review_v1:';
export const LOCATION_CREATION_RECOVERY_PREFIX = 'shiekh_location_creation_v1:';
export const LOCATION_LIFECYCLE_RECOVERY_PREFIX='shiekh_location_lifecycle_review_v1:';
type Family = 'leadership' | 'moves' | 'creation' | 'lifecycle';
function prefix(family: Family) {
  if (family === 'creation') return LOCATION_CREATION_RECOVERY_PREFIX;
  if(family==='lifecycle')return LOCATION_LIFECYCLE_RECOVERY_PREFIX;
  if (family !== 'leadership' && family !== 'moves') throw new Error('Invalid review family.');
  return family === 'moves' ? ORGANIZATION_MOVE_RECOVERY_PREFIX : ORGANIZATION_RECOVERY_PREFIX;
}
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
export function organizationMarkerStore(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, uid: string, check: () => void, family: Family = 'leadership') {
  const key = prefix(family) + encodeURIComponent(uid);
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
export function acquireOrganizationLease(locks: Pick<LockManager, 'request'>, uid: string, family: Family = 'leadership', signal?: AbortSignal): Promise<() => void> {
  if (!locks?.request) return Promise.reject(new Error('This browser cannot protect review recovery. Use a supported browser.'));
  return new Promise((resolve, reject) => {
    let release: () => void;
    const held = new Promise<void>(done => { release = done; });
    const abort=()=>{release();reject(new Error('This creation form was closed.'));};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});
    // Web Locks does not allow its signal option together with ifAvailable. Keep the
    // cancellation listener local and release/ignore a late grant instead.
    locks.request(prefix(family) + encodeURIComponent(uid), { mode: 'exclusive', ifAvailable: true }, lock => {
      if(signal?.aborted){abort();return;}
      if (!lock) { reject(new Error('Another tab is managing assignments. Finish or close that review first.')); return; }
      resolve(() => release()); return held;
    }).catch(reject).finally(()=>signal?.removeEventListener('abort',abort));
  });
}
