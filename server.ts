import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { executeSendMail } from './server/mailer';
import { INITIAL_LOCATIONS, INITIAL_PEOPLE, INITIAL_API_CLIENTS } from './src/data/initialData';

const app = express();
const PORT = 3000;

// ---------------------------------------------------------------------------
// Middlewares: CORS, Request Parsing & Rate Limiting
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Global Rate Limiter for API endpoints (120 requests/minute)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too Many Requests',
    message: 'Rate limit quota exceeded. Maximum 120 requests per minute per IP / client.',
    timestamp: new Date().toISOString()
  }
});

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

app.get('/api/gbp/status', (req, res) => {
  const hasKey = Boolean(process.env.GBP_PRIVATE_KEY || process.env.GBP_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  res.json({
    accountId: process.env.GBP_ACCOUNT_ID || 'accounts/5840371318',
    clientEmail: process.env.GBP_SERVICE_ACCOUNT_EMAIL || 'shiekh-gbp-sync-service@gen-lang-client-0801664258.iam.gserviceaccount.com',
    isConfigured: hasKey,
    authMethod: 'service_account',
    scope: 'https://www.googleapis.com/auth/business.manage',
    timestamp: new Date().toISOString()
  });
});

// ---------------------------------------------------------------------------
// 2. Secure Server-Side SMTP Mailer Route
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
// 3. API Key Authentication Helper Middleware
// ---------------------------------------------------------------------------
function authenticateApiKey(requiredScope?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const rawHeaderKey = req.headers['x-api-key'] || req.headers['x-api-token'];
    let apiKey: string | undefined = typeof rawHeaderKey === 'string' ? rawHeaderKey : undefined;

    if (!apiKey && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && (parts[0] === 'Bearer' || parts[0] === 'ApiKey')) {
        apiKey = parts[1];
      }
    }

    if (!apiKey && typeof req.query.api_key === 'string') {
      apiKey = req.query.api_key;
    }

    if (!apiKey) {
      return res.status(401).json({
        status: 401,
        error: 'Unauthorized',
        message: 'Missing required API key. Pass in header "x-api-key: <key>" or "Authorization: Bearer <key>".',
        timestamp: new Date().toISOString()
      });
    }

    // Match against active client tokens or master env key
    const client = INITIAL_API_CLIENTS.find(c => c.apiKey === apiKey && c.status === 'Active');
    const envMasterKey = process.env.DIRECTORY_MASTER_API_KEY || 'shk_live_pos_9a8b7c6d5e4f3a2b1c';
    const isMasterKey = apiKey === envMasterKey;

    if (!client && !isMasterKey) {
      return res.status(403).json({
        status: 403,
        error: 'Forbidden',
        message: 'Invalid or revoked API key.',
        timestamp: new Date().toISOString()
      });
    }

    if (requiredScope && client && !client.scopes.includes(requiredScope as any) && !client.scopes.includes('locations:manage' as any) && !isMasterKey) {
      return res.status(403).json({
        status: 403,
        error: 'Forbidden',
        message: `API key lacks required scope [${requiredScope}]. Authorized scopes: ${client.scopes.join(', ')}`,
        timestamp: new Date().toISOString()
      });
    }

    (req as any).apiClient = client || { name: 'Master API Client', id: 'master' };
    next();
  };
}

// ---------------------------------------------------------------------------
// 4. Downstream Read-Only API Routes (v1)
// ---------------------------------------------------------------------------

// GET /api/v1/locations - All Master Store Records
app.get('/api/v1/locations', apiLimiter, authenticateApiKey('locations:read'), (req: Request, res: Response) => {
  try {
    let results = [...INITIAL_LOCATIONS];

    // Filter by State
    if (typeof req.query.state === 'string') {
      const stateQuery = req.query.state.trim().toUpperCase();
      results = results.filter(loc => loc.state.toUpperCase() === stateQuery);
    }

    // Filter by District
    if (typeof req.query.district === 'string') {
      const districtQuery = req.query.district.trim().toLowerCase();
      results = results.filter(loc => loc.district && loc.district.toLowerCase().includes(districtQuery));
    }

    // Filter by Operational Status
    if (typeof req.query.status === 'string') {
      const statusQuery = req.query.status.trim().toLowerCase();
      results = results.filter(loc => loc.operationalStatus.toLowerCase().includes(statusQuery));
    }

    // Search query
    if (typeof req.query.search === 'string') {
      const q = req.query.search.trim().toLowerCase();
      results = results.filter(loc => 
        loc.name.toLowerCase().includes(q) ||
        loc.storeNumber.toLowerCase().includes(q) ||
        loc.city.toLowerCase().includes(q) ||
        loc.address.toLowerCase().includes(q)
      );
    }

    // Pagination
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const totalRecords = results.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const startIndex = (page - 1) * limit;
    const paginated = results.slice(startIndex, startIndex + limit);

    const formattedData = paginated.map(loc => ({
      location_id: loc.id,
      store_number: loc.storeNumber,
      name: loc.name,
      type: loc.type,
      mall_name: loc.mallOrCenterName || null,
      address: {
        street: loc.address,
        city: loc.city,
        state: loc.state,
        postal_code: loc.zipCode,
        country: 'US',
        timezone: loc.timeZone,
        coordinates: loc.coordinates || null,
      },
      contact: {
        store_phone: loc.phone,
        store_manager: loc.storeManagerName || null,
        store_manager_phone: loc.storeManagerPhoneVisibility === 'Directory Public' ? loc.storeManagerPhone : null,
        district_manager: loc.districtManagerName || null,
        district: loc.district || null,
      },
      hours: {
        standard: loc.standardHours,
        holiday: loc.holidayHours || [],
        special: loc.specialHours || []
      },
      status: {
        operational_status: loc.operationalStatus,
        lifecycle: loc.recordStatus,
        active_notice: loc.activeNotice ? {
          reason: loc.activeNotice.shortDescription,
          effective_date: loc.activeNotice.effectiveDate
        } : null
      },
      last_updated: loc.lastUpdated,
      last_verified_at: loc.lastVerifiedDate
    }));

    return res.status(200).json({
      status: 200,
      api_version: 'v1',
      source_of_truth: 'Shiekh Shoes Master Directory System of Record',
      environment: 'PRODUCTION',
      total_records: totalRecords,
      data: formattedData,
      _pagination: {
        page,
        limit,
        total_pages: totalPages,
        total_records: totalRecords,
        has_next: page < totalPages,
        has_prev: page > 1,
        next_page: page < totalPages ? `/api/v1/locations?page=${page + 1}&limit=${limit}` : null
      }
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 500,
      error: 'Internal Server Error',
      message: err.message || String(err)
    });
  }
});

