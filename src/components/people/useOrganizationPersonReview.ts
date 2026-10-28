import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { createOrganizationHttpPort } from '../../lib/organizationLeadershipClient';
import { readOrganizationPersonReview, type OrganizationPersonReview } from '../../lib/organizationPersonReview';

export function useOrganizationPersonReview(personId: string | undefined, enabled: boolean) {
  const auth = useAuth(), generation = auth.sessionGeneration();
  const [attempt, setAttempt] = useState(0);
  const [saved, setSaved] = useState<{ key: string; value: OrganizationPersonReview } | null>(null);
  const admitted = enabled && !!personId && auth.status === 'authorized' && auth.account?.role === 'System Administrator' && auth.account.status === 'Active' && auth.account.accessScope === 'Company-wide';
  const key = JSON.stringify([generation, auth.account?.uid, personId, admitted, attempt]);
  useEffect(() => {
    setSaved(null);
    if (!admitted || !personId) return;
    let live = true;
    const port = createOrganizationHttpPort({ session: auth.currentSession, generation: auth.sessionGeneration, request: fetch });
    const unsubscribe = auth.onSessionBoundary(() => { live = false; setSaved(null); port.dispose(); });
    void readOrganizationPersonReview(port, personId).then(value => { if (live) setSaved({ key, value }); })
      .catch(() => { if (live) setSaved({ key, value: { phase: 'unavailable', units: [] } }); });
    return () => { live = false; unsubscribe(); port.dispose(); };
  }, [key]);
  const value: OrganizationPersonReview | null = !admitted ? null : saved?.key === key ? saved.value : { phase: 'loading', units: [] };
  return { review: value, refresh: () => setAttempt(n => n + 1) };
}
