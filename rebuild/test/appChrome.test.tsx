// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from '../src/components/AppLayout';
import { Dialog } from '../src/components/Dialog';

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    authUser: { uid: 'test-uid', email: 'qa@test.invalid', role: 'Admin', fullName: 'Test Admin' },
    user: { email: 'qa@test.invalid', getIdToken: async () => '' },
    signOut: vi.fn(),
    getIdToken: async () => '',
    storeSession: null,
    isStoreSession: false,
  }),
}));

function layerZ(className: string): number {
  const arbitrary = className.match(/(?:^|\s)z-\[(\d+)\]/);
  if (arbitrary) return Number(arbitrary[1]);
  const named = className.match(/(?:^|\s)z-(\d+)(?:\s|$)/);
  if (named) return Number(named[1]);
  throw new Error(`no z-index class in "${className}"`);
}

afterEach(() => {
  cleanup();
});

describe('app chrome stacking', () => {
  it('keeps the sticky chrome at z-50 so a dialog is not underneath it', () => {
    const { container } = render(
      <MemoryRouter>
        <AppLayout>
          <Dialog isOpen onClose={() => {}} title="Edit hours">
            Form
          </Dialog>
        </AppLayout>
      </MemoryRouter>,
    );

    const header = container.querySelector('header');
    const chrome = header?.parentElement;
    expect(chrome).toBeTruthy();
    expect(chrome?.className).toContain('sticky');
    expect(chrome?.className).toContain('top-0');
    expect(chrome?.className).toContain('z-50');
    expect(chrome?.className).not.toMatch(/z-\[\d+\]/);

    const dialog = screen.getByRole('dialog', { name: 'Edit hours' });
    const overlay = dialog.parentElement;
    expect(overlay?.className).toContain('z-50');
    expect(layerZ(chrome!.className)).toBeLessThanOrEqual(layerZ(overlay!.className));
  });

  it('anchors the mobile menu to the bottom of the sticky chrome', () => {
    render(
      <MemoryRouter>
        <AppLayout>Page</AppLayout>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    const closeButton = screen.getByRole('button', { name: 'Close menu' });
    const panel = screen.getByRole('dialog', { name: 'Navigation menu' });
    const chrome = panel.closest('.sticky');
    const headerBar = closeButton.closest('.relative.z-50');

    expect(panel.className).toContain('absolute');
    expect(panel.className).toContain('top-full');
    expect(panel.className).not.toContain('top-14');
    expect(chrome).toBeTruthy();
    expect(chrome).toBe(panel.parentElement?.parentElement);
    expect(headerBar).toBeTruthy();
    expect(chrome?.contains(closeButton)).toBe(true);
    expect(panel.contains(closeButton)).toBe(false);
  });
});
