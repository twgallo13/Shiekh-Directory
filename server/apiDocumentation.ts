import path from 'node:path';
import { Router } from 'express';

export function createApiDocumentationRouter(root = process.cwd()): Router {
  const router = Router();
  const directory = path.join(root, process.env.NODE_ENV === 'production' ? 'dist/api-docs' : 'docs');
  router.get('/openapi.json', (_request, response) => {
    response.set('Cache-Control', 'no-store').sendFile(path.join(directory, 'personnel-staffing-openapi.json'));
  });
  router.get('/personnel-guide', (_request, response) => {
    response.set('Cache-Control', 'no-store').type('text/plain').sendFile(path.join(directory, 'personnel-staffing-api.md'));
  });
  return router;
}
