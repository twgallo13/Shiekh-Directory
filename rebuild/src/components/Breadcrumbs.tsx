import { Link } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center text-sm ${className}`}>
      <ol className="flex items-center space-x-1 flex-wrap">
        <li>
          <Link
            to="/"
            className="text-gray-500 hover:text-gray-700 min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 lg:ml-0 lg:min-h-0 lg:min-w-0"
            aria-label="Home"
          >
            <Home className="w-4 h-4" />
          </Link>
        </li>
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
            {item.href && index < items.length - 1 ? (
              <Link
                to={item.href}
                className="ml-1 text-gray-500 hover:text-gray-700 hover:underline whitespace-nowrap"
              >
                {item.label}
              </Link>
            ) : (
              <span
                className="ml-1 text-gray-900 font-medium truncate max-w-[200px] sm:max-w-[300px]"
                aria-current="page"
              >
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
