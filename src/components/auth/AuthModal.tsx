import React, { useState } from 'react';
import { 
  Shield, 
  LogIn, 
  Mail, 
  Lock, 
  UserCheck, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Building2, 
  KeyRound,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { useDirectory } from '../../context/DirectoryContext';
import { UserRole } from '../../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { 
    currentUser, 
    users, 
    loginWithGoogle, 
    loginWithEmailPassword, 
    switchUserAccount, 
    logout,
    isAuthenticated 
  } = useDirectory();

  const [activeTab, setActiveTab] = useState<'signin' | 'corporate_sso' | 'switch'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    const result = await loginWithEmailPassword(email, password);
    setLoading(false);

    if (result.success) {
      setSuccessMsg(`Welcome back, ${email}!`);
      setTimeout(() => {
        onClose();
      }, 600);
    } else {
      setErrorMsg(result.message || 'Invalid credentials or user not authorized.');
    }
  };

  const handleGoogleSignIn = async (overrideEmail?: string) => {
    setErrorMsg(null);
    setLoading(true);
    const result = await loginWithGoogle(overrideEmail);
    setLoading(false);

    if (result.success) {
      setSuccessMsg('Corporate Google SSO authentication verified.');
      setTimeout(() => {
        onClose();
      }, 600);
    } else {
      setErrorMsg(result.message || 'Corporate SSO failed.');
    }
  };

  const roleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'System Administrator':
        return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800';
      case 'Directory Data Steward':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'District Manager':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Store Manager':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      default:
        return 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-300';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between bg-neutral-50/50 dark:bg-neutral-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>Shiekh Shoes Identity & Sign-In</span>
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Authoritative Master Directory Authentication Gateway
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Session Status */}
        <div className="px-5 py-3 bg-neutral-100/70 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-neutral-500">Active User:</span>
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{currentUser.displayName}</span>
            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${roleBadgeColor(currentUser.role)}`}>
              {currentUser.role}
            </span>
          </div>
          <div className="text-[11px] text-neutral-500 font-mono">
            Scope: {currentUser.accessScope}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('signin')}
            className={`flex-1 py-3 text-center border-b-2 transition-colors ${
              activeTab === 'signin'
                ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Store / Email Login
          </button>
          <button
            onClick={() => setActiveTab('corporate_sso')}
            className={`flex-1 py-3 text-center border-b-2 transition-colors ${
              activeTab === 'corporate_sso'
                ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Corporate Google SSO
          </button>
          <button
            onClick={() => setActiveTab('switch')}
            className={`flex-1 py-3 text-center border-b-2 transition-colors ${
              activeTab === 'switch'
                ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-neutral-900'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200'
            }`}
          >
            Directory Accounts ({users.length})
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* TAB 1: EMAIL & PASSWORD LOGIN */}
          {activeTab === 'signin' && (
            <form onSubmit={handleEmailSignIn} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300 mb-1">
                  Store / Corporate Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    placeholder="e.g. store007@shiekhshoes.com or theo@shiekhshoes.org"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    Password / PIN
                  </label>
                  <span className="text-[11px] text-neutral-400 italic">Default store pin: 123456</span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg text-xs text-neutral-900 dark:text-neutral-100 focus:ring-2 focus:ring-red-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{loading ? 'Authenticating...' : 'Sign In with Credentials'}</span>
                </button>
              </div>

              <div className="text-[11px] text-neutral-500 text-center pt-2">
                Store associates and field staff are provisioned by Directory Data Stewards.
              </div>
            </form>
          )}

          {/* TAB 2: GOOGLE CORPORATE SSO */}
          {activeTab === 'corporate_sso' && (
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-neutral-900 dark:text-neutral-100">
                  <Building2 className="w-4 h-4 text-red-600" />
                  <span>Shiekh Shoes Corporate Google Workspace SSO</span>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Sign in securely using your authoritative @shiekhshoes.com or @shiekhshoes.org Google account.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => handleGoogleSignIn('theo@shiekhshoes.org')}
                  className="w-full p-3 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-xl flex items-center justify-between text-xs font-semibold text-neutral-900 dark:text-neutral-100 shadow-2xs transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 flex items-center justify-center font-black">
                      T
                    </div>
                    <div className="text-left">
                      <div className="font-bold">Theo (System Administrator)</div>
                      <div className="text-[11px] text-neutral-500 font-mono">theo@shiekhshoes.org</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 text-[10px] font-bold">
                    SysAdmin
                  </span>
                </button>

                <button
                  onClick={() => handleGoogleSignIn('m.vargas@shiekhshoes.com')}
                  className="w-full p-3 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-xl flex items-center justify-between text-xs font-semibold text-neutral-900 dark:text-neutral-100 shadow-2xs transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-black">
                      M
                    </div>
                    <div className="text-left">
                      <div className="font-bold">Manny Vargas (Directory Data Steward)</div>
                      <div className="text-[11px] text-neutral-500 font-mono">m.vargas@shiekhshoes.com</div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 text-[10px] font-bold">
                    Data Steward
                  </span>
                </button>

                <button
                  onClick={() => handleGoogleSignIn()}
                  className="w-full py-2.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition-colors mt-2"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Authenticate with Google Identity Services</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DIRECTORY SAMPLE ACCOUNTS SWITCHER */}
          {activeTab === 'switch' && (
            <div className="space-y-2">
              <div className="text-xs text-neutral-500 mb-2">
                Select an authorized directory user profile to simulate role-based access governance:
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {users.map(u => {
                  const isCurrent = currentUser.id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUserAccount(u.id);
                        onClose();
                      }}
                      className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-left transition-all ${
                        isCurrent
                          ? 'border-red-500 bg-red-50/40 dark:bg-red-950/30'
                          : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center text-xs font-bold shrink-0">
                          {u.displayName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-neutral-900 dark:text-neutral-100 truncate flex items-center gap-1.5">
                            <span>{u.displayName}</span>
                            {isCurrent && <span className="text-[10px] text-red-600 font-bold">(Active)</span>}
                          </div>
                          <div className="text-[11px] text-neutral-500 truncate font-mono">{u.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${roleBadgeColor(u.role)}`}>
                          {u.role}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Sign Out */}
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 flex items-center justify-between">
          <div className="text-[11px] text-neutral-500">
            RBAC Model: Blueprint Sec 9
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                logout();
                onClose();
              }}
              className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-lg text-xs font-semibold transition-colors"
            >
              Sign Out / Clear Session
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-xs font-bold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
