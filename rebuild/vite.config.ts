import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Build guard (2026-11-04): a production build must carry a real Firebase web config.
// A placeholder config shipped once and broke live sign-in (auth/api-key-not-valid).
function firebaseConfigGuard(mode: string): Plugin {
  return {
    name: 'firebase-config-guard',
    apply: 'build',
    configResolved() {
      const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env } as Record<string, string | undefined>;
      if (env.VITE_USE_EMULATOR === 'true' || env.ALLOW_PLACEHOLDER_FIREBASE_CONFIG === 'true') return;
      const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'];
      const bad = required.filter((k) => {
        const v = (env[k] || '').trim();
        return !v || /demo|placeholder|your[-_]|example|changeme/i.test(v);
      });
      if (bad.length) {
        throw new Error(`Build stopped: Firebase web config is missing or a placeholder (${bad.join(', ')}). Add the real values to .env.production.`);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), firebaseConfigGuard(mode)],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
}));
