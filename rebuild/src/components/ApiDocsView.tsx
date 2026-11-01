import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  description: string;
  scope: string;
  parameters?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
    example?: string;
  }[];
  headers?: {
    name: string;
    required: boolean;
    description: string;
    example: string;
  }[];
  responseExample: string;
  notes?: string[];
}

interface ApiVersion {
  version: string;
  title: string;
  description: string;
  contractVersion?: string;
  endpoints: Endpoint[];
}

const API_VERSIONS: ApiVersion[] = [
  {
    version: 'v1',
    title: 'Location Directory API',
    description: 'Access store location data including addresses, hours, and operating status.',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v1/location-fields',
        summary: 'List Custom Fields',
        description: 'Returns all custom field definitions used across locations.',
        scope: 'locations:read',
        responseExample: `{
  "version": "abc123...",
  "fields": [
    {
      "id": "cf_001",
      "name": "Mall Contact",
      "type": "text",
      "required": false,
      "description": "Mall management contact info"
    }
  ]
}`,
      },
      {
        method: 'GET',
        path: '/api/v1/locations',
        summary: 'List Locations',
        description: 'Returns paginated list of active store locations with full details including hours and closures.',
        scope: 'locations:read',
        parameters: [
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)', example: '50' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor from previous response' },
          { name: 'updatedSince', type: 'ISO 8601 timestamp', required: false, description: 'Filter to locations updated after this time', example: '2024-01-01T00:00:00Z' },
          { name: 'kind', type: 'string', required: false, description: 'Location types to include (comma-separated: store,warehouse,office)', example: 'store' },
          { name: 'customFieldsVersion', type: 'string', required: false, description: 'Validates custom field schema hasn\'t changed' },
          { name: 'hierarchyVersion', type: 'string', required: false, description: 'Validates region/district hierarchy hasn\'t changed' },
        ],
        responseExample: `{
  "data": [
    {
      "id": "loc_abc123",
      "storeNumber": "07",
      "name": "Glendale Galleria",
      "address": "100 W Broadway",
      "city": "Glendale",
      "state": "CA",
      "zipCode": "91210",
      "timeZone": "America/Los_Angeles",
      "regionId": "reg_001",
      "regionName": "West",
      "districtId": "dist_001",
      "districtName": "LA Metro",
      "operationalStatus": "Active",
      "standardHours": {
        "monday": { "isClosed": false, "open": "10:00", "close": "21:00" }
      },
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "sync": {
    "watermark": "2024-01-15T12:00:00.000Z",
    "mode": "full",
    "customFieldsVersion": "abc...",
    "hierarchyVersion": "def..."
  },
  "pagination": { "limit": 50, "nextCursor": "..." }
}`,
        notes: [
          'Use `customFieldsVersion` and `hierarchyVersion` to detect schema changes mid-sync.',
          'The watermark should be saved and used as `updatedSince` for delta syncs.',
          'Cursor is only valid within the same snapshot window (15 minutes).',
        ],
      },
      {
        method: 'GET',
        path: '/api/v1/locations/:storeNumber',
        summary: 'Get Location by Store Number',
        description: 'Returns a single location by its store number.',
        scope: 'locations:read',
        parameters: [
          { name: 'storeNumber', type: 'string', required: true, description: 'Store number (e.g., "07" or "125")' },
        ],
        responseExample: `{
  "data": {
    "id": "loc_abc123",
    "storeNumber": "07",
    "name": "Glendale Galleria",
    ...
  },
  "customFieldsVersion": "abc...",
  "hierarchyVersion": "def..."
}`,
      },
      {
        method: 'GET',
        path: '/api/v1/locations/:storeNumber/operating-state',
        summary: 'Get Real-time Operating State',
        description: 'Returns the current open/closed state based on hours, closures, and exceptions.',
        scope: 'locations:read',
        parameters: [
          { name: 'storeNumber', type: 'string', required: true, description: 'Store number' },
        ],
        responseExample: `{
  "contract": "location-operating-state-v1",
  "data": {
    "locationId": "loc_abc123",
    "storeNumber": "07",
    "state": "Open",
    "reason": "Open until 21:00",
    "scheduleSource": "standard",
    "hours": { "open": "10:00", "close": "21:00", "isClosed": false },
    "localDate": "2024-01-15",
    "timeZone": "America/Los_Angeles",
    "evaluatedAt": "2024-01-15T18:30:00Z",
    "nextTransitionAt": null,
    "temporaryClosure": null,
    "issues": []
  }
}`,
        notes: [
          'This endpoint evaluates the current time against the schedule.',
          'For bulk operations, use the list endpoint and compute state locally.',
        ],
      },
    ],
  },
  {
    version: 'v2',
    title: 'Personnel & Staffing API',
    description: 'Access personnel records and store staffing assignments.',
    contractVersion: 'personnel-staffing-v2.1',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v2/snapshot',
        summary: 'Create Snapshot',
        description: 'Creates a point-in-time snapshot token required for personnel and staffing queries.',
        scope: 'personnel:read or staffing:read',
        responseExample: `{
  "snapshot": "eyJ2ZXJzaW9u...",
  "snapshotAt": "2024-01-15T12:00:00.000Z",
  "expiresAt": "2024-01-15T12:15:00.000Z",
  "contractVersion": "personnel-staffing-v2.1"
}`,
        notes: [
          'Snapshots expire after 15 minutes.',
          'All queries must include a valid snapshot token.',
          'If a snapshot expires mid-sync, restart from the beginning.',
        ],
      },
      {
        method: 'GET',
        path: '/api/v2/personnel',
        summary: 'List Personnel',
        description: 'Returns paginated list of active personnel with their location assignments.',
        scope: 'personnel:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token from /snapshot endpoint' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
        ],
        responseExample: `{
  "data": [
    {
      "id": "person_abc123",
      "fullName": "John Smith",
      "lifecycle": "active",
      "primaryLocationId": "loc_001",
      "supportedLocationIds": ["loc_002", "loc_003"],
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v2/personnel/:id',
        summary: 'Get Personnel by ID',
        description: 'Returns a single personnel record by canonical ID.',
        scope: 'personnel:read',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Personnel canonical ID' },
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
        ],
        responseExample: `{
  "data": {
    "id": "person_abc123",
    "fullName": "John Smith",
    ...
  },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
      {
        method: 'GET',
        path: '/api/v2/location-staffing',
        summary: 'List Location Staffing',
        description: 'Returns staffing assignments for each location including SM, ASM, DM, and key holders.',
        scope: 'staffing:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
          { name: 'kind', type: 'string', required: false, description: 'Location types (store,warehouse,office)', example: 'store' },
        ],
        responseExample: `{
  "data": [
    {
      "locationId": "loc_abc123",
      "storeNumber": "07",
      "recordStatus": "active",
      "storeManagerId": "person_001",
      "districtManagerId": "person_002",
      "assistantStoreManagerIds": ["person_003"],
      "keyHolderIds": ["person_004", "person_005"],
      "positionStatus": {
        "sm": { "status": "filled", "holders": [...] },
        "dm": { "status": "filled", "holders": [...] }
      },
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "personnel-staffing-v2.1" }
}`,
      },
    ],
  },
  {
    version: 'v3',
    title: 'District Leadership API',
    description: 'Access district management structure and leadership assignments.',
    contractVersion: 'district-leadership-v3.1',
    endpoints: [
      {
        method: 'GET',
        path: '/api/v3/snapshot',
        summary: 'Create Snapshot',
        description: 'Creates a point-in-time snapshot token for district leadership queries.',
        scope: 'district-leadership:read',
        responseExample: `{
  "snapshot": "eyJ2ZXJzaW9u...",
  "snapshotAt": "2024-01-15T12:00:00.000Z",
  "expiresAt": "2024-01-15T12:15:00.000Z",
  "contractVersion": "district-leadership-v3.1"
}`,
      },
      {
        method: 'GET',
        path: '/api/v3/district-leadership',
        summary: 'List District Leadership',
        description: 'Returns all districts with their assigned district managers.',
        scope: 'district-leadership:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size (1-100, default 50)' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
        ],
        responseExample: `{
  "data": [
    {
      "districtId": "dist_001",
      "districtName": "LA Metro",
      "recordStatus": "active",
      "regionId": "reg_001",
      "regionName": "West",
      "assignmentState": "assigned",
      "districtManager": {
        "personId": "person_001",
        "fullName": "Jane Doe",
        "lifecycle": "active",
        "workEmail": "jane.doe@shiekhshoes.com",
        "workEmailStatus": "available"
      },
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { 
    "mode": "full", 
    "snapshotAt": "...", 
    "contractVersion": "district-leadership-v3.1",
    "contactAccess": "work-email"
  }
}`,
        notes: [
          'Work email is only included if your token has the `district-leadership:contacts:read` scope.',
          'Without the contacts scope, `workEmailStatus` will be "not_granted".',
        ],
      },
      {
        method: 'GET',
        path: '/api/v3/location-districts',
        summary: 'List Location District Assignments',
        description: 'Returns region/district assignments for each location.',
        scope: 'district-leadership:read',
        parameters: [
          { name: 'snapshot', type: 'string', required: true, description: 'Snapshot token' },
          { name: 'limit', type: 'integer', required: false, description: 'Page size' },
          { name: 'cursor', type: 'string', required: false, description: 'Pagination cursor' },
          { name: 'kind', type: 'string', required: false, description: 'Location types' },
        ],
        responseExample: `{
  "data": [
    {
      "locationId": "loc_abc123",
      "storeNumber": "07",
      "recordStatus": "active",
      "locationType": "enclosed-mall",
      "regionId": "reg_001",
      "districtId": "dist_001",
      "issues": []
    }
  ],
  "pagination": { "limit": 50, "nextCursor": "..." },
  "sync": { "mode": "full", "snapshotAt": "...", "contractVersion": "district-leadership-v3.1" }
}`,
      },
    ],
  },
];

