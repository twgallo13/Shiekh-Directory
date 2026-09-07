import React from 'react';
import { OperationalStatus, ContactPrivacyLevel } from '../../types';

interface OperationalStatusBadgeProps {
  status: OperationalStatus;
  surface?: 'light' | 'dark';
}

const statusConfig: Record<OperationalStatus, {
  label: string;
  light: string;
  dark: string;
  dot: string;
  pulse?: boolean;
}> = {
  'Open — Normal Operations': {
    label: 'Open',
    light: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dark: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
    dot: 'bg-emerald-500',
    pulse: true,
  },
  'Temporarily Modified Hours': {
    label: 'Modified Hours',
    light: 'border-amber-200 bg-amber-50 text-amber-800',
    dark: 'border-amber-500/30 bg-amber-500/15 text-amber-200',
    dot: 'bg-amber-500',
  },
  'Under Remodel / Renovation': {
    label: 'Remodel',
    light: 'border-blue-200 bg-blue-50 text-blue-700',
    dark: 'border-blue-500/30 bg-blue-500/15 text-blue-200',
    dot: 'bg-blue-500',
  },
  'Opening Soon — New Store': {
    label: 'Opening Soon',
    light: 'border-violet-200 bg-violet-50 text-violet-700',
    dark: 'border-violet-500/30 bg-violet-500/15 text-violet-200',
    dot: 'bg-violet-500',
  },
  'Temporarily Closed — Emergency': {
    label: 'Emergency Closure',
    light: 'border-rose-200 bg-rose-50 text-rose-700',
    dark: 'border-rose-500/30 bg-rose-500/15 text-rose-200',
    dot: 'bg-rose-500',
  },
  'Permanently Closed': {
    label: 'Permanently Closed',
    light: 'border-rose-200 bg-rose-50 text-rose-700',
    dark: 'border-rose-500/30 bg-rose-500/15 text-rose-200',
    dot: 'bg-rose-500',
  },
};

export const OperationalStatusBadge: React.FC<OperationalStatusBadgeProps> = ({
  status,
  surface = 'light',
}) => {
  const config = statusConfig[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config[surface]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${config.pulse ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {config.label}
    </span>
  );
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
