// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PwaUpdateBanner } from '../src/components/PwaUpdateBanner';

vi.mock('../src/lib/buildId', () => ({
  pageBuildId: () => 'page-build',
}));

interface SwHandle {
  update: ReturnType<typeof vi.fn>;
  setControllerId: (id: string | null) => void;
  fireControllerChange: () => void;
}

function installServiceWorker(initialId: string | null): SwHandle {
  const listeners = new Set<(event: Event) => void>();
  let controllerId = initialId;
  const update = vi.fn(async () => {});
  const postMessage = (message: { type?: string }, transfer?: MessagePort[]) => {
    if (!message || message.type !== 'GET_BUILD_ID') return;
    const port = transfer?.[0];
    port?.postMessage({ type: 'BUILD_ID', buildId: controllerId });
  };
  const sw = {
    get controller() {
      if (controllerId == null) return null;
      return { postMessage };
    },
    addEventListener(_type: string, fn: EventListener) {
      listeners.add(fn as (event: Event) => void);
    },
    removeEventListener(_type: string, fn: EventListener) {
      listeners.delete(fn as (event: Event) => void);
    },
    getRegistration: vi.fn(async () => ({ update })),
    ready: Promise.resolve(),
  };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: sw });
  return {
    update,
    setControllerId(id: string | null) {
      controllerId = id;
    },
    fireControllerChange() {
      for (const fn of listeners) fn(new Event('controllerchange'));
    },
  };
}

function mockReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  const location = { reload, href: 'http://localhost/', hostname: 'localhost' };
  Object.defineProperty(window, 'location', { configurable: true, value: location });
  return reload;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PwaUpdateBanner', () => {
  it('stays hidden when the worker build id matches the page', async () => {
    const reload = mockReload();
    installServiceWorker('page-build');
    render(<PwaUpdateBanner />);
    await waitFor(() => {
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows the bar when the build ids differ and Refresh reloads only this window', async () => {
    const reload = mockReload();
    const sw = installServiceWorker('deployed-build');
    render(<PwaUpdateBanner />);
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('A new version is available.');
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button.className).toContain('min-h-[44px]');
    expect(button.className).toContain('min-w-[44px]');
    expect(reload).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(reload).toHaveBeenCalledTimes(1);
    sw.fireControllerChange();
    await Promise.resolve();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('hides on a first install with no controller', async () => {
    const reload = mockReload();
    installServiceWorker(null);
    render(<PwaUpdateBanner />);
    await waitFor(() => {
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows after controllerchange when the new id differs, and hides when it matches', async () => {
    const reload = mockReload();
    const sw = installServiceWorker(null);
    render(<PwaUpdateBanner />);
    await waitFor(() => {
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    });
    expect(screen.queryByRole('status')).toBeNull();

    sw.setControllerId('deployed-build');
    sw.fireControllerChange();
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();

    sw.setControllerId('page-build');
    sw.fireControllerChange();
    await waitFor(() => {
      expect(screen.queryByRole('status')).toBeNull();
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('shows the same bar for a stale chunk and does not reload on its own', async () => {
    const reload = mockReload();
    installServiceWorker('page-build');
    render(<PwaUpdateBanner />);
    await waitFor(() => {
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    });
    const event = new Event('vite:preloadError', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it('stays hidden while offline even if the build ids differ', async () => {
    const reload = mockReload();
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    installServiceWorker('deployed-build');
    render(<PwaUpdateBanner />);
    await waitFor(() => {
      expect(navigator.serviceWorker.getRegistration).toHaveBeenCalled();
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });
});
