import React, { useEffect } from 'react';
import { CircleCheck, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onDismiss, duration = 4000 }) => {
  useEffect(() => {
    const timeoutId = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[70] flex max-w-sm items-center gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-neutral-800 shadow-xl"
    >
      <CircleCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
      <span className="font-medium">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="ml-1 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
};