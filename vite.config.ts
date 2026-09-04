import 'dotenv/config';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { executeSendMail } from './server/mailer';

function expressApiPlugin(): Plugin {
  return {
    name: 'express-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url) return next();

        // 1. Backend Health
        if (req.url === '/api/health' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            status: 'ok',
            service: 'Shiekh Directory SoR Backend & SMTP Relay',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            smtpConfigured: Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS),
          }));
          return;
        }

        // 2. SMTP Status
        if (req.url === '/api/smtp/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            isConfigured: Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS),
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587', 10),
            secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
            username: process.env.SMTP_USER || 'directory-notifications@shiekhshoes.com',
            fromName: process.env.SMTP_FROM_NAME || 'Shiekh Directory Services',
            fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'directory-notifications@shiekhshoes.com',
            replyTo: process.env.SMTP_REPLY_TO || 'directory-steward@shiekhshoes.com',
            appUrl: process.env.APP_URL || '',
          }));
          return;
        }

        // 3. SMTP Send Email
        if (req.url === '/api/send-email' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });

          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const result = await executeSendMail(payload);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(result));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: false,
                code: err.code || 'SMTP_TRANSPORT_ERROR',
                error: err.message || String(err),
                rawError: String(err),
              }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), expressApiPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
