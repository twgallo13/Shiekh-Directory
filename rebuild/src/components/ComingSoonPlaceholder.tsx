import { Clock } from 'lucide-react';

interface ComingSoonPlaceholderProps {
  title: string;
  description: string;
  className?: string;
}

export function ComingSoonPlaceholder({ title, description, className = '' }: ComingSoonPlaceholderProps) {
  return (
    <div className={`bg-gray-50 border border-gray-200 border-dashed rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Clock className="w-5 h-5 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-gray-700">{title}</h3>
            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
              Planned
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function ComingSoonSection({ title, description, className = '' }: ComingSoonPlaceholderProps) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gray-100 rounded-lg">
          <Clock className="w-5 h-5 text-gray-400" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-700">{title}</h2>
          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
            Planned
          </span>
        </div>
      </div>
      <p className="text-gray-500">{description}</p>
    </div>
  );
}
