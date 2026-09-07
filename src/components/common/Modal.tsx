import React, { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

interface ModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  size?: ModalSize;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  bodyClassName?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  title,
  description,
  icon,
  size = 'md',
  onClose,
  children,
  footer,
  bodyClassName = '',
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl ${sizeClasses[size]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-neutral-200 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <div className="mt-0.5 shrink-0 text-red-700">{icon}</div>}
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-neutral-900">{title}</h2>
              {description && <p id={descriptionId} className="mt-0.5 text-sm text-neutral-500">{description}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto p-5 ${bodyClassName}`}>{children}</div>
        {footer && <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
};