import React from 'react';
import { Shield, Server, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { AppEnvironment } from '../../types';

export const EnvironmentBanner: React.FC = () => {
  const { environment, setEnvironment } = useDirectory();

  const getEnvConfig = () => {
    switch (environment) {
      case 'DEVELOPMENT':
        return {
          label: 'DEV SANDBOX',
          bg: 'bg-blue-600 dark:bg-blue-700 text-white',
          desc: 'Development Sandbox · Mock feeds and localized storage isolated from live POS/Locator services.',
          badgeBg: 'bg-blue-800 text-blue-100',
        };
      case 'STAGING':
        return {
          label: 'STAGING UAT',
          bg: 'bg-amber-600 dark:bg-amber-700 text-white',
          desc: 'Staging Environment · Pre-production integration testing against staging API endpoints.',
          badgeBg: 'bg-amber-800 text-amber-100',
        };
      case 'PRODUCTION':
      default:
        return {
          label: 'PROD LIVE',
          bg: 'bg-neutral-900 dark:bg-black text-neutral-200 border-b border-neutral-800',
          desc: 'Production System of Record · Active master data source for POS, ERP, and Shiekh.com Store Locator.',
          badgeBg: 'bg-red-600 text-white',
        };
    }
  };

  const config = getEnvConfig();

  return (
    <aside aria-label="Environment Banner" className={`py-1 px-4 text-[11px] font-medium flex flex-wrap items-center justify-between gap-2 shadow-xs transition-colors ${config.bg}`}>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase tracking-wider ${config.badgeBg}`}>
          {config.label}
        </span>
        <span className="hidden sm:inline font-sans opacity-90">
          {config.desc}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="opacity-75 text-[10px] uppercase font-bold hidden md:inline">Target SoR Partition:</span>
        <select
          value={environment}
          onChange={e => setEnvironment(e.target.value as AppEnvironment)}
          className="px-2 py-0.5 rounded bg-black/40 border border-white/20 text-white font-mono text-[10px] font-bold cursor-pointer hover:bg-black/60 transition-colors"
        >
          <option value="PRODUCTION">PRODUCTION (Authoritative)</option>
          <option value="STAGING">STAGING (UAT)</option>
          <option value="DEVELOPMENT">DEVELOPMENT (Local)</option>
        </select>
      </div>
    </aside>
  );
};
