import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import express from 'express';
import { createBrowserApp } from '../server/browserApp';

test('production HTML serves the current release despite stale validators and normalized build timestamps', async () => {
  const dist = await mkdtemp(path.join(os.tmpdir(), 'directory-browser-release-'));
  const htmlPath = path.join(dist, 'index.html');
  const timestamp = new Date('1980-01-01T00:00:01Z');
  const oldHtml = '<script src="/assets/index-old.js"></script>';
  const newHtml = '<script src="/assets/index-new.js"></script>';
  await mkdir(path.join(dist, 'assets'));
  await writeFile(htmlPath, oldHtml);
  await utimes(htmlPath, timestamp, timestamp);
  // Reproduce the weak stat ETag that the previous sendFile implementation emitted.
  const previous = express();
  previous.get('*all', (_request, response) => response.sendFile(htmlPath));
  const previousServer = previous.listen(0, '127.0.0.1');
  await once(previousServer, 'listening');
  const previousResponse = await fetch(`http://127.0.0.1:${(previousServer.address() as { port: number }).port}/`);
  const oldEtag = previousResponse.headers.get('etag')!;
  await previousResponse.text();
  previousServer.closeAllConnections();
  await new Promise<void>(resolve => previousServer.close(() => resolve()));

  await writeFile(htmlPath, newHtml);
  await utimes(htmlPath, timestamp, timestamp);
  await writeFile(path.join(dist, 'assets', 'index-new.js'), 'console.log("release");');
  const app = express();
  app.use(createBrowserApp(dist));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const route of ['/', '/locations/loc-150/edit', '/index.html']) {
      const response = await fetch(origin + route, { headers: { 'If-None-Match': oldEtag, 'If-Modified-Since': timestamp.toUTCString() } });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), newHtml);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('etag'), null);
      assert.equal(response.headers.get('last-modified'), null);
    }
    const asset = await fetch(origin + '/assets/index-new.js');
    assert.equal(asset.status, 200);
    assert.ok(asset.headers.get('etag'), 'Hashed asset validators remain available.');
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(path.dirname(path.resolve(dist)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dist).startsWith('directory-browser-release-'));
    await rm(dist, { recursive: true, force: true });
  }
});
