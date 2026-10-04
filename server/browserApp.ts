import path from 'node:path';
import express from 'express';

export function createBrowserApp(distPath: string) {
  const app = express();
  // sendFile uses its application's ETag setting, overriding per-call options.
  app.disable('etag');
  app.use('/assets', express.static(path.join(distPath, 'assets')));
  app.get('*all', (_request, response) => {
    // Buildpacks normalize file times. Equal-sized HTML across releases can share
    // a stat-based ETag even when it references different hashed assets.
    response.sendFile(path.join(distPath, 'index.html'), {
      lastModified: false,
      headers: { 'Cache-Control': 'no-store' },
    });
  });
  return app;
}
