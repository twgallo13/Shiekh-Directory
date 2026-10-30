import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  connectAuthEmulator,
  type Auth,
  type User,
} from 'firebase/auth';

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

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);
  
  const signIn = async (email: string, password: string) => {
    if (!auth) throw new Error('Auth not initialized');
    await signInWithEmailAndPassword(auth, email, password);
  };
  
  const signOut = async () => {
    if (!auth) return;
    await firebaseSignOut(auth);
  };
  
  const getIdToken = async (): Promise<string> => {
    if (!user) throw new Error('Not authenticated');
    
    if (import.meta.env.DEV || import.meta.env.VITE_USE_EMULATOR === 'true') {
      return `test-token-${user.uid}`;
    }
    
    return user.getIdToken();
  };
  
  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getIdToken }}>
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
