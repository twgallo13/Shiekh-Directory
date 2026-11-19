import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  BUILD_ID_PLACEHOLDER,
  KILL_SWITCH_MARKER,
  createBuildId,
  finalizeServiceWorker,
  stampServiceWorker,
} from '../scripts/stampBuildId.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

interface ListenerMap {
  install?: Array<(event: { waitUntil: (work: Promise<unknown>) => void }) => void>;
  activate?: Array<(event: { waitUntil: (work: Promise<unknown>) => void }) => void>;
  fetch?: Array<(event: unknown) => void>;
  message?: Array<(event: {
    data: unknown;
    ports: Array<{ postMessage: (message: unknown) => void }>;
    source: { postMessage: (message: unknown) => void } | null;
  }) => void>;
}

interface WorkerHarness {
  listeners: ListenerMap;
  skipWaitingCount: number;
  claimCount: number;
  cacheGets: string[];
  clientGets: string[];
  deletedCaches: string[];
  unregistered: boolean;
}

function loadWorker(source: string, options: { caches?: 'forbid' | 'kill' }): WorkerHarness {
  const listeners: ListenerMap = {};
  const harness: WorkerHarness = {
    listeners,
    skipWaitingCount: 0,
    claimCount: 0,
    cacheGets: [],
    clientGets: [],
    deletedCaches: [],
    unregistered: false,
  };

  const caches = options.caches === 'kill'
    ? {
        async keys() {
          return ['shkdir-old', 'other'];
        },
        async delete(key: string) {
          harness.deletedCaches.push(key);
          return true;
        },
        open() {
          throw new Error('caches.open called');
        },
      }
    : new Proxy({}, {
        get(_target, prop) {
          harness.cacheGets.push(String(prop));
          throw new Error(`caches.${String(prop)} called`);
        },
      });

  const self = {
    addEventListener(type: string, fn: unknown) {
      const bucket = listeners as Record<string, unknown[]>;
      if (!bucket[type]) bucket[type] = [];
      bucket[type].push(fn);
    },
    skipWaiting() {
      harness.skipWaitingCount += 1;
    },
    clients: {
      claim() {
        harness.claimCount += 1;
        harness.clientGets.push('claim');
        return Promise.resolve();
      },
      navigate(url: string) {
        harness.clientGets.push(`navigate:${url}`);
        throw new Error('clients.navigate called');
      },
    },
    registration: {
      async unregister() {
        harness.unregistered = true;
        return true;
      },
    },
  };

  const sandbox = {
    self,
    caches,
    Promise,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'sw.js' });
  return harness;
}

async function runLifecycle(harness: WorkerHarness): Promise<void> {
  const install = harness.listeners.install;
  assert.ok(install && install.length === 1);
  const installWaits: Array<Promise<unknown>> = [];
  install[0]({ waitUntil(work) { installWaits.push(work); } });
  await Promise.all(installWaits);

  const activate = harness.listeners.activate;
  assert.ok(activate && activate.length === 1);
  const activateWaits: Array<Promise<unknown>> = [];
  activate[0]({ waitUntil(work) { activateWaits.push(work); } });
  await Promise.all(activateWaits);
}

function assertInstallOnly(harness: WorkerHarness, buildId: string): void {
  if (harness.listeners.fetch && harness.listeners.fetch.length > 0) {
    throw new Error('fetch listener is registered');
  }
  assert.equal(harness.listeners.fetch, undefined);
  assert.equal(harness.skipWaitingCount, 1);
  assert.equal(harness.claimCount, 1);
  assert.deepEqual(harness.cacheGets, []);
  assert.equal(harness.clientGets.includes('claim'), true);
  assert.equal(harness.clientGets.some((call) => call.startsWith('navigate')), false);
  let reply: { type?: string; buildId?: string } | null = null;
  const message = harness.listeners.message;
  assert.ok(message && message.length === 1);
  message[0]({
    data: { type: 'GET_BUILD_ID' },
    ports: [{
      postMessage(value) {
        const record = value as { type?: string; buildId?: string };
        reply = { type: record.type, buildId: record.buildId };
      },
    }],
    source: null,
  });
  assert.deepEqual(reply, { type: 'BUILD_ID', buildId });
}

