import express, { type Request, type Response, type NextFunction } from 'express';
import { createSearchRouter } from './routes/search';
import { createLocationsRouter } from './routes/locations';
import { createImportRouter } from './routes/import';
import { createRegionsRouter, createDistrictsRouter } from './routes/regions';
import { createUsersRouter } from './routes/users';
import { createEditRouter } from './routes/edit';
import { createCorrectionsRouter } from './routes/corrections';
import { createAuditRouter } from './routes/audit';
import { createPeopleRouter } from './routes/people';
import { createAssignmentsRouter } from './routes/assignments';
import { createHoursExceptionsRouter } from './routes/hoursExceptions';
import { createVerificationRouter } from './routes/verification';
import { createAuthMiddleware, createAuthUserMiddleware } from './middleware/auth';
import { createLegacyApiAuthMiddleware } from './middleware/legacyApiAuth';
import { createLegacyV1Router } from './routes/legacyV1';
import { createLegacyV2Router } from './routes/legacyV2';
import { createLegacyV3Router } from './routes/legacyV3';
import { createApiClientsRouter } from './routes/apiClients';
import { createExportsRouter } from './routes/exports';
import { createAdminRouter } from './routes/admin';
import { createLegacyImportRouter } from './routes/legacyImport';
import { createBackupRouter } from './routes/backup';
import { createHierarchyRouter } from './routes/hierarchy';
import { createHoursTemplatesRouter } from './routes/hoursTemplates';
import { createNoticesRouter } from './routes/notices';
import { createStaleStoresRouter } from './routes/staleStores';
import { createStoreAuthRouter } from './routes/storeAuth';
import { createFirestoreClient } from './firebase';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

const db = createFirestoreClient();

app.use('/api/app', createAuthMiddleware());
app.use('/api/app', createAuthUserMiddleware(db));
app.use('/api/app/search', createSearchRouter(db));
app.use('/api/app/locations', createLocationsRouter(db));
app.use('/api/app/import', createImportRouter(db));
app.use('/api/app/regions', createRegionsRouter(db));
app.use('/api/app/districts', createDistrictsRouter(db));
app.use('/api/app/users', createUsersRouter(db));
app.use('/api/app/edit', createEditRouter(db));
app.use('/api/app/corrections', createCorrectionsRouter(db));
app.use('/api/app/audit', createAuditRouter(db));
app.use('/api/app/people', createPeopleRouter(db));
app.use('/api/app/assignments', createAssignmentsRouter(db));
app.use('/api/app/hours-exceptions', createHoursExceptionsRouter(db));
app.use('/api/app/verification', createVerificationRouter(db));
app.use('/api/app/api-clients', createApiClientsRouter(db));
app.use('/api/app/exports', createExportsRouter(db));
app.use('/api/app/admin', createAdminRouter(db));
app.use('/api/app/import/legacy', createLegacyImportRouter(db));
app.use('/api/app/backups', createBackupRouter(db));
app.use('/api/app/hierarchy', createHierarchyRouter(db));
app.use('/api/app/hours-templates', createHoursTemplatesRouter(db));
app.use('/api/app', createNoticesRouter(db));
app.use('/api/app/stale-stores', createStaleStoresRouter(db));
app.use('/api/store-auth', createStoreAuthRouter(db));

// Legacy API routes (v1/v2/v3)
app.use('/api/v1', createLegacyApiAuthMiddleware(db), createLegacyV1Router(db));
app.use('/api/v2', createLegacyApiAuthMiddleware(db), createLegacyV2Router(db));
app.use('/api/v3', createLegacyApiAuthMiddleware(db), createLegacyV3Router(db));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', (_req: Request, res: Response) => {
  res.status(404).json({
    error: {
      code: 'not_found',
      message: 'API endpoint not found',
      requestId: res.locals.requestId || 'unknown',
    },
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'An unexpected error occurred',
      requestId: res.locals.requestId || 'unknown',
    },
  });
});

const isCloudFunction = !!(
  process.env.FUNCTION_TARGET ||
  process.env.K_SERVICE ||
  process.env.FUNCTIONS_CONTROL_API
);

if (!isCloudFunction) {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