const SCOPES = [
  { name: 'locations:read', description: 'Read location data, hours, and operating status' },
  { name: 'personnel:read', description: 'Read personnel records' },
  { name: 'staffing:read', description: 'Read store staffing assignments' },
  { name: 'district-leadership:read', description: 'Read district and region leadership structure' },
  { name: 'district-leadership:contacts:read', description: 'Include DM work email addresses' },
];

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className={`bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm language-${language}`}>
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-2 bg-gray-700 rounded hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy to clipboard"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-300" />}
      </button>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-white hover:bg-gray-50 flex items-center gap-3 text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
        )}
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
          endpoint.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-gray-800 flex-1">{endpoint.path}</code>
        <span className="text-sm text-gray-500 hidden sm:block">{endpoint.summary}</span>
      </button>

      {expanded && (
        <div className="px-4 py-4 bg-gray-50 border-t border-gray-200 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Description</h4>
            <p className="text-sm text-gray-600">{endpoint.description}</p>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Required Scope</h4>
            <code className="text-sm bg-amber-100 text-amber-800 px-2 py-1 rounded">{endpoint.scope}</code>
          </div>

          {endpoint.parameters && endpoint.parameters.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Parameters</h4>
              <div className="bg-white rounded border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Required</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {endpoint.parameters.map((param) => (
                      <tr key={param.name}>
                        <td className="px-3 py-2 font-mono text-gray-800">{param.name}</td>
                        <td className="px-3 py-2 text-gray-600">{param.type}</td>
                        <td className="px-3 py-2">
                          {param.required ? (
                            <span className="text-red-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {param.description}
                          {param.example && (
                            <code className="ml-2 text-xs bg-gray-100 px-1 py-0.5 rounded">
                              e.g., {param.example}
                            </code>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">Example Response</h4>
            <CodeBlock code={endpoint.responseExample} />
          </div>

          {endpoint.notes && endpoint.notes.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <h4 className="text-sm font-semibold text-blue-800 mb-1">Notes</h4>
              <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                {endpoint.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApiVersionSection({ version }: { version: ApiVersion }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-gray-50"
      >
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{version.title}</h3>
          <p className="text-sm text-gray-500">{version.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-mono">{version.version}</span>
          {expanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {version.contractVersion && (
            <p className="text-xs text-gray-500">
              Contract: <code className="bg-gray-100 px-1 py-0.5 rounded">{version.contractVersion}</code>
            </p>
          )}
          {version.endpoints.map((endpoint, i) => (
            <EndpointCard key={i} endpoint={endpoint} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ApiDocsView() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-700 text-white sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button 
            onClick={() => navigate('/admin')} 
            className="p-1 hover:bg-blue-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold">API Documentation</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Introduction */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Getting Started</h2>
          <p className="text-gray-600 mb-4">
            The Shiekh Directory API provides programmatic access to store locations, personnel, 
            staffing assignments, and leadership structures. All API requests require authentication
            via a Bearer token.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">Authentication</h3>
          <p className="text-sm text-gray-600 mb-3">
            Include your API token in the <code className="bg-gray-100 px-1 py-0.5 rounded">Authorization</code> header:
          </p>
          <CodeBlock code={`curl -H "Authorization: Bearer shk_your_api_token" \\
     https://directory.shiekh.com/api/v1/locations`} language="bash" />

          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Rate Limiting</h3>
          <p className="text-sm text-gray-600 mb-3">
            API requests are rate-limited per client. Check the response headers:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside mb-3">
            <li><code className="bg-gray-100 px-1 py-0.5 rounded">X-RateLimit-Limit</code> — Requests allowed per minute</li>
            <li><code className="bg-gray-100 px-1 py-0.5 rounded">X-RateLimit-Remaining</code> — Requests remaining in window</li>
            <li><code className="bg-gray-100 px-1 py-0.5 rounded">X-RateLimit-Reset</code> — Unix timestamp when window resets</li>
          </ul>
          <p className="text-sm text-gray-600">
            If you exceed the limit, you'll receive a <code className="bg-gray-100 px-1 py-0.5 rounded">429 Too Many Requests</code> response.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Error Responses</h3>
          <p className="text-sm text-gray-600 mb-3">
            All errors return a JSON object with an <code className="bg-gray-100 px-1 py-0.5 rounded">error</code> field:
          </p>
          <CodeBlock code={`{
  "error": {
    "code": "invalid_token",
    "message": "A valid Bearer token is required.",
    "requestId": "req_abc123"
  }
}`} />
        </div>

        {/* Scopes */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Available Scopes</h2>
          <p className="text-sm text-gray-600 mb-4">
            API tokens are granted specific scopes that control access to different data types:
          </p>
          <div className="space-y-2">
            {SCOPES.map((scope) => (
              <div key={scope.name} className="flex items-start gap-3 p-3 bg-gray-50 rounded">
                <code className="text-sm bg-amber-100 text-amber-800 px-2 py-1 rounded whitespace-nowrap">
                  {scope.name}
                </code>
                <span className="text-sm text-gray-600">{scope.description}</span>
              </div>
            ))}
          </div>
        </div>

        {/* API Versions */}
        {API_VERSIONS.map((version) => (
          <ApiVersionSection key={version.version} version={version} />
        ))}

        {/* Support */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">Need Help?</h2>
          <p className="text-sm text-blue-700 mb-3">
            If you encounter issues or need additional access, contact the IT team or your administrator.
          </p>
          <a 
            href="mailto:it@shiekhshoes.com"
            className="inline-flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Contact Support
          </a>
        </div>
      </main>
    </div>
  );
}
