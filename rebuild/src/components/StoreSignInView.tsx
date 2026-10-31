import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function StoreSignInView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signInWithCustomToken } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [storeInfo, setStoreInfo] = useState<{
    locationId: string;
    storeNumber: string;
    storeName: string;
  } | null>(null);

  const token = searchParams.get('token');

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);

  useEffect(() => {
    if (token) {
      window.history.replaceState({}, '', window.location.pathname);
      verifyToken(token);
    }
  }, [token]);

  const verifyToken = async (token: string) => {
    setVerifying(true);
    setError('');
    try {
      const response = await fetch('/api/store-auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Invalid or expired link');
        setVerifying(false);
        return;
      }

      setStoreInfo({
        locationId: data.locationId,
        storeNumber: data.storeNumber,
        storeName: data.storeName,
      });

      if (data.customToken) {
        await signInWithCustomToken(data.customToken);
      }

      setTimeout(() => {
        navigate(`/location/${data.locationId}`);
      }, 2000);
    } catch {
      setError('Failed to verify sign-in link');
    } finally {
      setVerifying(false);
    }
  };

  const handleRequestLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/store-auth/send-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Failed to send sign-in link');
        return;
      }

      setSuccess(`Sign-in link sent to ${data.email}. Check your store mailbox.`);
      setEmail('');
    } catch {
      setError('Failed to send sign-in link');
    } finally {
      setLoading(false);
    }
  };

  if (token && verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Verifying your sign-in link...</p>
        </div>
      </div>
    );
  }

  if (storeInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Signed In</h2>
          <p className="text-gray-600 mb-4">
            Welcome, Store {storeInfo.storeNumber} - {storeInfo.storeName}
          </p>
          <p className="text-sm text-gray-500">Redirecting to your store page...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <img 
            src="/shiekh-logo.svg" 
            alt="Shiekh" 
            className="h-12 mx-auto mb-4"
          />
          <h1 className="text-xl font-bold text-gray-900">Store Manager Sign-In</h1>
          <p className="text-gray-600 mt-1">
            Enter your store email to receive a sign-in link
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-700">{success}</p>
            </div>
          )}

          <form onSubmit={handleRequestLink} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Store Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="store42@shiekhshoes.com"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Format: store{'{n}'}@shiekhshoes.com (no leading zeros)
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Sign-In Link'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 text-center">
              Company staff should use{' '}
              <Link to="/signin" className="text-blue-600 hover:underline">
                Google Sign-In
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link 
            to="/signin" 
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Staff Sign-In
          </Link>
        </div>
      </div>
    </div>
  );
}
