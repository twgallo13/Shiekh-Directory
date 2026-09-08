import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DirectoryProvider } from '../../context/DirectoryContext';
import type { DirectorySeed } from '../../lib/directorySeed';

export function DirectoryBootstrap({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [seed, setSeed] = useState<DirectorySeed | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(false);
    void (async () => {
      try {
        if (!user) throw new Error();
        const response = await fetch('/api/auth/bootstrap', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json();
        for (const field of ['locations', 'people', 'hoursTemplates', 'corporateHolidays', 'emailTemplates', 'notificationRules', 'outboxLogs', 'sopRunbooks']) if (!Array.isArray(data[field])) throw new Error();
        if (active) setSeed(data);
      } catch { if (active) setError(true); }
    })();
    return () => { active = false; controller.abort(); };
  }, [user?.uid, attempt]);
  if (error) return <main className="space-y-4 p-6 text-neutral-900"><p role="alert">Directory access could not be loaded.</p><button className="flex items-center gap-2" onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-4 w-4" />Retry</button><button className="flex items-center gap-2" onClick={() => void signOut()}><LogOut className="h-4 w-4" />Sign out</button></main>;
  if (!seed) return <main className="flex min-h-screen items-center justify-center text-neutral-700" role="status">Loading authorized directory...</main>;
  return <DirectoryProvider seed={seed}>{children}</DirectoryProvider>;
}