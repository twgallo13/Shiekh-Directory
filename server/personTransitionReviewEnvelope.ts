import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalTransitionId, object } from './personTransitionIntent';

const AUDIENCE = 'directory-person-transition-review-v1';
export const TRANSITION_REVIEW_TTL_MS = 300_000;
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value);
const actorId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\u0000-\u001f]/.test(value);
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function invalid(): never { throw new Error('Invalid transition review envelope.'); }
function decode(value: string, maximum: number) {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > maximum) invalid();
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value) invalid();
  return bytes;
}
export interface TransitionReviewClaims {
  schemaVersion: 1; audience: typeof AUDIENCE; keyId: string;
  actorUid: string; personId: string; intentHash: string; stateHash: string; planHash: string;
  issuedAt: number; expiresAt: number;
}
function validClaims(value: unknown): value is TransitionReviewClaims {
  return object(value) && Object.keys(value).sort().join(',') === ['schemaVersion', 'audience', 'keyId', 'actorUid', 'personId', 'intentHash', 'stateHash', 'planHash', 'issuedAt', 'expiresAt'].sort().join(',')
    && value.schemaVersion === 1 && value.audience === AUDIENCE && id(value.keyId) && actorId(value.actorUid) && canonicalTransitionId(value.personId)
    && hash(value.intentHash) && hash(value.stateHash) && hash(value.planHash)
    && Number.isSafeInteger(value.issuedAt) && value.issuedAt >= 0 && Number.isSafeInteger(value.expiresAt)
    && value.expiresAt - value.issuedAt === TRANSITION_REVIEW_TTL_MS;
}

/** Dedicated server keyring only. A signed review is neither authentication nor permission to write. */
export class PersonTransitionReviewSigner {
  #keys = new Map<string, Buffer>();
  #active: string;
  constructor(config: unknown) {
    if (!object(config) || Object.keys(config).some(k => !['activeKeyId', 'keys'].includes(k)) || !id(config.activeKeyId)
      || !Array.isArray(config.keys) || !config.keys.length || config.keys.length > 3) throw new Error('Invalid transition review signing configuration.');
    for (const key of config.keys) {
      if (!object(key) || Object.keys(key).sort().join(',') !== 'id,secret' || !id(key.id) || this.#keys.has(key.id) || typeof key.secret !== 'string') throw new Error('Invalid transition review signing configuration.');
      let bytes: Buffer;
      try { bytes = decode(key.secret, 86); } catch { throw new Error('Invalid transition review signing configuration.'); }
      if (bytes.length < 32 || bytes.length > 64) throw new Error('Invalid transition review signing configuration.');
      this.#keys.set(key.id, bytes);
    }
    if (!this.#keys.has(config.activeKeyId)) throw new Error('Invalid transition review signing configuration.');
    this.#active = config.activeKeyId;
  }
  sign(input: Omit<TransitionReviewClaims, 'schemaVersion' | 'audience' | 'keyId'>) {
    const claims: TransitionReviewClaims = { ...input, schemaVersion: 1, audience: AUDIENCE, keyId: this.#active };
    if (!validClaims(claims)) invalid();
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signature = createHmac('sha256', this.#keys.get(this.#active)!).update(`${AUDIENCE}.${payload}`).digest('base64url');
    return `ptv1.${payload}.${signature}`;
  }
  /** Cryptographic binding only, never admission to prepare or write. Terminal replay may outlive expiry. */
  verifySignature(token: unknown, expected: Pick<TransitionReviewClaims, 'actorUid' | 'personId' | 'intentHash'>): TransitionReviewClaims {
    if (typeof token !== 'string' || token.length > 4096) invalid();
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== 'ptv1') invalid();
    let claims: unknown;
    const raw = decode(parts[1], 3800).toString('utf8');
    try { claims = JSON.parse(raw); } catch { invalid(); }
    if (!validClaims(claims) || JSON.stringify(claims) !== raw || !this.#keys.has(claims.keyId)) invalid();
    const signature = decode(parts[2], 43);
    const calculated = createHmac('sha256', this.#keys.get(claims.keyId)!).update(`${AUDIENCE}.${parts[1]}`).digest();
    if (signature.length !== calculated.length || !timingSafeEqual(signature, calculated)
      || claims.actorUid !== expected.actorUid || claims.personId !== expected.personId || claims.intentHash !== expected.intentHash) invalid();
    return { ...claims };
  }
  verify(token: unknown, expected: Pick<TransitionReviewClaims, 'actorUid' | 'personId' | 'intentHash'>, now: number): TransitionReviewClaims {
    const claims = this.verifySignature(token, expected);
    if (!Number.isSafeInteger(now) || now < claims.issuedAt || now >= claims.expiresAt) invalid();
    return claims;
  }
}

/** Missing configuration disables only this preview. Never fall back to an import/API/Firebase key. */
export function loadPersonTransitionReviewSigner(value = process.env.PERSON_TRANSITION_REVIEW_KEYRING) {
  if (value === undefined || value === '') return undefined;
  try { return new PersonTransitionReviewSigner(JSON.parse(value)); }
  catch { throw new Error('Invalid transition review signing configuration.'); }
}
