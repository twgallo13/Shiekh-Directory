import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('APP_URL Security', () => {
  it('should not have any APP_URL fallback to directory.shiekh.com', () => {
    const serverDir = join(__dirname, '..', 'server');
    const violations: string[] = [];
    
    function scanDir(dir: string): void {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
          const content = readFileSync(fullPath, 'utf-8');
          if (content.includes("APP_URL") && content.includes("directory.shiekh.com")) {
            violations.push(fullPath);
          }
          if (content.match(/\|\|\s*['"]https?:\/\/[^'"]*shiekh[^'"]*['"]/)) {
            violations.push(`${fullPath} (has shiekh URL fallback)`);
          }
        }
      }
    }
    
    scanDir(serverDir);
    
    assert.strictEqual(
      violations.length,
      0,
      `Found APP_URL fallbacks that should use settings.appBaseUrl instead:\n${violations.join('\n')}`
    );
  });

  it('should use getAppBaseUrl in email-sending code', async () => {
    const serverDir = join(__dirname, '..', 'server');
    const emailSendingFiles = [
      'routes/dmVerification.ts',
      'routes/invitations.ts',
      'routes/storeAuth.ts',
      'routes/verification.ts',
      'scheduledDMEscalation.ts',
      'scheduledReminders.ts',
    ];
    
    for (const file of emailSendingFiles) {
      const filePath = join(serverDir, file);
      const content = readFileSync(filePath, 'utf-8');
      
      const hasGetAppBaseUrl = content.includes('getAppBaseUrl');
      assert.ok(hasGetAppBaseUrl, `${file} should use getAppBaseUrl for URL construction`);
    }
  });
});

describe('Firestore Rules Security', () => {
  it('should deny every client read and write, including dmTasks', () => {
    const rulesPath = join(__dirname, '..', 'firestore.rules');
    const content = readFileSync(rulesPath, 'utf-8');

    assert.ok(content.includes('Admin SDK'), 'header should say access is via the Admin SDK');
    assert.ok(content.includes('match /{document=**}'), 'should catch every document');
    assert.ok(content.includes('allow read, write: if false'), 'should deny client read and write');
    assert.ok(!content.includes('isSignedIn'), 'signed-in clients must not be allowed to read');
    assert.ok(!content.includes('request.auth'), 'rules must not grant access from auth claims');
  });
});

describe('DM Escalation Logic', () => {
  it('should treat missing dmEscalated as false (eligible for escalation)', async () => {
    const filePath = join(__dirname, '..', 'server', 'scheduledDMEscalation.ts');
    const content = readFileSync(filePath, 'utf-8');
    
    assert.ok(
      content.includes('dmEscalated !== true'),
      'Should check dmEscalated !== true (treats missing as false)'
    );
    
    const hasEqualityFalse = content.match(/dmEscalated\s*===?\s*false/);
    assert.ok(
      !hasEqualityFalse,
      'Should NOT use strict equality to false (would miss undefined)'
    );
  });
});
