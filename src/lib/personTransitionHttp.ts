import type { SessionState } from './authSession';
import { normalizePersonTransitionIntent, object } from './personTransitionIntent';
import { parseTransitionRecoveryMarker } from './personTransitionRecovery';
import type { ClientTransitionCommand, TransitionCommandPort } from './personTransitionController';

export class TransitionTransportError extends Error {
  constructor(public readonly status?: number) { super('The transition request outcome could not be confirmed. Keep the original operation.'); }
}
const exact = (v: unknown, keys: string[]): v is Record<string, any> => object(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
function commandBody(value: ClientTransitionCommand) {
  if (!exact(value, ['schemaVersion', 'operationId', 'intent', 'reviewEnvelope']) || value.schemaVersion !== 1 || typeof value.reviewEnvelope !== 'string' || !value.reviewEnvelope || value.reviewEnvelope.length > 4096) throw new TransitionTransportError(400);
  const intent = normalizePersonTransitionIntent(value.intent);
  parseTransitionRecoveryMarker({ schemaVersion: 1, operationId: value.operationId, personId: intent.personId, commandDigest: '0'.repeat(64) });
  const body = JSON.stringify({ schemaVersion: 1, operationId: value.operationId, intent, reviewEnvelope: value.reviewEnvelope });
  if (new TextEncoder().encode(body).byteLength > 128 * 1024) throw new TransitionTransportError(413);
  return body;
}

/** Unwired, disabled by default. Activation must come from the approved server workflow,
 * never a role/title, consumer grant or possession of a review envelope. No automatic retries.
 */
export function createTransitionCommandHttpPort(options: {
  session(): SessionState; generation(): number; request: typeof fetch; enabled?: boolean; recoveryEnabled?: boolean; timeoutMs?: number;
}): TransitionCommandPort & { dispose(): void; capabilities(): Promise<unknown>; preview(intent: unknown): Promise<unknown>; directory(): Promise<unknown> } {
  const initial = options.session(), uid = initial.user?.uid, generation = options.generation();
  let disposed = false; const active = new Set<AbortController>();
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000 || !Number.isSafeInteger(generation) || generation < 0) throw new TransitionTransportError();
  type Method = 'operations' | 'status' | 'prepare' | 'commit' | 'cancel' | 'capabilities' | 'preview' | 'directory';
  const check = (method: Method) => {
    const s = options.session(), a = s.account;
    const permitted = method === 'capabilities' || (['operations', 'status', 'cancel', 'directory'].includes(method) ? options.recoveryEnabled === true : options.enabled === true);
    if (disposed || !permitted || s.status !== 'authorized' || !s.user || !a || s.user.uid !== uid || a.uid !== uid || a.role !== 'System Administrator' || a.status !== 'Active' || a.accessScope !== 'Company-wide' || options.generation() !== generation) throw new TransitionTransportError(403);
    return s.user;
  };
  const call = async (method: Method, body?: string): Promise<unknown> => {
    const user = check(method), abort = new AbortController(); active.add(abort);
    let timer: ReturnType<typeof setTimeout>;
    let rejectAbort: () => void;
    const expired = new Promise<never>((_resolve, reject) => {
      rejectAbort = () => reject(new TransitionTransportError()); abort.signal.addEventListener('abort', rejectAbort, { once: true });
      timer = setTimeout(() => abort.abort(), timeoutMs);
    });
    const job = (async () => {
      const token = await user.getIdToken(); check(method);
      if (abort.signal.aborted || typeof token !== 'string' || !token.length || token.length > 8192 || /\s/.test(token)) throw new TransitionTransportError();
      const request = options.request;
      const response = await request(method === 'directory' ? '/api/auth/bootstrap' : `/api/directory/person-transitions/${method}`, {
        method: ['operations', 'capabilities', 'directory'].includes(method) ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        cache: 'no-store', redirect: 'error', signal: abort.signal, ...(body === undefined ? {} : { body }),
      }); check(method);
      if (!response.ok) throw new TransitionTransportError(response.status);
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new TransitionTransportError();
      const result = await response.json(); check(method);
      if (abort.signal.aborted) throw new TransitionTransportError();
      return result;
    })();
    try { const result = await Promise.race([job, expired]); check(method); return result; }
    catch (error) { abort.abort(); throw error instanceof TransitionTransportError ? error : new TransitionTransportError(); }
    finally { clearTimeout(timer!); abort.signal.removeEventListener('abort', rejectAbort!); active.delete(abort); }
  };
  return {
    capabilities: () => call('capabilities'),
    preview: intent => call('preview', JSON.stringify(normalizePersonTransitionIntent(intent))),
    directory: () => call('directory'),
    list: () => call('operations'),
    status: marker => call('status', JSON.stringify(parseTransitionRecoveryMarker(marker))),
    prepare: command => call('prepare', commandBody(command)),
    commit: command => call('commit', commandBody(command)),
    cancel: marker => call('cancel', JSON.stringify(parseTransitionRecoveryMarker(marker))),
    dispose() { disposed = true; for (const abort of active) abort.abort(); },
  };
}
