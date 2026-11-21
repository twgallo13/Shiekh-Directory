/**
 * Signed-in client reads must be denied by the Firestore emulator using
 * rebuild/firestore.rules. Fails (does not skip) when the emulator is down
 * or is not serving this file.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, createUserWithEmailAndPassword, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, type Firestore } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = join(__dirname, '..', 'firestore.rules');
const PROJECT_ID = process.env.GCLOUD_PROJECT || 'shiekh-directory-v2';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

function normalizeRules(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim();
}

function rulesTextFromBody(text: string): string | null {
  try {
    const body = JSON.parse(text) as {
      rules?: { files?: Array<{ content?: string }> } | string;
      content?: string;
    };
    if (typeof body.rules === 'string' && body.rules.includes('service cloud.firestore')) return body.rules;
    const file = typeof body.rules === 'object'
      ? body.rules?.files?.find((entry) => entry.content?.includes('service cloud.firestore'))
      : undefined;
    if (file?.content) return file.content;
    if (typeof body.content === 'string' && body.content.includes('service cloud.firestore')) return body.content;
  } catch {
    if (text.includes('service cloud.firestore')) return text;
  }
  return null;
}

async function loadEmulatorRules(projectId: string): Promise<string> {
  const [host, port] = FIRESTORE_HOST.split(':');
  const projects = [...new Set([projectId, 'shiekh-directory-v2', 'shiekh-directory-rebuild-placeholder'])];
  const errors: string[] = [];
  for (const project of projects) {
    const urls = [
      `http://${host}:${port}/emulator/v1/projects/${project}:securityRules`,
      `http://${host}:${port}/emulator/v1/projects/${project}/securityRules`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) {
          errors.push(`${url} -> ${res.status} ${text.slice(0, 180)}`);
          continue;
        }
        const rules = rulesTextFromBody(text);
        if (rules) return rules;
        errors.push(`${url} -> unexpected body ${text.slice(0, 300)}`);
      } catch (error) {
        errors.push(`${url} -> ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  assert.fail(`Firestore emulator is missing or is not exposing the loaded rules:\n${errors.join('\n')}`);
}

describe('firestore rules emulator', () => {
  let app: FirebaseApp;
  let auth: Auth;
  let db: Firestore;

  before(async () => {
    const repoRules = readFileSync(RULES_PATH, 'utf8');
    assert.ok(normalizeRules(repoRules).includes('match /{document=**}'), 'repo rules must be the catch-all deny');
    const [host, portRaw] = FIRESTORE_HOST.split(':');
    const port = Number(portRaw);
    const probe = await fetch(`http://${host}:${port}/`).catch((error: Error) => {
      assert.fail(`Firestore emulator is not running at ${FIRESTORE_HOST}: ${error.message}`);
    });
    assert.ok(probe, 'Firestore emulator did not respond');

    const loaded = await loadEmulatorRules(PROJECT_ID);
    const loadedNorm = normalizeRules(loaded);
    const repoNorm = normalizeRules(repoRules);
    assert.strictEqual(
      loadedNorm,
      repoNorm,
      `Firestore emulator is not loading ${RULES_PATH}.\nLoaded:\n${loaded}`,
    );

    app = initializeApp({
      apiKey: 'demo-api-key',
      authDomain: 'localhost',
      projectId: PROJECT_ID,
    }, `rules-${Date.now()}`);
    auth = getAuth(app);
    connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
    db = getFirestore(app);
    connectFirestoreEmulator(db, host, port);

    const email = `rules-${Date.now()}@shiekhshoes.org`;
    const password = 'rules-test-password';
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch {
      await signInWithEmailAndPassword(auth, email, password);
    }
  });

  after(async () => {
    if (app) await deleteApp(app);
  });

  for (const collection of ['locations', 'people', 'assignments']) {
    it(`signed-in client read of ${collection} is denied`, async () => {
      await assert.rejects(
        getDoc(doc(db, collection, 'rules-probe')),
        (error: { code?: string }) => error?.code === 'permission-denied',
        `${collection} client read must be permission-denied`,
      );
    });
  }
});
