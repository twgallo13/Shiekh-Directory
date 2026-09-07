import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}) => (
  <div className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-center ${compact ? 'px-5 py-6' : 'px-6 py-10'}`}>
    <div className="mb-3 rounded-full border border-neutral-200 bg-white p-2.5 text-neutral-400 shadow-xs">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
    <h3 className="text-sm font-semibold text-neutral-800">{title}</h3>
    {description && <p className="mt-1 max-w-md text-sm leading-5 text-neutral-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);