import React, { useState } from 'react';
import { 
  Key, 
  Plus, 
  RotateCw, 
  Trash2, 
  Check, 
  Copy, 
  Eye, 
  EyeOff, 
  Shield, 
  ShieldAlert, 
  Activity, 
  Globe, 
  Database, 
  Code2, 
  Terminal, 
  CheckCircle2, 
  AlertTriangle,
  Server,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { ApiClient, ApiScope } from '../../types';

const AVAILABLE_SCOPES: { id: ApiScope; label: string; description: string; category: string }[] = [
  { 
    id: 'locations:read', 
    label: 'locations:read', 
    description: 'Query authoritative store locations, operating hours, addresses, and timezone metadata.',
    category: 'Store Locations'
  },
  { 
    id: 'locations:write', 
    label: 'locations:write', 
    description: 'Submit administrative operational notices, status updates, and emergency hour overrides.',
    category: 'Store Locations'
  },
  { 
    id: 'personnel:read', 
    label: 'personnel:read', 
    description: 'Read directory personnel records (Store Managers, Assistant Managers, District Managers).',
    category: 'Personnel'
  },
  { 
    id: 'contacts:directory', 
    label: 'contacts:directory', 
    description: 'Access direct executive emails, mobile work phone numbers, and emergency contact details.',
    category: 'Personnel'
  },
  { 
    id: 'notices:read', 
    label: 'notices:read', 
    description: 'Query active store remodel notices, emergency closures, and temporary operating schedules.',
    category: 'Alerts & Notices'
  },
  { 
    id: 'exports:csv', 
    label: 'exports:csv', 
    description: 'Execute automated headless CSV data exports for external ERP and data warehouse ingestion.',
    category: 'Data Export'
  },
];

export const ApiClientsPanel: React.FC = () => {
  const { 
    apiClients, 
    addApiClient, 
    rotateApiKey, 
    revokeApiClient, 
    triggerApiSync, 
    locations, 
    people 
  } = useDirectory();

  // Modal / Form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientDesc, setClientDesc] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>(['locations:read', 'notices:read']);
  const [rateLimit, setRateLimit] = useState(300);

  // Newly Created One-Time Token Banner
  const [createdTokenNotice, setCreatedTokenNotice] = useState<{ clientName: string; token: string } | null>(null);

  // Rotation Confirmation Modal
  const [rotatingClient, setRotatingClient] = useState<ApiClient | null>(null);
  const [rotatedTokenNotice, setRotatedTokenNotice] = useState<{ clientName: string; token: string } | null>(null);

  // Revocation Confirmation
  const [revokingClient, setRevokingClient] = useState<ApiClient | null>(null);

  // Endpoint Explorer Interactive Test State
  const [selectedEndpoint, setSelectedEndpoint] = useState<'all-locations' | 'single-location' | 'personnel'>('all-locations');
  const [testStoreNumber, setTestStoreNumber] = useState('7');
  const [testTokenId, setTestTokenId] = useState<string>(apiClients[0]?.id || '');
  const [isSimulatingRequest, setIsSimulatingRequest] = useState(false);
  const [copiedString, setCopiedString] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'clients' | 'explorer'>('clients');

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedString(id);
    setTimeout(() => setCopiedString(null), 2500);
  };

  const handleToggleScope = (scope: ApiScope) => {
    if (selectedScopes.includes(scope)) {
      if (selectedScopes.length === 1) return; // Must have at least 1 scope
      setSelectedScopes(selectedScopes.filter(s => s !== scope));
    } else {
      setSelectedScopes([...selectedScopes, scope]);
    }
  };

  const handleCreateClient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    const result = addApiClient({
      name: clientName.trim(),
      description: clientDesc.trim() || 'Service account integration client.',
      scopes: selectedScopes,
      rateLimitPerMinute: Number(rateLimit) || 300,
      status: 'Active',
    });

    setCreatedTokenNotice({
      clientName: result.client.name,
      token: result.plainTextKey,
    });

    // Reset Form
    setClientName('');
    setClientDesc('');
    setSelectedScopes(['locations:read', 'notices:read']);
    setRateLimit(300);
    setShowCreateModal(false);
  };

  const handleConfirmRotate = () => {
    if (!rotatingClient) return;
    const result = rotateApiKey(rotatingClient.id);
    setRotatedTokenNotice({
      clientName: rotatingClient.name,
      token: result.newKey,
    });
    setRotatingClient(null);
  };

  const handleConfirmRevoke = () => {
    if (!revokingClient) return;
    revokeApiClient(revokingClient.id);
    setRevokingClient(null);
  };

  // Mock API Response Payload Generator (Section 14)
  const currentSelectedClient = apiClients.find(c => c.id === testTokenId) || apiClients[0];
  const hasLocationScope = currentSelectedClient?.scopes.includes('locations:read');
  const hasPersonnelScope = currentSelectedClient?.scopes.includes('personnel:read') || currentSelectedClient?.scopes.includes('contacts:directory');

  const getMockApiResponse = () => {
    const timestamp = new Date().toISOString();
    
    if (currentSelectedClient?.status === 'Revoked') {
      return {
        status: 401,
        error: 'Unauthorized',
        message: 'The provided API Bearer token has been revoked by an administrator.',
        timestamp
      };
    }

    if (selectedEndpoint === 'all-locations') {
      if (!hasLocationScope) {
        return {
          status: 403,
          error: 'Forbidden',
          message: 'Client token lacks required scope [locations:read].',
          provided_scopes: currentSelectedClient?.scopes || [],
          timestamp
        };
      }
      return {
        status: 200,
        api_version: 'v1',
        source_of_truth: 'Shiekh Shoes Master Directory System of Record',
        environment: 'PRODUCTION',
        last_updated: locations.reduce((max, l) => l.lastUpdated > max ? l.lastUpdated : max, locations[0]?.lastUpdated || timestamp),
        total_records: locations.length,
        data: locations.slice(0, 5).map(loc => ({
          location_id: loc.id,
          store_number: loc.storeNumber,
          name: loc.name,
          type: loc.type,
          mall_name: loc.mallOrCenterName || null,
          address: {
            street: loc.address,
            city: loc.city,
            state: loc.state,
            postal_code: loc.zipCode,
            country: 'US',
            timezone: loc.timeZone,
            coordinates: loc.coordinates || null,
          },
          contact: {
            store_phone: loc.phone,
            store_manager: loc.storeManagerName || null,
            district_manager: loc.districtManagerName || null,
            district: loc.district || null,
          },
          status: {
            operational_status: loc.operationalStatus,
            lifecycle: loc.recordStatus,
            active_notice: loc.activeNotice ? {
              reason: loc.activeNotice.shortDescription,
              effective_date: loc.activeNotice.effectiveDate
            } : null
          },
          last_updated: loc.lastUpdated,
          last_verified_at: loc.lastVerifiedDate
        })),
        _pagination: {
          page: 1,
          limit: 5,
          total_pages: Math.ceil(locations.length / 5),
          next_page: '/api/v1/locations?page=2&limit=5'
        }
      };
    }

    if (selectedEndpoint === 'single-location') {
      if (!hasLocationScope) {
        return {
          status: 403,
          error: 'Forbidden',
          message: 'Client token lacks required scope [locations:read].',
          timestamp
        };
      }
      const loc = locations.find(l => l.storeNumber.trim() === testStoreNumber.trim()) || locations[0];
      return {
        status: 200,
        api_version: 'v1',
        source_of_truth: 'Shiekh Shoes Master Directory SoR',
        environment: 'PRODUCTION',
        last_updated: loc.lastUpdated,
        data: {
          location_id: loc.id,
          store_number: loc.storeNumber,
          name: loc.name,
          type: loc.type,
          mall_name: loc.mallOrCenterName || null,
          address: {
            street: loc.address,
            city: loc.city,
            state: loc.state,
            postal_code: loc.zipCode,
            timezone: loc.timeZone,
          },
          store_phone: loc.phone,
          management: {
            store_manager: loc.storeManagerName,
            store_manager_phone: loc.storeManagerPhone,
            district_manager: loc.districtManagerName,
            district: loc.district,
          },
          standard_hours: loc.standardHours,
          special_overrides: loc.specialHours,
          holiday_schedule: loc.holidayHours,
          operational_status: loc.operationalStatus,
          active_notice: loc.activeNotice || null,
          last_verified: {
            date: loc.lastVerifiedDate,
            verified_by: loc.verifiedBy
          },
          last_updated: loc.lastUpdated
        }
      };
    }

    if (selectedEndpoint === 'personnel') {
      if (!hasPersonnelScope) {
        return {
          status: 403,
          error: 'Forbidden',
          message: 'Client token lacks required scope [personnel:read] or [contacts:directory].',
          provided_scopes: currentSelectedClient?.scopes || [],
          timestamp
        };
      }
      return {
        status: 200,
        api_version: 'v1',
        source_of_truth: 'Shiekh Shoes Master Directory SoR',
        total_records: people.length,
        last_updated: timestamp,
        data: people.slice(0, 5).map(p => ({
          person_id: p.id,
          full_name: p.name,
          job_title: p.jobTitle,
          department: p.department,
          work_phone: p.workPhone,
          work_email: p.workEmail,
          assigned_district: p.district || null,
          active_status: p.activeStatus,
          is_temporary: p.isTemporary || false
        }))
      };
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-header Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-neutral-900 p-5 rounded-xl border border-neutral-200 dark:border-neutral-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-red-600" />
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Internal Store Directory API & Service Accounts (Sec 14)
            </h2>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Authoritative REST endpoints and granular OAuth-style scoped Bearer tokens for downstream services (Shiekh.com, POS, ERP).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setActiveTab('clients')}
              className={`px-3 py-1.5 rounded-md transition-all ${
                activeTab === 'clients' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs' : 'text-neutral-500'
              }`}
            >
              Service Accounts ({apiClients.length})
            </button>
            <button
              onClick={() => setActiveTab('explorer')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 ${
                activeTab === 'explorer' ? 'bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-2xs' : 'text-neutral-500'
              }`}
            >
              <Terminal className="w-3.5 h-3.5 text-red-600" />
              <span>API Explorer (v1)</span>
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Generate Token</span>
          </button>
        </div>
      </div>

      {/* ONE-TIME TOKEN REVEAL BANNER */}
      {createdTokenNotice && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/50 border-2 border-emerald-500/50 rounded-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>API Service Token Created for "{createdTokenNotice.clientName}"</span>
            </div>
            <button
              onClick={() => setCreatedTokenNotice(null)}
              className="text-xs text-neutral-400 hover:text-neutral-600 font-semibold"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            <strong>Security Notice:</strong> Copy this secret key now. Following industry best-practices, this plain-text secret token is hashed and will <em>never be displayed again</em>.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-2.5 bg-white dark:bg-neutral-900 border border-emerald-300 dark:border-emerald-800 rounded-lg font-mono text-xs text-emerald-900 dark:text-emerald-200 break-all select-all font-bold">
              {createdTokenNotice.token}
            </div>
            <button
              onClick={() => handleCopy(createdTokenNotice.token, 'new-token')}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              {copiedString === 'new-token' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedString === 'new-token' ? 'Copied!' : 'Copy Secret Key'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ROTATED TOKEN REVEAL BANNER */}
      {rotatedTokenNotice && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-500/50 rounded-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-sm">
              <RotateCw className="w-5 h-5 text-amber-600 shrink-0" />
              <span>New API Secret Key Rotated for "{rotatedTokenNotice.clientName}"</span>
            </div>
            <button
              onClick={() => setRotatedTokenNotice(null)}
              className="text-xs text-neutral-400 hover:text-neutral-600 font-semibold"
            >
              Dismiss
            </button>
          </div>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            The previous API key was immediately invalidated. Update your client application headers with this new token.
          </p>
          <div className="flex items-center gap-2">
            <div className="flex-1 p-2.5 bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-800 rounded-lg font-mono text-xs text-amber-900 dark:text-amber-200 break-all select-all font-bold">
              {rotatedTokenNotice.token}
            </div>
            <button
              onClick={() => handleCopy(rotatedTokenNotice.token, 'rotated-token')}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs"
            >
              {copiedString === 'rotated-token' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedString === 'rotated-token' ? 'Copied!' : 'Copy New Key'}</span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'clients' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {apiClients.map(client => {
              const isRevoked = client.status === 'Revoked';
              return (
                <div
                  key={client.id}
                  className={`bg-white dark:bg-neutral-900 rounded-xl border ${
                    isRevoked ? 'border-neutral-300 dark:border-neutral-800 opacity-60' : 'border-neutral-200 dark:border-neutral-800 shadow-xs'
                  } p-5 flex flex-col justify-between space-y-4 text-xs`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                            {client.name}
                          </span>
                        </div>
                        <p className="text-neutral-500 text-[11px] mt-0.5">
                          {client.description}
                        </p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase shrink-0 ${
                        isRevoked 
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300' 
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}>
                        {client.status}
                      </span>
                    </div>

                    {/* Token Mask */}
                    <div className="p-2.5 bg-neutral-50 dark:bg-neutral-800/80 rounded-lg border border-neutral-200 dark:border-neutral-700/60 font-mono text-[11px] text-neutral-600 dark:text-neutral-300 flex items-center justify-between">
                      <div className="flex items-center gap-2 truncate">
                        <Key className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span className="truncate">
                          {client.apiKey.substring(0, 12)}••••••••••••••••
                        </span>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 bg-neutral-200 dark:bg-neutral-700 rounded text-neutral-600 dark:text-neutral-400 font-semibold shrink-0">
                        Bearer
                      </span>
                    </div>

                    {/* Scopes Badges */}
                    <div className="space-y-1">
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
                        Authorized Scopes ({client.scopes.length})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {client.scopes.map(s => (
                          <span
                            key={s}
                            className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded text-[10px] font-mono font-medium text-neutral-700 dark:text-neutral-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Rate limit and usage metadata */}
                    <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 grid grid-cols-2 gap-2 text-[11px] text-neutral-500">
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Rate Limit:</span>
                        <span className="font-semibold text-neutral-700 dark:text-neutral-300">{client.rateLimitPerMinute} req/min</span>
                      </div>
                      <div>
                        <span className="text-neutral-400 block text-[10px]">Last Query:</span>
                        <span className="font-mono text-neutral-700 dark:text-neutral-300">
                          {client.lastUsedAt ? new Date(client.lastUsedAt).toLocaleTimeString() : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                    {!isRevoked ? (
                      <>
                        <button
                          onClick={() => setRotatingClient(client)}
                          className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded font-semibold text-xs flex items-center gap-1.5 transition-colors"
                          title="Generate a new secret token and invalidate previous key"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Rotate Key</span>
                        </button>

                        <button
                          onClick={() => setRevokingClient(client)}
                          className="px-2.5 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded font-semibold text-xs flex items-center gap-1.5 transition-colors"
                          title="Revoke access token immediately"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Revoke</span>
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-neutral-400 italic">
                        Revoked on {new Date(client.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INTERACTIVE API EXPLORER TAB (v1 Versioned Endpoints) */}
      {activeTab === 'explorer' && (
        <div className="space-y-5">
          <div className="bg-neutral-900 text-neutral-100 p-5 rounded-xl border border-neutral-800 shadow-md space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
              <div className="flex items-center gap-2">
                <div className="px-2 py-0.5 rounded bg-red-600 text-white font-mono font-bold text-xs">
                  REST API v1
                </div>
                <h3 className="font-bold text-sm text-neutral-100">
                  Dynamic Store Directory HTTP Endpoint Inspector
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">Authenticated Client:</span>
                <select
                  value={testTokenId}
                  onChange={e => setTestTokenId(e.target.value)}
                  className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs text-neutral-200 font-medium"
                >
                  {apiClients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Endpoint Selector Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedEndpoint('all-locations')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all ${
                  selectedEndpoint === 'all-locations' 
                    ? 'bg-neutral-800 text-red-400 border border-red-500/50' 
                    : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                }`}
              >
                <span className="text-emerald-400 font-bold">GET</span>
                <span>/api/v1/locations</span>
              </button>

              <button
                onClick={() => setSelectedEndpoint('single-location')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all ${
                  selectedEndpoint === 'single-location' 
                    ? 'bg-neutral-800 text-red-400 border border-red-500/50' 
                    : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                }`}
              >
                <span className="text-emerald-400 font-bold">GET</span>
                <span>/api/v1/locations/store/{'{store_number}'}</span>
              </button>

              <button
                onClick={() => setSelectedEndpoint('personnel')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium flex items-center gap-2 transition-all ${
                  selectedEndpoint === 'personnel' 
                    ? 'bg-neutral-800 text-red-400 border border-red-500/50' 
                    : 'bg-neutral-950 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                }`}
              >
                <span className="text-emerald-400 font-bold">GET</span>
                <span>/api/v1/personnel</span>
              </button>
            </div>

            {/* Path Parameters if single location */}
            {selectedEndpoint === 'single-location' && (
              <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 flex items-center gap-3 text-xs">
                <span className="text-neutral-400 font-mono">Store Number Param:</span>
                <select
                  value={testStoreNumber}
                  onChange={e => setTestStoreNumber(e.target.value)}
                  className="px-2.5 py-1 bg-neutral-800 border border-neutral-700 rounded text-neutral-200 font-mono"
                >
                  {locations.slice(0, 15).map(l => (
                    <option key={l.id} value={l.storeNumber}>
                      Store #{l.storeNumber} — {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Request Headers and Authorization */}
            <div className="p-3 bg-neutral-950 rounded-lg border border-neutral-800 text-xs font-mono space-y-1 text-neutral-300">
              <div className="text-neutral-500 font-sans font-bold text-[10px] uppercase">
                Constructed HTTP Request Headers
              </div>
              <div>
                <span className="text-neutral-500">Host:</span> api.shiekhshoes.com
              </div>
              <div>
                <span className="text-neutral-500">Authorization:</span> Bearer {currentSelectedClient?.apiKey || 'shk_live_••••••••'}
              </div>
              <div>
                <span className="text-neutral-500">Accept:</span> application/json
              </div>
            </div>

            {/* Live Response Code Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-400 font-mono">Response Payload:</span>
                  <span className="px-2 py-0.5 bg-emerald-950 text-emerald-400 rounded font-mono font-bold text-[11px] border border-emerald-800">
                    HTTP 200 OK
                  </span>
                  <span className="text-neutral-500 text-[11px]">
                    latency: 14ms · application/json
                  </span>
                </div>

                <button
                  onClick={() => handleCopy(JSON.stringify(getMockApiResponse(), null, 2), 'response-payload')}
                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded font-semibold text-[11px] flex items-center gap-1 transition-colors"
                >
                  {copiedString === 'response-payload' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedString === 'response-payload' ? 'Copied JSON' : 'Copy JSON'}</span>
                </button>
              </div>

              <pre className="p-4 bg-black/90 rounded-xl border border-neutral-800 text-xs font-mono text-emerald-400 overflow-x-auto max-h-96 leading-relaxed select-all">
                {JSON.stringify(getMockApiResponse(), null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* CREATE API CLIENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-red-600" />
                <h3 className="font-bold text-base text-neutral-900 dark:text-neutral-100">
                  Provision New API Service Account Token
                </h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClient} className="space-y-4 text-xs">
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                  Service / Consumer Name *
                </label>
                <input
                  type="text"
                  required
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                  placeholder="e.g. Shiekh.com Store Locator Webhook"
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                  Purpose / Description
                </label>
                <textarea
                  rows={2}
                  value={clientDesc}
                  onChange={e => setClientDesc(e.target.value)}
                  placeholder="e.g. Ingests store hours and notices for customer map search."
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs"
                />
              </div>

              {/* Scopes Selection (Least Privilege) */}
              <div className="space-y-2">
                <label className="block text-neutral-700 dark:text-neutral-300 font-semibold">
                  Least-Privilege API Scopes *
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {AVAILABLE_SCOPES.map(sc => {
                    const isChecked = selectedScopes.includes(sc.id);
                    return (
                      <div
                        key={sc.id}
                        onClick={() => handleToggleScope(sc.id)}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-start gap-2.5 ${
                          isChecked 
                            ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20' 
                            : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleScope(sc.id)}
                          className="mt-0.5 rounded text-red-600 focus:ring-red-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-[11px] text-neutral-900 dark:text-neutral-100">
                              {sc.label}
                            </span>
                            <span className="text-[10px] text-neutral-400">
                              {sc.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-neutral-500 mt-0.5">
                            {sc.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rate Limit */}
              <div>
                <label className="block text-neutral-700 dark:text-neutral-300 font-semibold mb-1">
                  Rate Limit (Requests per Minute)
                </label>
                <select
                  value={rateLimit}
                  onChange={e => setRateLimit(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs font-semibold"
                >
                  <option value={100}>100 req/min (Standard)</option>
                  <option value={300}>300 req/min (High-Volume POS)</option>
                  <option value={600}>600 req/min (E-commerce Web App)</option>
                  <option value={1200}>1200 req/min (Data Warehouse Ingestion)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-xs"
                >
                  Generate Secret Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ROTATE KEY CONFIRMATION MODAL */}
      {rotatingClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-600">
              <RotateCw className="w-5 h-5" />
              <h3 className="font-bold text-base">Rotate API Secret Key?</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              This will immediately invalidate the current Bearer token for <strong>{rotatingClient.name}</strong> and issue a brand-new cryptographic token.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRotatingClient(null)}
                className="px-3.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRotate}
                className="px-4 py-1.5 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700 shadow-xs"
              >
                Rotate Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVOKE KEY CONFIRMATION MODAL */}
      {revokingClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="font-bold text-base">Revoke Service Account Token?</h3>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Are you sure you want to permanently revoke API access for <strong>{revokingClient.name}</strong>? Any automated workflows using this token will fail immediately with HTTP 401 Unauthorized.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRevokingClient(null)}
                className="px-3.5 py-1.5 bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 rounded text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                className="px-4 py-1.5 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 shadow-xs"
              >
                Revoke Token
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
