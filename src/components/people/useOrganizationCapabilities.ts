import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createOrganizationHttpPort } from '../../lib/organizationLeadershipClient';
import type { OrganizationCapabilities } from '../../lib/organizationLeadershipContract';

/** Optional feature discovery must never turn an already successful profile save into a failure. */
export function useOrganizationCapabilityState() {
  const auth = useAuth(), generation = auth.sessionGeneration();
  const [value, setValue] = useState<OrganizationCapabilities | null>(null);
  const [status, setStatus] = useState<'loading' | 'unavailable' | 'ready' | 'hidden'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setValue(null);
    if (auth.status !== 'authorized' || auth.account?.role !== 'System Administrator' || auth.account.accessScope !== 'Company-wide') { setStatus('hidden'); return; }
    setStatus('loading');
    let live = true;
    const port = createOrganizationHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch });
    const unsubscribe = auth.onSessionBoundary(() => { if (live) { setValue(null); setStatus('loading'); live = false; } port.dispose(); });
    void port.capabilities().then(c => { if (live) { setValue(c); setStatus('ready'); } }).catch(() => { if (live) { setValue(null); setStatus('unavailable'); } });
    return () => { live = false; unsubscribe(); port.dispose(); };
  }, [generation, auth.status, auth.account?.uid, auth.account?.role, auth.account?.accessScope, attempt]);
  return { capabilities: value, status, retry: () => setAttempt(a => a + 1) };
}
export function useOrganizationCapabilities() { return useOrganizationCapabilityState().capabilities; }
