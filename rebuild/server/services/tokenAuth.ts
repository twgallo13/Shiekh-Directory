import { createHmac, randomBytes } from 'crypto';

const DEV_SECRET = 'dev-token-secret-not-for-production';
const DEV_SESSION_SECRET = 'dev-session-secret-not-for-production';

let tokenSecretValidated = false;
let sessionSecretValidated = false;

function validateTokenSecret(): string {
  const secret = process.env.STORE_AUTH_TOKEN_SECRET;
  
  if (!secret) {
    throw new Error(
      'STORE_AUTH_TOKEN_SECRET environment variable is required. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"'
    );
  }
  
  if (secret === DEV_SECRET) {
    throw new Error(
      'STORE_AUTH_TOKEN_SECRET is set to the hardcoded dev default. ' +
      'This is not allowed in any environment. ' +
      'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"'
    );
  }
  
  if (secret.length < 32) {
    throw new Error(
      'STORE_AUTH_TOKEN_SECRET is too short (minimum 32 characters). ' +
      'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"'
    );
  }
  
  tokenSecretValidated = true;
  return secret;
}

function validateSessionSecret(): string {
  const secret = process.env.STORE_SESSION_SECRET;
  
  if (!secret) {
    throw new Error(
      'STORE_SESSION_SECRET environment variable is required. ' +
      'Generate with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"'
    );
  }
  
  if (secret === DEV_SESSION_SECRET) {
    throw new Error(
      'STORE_SESSION_SECRET is set to the hardcoded dev default. ' +
      'This is not allowed in any environment. ' +
      'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"'
    );
  }
  
  if (secret.length < 32) {
    throw new Error(
      'STORE_SESSION_SECRET is too short (minimum 32 characters). ' +
      'Generate a secure secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64\'))"'
    );
  }
  
  sessionSecretValidated = true;
  return secret;
}

export function getTokenSecret(): string {
  if (tokenSecretValidated) {
    return process.env.STORE_AUTH_TOKEN_SECRET!;
  }
  return validateTokenSecret();
}

export function getSessionSecret(): string {
  if (sessionSecretValidated) {
    return process.env.STORE_SESSION_SECRET!;
  }
  return validateSessionSecret();
}

export function hashToken(token: string): string {
  const secret = getTokenSecret();
  return createHmac('sha256', secret).update(token).digest('hex');
}

export function hashSessionId(sessionId: string): string {
  const secret = getSessionSecret();
  return createHmac('sha256', secret).update(sessionId).digest('hex');
}

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function generateSessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function isTokenSecretConfigured(): boolean {
  const secret = process.env.STORE_AUTH_TOKEN_SECRET;
  return !!secret && secret !== DEV_SECRET && secret.length >= 32;
}

export function isSessionSecretConfigured(): boolean {
  const secret = process.env.STORE_SESSION_SECRET;
  return !!secret && secret !== DEV_SESSION_SECRET && secret.length >= 32;
}

export function validateSecuritySecrets(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    validateTokenSecret();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Token secret validation failed');
  }
  
  try {
    validateSessionSecret();
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Session secret validation failed');
  }
  
  return { valid: errors.length === 0, errors };
}
