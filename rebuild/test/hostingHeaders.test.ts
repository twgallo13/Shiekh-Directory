import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
// Same call superstatic (the Hosting emulator) makes: minimatch(path, source)
// with minimatch 3 defaults. "/" is a literal in the no-cache brace because
// minimatch does not match "/" against the extensionless extglob.
const minimatch = require('minimatch') as (target: string, pattern: string) => boolean;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface HeaderPair {
  key: string;
  value: string;
}

interface HeaderRule {
  source: string;
  headers: HeaderPair[];
}

interface FirebaseHosting {
  headers: HeaderRule[];
  rewrites: Array<{ source: string; function?: string; destination?: string }>;
}

const NO_CACHE = 'no-cache, no-store, must-revalidate';
const IMMUTABLE = 'public, max-age=31536000, immutable';

const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8')) as { hosting: FirebaseHosting };
const headerRules = config.hosting.headers;

function rulesWith(key: string): Array<{ source: string; value: string }> {
  const found: Array<{ source: string; value: string }> = [];
  for (const rule of headerRules) {
    for (const header of rule.headers) {
      if (header.key === key) found.push({ source: rule.source, value: header.value });
    }
  }
  return found;
}

const cacheRules = rulesWith('Cache-Control');
const referrerRules = rulesWith('Referrer-Policy');

function matches(match: (target: string, pattern: string) => boolean, urlPath: string, rules: Array<{ source: string; value: string }>) {
  return rules.filter((rule) => match(urlPath, rule.source));
}

const PATHS = [
  '/',
  '/index.html',
  '/people',
  '/locations/abc',
  '/sw.js',
  '/manifest.json',
  '/assets/index-abc.js',
  '/assets/x.js',
  '/api/v1/locations',
  '/api/app/health',
  '/finish-sign-in',
  '/store-signin',
  '/verify/x',
  '/verify-action',
  '/dm-verify/x',
  '/location/x',
  '/icon-192.png',
  '/__/auth/handler',
  '/person/a.b',
  '/people/',
  '/locations/abc/',
];

describe('firebase.json hosting headers', () => {
  it('keeps the four Referrer-Policy rules and the rewrites', () => {
    assert.deepEqual(referrerRules, [
      { source: '/verify-action**', value: 'no-referrer' },
      { source: '/store-signin**', value: 'no-referrer' },
      { source: '/verify/**', value: 'no-referrer' },
      { source: '/dm-verify/**', value: 'no-referrer' },
    ]);
    assert.deepEqual(config.hosting.rewrites, [
      { source: '/api/**', function: 'api' },
      { source: '**', destination: '/index.html' },
    ]);
  });

  it('matches at most one Cache-Control rule per path on minimatch and matchesGlob', () => {
    for (const urlPath of PATHS) {
      const byMinimatch = matches(minimatch, urlPath, cacheRules);
      const byMatchesGlob = matches(matchesGlob, urlPath, cacheRules);
      assert.ok(byMinimatch.length <= 1, `minimatch ${urlPath} matched ${byMinimatch.length} Cache-Control rules`);
      assert.ok(byMatchesGlob.length <= 1, `matchesGlob ${urlPath} matched ${byMatchesGlob.length} Cache-Control rules`);
    }
  });

  it('sets no-cache on the shell, worker, manifest, and extensionless navigations', () => {
    const noCachePaths = [
      '/',
      '/index.html',
      '/sw.js',
      '/manifest.json',
      '/people',
      '/locations/abc',
      '/finish-sign-in',
      '/store-signin',
      '/verify/x',
      '/verify-action',
      '/dm-verify/x',
      '/location/x',
      '/__/auth/handler',
    ];
    for (const urlPath of noCachePaths) {
      const found = matches(minimatch, urlPath, cacheRules);
      assert.equal(found.length, 1, urlPath);
      assert.equal(found[0].value, NO_CACHE, urlPath);
    }
  });

  it('caches hashed assets as immutable and does not cache /api', () => {
    for (const urlPath of ['/assets/index-abc.js', '/assets/x.js']) {
      const found = matches(minimatch, urlPath, cacheRules);
      assert.equal(found.length, 1, urlPath);
      assert.equal(found[0].value, IMMUTABLE, urlPath);
    }
    for (const urlPath of ['/api/v1/locations', '/api/app/health', '/api', '/api/']) {
      assert.equal(matches(minimatch, urlPath, cacheRules).length, 0, urlPath);
      assert.equal(matches(matchesGlob, urlPath, cacheRules).length, 0, urlPath);
      assert.equal(matches(minimatch, urlPath, referrerRules).length, 0, urlPath);
    }
  });

  it('keeps Referrer-Policy on the verify and store-signin paths', () => {
    assert.equal(matches(minimatch, '/store-signin', referrerRules)[0].value, 'no-referrer');
    assert.equal(matches(minimatch, '/verify-action', referrerRules)[0].value, 'no-referrer');
    assert.equal(matches(minimatch, '/verify/x', referrerRules)[0].value, 'no-referrer');
    assert.equal(matches(minimatch, '/dm-verify/x', referrerRules)[0].value, 'no-referrer');
    assert.equal(matches(minimatch, '/finish-sign-in', referrerRules).length, 0);
  });

  it('requires exactly one no-cache Cache-Control rule for / on minimatch and matchesGlob', () => {
    // minimatch 3.1.5 (superstatic, the Hosting emulator) does not match "/"
    // against "/!(*.*|api|assets)". "/" is therefore a literal alternative in
    // the same no-cache source. A second source of "/" would make one of
    // these matchers see two Cache-Control rules.
    const byMinimatch = matches(minimatch, '/', cacheRules);
    const byMatchesGlob = matches(matchesGlob, '/', cacheRules);
    assert.equal(byMinimatch.length, 1);
    assert.equal(byMatchesGlob.length, 1);
    assert.equal(byMinimatch[0].value, NO_CACHE);
    assert.equal(byMatchesGlob[0].value, NO_CACHE);
    assert.equal(byMinimatch[0].source, byMatchesGlob[0].source);
    assert.equal(minimatch('/', '**/!(*.*)'), false);
    assert.equal(matchesGlob('/', '**/!(*.*)'), true);
  });
});
