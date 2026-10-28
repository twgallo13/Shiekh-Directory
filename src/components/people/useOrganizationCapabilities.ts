import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createOrganizationHttpPort } from '../../lib/organizationLeadershipClient';
import type { OrganizationCapabilities } from '../../lib/organizationLeadershipContract';

/** Optional feature discovery must never turn an already successful profile save into a failure. */
export function useOrganizationCapabilities() {
  const auth = useAuth(), generation = auth.sessionGeneration();
  const [value, setValue] = useState<OrganizationCapabilities | null>(null);
  useEffect(() => {
    setValue(null);
    if (auth.status !== 'authorized' || auth.account?.role !== 'System Administrator' || auth.account.accessScope !== 'Company-wide') return;
    let live = true;
    const port = createOrganizationHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch });
    const unsubscribe = auth.onSessionBoundary(() => { if (live) setValue(null); port.dispose(); });
    void port.capabilities().then(c => { if (live) setValue(c); }).catch(() => { if (live) setValue(null); });
    return () => { live = false; unsubscribe(); port.dispose(); };
  }, [generation, auth.status, auth.account?.uid, auth.account?.role, auth.account?.accessScope]);
  return value;
}
