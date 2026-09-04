import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { executeSendMail } from './server/mailer';

const app = express();
const PORT = 3000;

// JSON & URL-encoded request body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---------------------------------------------------------------------------
// 1. Backend Health & Diagnostic Routes
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Shiekh Directory SoR Backend & SMTP Relay',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    smtpConfigured: Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS),
  });
});

app.get('/api/smtp/status', (req, res) => {
  res.json({
    isConfigured: Boolean(process.env.SMTP_PASSWORD || process.env.SMTP_PASS),
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    username: process.env.SMTP_USER || 'directory-notifications@shiekhshoes.com',
    fromName: process.env.SMTP_FROM_NAME || 'Shiekh Directory Services',
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || 'directory-notifications@shiekhshoes.com',
    replyTo: process.env.SMTP_REPLY_TO || 'directory-steward@shiekhshoes.com',
    appUrl: process.env.APP_URL || '',
  });
});

// ---------------------------------------------------------------------------
// 2. Secure Server-Side SMTP Mailer Route (DISPATCH-013)
// ---------------------------------------------------------------------------
app.post('/api/send-email', async (req, res) => {
  try {
    const result = await executeSendMail(req.body);
    console.log(`[SMTP Service] Successfully dispatched message "${req.body.subject}". MessageId: ${result.messageId}`);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[SMTP Service Error]:', err);
    return res.status(500).json({
      success: false,
      code: err.code || 'SMTP_TRANSPORT_ERROR',
      error: err.message || String(err),
      rawError: String(err),
    });
  }
});

// ---------------------------------------------------------------------------
// 3. Vite Middleware Integration (Dev vs Prod)
// ---------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Shiekh Directory SoR Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
