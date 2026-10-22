import assert from 'node:assert/strict';
import { test } from 'node:test';
import { operatingMailDelivery } from '../server/firestoreMail';
import { transactionDatabase } from './fixtures/transactionDatabase';

test('operating notification claims serialize SMTP attempts and preserve accepted receipts', async () => {
  const f = transactionDatabase(), actor = { uid: 'owner', role: 'Viewer' };
  f.records.set('operating_events/event', { actorId: 'owner' });
  const delivery = operatingMailDelivery(f.firestore);
  const results = await Promise.all([delivery.claim('event', 'request-a', 'steward@example.test', actor), delivery.claim('event', 'request-b', 'steward@example.test', actor)]);
  assert.deepEqual(results, ['claimed', 'uncertain']);
  await assert.rejects(delivery.finish('event', 'request-b', 'Accepted'), /claim changed/);
  await delivery.finish('event', 'request-a', 'Accepted');
  await delivery.finish('event', 'request-a', 'Unknown');
  assert.equal(await delivery.claim('event', 'request-c', 'new-steward@example.test', actor), 'accepted');
  assert.equal(f.records.get('operating_mail_receipts/event')?.recipient, 'steward@example.test');
  await assert.rejects(delivery.claim('event', 'request-d', 'steward@example.test', { uid: 'unrelated', role: 'Viewer' }));
});

test('only a proven not-started notification can be claimed again; uncertain SMTP never auto-retries', async () => {
  const f = transactionDatabase(), actor = { uid: 'owner', role: 'Editor' }, delivery = operatingMailDelivery(f.firestore);
  for (const status of ['NotStarted', 'Unknown'] as const) {
    f.records.set(`operating_events/${status}`, { actorId: actor.uid });
    assert.equal(await delivery.claim(status, 'first', 'steward@example.test', actor), 'claimed');
    await delivery.finish(status, 'first', status);
    assert.equal(await delivery.claim(status, 'second', 'steward@example.test', actor), status === 'NotStarted' ? 'claimed' : 'uncertain');
  }
});
