import type { AssignmentCapacity, PositionStatus } from '../types';

interface CapacityBadgeProps {
  capacity: AssignmentCapacity;
  className?: string;
}

export function CapacityBadge({ capacity, className = '' }: CapacityBadgeProps) {
  if (capacity === 'primary') return null;
  
  const badges = {
    training: { label: 'In Training', bg: 'bg-blue-100', text: 'text-blue-700' },
    acting: { label: 'Acting', bg: 'bg-amber-100', text: 'text-amber-700' },
  };
  
  const badge = badges[capacity];
  if (!badge) return null;
  
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${badge.bg} ${badge.text} ${className}`}>
      {badge.label}
    </span>
  );
}

interface VacantBadgeProps {
  className?: string;
}

export function VacantBadge({ className = '' }: VacantBadgeProps) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700 ${className}`}>
      Vacant
    </span>
  );
}

interface PositionStatusBadgeProps {
  status: PositionStatus;
  capacity?: AssignmentCapacity;
  className?: string;
}

export function PositionStatusBadge({ status, capacity, className = '' }: PositionStatusBadgeProps) {
  if (status === 'vacant') {
    return <VacantBadge className={className} />;
  }
  
  if (capacity && capacity !== 'primary') {
    return <CapacityBadge capacity={capacity} className={className} />;
  }
  
  return null;
}
