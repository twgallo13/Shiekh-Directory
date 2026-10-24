import type { SessionState } from './authSession';
import type { DirectorySeed } from './directorySeed';

const fail = (): never => { throw new Error('Current saved Directory could not be confirmed. Keep the original operation and retry recovery.'); };
export function parseTransitionDirectory(body: any): DirectorySeed {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.serverNow !== 'string' || !Number.isFinite(Date.parse(body.serverNow))) fail();
  const arrays = ['locations', 'people', 'users', 'requests', 'auditLogs', 'hoursTemplates', 'corporateHolidays', 'emailTemplates', 'notificationRules', 'outboxLogs', 'sopRunbooks', 'regions', 'districts'];
  for (const field of arrays) {
    const rows = body[field]; if (!Array.isArray(rows) || rows.length > 50_000) fail();
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id) || Object.hasOwn(row, 'version') && row.version !== null && (!Number.isSafeInteger(row.version) || row.version < 0)) fail();
      ids.add(row.id);
    }
  }
  if (body.locations.some((r: any) => typeof r.storeNumber !== 'string' || typeof r.name !== 'string') || body.people.some((r: any) => typeof r.fullName !== 'string')) fail();
  if (body.customFieldDefinitions !== undefined && !Array.isArray(body.customFieldDefinitions)) fail();
  return body as DirectorySeed;
}
/** Complete saved-state refresh, never a best-effort polling callback. No mutation or retry. */
export async function refreshTransitionSavedState(options: {
  session(): SessionState; generation(): number; fence(): { epoch: number; pending: number };
  read(): Promise<unknown>; apply(seed: DirectorySeed): void;
}) {
  const session = options.session(), uid = session.user?.uid, generation = options.generation(), epoch = options.fence().epoch;
  const check = () => {
    const s = options.session(), fence = options.fence();
    if (!uid || s.status !== 'authorized' || s.user?.uid !== uid || s.account?.uid !== uid || s.account.role !== 'System Administrator' || s.account.status !== 'Active' || s.account.accessScope !== 'Company-wide'
      || options.generation() !== generation || fence.epoch !== epoch || fence.pending) fail();
  };
  check(); const raw = await options.read(); check(); const body = parseTransitionDirectory(raw);
  check(); options.apply(body); check();
}
