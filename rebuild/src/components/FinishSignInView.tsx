import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Completes a passwordless sign-in from an Admin-issued email link. */
export function FinishSignInView() {
  const { isEmailSignInLink, completeEmailLinkSignIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const href = window.location.href;
  const valid = isEmailSignInLink(href);

  useEffect(() => { document.title = 'Finish signing in · Shiekh Directory'; }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await completeEmailLinkSignIn(email, href);
      navigate('/', { replace: true });
    } catch (err) {
      const code = (err as { code?: string })?.code || '';
      setError(
        code === 'auth/invalid-email'
          ? "That email doesn't match this link. Use the work email the link was made for."
          : code === 'auth/invalid-action-code' || code === 'auth/expired-action-code'
            ? 'This link has expired or was already used. Ask an Admin for a new one.'
            : 'Could not sign you in with this link. Ask an Admin for a new one.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-semibold text-gray-900">Finish signing in</h1>
        {!valid ? (
          <p className="mt-3 text-sm text-gray-700" role="alert">
            This sign-in link isn't valid. Ask an Admin for a new one.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <p className="text-sm text-gray-600">No password needed. Confirm your work email to continue.</p>
            <label htmlFor="finish-email" className="block text-sm font-medium text-gray-700">Work email</label>
            <input
              id="finish-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm min-h-[44px]"
            />
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm min-h-[44px] disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
