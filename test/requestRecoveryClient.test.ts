import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelDirectorySubmission, commitDirectory, DirectoryCommitError, type DirectoryWrite } from '../src/lib/directoryClient';
import type { SessionUser } from '../src/lib/authSession';
const user = { getIdToken: async () => 'synthetic-token' } as unknown as SessionUser;
const write: DirectoryWrite = { collection: 'requests', id: 'req-test', operation: 'set', data: { status: 'Pending' } };
const audit = { action: 'Request Submitted', entityType: 'Request' as const, entityId: write.id, entityName: 'Synthetic', details: 'Synthetic' };
const saved = { records: [{ collection: 'requests', id: write.id, operation: 'set', data: { id: write.id, status: 'Rejected' } }], replayed: true };
test('cancellation response failures preserve uncertainty with actionable errors', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('Rate limited', { status: 429 }), new Response('Proxy failure', { status: 502 }), Response.json({}), Response.json({ records: [], cancelled: false }), Response.json({ records: [{ id: 'wrong' }], cancelled: true })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(cancelDirectorySubmission(user, write), e => e instanceof DirectoryCommitError && /could not be confirmed/.test(e.message));
    }
    globalThis.fetch = async () => Response.json({ records: [], cancelled: true });
    assert.equal((await cancelDirectorySubmission(user, write)).cancelled, true);
    globalThis.fetch = async () => Response.json({ ...saved, cancelled: false });
    assert.equal((await cancelDirectorySubmission(user, write)).records[0].data?.status, 'Rejected');
  } finally { globalThis.fetch = original; }
});
test('malformed successful submission responses cannot masquerade as a confirmed save', async () => {
  const original = globalThis.fetch;
  try {
    for (const response of [new Response('Unexpected HTML'), Response.json({ records: [] }), Response.json({ records: [{ collection: 'requests', id: 'wrong', operation: 'set', data: { id: 'wrong', status: 'Pending' } }] })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(commitDirectory(user, [write], audit), DirectoryCommitError);
    }
    globalThis.fetch = async () => Response.json(saved);
    assert.equal((await commitDirectory(user, [write], audit)).records[0].data?.status, 'Rejected');
  } finally { globalThis.fetch = original; }
});
