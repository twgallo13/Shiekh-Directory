import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelOperatingCommand, saveOperatingCommand, fetchOperatingPreview } from '../src/lib/operatingClient';
import { DirectoryCommitError } from '../src/lib/directoryClient';
import type { SessionUser } from '../src/lib/authSession';
import type { OperatingCommand } from '../server/operatingCommand';
const user = { uid: 'synthetic', getIdToken: async () => 'synthetic-token' } as SessionUser;
const command: OperatingCommand = { operationId: '12345678-1234-1234-1234-123456789abc', locationId: 'store', action: 'close', reason: 'Outage', expectedVersion: 3, expectedClosureId: null, expectedExpiresAt: '2026-10-23T07:00:00Z' };

test('operating client never confirms malformed, unrelated or invalid-clock results', async () => {
  const original = globalThis.fetch;
  const saved = { operationId: command.operationId, records: [{ collection: 'locations', id: 'store', operation: 'set', data: { id: 'store' } }], state: { state: 'Closed', reason: 'Outage', evaluatedAt: '2026-10-22T18:00:00Z' } };
  try {
    for (const value of [{}, { ...saved, operationId: 'wrong' }, { ...saved, state: { ...saved.state, evaluatedAt: 'bad' } }]) {
      globalThis.fetch = async () => Response.json(value);
      await assert.rejects(saveOperatingCommand(user, command), DirectoryCommitError);
    }
    globalThis.fetch = async () => new Response('<html>Lost response</html>');
    await assert.rejects(cancelOperatingCommand(user, command), DirectoryCommitError);
    globalThis.fetch = async () => Response.json({ cancelled: true, operationId: 'wrong' });
    await assert.rejects(cancelOperatingCommand(user, command), DirectoryCommitError);
    globalThis.fetch = async () => Response.json({ cancelled: true, operationId: command.operationId });
    assert.equal(await cancelOperatingCommand(user, command), true);
    globalThis.fetch = async () => Response.json(saved);
    assert.equal((await saveOperatingCommand(user, command)).state.state, 'Closed');
    globalThis.fetch = async () => Response.json({ locationId: 'store', action: 'close', expectedVersion: -1, evaluatedAt: 'bad', state: { state: 'Open' } });
    await assert.rejects(fetchOperatingPreview(user, 'store', 'close'), DirectoryCommitError);
  } finally { globalThis.fetch = original; }
});
