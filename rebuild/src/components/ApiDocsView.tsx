import { useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Check, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  API_BASE_URL,
  API_VERSIONS,
  API_SCOPES,
  ERROR_RESPONSE_EXAMPLE,
  RATE_LIMIT_HEADERS,
  type ApiEndpoint,
  type ApiVersion,
} from '../lib/apiDocsData';

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
        className="absolute top-2 right-2 p-2 bg-gray-700 rounded hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity min-h-[44px] min-w-[44px] flex items-center justify-center"
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        title="Copy to clipboard"
      >
        {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-gray-300" />}
      </button>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: ApiEndpoint }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-white hover:bg-gray-50 flex items-center gap-3 text-left min-h-[44px]"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
        )}
        <span className={`px-2 py-0.5 rounded text-xs font-bold flex-shrink-0 ${
          endpoint.method === 'GET' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}>
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-gray-800 break-all">{endpoint.path}</code>
        <span className="text-sm text-gray-500 hidden sm:block ml-auto flex-shrink-0">{endpoint.summary}</span>
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
              <div className="bg-white rounded border border-gray-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Name</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Req</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {endpoint.parameters.map((param) => (
                      <tr key={param.name}>
                        <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">{param.name}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{param.type}</td>
                        <td className="px-3 py-2">
                          {param.required ? (
                            <span className="text-red-600 font-medium">Yes</span>
                          ) : (
                            <span className="text-gray-600">No</span>
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
        className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-gray-50 min-h-[44px]"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{version.title}</h3>
          <p className="text-sm text-gray-500">{version.description}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-2">
          <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm font-mono">{version.version}</span>
          {expanded ? <ChevronDown className="w-5 h-5 text-gray-600" /> : <ChevronRight className="w-5 h-5 text-gray-600" />}
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
            aria-label="Back to admin"
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
          
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> This documents the <strong>external consumer API</strong> (v1/v2/v3) 
              for LP and integration partners. Internal staff endpoints require separate Firebase authentication.
            </p>
          </div>

          <h3 className="text-lg font-semibold text-gray-900 mb-2">Base URL</h3>
          <CodeBlock code={API_BASE_URL} language="text" />

          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Authentication</h3>
          <p className="text-sm text-gray-600 mb-3">
            Include your API token in the <code className="bg-gray-100 px-1 py-0.5 rounded">Authorization</code> header:
          </p>
          <CodeBlock code={`curl -H "Authorization: Bearer shk_your_api_token" \\
     ${API_BASE_URL}/api/v1/locations`} language="bash" />

          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Rate Limiting</h3>
          <p className="text-sm text-gray-600 mb-3">
            API requests are rate-limited per client. Check the response headers:
          </p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside mb-3">
            {RATE_LIMIT_HEADERS.map((header) => (
              <li key={header.name}>
                <code className="bg-gray-100 px-1 py-0.5 rounded">{header.name}</code> — {header.description}
              </li>
            ))}
          </ul>
          <p className="text-sm text-gray-600">
            If you exceed the limit, you'll receive a <code className="bg-gray-100 px-1 py-0.5 rounded">429 Too Many Requests</code> response.
          </p>

          <h3 className="text-lg font-semibold text-gray-900 mt-6 mb-2">Error Responses</h3>
          <p className="text-sm text-gray-600 mb-3">
            All errors return a JSON object with an <code className="bg-gray-100 px-1 py-0.5 rounded">error</code> field:
          </p>
          <CodeBlock code={ERROR_RESPONSE_EXAMPLE} />
        </div>

        {/* Scopes */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-3">Available Scopes</h2>
          <p className="text-sm text-gray-600 mb-4">
            API tokens are granted specific scopes that control access to different data types:
          </p>
          <div className="space-y-2">
            {API_SCOPES.map((scope) => (
              <div key={scope.name} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 p-3 bg-gray-50 rounded">
                <code className="text-sm bg-amber-100 text-amber-800 px-2 py-1 rounded whitespace-nowrap self-start">
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
