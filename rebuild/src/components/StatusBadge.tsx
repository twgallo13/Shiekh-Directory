import type { OperatingState } from '../types';

interface StatusBadgeProps {
  status: OperatingState;
  large?: boolean;
}

export function StatusBadge({ status, large }: StatusBadgeProps) {
  const baseClasses = 'inline-flex items-center font-medium rounded-full';
  const sizeClasses = large ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  
  let colorClasses: string;
  
  switch (status) {
    case 'Open':
      colorClasses = 'bg-green-100 text-green-800';
      break;
    case 'Closed':
      colorClasses = 'bg-red-100 text-red-800';
      break;
    case 'Unknown':
    default:
      colorClasses = 'bg-yellow-100 text-yellow-800';
      break;
  }
  
  return (
    <span className={`${baseClasses} ${sizeClasses} ${colorClasses}`}>
      {status}
    </span>
  );
}
