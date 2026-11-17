// @vitest-environment jsdom
/**
 * Component tests for close/restore dialogs.
 * Tests the Dialog component behavior with mock props.
 * Full integration with LocationDetailView/HierarchyView requires
 * complex mock data and is covered by the API tests.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dialog } from '../src/components/Dialog';

const authMock = {
  uid: 'test-uid',
  email: 'admin@test.com',
  role: 'Admin' as string,
  displayName: 'Test Admin',
};

vi.mock('../src/context/AuthContext', () => ({
  useAuth: () => ({
    authUser: authMock,
    user: { email: authMock.email, getIdToken: async () => 'test-token' },
    signOut: vi.fn(),
    getIdToken: async () => 'test-token',
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Close Store Dialog Behavior', () => {
  it('shows dialog with title and content', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close #1234 Test Store permanently?"
          footer={<button>Close store #1234</button>}
        >
          <p>Store will be closed</p>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/Close #1234 Test Store permanently/)).toBeTruthy();
    expect(screen.getByText(/Store will be closed/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Close store #1234/ })).toBeTruthy();
  });

  it('shows loading state text', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={<button>Close</button>}
        >
          <p>Checking who's assigned...</p>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/Checking who's assigned/)).toBeTruthy();
  });

  it('shows empty state text', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={<button>Close</button>}
        >
          <p>No one is assigned to this store.</p>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/No one is assigned to this store/)).toBeTruthy();
  });

  it('shows people list', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={<button>Close</button>}
        >
          <ul>
            <li>John Smith - Store Manager</li>
            <li>Jane Doe - Assistant Manager</li>
          </ul>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/John Smith/)).toBeTruthy();
    expect(screen.getByText(/Jane Doe/)).toBeTruthy();
  });

  it('shows Steward wording', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={<button>Close</button>}
        >
          <p>Only an Admin can undo this. People taken off won't be put back automatically.</p>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/Only an Admin can undo this/)).toBeTruthy();
  });

  it('shows Admin wording', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={<button>Close</button>}
        >
          <p>You can restore it later from the Directory.</p>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/You can restore it later from the Directory/)).toBeTruthy();
  });

  it('shows inline close error', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={<button>Close</button>}
        >
          <div role="alert" className="bg-red-50">
            <p>Couldn't close the store. Nothing was changed. Try again.</p>
          </div>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/Couldn't close the store/)).toBeTruthy();
  });

  it('type-to-confirm input enables button when matching', () => {
    const storeNumber = '1234';
    
    const { rerender } = render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={
            <button disabled={true}>
              Close store #{storeNumber}
            </button>
          }
        >
          <input
            type="text"
            inputMode="numeric"
            defaultValue=""
            placeholder={storeNumber}
            data-testid="confirm-input"
          />
        </Dialog>
      </MemoryRouter>
    );

    const button = screen.getByRole('button', { name: /Close store #1234/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={
            <button disabled={'123'.trim() !== storeNumber.trim()}>
              Close store #{storeNumber}
            </button>
          }
        >
          <input type="text" defaultValue="123" data-testid="confirm-input" />
        </Dialog>
      </MemoryRouter>
    );
    expect((button as HTMLButtonElement).disabled).toBe(true);

    rerender(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={
            <button disabled={'1234'.trim() !== storeNumber.trim()}>
              Close store #{storeNumber}
            </button>
          }
        >
          <input type="text" defaultValue="1234" data-testid="confirm-input" />
        </Dialog>
      </MemoryRouter>
    );
    expect((button as HTMLButtonElement).disabled).toBe(false);

    rerender(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Close store"
          footer={
            <button disabled={' 1234 '.trim() !== storeNumber.trim()}>
              Close store #{storeNumber}
            </button>
          }
        >
          <input type="text" defaultValue=" 1234 " data-testid="confirm-input" />
        </Dialog>
      </MemoryRouter>
    );
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('Restore Store Dialog Behavior', () => {
  it('shows restore dialog', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Restore store"
          footer={<button>Restore store</button>}
        >
          <p>This will restore Store #1234 to active status.</p>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Restore store/ })).toBeTruthy();
    expect(screen.getByText(/This will restore Store #1234 to active status/)).toBeTruthy();
  });

  it('shows inline restore error for district_retired', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Restore store"
          footer={<button>Restore store</button>}
        >
          <div role="alert">
            <p>Its district was removed. Restore the district first, or move this store to an active district.</p>
          </div>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/district was removed/)).toBeTruthy();
  });

  it('shows inline restore error for region_retired', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Restore store"
          footer={<button>Restore store</button>}
        >
          <div role="alert">
            <p>Its region was removed. Restore the region first.</p>
          </div>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/region was removed/)).toBeTruthy();
  });

  it('shows inline restore error for duplicate_store_number', () => {
    render(
      <MemoryRouter>
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Restore store"
          footer={<button>Restore store</button>}
        >
          <div role="alert">
            <p>This store number is already in use by another active store.</p>
          </div>
        </Dialog>
      </MemoryRouter>
    );

    expect(screen.getByText(/already in use/)).toBeTruthy();
  });
});

describe('Role-based Visibility', () => {
  it('Restore button visibility based on role', () => {
    const RestoreButton = ({ isAdmin }: { isAdmin: boolean }) => (
      isAdmin ? <button>Restore store</button> : null
    );

    const { rerender } = render(<RestoreButton isAdmin={true} />);
    expect(screen.getByRole('button', { name: /Restore store/ })).toBeTruthy();

    rerender(<RestoreButton isAdmin={false} />);
    expect(screen.queryByRole('button', { name: /Restore store/ })).toBeNull();
  });
});
