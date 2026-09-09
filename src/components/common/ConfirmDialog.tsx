import React, { useId, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'danger',
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, onCancel, dialogRef, cancelButtonRef);

  if (!isOpen) return null;

  const confirmClassName = tone === 'danger'
    ? 'bg-red-700 hover:bg-red-800 focus-visible:ring-red-600'
    : 'bg-neutral-900 hover:bg-neutral-800 focus-visible:ring-neutral-700';
  const iconClassName = tone === 'danger'
    ? 'bg-red-50 text-red-700'
    : 'bg-neutral-100 text-neutral-700';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-2xl"
      >
        <div className="flex items-start gap-3 p-5">
          <div className={`mt-0.5 rounded-full p-2 ${iconClassName}`}>
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-neutral-900">
              {title}
            </h2>
            <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-neutral-600">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close confirmation"
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-5 py-4">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${confirmClassName}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};