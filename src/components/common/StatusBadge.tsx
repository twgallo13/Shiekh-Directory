import React from 'react';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  AlertOctagon, 
  Hammer, 
  Wrench, 
  Truck, 
  XCircle, 
  Eye, 
  Check, 
  Sparkles,
  Lock,
  ShieldCheck,
  HelpCircle
} from 'lucide-react';
import { OperationalStatus, RequestStatus, ContactPrivacyLevel, RecordLifecycleStatus } from '../../types';

interface OperationalStatusBadgeProps {
  status: OperationalStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export const OperationalStatusBadge: React.FC<OperationalStatusBadgeProps> = ({ 
  status, 
  size = 'md',
  className = '' 
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'Open — Normal Operations':
        return {
          icon: CheckCircle2,
          text: 'Open — Normal Operations',
          shortText: 'Open',
          style: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
          iconColor: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'Opening Soon':
        return {
          icon: Sparkles,
          text: 'Opening Soon',
          shortText: 'Opening Soon',
          style: 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950/70 dark:text-sky-200 dark:border-sky-800',
          iconColor: 'text-sky-600 dark:text-sky-400',
        };
      case 'Modified Hours':
        return {
          icon: Clock,
          text: 'Modified Hours',
          shortText: 'Modified Hours',
          style: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
          iconColor: 'text-amber-600 dark:text-amber-400',
        };
      case 'Under Remodel':
        return {
          icon: Hammer,
          text: 'Under Remodel',
          shortText: 'Remodel',
          style: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-800',
          iconColor: 'text-purple-600 dark:text-purple-400',
        };
      case 'Maintenance / Repair Issue':
        return {
          icon: Wrench,
          text: 'Maintenance / Repair Issue',
          shortText: 'Maintenance',
          style: 'bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/70 dark:text-orange-200 dark:border-orange-800',
          iconColor: 'text-orange-600 dark:text-orange-400',
        };
      case 'Relocating':
        return {
          icon: Truck,
          text: 'Relocating',
          shortText: 'Relocating',
          style: 'bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-800',
          iconColor: 'text-indigo-600 dark:text-indigo-400',
        };
      case 'Closing':
        return {
          icon: AlertTriangle,
          text: 'Closing Soon',
          shortText: 'Closing',
          style: 'bg-amber-200 text-amber-950 border-amber-400 dark:bg-amber-900/60 dark:text-amber-100 dark:border-amber-700',
          iconColor: 'text-amber-700 dark:text-amber-300',
        };
      case 'Temporarily Closed':
        return {
          icon: AlertOctagon,
          text: 'Temporarily Closed',
          shortText: 'Temp Closed',
          style: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800',
          iconColor: 'text-rose-600 dark:text-rose-400',
        };
      case 'Permanently Closed':
        return {
          icon: XCircle,
          text: 'Permanently Closed',
          shortText: 'Closed',
          style: 'bg-neutral-200 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
          iconColor: 'text-neutral-500',
        };
      default:
        return {
          icon: HelpCircle,
          text: String(status),
          shortText: String(status),
          style: 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700',
          iconColor: 'text-neutral-500',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const isSmall = size === 'sm';

  return (
    <span 
      className={`inline-flex items-center gap-1.5 font-bold tracking-tight rounded-md border ${config.style} ${
        isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      } ${className}`}
      title={`Operational Status: ${config.text}`}
    >
      <Icon className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${config.iconColor} shrink-0`} />
      <span className="whitespace-nowrap">{isSmall ? config.shortText : config.text}</span>
    </span>
  );
};

interface RequestStatusBadgeProps {
  status: RequestStatus;
  size?: 'sm' | 'md';
  className?: string;
}

export const RequestStatusBadge: React.FC<RequestStatusBadgeProps> = ({
  status,
  size = 'md',
  className = ''
}) => {
  const getConfig = () => {
    switch (status) {
      case 'Submitted':
        return {
          icon: Clock,
          text: 'Submitted',
          style: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
          iconColor: 'text-amber-600 dark:text-amber-400',
        };
      case 'Under Review':
        return {
          icon: Eye,
          text: 'Under Review',
          style: 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-800',
          iconColor: 'text-blue-600 dark:text-blue-400',
        };
      case 'Approved':
        return {
          icon: CheckCircle2,
          text: 'Approved',
          style: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
          iconColor: 'text-emerald-600 dark:text-emerald-400',
        };
      case 'Completed':
        return {
          icon: Check,
          text: 'Completed',
          style: 'bg-neutral-100 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700',
          iconColor: 'text-neutral-600 dark:text-neutral-400',
        };
      case 'Rejected':
        return {
          icon: XCircle,
          text: 'Rejected',
          style: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-800',
          iconColor: 'text-rose-600 dark:text-rose-400',
        };
      case 'Data Conflict':
        return {
          icon: AlertTriangle,
          text: 'Data Conflict',
          style: 'bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/70 dark:text-purple-200 dark:border-purple-800',
          iconColor: 'text-purple-600 dark:text-purple-400',
        };
      default:
        return {
          icon: Clock,
          text: String(status),
          style: 'bg-neutral-100 text-neutral-800 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:border-neutral-700',
          iconColor: 'text-neutral-500',
        };
    }
  };

  const config = getConfig();
  const Icon = config.icon;
  const isSmall = size === 'sm';

  return (
    <span 
      className={`inline-flex items-center gap-1.5 font-bold tracking-tight rounded-md border ${config.style} ${
        isSmall ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      } ${className}`}
      title={`Workflow Status: ${config.text}`}
    >
      <Icon className={`${isSmall ? 'w-3 h-3' : 'w-3.5 h-3.5'} ${config.iconColor} shrink-0`} />
      <span className="whitespace-nowrap">{config.text}</span>
    </span>
  );
};

interface PrivacyBadgeProps {
  visibility?: ContactPrivacyLevel;
  isVerified?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export const PrivacyBadge: React.FC<PrivacyBadgeProps> = ({
  visibility = 'Directory Public',
  isVerified = true,
  size = 'sm',
  className = ''
}) => {
  const isPending = visibility === 'Pending Review' || !isVerified;
  const isRestricted = visibility === 'Internal Management Only';

  if (!isPending && !isRestricted) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded px-1.5 py-0.5 text-[10px] ${className}`}
        title="Verified Internal Directory Public Contact"
      >
        <ShieldCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
        <span>Verified Public</span>
      </span>
    );
  }

  if (isPending) {
    return (
      <span 
        className={`inline-flex items-center gap-1 font-bold text-amber-800 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded px-1.5 py-0.5 text-[10px] ${className}`}
        title="Quarantined contact imported from CSV or unverified; Pending Data Steward Review"
      >
        <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
        <span>Pending Review</span>
      </span>
    );
  }

  return (
    <span 
      className={`inline-flex items-center gap-1 font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-100 dark:bg-indigo-950/60 border border-indigo-300 dark:border-indigo-800 rounded px-1.5 py-0.5 text-[10px] ${className}`}
      title="Restricted: Internal Leadership & Management Only"
    >
      <Lock className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
      <span>Management Only</span>
    </span>
  );
};
