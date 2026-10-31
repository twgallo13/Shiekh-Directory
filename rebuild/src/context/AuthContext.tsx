import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  connectAuthEmulator,
  type Auth,
  type User,
} from 'firebase/auth';
import type { AuthUser } from '../types';
import { setAuthGetter } from '../lib/api';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'shiekh-directory-rebuild-placeholder',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'demo.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
};

let app: FirebaseApp;
let auth: Auth;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  if (import.meta.env.DEV || import.meta.env.VITE_USE_EMULATOR === 'true') {
    const authHost = import.meta.env.VITE_AUTH_EMULATOR_HOST || 'http://127.0.0.1:9099';
    try {
      connectAuthEmulator(auth, authHost, { disableWarnings: true });
    } catch {
    }
  }
} catch (error) {
  console.error('Firebase init error:', error);
}

interface StoreSessionData {
  authenticated: boolean;
  locationId?: string;
  storeNumber?: string;
  storeName?: string;
  email?: string;
  role?: string;
  expiresAt?: string;
}

interface AuthContextType {
  user: User | null;
  authUser: AuthUser | null;
  storeSession: StoreSessionData | null;
  loading: boolean;
  isStoreSession: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
  getStoreSessionHeader: () => string | null;
  refreshAuthUser: () => Promise<void>;
  refreshStoreSession: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [storeSession, setStoreSession] = useState<StoreSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeSessionChecked, setStoreSessionChecked] = useState(false);
  const [firebaseChecked, setFirebaseChecked] = useState(false);
  
  const isStoreSession = storeSession?.authenticated === true && !user;
  
  const userRef = useRef<User | null>(null);
  const storeSessionRef = useRef<StoreSessionData | null>(null);
  
  useEffect(() => {
    userRef.current = user;
    storeSessionRef.current = storeSession;
  }, [user, storeSession]);

  const getStoreSessionHeader = useCallback((): string | null => {
    return null;
  }, []);
  
  const getIdToken = useCallback(async (): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    
    if (import.meta.env.DEV || import.meta.env.VITE_USE_EMULATOR === 'true') {
      return `test-token-${user.uid}`;
    }
    
    return user.getIdToken();
  }, [user]);

  useEffect(() => {
    setAuthGetter(async () => {
      const currentUser = userRef.current;
      const currentStoreSession = storeSessionRef.current;
      
      if (currentStoreSession?.authenticated && !currentUser) {
        return { isStoreSession: true };
      }
      
      if (currentUser) {
        let token: string;
        if (import.meta.env.DEV || import.meta.env.VITE_USE_EMULATOR === 'true') {
          token = `test-token-${currentUser.uid}`;
        } else {
          token = await currentUser.getIdToken();
        }
        return { isStoreSession: false, token };
      }
      
      return { isStoreSession: false };
    });
  }, []);

  const refreshStoreSession = useCallback(async () => {
    try {
      const response = await fetch('/api/store-auth/session', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setStoreSession(data);
        
        if (data.authenticated) {
          setAuthUser({
            uid: `store_${data.locationId}`,
            email: data.email || '',
            displayName: `Store ${data.storeNumber}`,
            role: 'Store',
            storeLocationId: data.locationId,
          });
        }
      } else {
        setStoreSession({ authenticated: false });
      }
    } catch {
      setStoreSession({ authenticated: false });
    }
  }, []);
  
  const loadAuthUser = useCallback(async () => {
    if (!user) {
      setAuthUser(null);
      return;
    }
    
    try {
      const token = await getIdToken();
      const response = await fetch('/api/app/users/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (response.ok) {
        const { data } = await response.json();
        setAuthUser(data);
      } else if (response.status === 403) {
        const errorData = await response.json();
        if (errorData.error?.code === 'domain_not_allowed') {
          console.error('Domain not allowed:', errorData.error.message);
          await firebaseSignOut(auth);
          setAuthUser(null);
          throw new Error(errorData.error.message);
        }
        setAuthUser({
          uid: user.uid,
          email: user.email || '',
          displayName: user.email?.split('@')[0] || 'Unknown',
          role: 'Viewer',
        });
      } else {
        setAuthUser({
          uid: user.uid,
          email: user.email || '',
          displayName: user.email?.split('@')[0] || 'Unknown',
          role: 'Viewer',
        });
      }
    } catch (error) {
      console.error('Failed to load user profile:', error);
      if (error instanceof Error && error.message.includes('domain')) {
        throw error;
      }
      setAuthUser({
        uid: user.uid,
        email: user.email || '',
        displayName: user.email?.split('@')[0] || 'Unknown',
        role: 'Viewer',
      });
    }
  }, [user, getIdToken]);
  
  useEffect(() => {
    if (storeSessionChecked && firebaseChecked) {
      if (user) {
        loadAuthUser().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }
  }, [storeSessionChecked, firebaseChecked, user, loadAuthUser]);

  useEffect(() => {
    if (!auth) {
      setFirebaseChecked(true);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setAuthUser(null);
      }
      setFirebaseChecked(true);
    });
    
    return unsubscribe;
  }, []);

  useEffect(() => {
    refreshStoreSession().finally(() => {
      setStoreSessionChecked(true);
    });
  }, [refreshStoreSession]);
  
  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };
  
  const signInWithGoogleHandler = async () => {
    if (!auth) throw new Error('Auth not initialized');
    await signInWithPopup(auth, googleProvider);
  };
  
  const signOut = async () => {
    if (storeSession?.authenticated) {
      try {
        await fetch('/api/store-auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
      }
      setStoreSession({ authenticated: false });
    }
    
    if (auth) {
      setAuthUser(null);
      await firebaseSignOut(auth);
    }
  };
  
  const refreshAuthUser = async () => {
    await loadAuthUser();
  };
  
  const sendPasswordReset = async (email: string) => {
    if (!auth) throw new Error('Auth not initialized');
    await sendPasswordResetEmail(auth, email);
  };
  
  return (
    <AuthContext.Provider value={{ 
      user, 
      authUser, 
      storeSession,
      loading,
      isStoreSession,
      signIn, 
      signInWithGoogle: signInWithGoogleHandler, 
      signOut, 
      getIdToken, 
      getStoreSessionHeader,
      refreshAuthUser,
      refreshStoreSession,
      sendPasswordReset 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
