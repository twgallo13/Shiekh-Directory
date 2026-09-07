import React from 'react';
import { OperationalStatus, ContactPrivacyLevel, RecordStatus } from '../../types';

export const OperationalStatusBadge: React.FC<{ status: OperationalStatus }> = ({ status }) => {
  switch (status) {
    case 'Open — Normal Operations':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Open
        </span>
      );
    case 'Temporarily Modified Hours':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          Modified Hours
        </span>
      );
    case 'Under Remodel / Renovation':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
          Remodel
        </span>
      );
    case 'Opening Soon — New Store':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
          Opening Soon
        </span>
      );
    case 'Temporarily Closed — Emergency':
    case 'Permanently Closed':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
          Closed
        </span>
      );
  }
};

export const PrivacyBadge: React.FC<{ level?: ContactPrivacyLevel }> = ({ level = 'Public' }) => {
  if (level === 'Public') {
    return (
      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-700 border border-neutral-200">
        Public
      </span>
    );
  }
  if (level === 'Internal') {
    return (
      <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
        Internal
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
      Restricted
    </span>
  );
};