describe('service worker policy', () => {
  const publicSource = readFileSync(join(root, 'public', 'sw.js'), 'utf8');

  it('stamps the public worker and the stamped copy is install-only', async () => {
    assert.equal(publicSource.split(BUILD_ID_PLACEHOLDER).length - 1, 1);
    const buildId = 'build-test-1';
    const stamped = stampServiceWorker(publicSource, buildId);
    assert.equal(stamped.includes(BUILD_ID_PLACEHOLDER), false);
    assert.equal(stamped.includes(buildId), true);
    const harness = loadWorker(stamped, { caches: 'forbid' });
    await runLifecycle(harness);
    assertInstallOnly(harness, buildId);
  });

  it('fails the policy when a fetch listener is added', async () => {
    const stamped = stampServiceWorker(publicSource, 'build-test-2');
    const bad = `${stamped}\nself.addEventListener("fetch", () => {});\n`;
    const harness = loadWorker(bad, { caches: 'forbid' });
    await runLifecycle(harness);
    assert.throws(() => assertInstallOnly(harness, 'build-test-2'), /fetch/);
  });

  it('createBuildId differs per production build and stamp rejects a leftover placeholder', () => {
    assert.equal(createBuildId('serve', 'development'), 'dev');
    assert.equal(createBuildId('build', 'test'), 'test');
    const first = createBuildId('build', 'production');
    const second = createBuildId('build', 'production');
    assert.notEqual(first, second);
    assert.match(first, /^[0-9a-z-]+$/i);
    assert.throws(() => stampServiceWorker('no placeholder here', first));
    const doubled = publicSource.replace(BUILD_ID_PLACEHOLDER, `${BUILD_ID_PLACEHOLDER} ${BUILD_ID_PLACEHOLDER}`);
    assert.throws(() => stampServiceWorker(doubled, first));
  });

  it('finalizeServiceWorker stamps a normal worker and rejects an unmarked worker with no id', () => {
    const buildId = 'build-test-final';
    const stamped = finalizeServiceWorker(publicSource, buildId);
    assert.equal(stamped.includes(BUILD_ID_PLACEHOLDER), false);
    assert.equal(stamped.includes(buildId), true);
    assert.equal(finalizeServiceWorker(stamped, buildId), stamped);
    assert.throws(() => finalizeServiceWorker('self.addEventListener("install", () => {});\n', buildId));
  });

  const distPath = join(root, 'dist', 'sw.js');
  it('dist/sw.js does not keep the build-id placeholder', {
    skip: existsSync(distPath)
      ? false
      : 'dist/sw.js is produced by npm run build, which fails if the placeholder survives',
  }, async () => {
    const text = readFileSync(distPath, 'utf8');
    assert.equal(text.includes(BUILD_ID_PLACEHOLDER), false);
    const match = text.match(/const BUILD_ID = "([^"]+)";/);
    assert.ok(match, 'dist/sw.js has no BUILD_ID assignment');
    const buildId = match[1];
    assert.notEqual(buildId, BUILD_ID_PLACEHOLDER);
    const harness = loadWorker(text, { caches: 'forbid' });
    await runLifecycle(harness);
    assertInstallOnly(harness, buildId);
  });
});

describe('kill switch', () => {
  const source = readFileSync(join(root, 'docs', 'sw-killswitch.js'), 'utf8');

  it('passes through the production build without a build id', () => {
    assert.equal(source.includes(KILL_SWITCH_MARKER), true);
    assert.equal(source.includes(BUILD_ID_PLACEHOLDER), false);
    const buildId = 'build-test-kill';
    assert.equal(finalizeServiceWorker(source, buildId), source);
    assert.throws(
      () => finalizeServiceWorker(`${source}\nconst BUILD_ID = "${BUILD_ID_PLACEHOLDER}";\n`, buildId),
      /placeholder survived/,
    );
  });

  it('unregisters, deletes caches, and never navigates or fetches', async () => {
    assert.equal(source.includes('clients.navigate'), false);
    assert.equal(source.includes('location.reload'), false);
    assert.equal(source.includes('fetch'), false);
    const harness = loadWorker(source, { caches: 'kill' });
    await runLifecycle(harness);
    assert.equal(harness.listeners.fetch, undefined);
    assert.equal(harness.skipWaitingCount, 1);
    assert.equal(harness.claimCount, 0);
    assert.deepEqual(harness.deletedCaches, ['shkdir-old', 'other']);
    assert.equal(harness.unregistered, true);
    assert.equal(harness.clientGets.some((call) => call.startsWith('navigate')), false);
  });
});
