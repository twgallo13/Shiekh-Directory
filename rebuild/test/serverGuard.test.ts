import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Server Cloud Function Guard', () => {
  function isCloudFunction(env: Record<string, string | undefined>): boolean {
    return !!(
      env.FUNCTION_TARGET ||
      env.K_SERVICE ||
      env.FUNCTIONS_CONTROL_API
    );
  }

  it('detects FUNCTION_TARGET (Cloud Functions runtime)', () => {
    assert.strictEqual(isCloudFunction({ FUNCTION_TARGET: 'api' }), true);
  });

  it('detects K_SERVICE (Cloud Run / Gen2 Functions)', () => {
    assert.strictEqual(isCloudFunction({ K_SERVICE: 'api' }), true);
  });

  it('detects FUNCTIONS_CONTROL_API (Firebase CLI deploy code-load)', () => {
    assert.strictEqual(isCloudFunction({ FUNCTIONS_CONTROL_API: 'http://localhost:9980' }), true);
  });

  it('returns false when no cloud env vars set', () => {
    assert.strictEqual(isCloudFunction({}), false);
  });

  it('returns false for unrelated env vars', () => {
    assert.strictEqual(isCloudFunction({ PORT: '3001', NODE_ENV: 'production' }), false);
  });
});
