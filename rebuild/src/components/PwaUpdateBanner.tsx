import { useEffect, useRef, useState } from 'react';
import { pageBuildId } from '../lib/buildId';

const UPDATE_INTERVAL_MS = 60_000;

interface BuildIdMessage {
  type?: string;
  buildId?: string;
}

function isBuildIdMessage(value: unknown): value is BuildIdMessage {
  if (!value || typeof value !== 'object') return false;
  const record = value as { type?: unknown; buildId?: unknown };
  return record.type === 'BUILD_ID' && typeof record.buildId === 'string';
}

// Update check: postMessage { type: "GET_BUILD_ID" } to the active controller.
// The worker replies { type: "BUILD_ID", buildId } on the transferred port.
// The bar is shown only when that id differs from this page's build id
// (or a stale lazy chunk fails to load). Refresh calls location.reload()
// on this window only. Other tabs are never reloaded from here.
function askWorkerBuildId(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      window.clearTimeout(timer);
      resolve(isBuildIdMessage(event.data) ? event.data.buildId ?? null : null);
    };
    try {
      worker.postMessage({ type: 'GET_BUILD_ID' }, [channel.port2]);
    } catch {
      window.clearTimeout(timer);
      resolve(null);
    }
  });
}

export function PwaUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const staleChunk = useRef(false);

  useEffect(() => {
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;
    let lastUpdate = 0;

    const compare = async () => {
      const worker = navigator.serviceWorker.controller;
      if (!worker) return;
      const workerId = await askWorkerBuildId(worker);
      if (cancelled || workerId == null) return;
      setUpdateAvailable(workerId !== pageBuildId() || staleChunk.current);
    };

    const updateRegistration = async (force: boolean) => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (cancelled || !reg) return;
      const now = Date.now();
      if (force || now - lastUpdate >= UPDATE_INTERVAL_MS) {
        lastUpdate = now;
        try {
          await reg.update();
        } catch {
          // update() rejects while offline. The bar does not depend on it.
        }
      }
      await compare();
    };

    const onControllerChange = () => {
      void compare();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void updateRegistration(false);
    };
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      staleChunk.current = true;
      if (!cancelled) setUpdateAvailable(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('vite:preloadError', onPreloadError);
    void updateRegistration(true);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('vite:preloadError', onPreloadError);
    };
  }, []);

  if (!updateAvailable || offline) return null;

  return (
    <div
      role="status"
      className="bg-blue-800 text-white px-4 text-sm font-medium flex items-center justify-center gap-3"
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-3 my-1 rounded-md bg-white text-blue-800 font-semibold"
      >
        Refresh
      </button>
    </div>
  );
}