// GET /api/v1/locations/store/:store_number - Single Store Record by Store Number
app.get('/api/v1/locations/store/:store_number', apiLimiter, authenticateApiKey('locations:read'), (req: Request, res: Response) => {
  const storeNum = req.params.store_number.trim();
  const loc = INITIAL_LOCATIONS.find(l => l.storeNumber.trim() === storeNum || l.id === storeNum);

  if (!loc) {
    return res.status(404).json({
      status: 404,
      error: 'Not Found',
      message: `Store with number or ID "${storeNum}" was not found in the Master Directory System of Record.`,
      timestamp: new Date().toISOString()
    });
  }

  return res.status(200).json({
    status: 200,
    api_version: 'v1',
    source_of_truth: 'Shiekh Shoes Master Directory System of Record',
    environment: 'PRODUCTION',
    data: {
      location_id: loc.id,
      store_number: loc.storeNumber,
      name: loc.name,
      type: loc.type,
      mall_name: loc.mallOrCenterName || null,
      address: {
        street: loc.address,
        city: loc.city,
        state: loc.state,
        postal_code: loc.zipCode,
        country: 'US',
        timezone: loc.timeZone,
        coordinates: loc.coordinates || null,
      },
      contact: {
        store_phone: loc.phone,
        store_manager: loc.storeManagerName || null,
        store_manager_phone: loc.storeManagerPhoneVisibility === 'Directory Public' ? loc.storeManagerPhone : null,
        district_manager: loc.districtManagerName || null,
        district: loc.district || null,
      },
      hours: {
        standard: loc.standardHours,
        holiday: loc.holidayHours || [],
        special: loc.specialHours || []
      },
      status: {
        operational_status: loc.operationalStatus,
        lifecycle: loc.recordStatus,
        active_notice: loc.activeNotice ? {
          reason: loc.activeNotice.shortDescription,
          effective_date: loc.activeNotice.effectiveDate
        } : null
      },
      last_updated: loc.lastUpdated,
      last_verified_at: loc.lastVerifiedDate
    }
  });
});

// GET /api/v1/personnel (and /api/v1/people) - Corporate & Field Leadership Personnel Directory
app.get(['/api/v1/personnel', '/api/v1/people'], apiLimiter, authenticateApiKey('people:read'), (req: Request, res: Response) => {
  let results = [...INITIAL_PEOPLE];

  if (typeof req.query.department === 'string') {
    const deptQuery = req.query.department.trim().toLowerCase();
    results = results.filter(p => p.department && p.department.toLowerCase().includes(deptQuery));
  }

  if (typeof req.query.search === 'string') {
    const q = req.query.search.trim().toLowerCase();
    results = results.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.jobTitle.toLowerCase().includes(q) ||
      (p.workEmail && p.workEmail.toLowerCase().includes(q))
    );
  }

  return res.status(200).json({
    status: 200,
    api_version: 'v1',
    source_of_truth: 'Shiekh Shoes Master Directory System of Record',
    total_records: results.length,
    data: results.map(p => ({
      person_id: p.id,
      name: p.name,
      job_title: p.jobTitle,
      department: p.department,
      work_email: p.workEmail || null,
      work_phone: p.workPhone || null,
      district: p.district || null,
      region: p.region || null,
      assigned_location_id: p.assignedLocationId || null,
      assigned_location_name: p.assignedLocationName || null,
      active_status: p.activeStatus
    }))
  });
});

// ---------------------------------------------------------------------------
// 5. Vite Middleware Integration (Dev vs Prod)
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
