import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Lock, Pencil } from 'lucide-react';
import type { AuthUser } from '../types';
import { apiGet, apiPatch, apiPost } from '../lib/api';
import { Dialog, FormField } from './Dialog';
import { storePageUrl } from '../constants/storePage';
import { validateReviewUrl, validateWebsiteUrl, parseMagentoStoreId } from '../lib/storePageValidation';

interface StorePageTile {
  key: string;
  label: string;
  locked: boolean;
  visible: boolean;
  note: string | null;
  order: number;
}

interface PendingRequest {
  id: string;
  status: string;
  reviewUrl: string | null;
  submittedByEmail?: string | null;
}

interface StorePageData {
  reviewUrl: string | null;
  websiteUrl: string | null;
  magentoStoreId: string | null;
  shopTileVisible: boolean;
  pageEnabled: boolean;
  version: number;
  updatedAt: string | null;
  pageUrl: string;
  storeNumber: string;
  pendingRequest: PendingRequest | null;
  tiles: StorePageTile[];
  defaultImage: { source: string; label: string };
}

interface StorePageCardProps {
  locationId: string;
  storeNumber: string;
  lifecycle: string;
  authUser: AuthUser;
}

function formatUpdated(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso));
}

export function StorePageCard({ locationId, storeNumber, lifecycle, authUser }: StorePageCardProps) {
  const [page, setPage] = useState<StorePageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmEnabled, setConfirmEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  const [reviewDraft, setReviewDraft] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState('');
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [editingMagento, setEditingMagento] = useState(false);
  const [magentoDraft, setMagentoDraft] = useState('');
  const [magentoError, setMagentoError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestUrl, setRequestUrl] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);

  const privileged = authUser.role === 'Admin' || authUser.role === 'Steward';
  const canToggle = authUser.role === 'Admin' && lifecycle === 'active';
  const canRequest = authUser.role === 'Store' || authUser.role === 'Leader';

  const load = useCallback(async () => {
    try {
      const response = await apiGet(`/api/app/store-pages/${locationId}`);
      if (!response.ok) {
        setLoadError('Couldn\'t load the store page.');
        setPage(null);
        return;
      }
      const { data } = await response.json();
      setPage(data);
      setLoadError(null);
    } catch {
      setLoadError('Couldn\'t load the store page.');
    }
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePatch = async (body: Record<string, unknown>) => {
    if (!page) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await apiPatch(`/api/app/store-pages/${locationId}`, {
        ...body,
        expectedVersion: page.version,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(payload.error?.message || 'Couldn\'t save the store page.');
        return;
      }
      setEditingReview(false);
      setEditingWebsite(false);
      setEditingMagento(false);
      await load();
    } catch {
      setActionError('Couldn\'t save the store page.');
    } finally {
      setSaving(false);
    }
  };

  const confirmVisibility = async () => {
    if (!page || confirmEnabled === null) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await apiPost(`/api/app/store-pages/${locationId}/visibility`, {
        enabled: confirmEnabled,
        expectedVersion: page.version,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(payload.error?.message || 'Couldn\'t update the store page.');
        return;
      }
      setConfirmEnabled(null);
      await load();
    } catch {
      setActionError('Couldn\'t update the store page.');
    } finally {
      setSaving(false);
    }
  };

  const submitRequest = async () => {
    const parsed = validateReviewUrl(requestUrl);
    if (!parsed.ok || !parsed.href) {
      setRequestError(parsed.ok ? 'Enter a review link.' : parsed.message);
      return;
    }
    setSaving(true);
    setRequestError(null);
    try {
      const response = await apiPost('/api/app/corrections', {
        locationId,
        category: 'store-link',
        type: 'store-page',
        proposedChanges: { reviewUrl: requestUrl },
        proposedNote: requestNote.trim() || undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRequestError(payload.error?.message || 'Couldn\'t send the request.');
        return;
      }
      setRequestOpen(false);
      setRequestUrl('');
      setRequestNote('');
      await load();
    } catch {
      setRequestError('Couldn\'t send the request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-semibold text-gray-900">Store page</h3>
        {page && (
          <span className={`text-sm font-medium ${page.pageEnabled ? 'text-green-700' : 'text-gray-600'}`}>
            {page.pageEnabled ? 'Live' : 'Off'}
          </span>
        )}
      </div>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}
      {actionError && <p className="text-sm text-red-600 mb-3" role="alert">{actionError}</p>}

      {page && (
        <div className="space-y-4 text-sm">
          {canToggle && (
            <button
              type="button"
              role="switch"
              aria-checked={page.pageEnabled}
              onClick={() => setConfirmEnabled(!page.pageEnabled)}
              className="min-h-[44px] px-4 py-2 rounded-lg border border-gray-300 font-medium text-gray-900 hover:bg-gray-50"
            >
              {page.pageEnabled ? 'Turn off the store page' : 'Turn on the store page'}
            </button>
          )}
          {authUser.role === 'Admin' && lifecycle !== 'active' && (
            <p className="text-gray-600">Page on/off is only for active stores.</p>
          )}

          <div>
            {page.pageEnabled ? (
              <a
                href={storePageUrl(storeNumber)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-blue-700 font-medium min-h-[44px] hover:underline"
              >
                Open page
                <ExternalLink className="w-4 h-4" aria-hidden="true" />
              </a>
            ) : (
              <>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-2 text-gray-400 font-medium min-h-[44px] cursor-not-allowed"
                >
                  Open page
                  <ExternalLink className="w-4 h-4" aria-hidden="true" />
                </button>
                <p className="text-gray-500">Page is off</p>
              </>
            )}
            <p className="text-gray-500">Changes show within 15 minutes</p>
            <p className="text-gray-500">
              {page.updatedAt ? `Last updated ${formatUpdated(page.updatedAt)}` : 'Last updated —'}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-gray-900">Review link</p>
              {privileged && !editingReview && (
                <button
                  type="button"
                  onClick={() => {
                    setReviewDraft(page.reviewUrl || '');
                    setReviewError(null);
                    setEditingReview(true);
                  }}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-blue-700"
                  aria-label="Edit review link"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            {!editingReview && (
              <p className="break-all text-gray-700">{page.reviewUrl || 'Not set'}</p>
            )}
            {editingReview && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = validateReviewUrl(reviewDraft);
                  if (!parsed.ok) {
                    setReviewError(parsed.message);
                    return;
                  }
                  setReviewError(null);
                  void savePatch({ reviewUrl: reviewDraft });
                }}
              >
                <FormField id="review-link" label="Review link" error={reviewError || undefined}>
                  <input
                    id="review-link"
                    value={reviewDraft}
                    onChange={(event) => setReviewDraft(event.target.value)}
                    aria-invalid={!!reviewError}
                    aria-describedby={reviewError ? 'review-link-error' : undefined}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                  />
                </FormField>
                <button type="submit" disabled={saving} className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white font-medium">
                  Save review link
                </button>
              </form>
            )}
            {canRequest && !page.pendingRequest && (
              <button
                type="button"
                onClick={() => {
                  setRequestOpen(true);
                  setRequestError(null);
                }}
                className="mt-2 min-h-[44px] px-4 rounded-lg border border-gray-300 font-medium text-gray-900 hover:bg-gray-50"
              >
                Request a review link change
              </button>
            )}
            {page.pendingRequest && (
              <p className="mt-2">
                <span className="font-medium text-amber-800">Pending Review</span>
                {' · '}
                <Link to="/my-requests" className="text-blue-700 underline min-h-[44px] inline-flex items-center">
                  My Requests
                </Link>
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-gray-900">Store website URL</p>
              {privileged && !editingWebsite && (
                <button
                  type="button"
                  onClick={() => {
                    setWebsiteDraft(page.websiteUrl || '');
                    setWebsiteError(null);
                    setEditingWebsite(true);
                  }}
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-blue-700"
                  aria-label="Edit store website URL"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            {!editingWebsite && (
              <p className="break-all text-gray-700">{page.websiteUrl || 'Not set'}</p>
            )}
            {editingWebsite && (
              <form
                className="space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = validateWebsiteUrl(websiteDraft);
                  if (!parsed.ok) {
                    setWebsiteError(parsed.message);
                    return;
                  }
                  setWebsiteError(null);
                  void savePatch({ websiteUrl: websiteDraft });
                }}
              >
                <FormField
                  id="store-website-url"
                  label="Store website URL"
                  error={websiteError || undefined}
                  hint="This store's page on shiekh.com. This is not the Store page on qr.shiekh.store, and it is not the company Find-a-store page URL."
                >
                  <input
                    id="store-website-url"
                    value={websiteDraft}
                    onChange={(event) => setWebsiteDraft(event.target.value)}
                    aria-invalid={!!websiteError}
                    aria-describedby={websiteError ? 'store-website-url-error' : undefined}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                  />
                </FormField>
                <button type="submit" disabled={saving} className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white font-medium">
                  Save store website URL
                </button>
              </form>
            )}
          </div>

          <div>
            <p className="font-medium text-gray-900">Shop this store</p>
            {privileged ? (
              <>
                <p className="text-gray-500">Magento store ID. Theo adds IDs Monday.</p>
                {!editingMagento ? (
                  <div className="flex items-center gap-2">
                    <p>{page.magentoStoreId || 'Not set'}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMagentoDraft(page.magentoStoreId || '');
                        setMagentoError(null);
                        setEditingMagento(true);
                      }}
                      className="min-h-[44px] px-3 text-blue-700 font-medium"
                    >
                      Edit
                    </button>
                  </div>
                ) : (
                  <form
                    className="space-y-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const parsed = parseMagentoStoreId(magentoDraft);
                      if (!parsed.ok) {
                        setMagentoError(parsed.message);
                        return;
                      }
                      setMagentoError(null);
                      void savePatch({ magentoStoreId: magentoDraft });
                    }}
                  >
                    <FormField id="magento-store-id" label="Magento store ID" error={magentoError || undefined} hint="Theo adds IDs Monday">
                      <input
                        id="magento-store-id"
                        inputMode="numeric"
                        value={magentoDraft}
                        onChange={(event) => setMagentoDraft(event.target.value)}
                        aria-invalid={!!magentoError}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
                      />
                    </FormField>
                    <button type="submit" disabled={saving} className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white font-medium">
                      Save Magento store ID
                    </button>
                  </form>
                )}
              </>
            ) : (
              <p>{page.shopTileVisible ? 'Shop tile: shown' : 'Shop tile: hidden until set'}</p>
            )}
          </div>

          <ul className="space-y-2">
            {page.tiles.map((tile) => (
              <li key={tile.key} className="flex items-center justify-between gap-3 min-h-[44px]">
                <span className="text-gray-900">{tile.label}</span>
                {tile.locked ? (
                  <span className="inline-flex items-center gap-1 text-gray-500">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    {tile.note === 'Not set' ? 'Not set' : 'Set by Shiekh'}
                  </span>
                ) : (
                  <span className="text-gray-500">{tile.visible ? 'Shown' : 'Hidden'}</span>
                )}
              </li>
            ))}
          </ul>

          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-gray-600">
            <p className="font-medium text-gray-900">Company default image</p>
            <p>{page.defaultImage?.label || 'Company default image · Set by Shiekh'}</p>
          </div>
        </div>
      )}

      <Dialog
        isOpen={confirmEnabled !== null}
        onClose={() => setConfirmEnabled(null)}
        title={confirmEnabled ? 'Turn on the store page' : 'Turn off the store page'}
        size="sm"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setConfirmEnabled(null)} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 min-h-[44px]">
              Cancel
            </button>
            <button type="button" onClick={() => void confirmVisibility()} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium min-h-[44px]">
              {confirmEnabled ? 'Yes, turn it on' : 'Yes, turn it off'}
            </button>
          </div>
        }
      >
        <p className="text-gray-600">
          {confirmEnabled
            ? `Turn on the store page for #${storeNumber}? Customers who scan the code will see it within 15 minutes.`
            : `Turn off the store page for #${storeNumber}? Customers who scan the code will stop seeing it within 15 minutes.`}
        </p>
      </Dialog>

      <Dialog
        isOpen={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request a review link change"
        size="sm"
        footer={
          <div className="flex gap-3">
            <button type="button" onClick={() => setRequestOpen(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium min-h-[44px]">
              Cancel
            </button>
            <button type="button" onClick={() => void submitRequest()} disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium min-h-[44px]">
              Send request
            </button>
          </div>
        }
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitRequest();
          }}
        >
          <FormField id="request-review-url" label="Review link" error={requestError || undefined}>
            <input
              id="request-review-url"
              value={requestUrl}
              onChange={(event) => setRequestUrl(event.target.value)}
              aria-invalid={!!requestError}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg min-h-[44px]"
            />
          </FormField>
          <FormField id="request-review-note" label="Note">
            <textarea
              id="request-review-note"
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </FormField>
        </form>
      </Dialog>
    </div>
  );
}
