import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog } from '../Dialog';

/**
 * Admin unsaved-changes guard.
 *
 * Sections that keep a draft until Save call useAdminUnsavedChanges(isDirty).
 * While any section is dirty, moving to another Admin section (menu, phone list,
 * or the "Admin" back button) asks first. Refresh / closing the tab uses the
 * browser's own beforeunload prompt.
 *
 * Known limit (tracked follow-up): the app uses BrowserRouter, so the browser's
 * own Back button and top-bar links that leave Admin are not intercepted yet.
 */
export const UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Leave without saving, or stay and save.';

interface UnsavedContextValue {
  setDirty: (key: string, dirty: boolean) => void;
  requestNavigate: (to: string) => void;
}

const UnsavedContext = createContext<UnsavedContextValue | null>(null);

export function AdminUnsavedChangesProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const dirtyKeys = useRef<Set<string>>(new Set());
  const [pendingTo, setPendingTo] = useState<string | null>(null);
  const stayRef = useRef<HTMLButtonElement>(null);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
  }, []);

  const requestNavigate = useCallback((to: string) => {
    if (dirtyKeys.current.size > 0) {
      setPendingTo(to);
      return;
    }
    navigate(to);
  }, [navigate]);

  // Stay is the default (safe) choice: focus it after the Dialog's own focus step.
  useEffect(() => {
    if (!pendingTo) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => stayRef.current?.focus());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pendingTo]);

  const stay = useCallback(() => setPendingTo(null), []);
  const leave = useCallback(() => {
    const to = pendingTo;
    setPendingTo(null);
    dirtyKeys.current.clear();
    if (to) navigate(to);
  }, [navigate, pendingTo]);

  const value = useMemo(() => ({ setDirty, requestNavigate }), [setDirty, requestNavigate]);

  return (
    <UnsavedContext.Provider value={value}>
      {children}
      <Dialog
        isOpen={pendingTo !== null}
        onClose={stay}
        title="Unsaved changes"
        size="sm"
        footer={
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 w-full">
            <button
              type="button"
              onClick={leave}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 min-h-[44px]"
            >
              Leave without saving
            </button>
            <button
              ref={stayRef}
              type="button"
              onClick={stay}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 min-h-[44px]"
            >
              Stay
            </button>
          </div>
        }
      >
        <p className="text-sm text-gray-700">{UNSAVED_CHANGES_MESSAGE}</p>
      </Dialog>
    </UnsavedContext.Provider>
  );
}

/** Navigate inside Admin, asking first if a section has unsaved changes. Falls back to plain navigate outside the provider. */
export function useAdminNavigate(): (to: string) => void {
  const ctx = useContext(UnsavedContext);
  const navigate = useNavigate();
  return ctx ? ctx.requestNavigate : navigate;
}

/** Report this section's unsaved state. Also adds the browser refresh/close prompt while dirty. */
export function useAdminUnsavedChanges(isDirty: boolean): void {
  const ctx = useContext(UnsavedContext);
  const key = useId();

  useEffect(() => {
    if (!ctx) return;
    ctx.setDirty(key, isDirty);
    return () => ctx.setDirty(key, false);
  }, [ctx, key, isDirty]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}
