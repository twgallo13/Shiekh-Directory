import { useCallback, useEffect, useState } from 'react';
import { Dialog } from './Dialog';
import { apiGet, apiPost } from '../lib/api';

interface AssignedPerson {
  personName: string;
  role: string;
}

interface CloseStoreDialogProps {
  isOpen: boolean;
  onClose: () => void;
  locationId: string;
  storeNumber: string;
  storeName: string;
  isAdmin: boolean;
  onClosed: () => void;
}

export function CloseStoreDialog({
  isOpen,
  onClose,
  locationId,
  storeNumber,
  storeName,
  isAdmin,
  onClosed,
}: CloseStoreDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [staffError, setStaffError] = useState(false);
  const [people, setPeople] = useState<AssignedPerson[]>([]);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoadingStaff(true);
    setStaffError(false);
    try {
      const response = await apiGet(`/api/app/assignments/location/${locationId}`);
      if (!response.ok) {
        setStaffError(true);
        setPeople([]);
        return;
      }
      const body = await response.json();
      const list = Array.isArray(body.data) ? body.data : [];
      setPeople(
        list
          .filter((assignment: { isActive?: boolean }) => assignment.isActive === true)
          .map((assignment: { personName?: string; role?: string }) => ({
            personName: assignment.personName || 'Unknown',
            role: assignment.role || '',
          }))
      );
    } catch {
      setStaffError(true);
      setPeople([]);
    } finally {
      setLoadingStaff(false);
    }
  }, [locationId]);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmText('');
    setCloseError(null);
    void loadStaff();
  }, [isOpen, loadStaff]);

  const handleDismiss = () => {
    if (closing) return;
    onClose();
  };

  const handleCloseStore = async () => {
    if (confirmText.trim() !== storeNumber.trim()) return;
    setClosing(true);
    setCloseError(null);
    try {
      const response = await apiPost(`/api/app/hierarchy/locations/${locationId}/retire`);
      if (response.ok) {
        onClosed();
        return;
      }
      const errorData = await response.json().catch(() => ({}));
      if (errorData.error?.code === 'already_retired') {
        setCloseError('This store was already permanently closed.');
      } else {
        setCloseError("Couldn't close the store. Nothing was changed. Try again.");
      }
    } catch {
      setCloseError("Couldn't close the store. Nothing was changed. Try again.");
    } finally {
      setClosing(false);
    }
  };

  const numberMatches = confirmText.trim() === storeNumber.trim();
  const submitDisabled = closing || loadingStaff || staffError || !numberMatches;
  const peopleLabel = people.length === 1 ? '1 person will be taken off' : `${people.length} people will be taken off`;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleDismiss}
      title={`Close #${storeNumber} ${storeName} permanently?`}
      size="md"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDismiss}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 min-h-[44px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCloseStore}
            disabled={submitDisabled}
            className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            {closing ? 'Closing...' : `Close store #${storeNumber}`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {closeError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
            <p className="text-sm text-red-700">{closeError}</p>
          </div>
        )}

        {loadingStaff ? (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">Checking who's assigned…</p>
          </div>
        ) : staffError ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3" role="alert">
            <p className="text-sm text-red-700">Couldn't load who's assigned. Try again.</p>
            <button
              type="button"
              onClick={() => void loadStaff()}
              className="mt-2 text-sm font-medium text-red-800 underline min-h-[44px]"
            >
              Try again
            </button>
          </div>
        ) : people.length > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm font-medium text-amber-800 mb-2">{peopleLabel}:</p>
            <ul className="text-sm text-amber-700 space-y-1">
              {people.map((person, index) => (
                <li key={`${person.personName}-${person.role}-${index}`}>
                  • {person.personName} ({person.role})
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No one is assigned to this store.</p>
        )}

        <div className="text-sm text-gray-600 space-y-1">
          <p>This store will be removed from the directory, search, exports and the consumer API.</p>
          <p>Open checks, temporary closures and DM tasks for this store will be cancelled.</p>
          <p>Store sessions will be revoked.</p>
          <p>People taken off won't be put back automatically.</p>
        </div>

        <p className="text-sm text-gray-600">
          {isAdmin
            ? 'You can restore it later from the Directory.'
            : 'Only an Admin can undo this. People taken off won\'t be put back automatically.'}
        </p>

        <div>
          <label htmlFor="close-confirm" className="block text-sm font-medium text-gray-700 mb-1">
            Type <span className="font-mono bg-gray-100 px-1 rounded">{storeNumber}</span> to confirm
          </label>
          <input
            id="close-confirm"
            type="text"
            inputMode="numeric"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 min-h-[44px]"
            placeholder={storeNumber}
            autoComplete="off"
          />
        </div>
      </div>
    </Dialog>
  );
}
