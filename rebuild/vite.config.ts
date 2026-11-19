import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';
import path from 'path';
import { createBuildId, finalizeServiceWorker } from './scripts/stampBuildId';

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

function stampBuildIdPlugin(): Plugin {
  let buildId = 'dev';
  let command = 'serve';
  let outDir = '';
  return {
    name: 'stamp-build-id',
    config(_config, env) {
      command = env.command;
      buildId = createBuildId(env.command, env.mode);
      return {
        define: {
          __APP_BUILD_ID__: JSON.stringify(buildId),
        },
      };
    },
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (command !== 'build') return;
      const swPath = path.join(outDir, 'sw.js');
      if (!fs.existsSync(swPath)) {
        throw new Error(`Build stopped: ${swPath} was not emitted, so the build id could not be stamped.`);
      }
      const source = fs.readFileSync(swPath, 'utf8');
      const finalized = finalizeServiceWorker(source, buildId);
      if (finalized !== source) {
        fs.writeFileSync(swPath, finalized);
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), firebaseConfigGuard(mode), stampBuildIdPlugin()],
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
