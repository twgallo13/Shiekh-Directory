import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2, AlertCircle, Edit, ArrowRight } from 'lucide-react';

export function VerifyActionView() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    action: 'confirmed' | 'update';
    storeNumber: string;
    storeName: string;
    message: string;
    locationId?: string;
    email?: string;
  } | null>(null);

  const token = searchParams.get('token');
  const action = searchParams.get('action');

  useEffect(() => {
    if (token && action) {
      processAction(token, action);
    } else {
      setError('Invalid verification link');
      setLoading(false);
    }
  }, [token, action]);

  const processAction = async (token: string, action: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/store-auth/one-click-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error?.message || 'Failed to process verification');
        return;
      }

      setResult({
        action: data.action,
        storeNumber: data.storeNumber,
        storeName: data.storeName,
        message: data.message,
        locationId: data.locationId,
        email: data.email,
      });

      if (data.action === 'update' && data.locationId) {
        sessionStorage.setItem('storeAuth', JSON.stringify({
          locationId: data.locationId,
          storeNumber: data.storeNumber,
          storeName: data.storeName,
          email: data.email,
          signedInAt: new Date().toISOString(),
        }));
      }
    } catch {
      setError('Failed to process verification');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Processing your verification...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Verification Failed</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                This link may have expired or already been used.
              </p>
              <Link
                to="/signin"
                className="inline-flex items-center gap-2 text-blue-600 hover:underline"
              >
                Go to Sign In
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (result?.action === 'confirmed') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Hours Confirmed!</h2>
            <p className="text-gray-600 mb-2">
              Thank you for confirming your store hours.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 my-6">
              <p className="text-lg font-semibold text-gray-900">
                Store {result.storeNumber}
              </p>
              <p className="text-gray-600">{result.storeName}</p>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Your store's hours are now verified in the directory.
            </p>
            <div className="space-y-3">
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700"
              >
                View Directory
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (result?.action === 'update') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <Edit className="h-16 w-16 text-blue-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Update Store Information</h2>
            <p className="text-gray-600 mb-2">
              You've been signed in to update your store information.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 my-6">
              <p className="text-lg font-semibold text-gray-900">
                Store {result.storeNumber}
              </p>
              <p className="text-gray-600">{result.storeName}</p>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => navigate(`/location/${result.locationId}`)}
                className="inline-flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700"
              >
                <Edit className="h-5 w-5" />
                Edit Store Information
              </button>
              <Link
                to="/"
                className="inline-flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 py-2 px-4 rounded-lg font-medium hover:bg-gray-50"
              >
                View Directory
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
