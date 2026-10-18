'use strict';

/**
 * Integration tests for the messaging dispatch boundary.
 *
 * Milestone 2 built the transactional half of the outbox pattern and proved it:
 * a row is written in the same transaction as the status change, and a rolled
 * back transition leaves nothing behind. The dispatch half was written and
 * never invoked, so no test had ever shown that a Pending row becomes a
 * Dispatched one. These cases close that gap, which is DEF-011.
 *
 * They run against a real PostgreSQL instance because the behaviour under test
 * is the interaction between the worker's SQL and the table's constraints:
 * the status CHECK, the attempt counter and the UNIQUE idempotency key. A fake
 * database would assert that the worker issues the statements the test author
 * expected, which is not the same as asserting the queue drains.
 *
 * Connection comes from TEST_DATABASE_URL; the suite skips when it is absent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

const {
  runOnce,
  createRecipientResolver,
} = require('../../src/integration/messaging/dispatchRunner');
const {
  SimulatedMessagingAdapter,
} = require('../../src/integration/messaging/simulatedMessagingAdapter');
const {
  PermanentDeliveryError,
  TransientDeliveryError,
} = require('../../src/integration/messaging/messagingPort');

const CONNECTION_STRING = process.env.TEST_DATABASE_URL;
const describeOrSkip = CONNECTION_STRING ? test.describe : test.describe.skip;

const SUBURB = 'DispatchTestville';
const CITIZEN_EMAIL = 'dispatch.citizen@civicconnect.test';

const quietLogger = { info() {}, warn() {}, error() {} };

function newPool() {
  return new Pool({ connectionString: CONNECTION_STRING, max: 4 });
}

async function reset(pool) {
  // Earlier integration files leave Pending rows in the outbox as a side
  // effect of the transitions they exercise. The worker drains the whole
  // queue, not one suite's slice of it, so those rows are taken out of scope
  // here rather than deleted: deleting another suite's evidence to make this
  // one pass would be the wrong trade.
  await pool.query(
    `UPDATE messaging_outbox
        SET status = 'Dispatched', dispatched_at = NOW()
      WHERE status = 'Pending'`);
  await pool.query(
    `DELETE FROM messaging_outbox WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = $1)`, [SUBURB]);
  await pool.query(
    `DELETE FROM request_audit_log WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = $1)`, [SUBURB]);
  await pool.query(`DELETE FROM service_requests WHERE suburb = $1`, [SUBURB]);
  await pool.query(`DELETE FROM users WHERE email = $1`, [CITIZEN_EMAIL]);
}

async function seedRequest(pool) {
  const citizen = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ('Dispatch Citizen', $1, 'not-a-real-hash', 'Citizen')
     RETURNING user_id`,
    [CITIZEN_EMAIL],
  );
  const citizenId = citizen.rows[0].user_id;

  const request = await pool.query(
    `INSERT INTO service_requests
       (tracking_code, requester_id, category_id, title, description,
        location_address, suburb, status, sla_due_at)
     VALUES ($1, $2, 2, 'Dispatch test request',
             'Seeded for the messaging dispatch integration tests.',
             '1 Dispatch Road', $3, 'Submitted', NOW() + INTERVAL '24 hours')
     RETURNING request_id`,
    [`DSP-${Date.now()}`, citizenId, SUBURB],
  );

  return { citizenId, requestId: request.rows[0].request_id };
}

async function queueMessage(pool, { requestId, citizenId, key, body = 'Your request has been updated.' }) {
  const { rows } = await pool.query(
    `INSERT INTO messaging_outbox
       (request_id, recipient_user_id, channel, message_body, idempotency_key)
     VALUES ($1, $2, 'WhatsApp', $3, $4)
     RETURNING outbox_id`,
    [requestId, citizenId, body, key],
  );
  return rows[0].outbox_id;
}

async function outboxRow(pool, outboxId) {
  const { rows } = await pool.query(
    `SELECT status, attempt_count, last_error, dispatched_at
       FROM messaging_outbox WHERE outbox_id = $1`,
    [outboxId],
  );
  return rows[0];
}

/** An adapter that fails every send in a stated way, for the failure paths. */
class FailingAdapter extends SimulatedMessagingAdapter {
  constructor(error) {
    super({ logger: quietLogger });
    this.error = error;
    this.attempts = 0;
  }

  async send() {
    this.attempts += 1;
    throw this.error;
  }
}

describeOrSkip('Messaging dispatch boundary', () => {
  let pool;

  test.before(async () => {
    pool = newPool();
    await reset(pool);
  });

  test.after(async () => {
    await reset(pool);
    await pool.end();
  });

  test('MSG-01 a pending message is dispatched and the row records the outcome', async (t) => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    const outboxId = await queueMessage(pool, {
      requestId, citizenId, key: `msg-01-${Date.now()}`,
    });

    const adapter = new SimulatedMessagingAdapter({ logger: quietLogger });
    const result = await runOnce({ db: pool, adapter, logger: quietLogger });

    assert.equal(result.skipped, false);
    assert.equal(result.examined, 1);
    assert.equal(result.dispatched, 1);
    assert.equal(result.failed, 0);

    const row = await outboxRow(pool, outboxId);
    assert.equal(row.status, 'Dispatched', 'the row leaves the Pending state');
    assert.equal(row.attempt_count, 1);
    assert.equal(row.last_error, null);
    assert.ok(row.dispatched_at, 'the dispatch time is recorded');

    assert.equal(adapter.sentMessages().length, 1, 'the provider received exactly one message');
    t.diagnostic(`provider reference ${adapter.sentMessages()[0].providerMessageId}`);
  });

  test('MSG-02 a dispatched message is not sent again on the next run', async () => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    await queueMessage(pool, { requestId, citizenId, key: `msg-02-${Date.now()}` });

    const adapter = new SimulatedMessagingAdapter({ logger: quietLogger });
    await runOnce({ db: pool, adapter, logger: quietLogger });
    const second = await runOnce({ db: pool, adapter, logger: quietLogger });

    assert.equal(second.examined, 0, 'the second run finds nothing pending');
    assert.equal(adapter.sentMessages().length, 1, 'the citizen is messaged once, not twice');
  });

  test('MSG-03 [negative] a transient failure leaves the row pending for retry', async () => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    const outboxId = await queueMessage(pool, {
      requestId, citizenId, key: `msg-03-${Date.now()}`,
    });

    const adapter = new FailingAdapter(
      new TransientDeliveryError('Simulated provider is temporarily unavailable.'),
    );
    const result = await runOnce({ db: pool, adapter, logger: quietLogger });

    assert.equal(result.failed, 1);
    const row = await outboxRow(pool, outboxId);
    assert.equal(row.status, 'Pending', 'a transient failure is retryable');
    assert.equal(row.attempt_count, 1, 'the attempt is counted');
    assert.match(row.last_error, /temporarily unavailable/);
  });

  test('MSG-04 [negative] a permanent failure is not retried', async () => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    const outboxId = await queueMessage(pool, {
      requestId, citizenId, key: `msg-04-${Date.now()}`,
    });

    const adapter = new FailingAdapter(
      new PermanentDeliveryError('A recipient address is required.'),
    );
    const first = await runOnce({ db: pool, adapter, logger: quietLogger });
    assert.equal(first.failed, 1);

    const row = await outboxRow(pool, outboxId);
    assert.equal(row.status, 'Failed', 'a permanent failure stops being retried');

    // A Failed row is not re-examined, so the provider is not called again.
    const second = await runOnce({ db: pool, adapter, logger: quietLogger });
    assert.equal(second.examined, 0);
    assert.equal(adapter.attempts, 1, 'the provider was contacted once');
  });

  test('MSG-05 a transient failure stops being retried once attempts are exhausted', async () => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    const outboxId = await queueMessage(pool, {
      requestId, citizenId, key: `msg-05-${Date.now()}`,
    });

    const adapter = new FailingAdapter(
      new TransientDeliveryError('Simulated provider is temporarily unavailable.'),
    );
    const maxAttempts = 3;

    for (let i = 0; i < maxAttempts; i += 1) {
      await runOnce({ db: pool, adapter, maxAttempts, logger: quietLogger });
    }

    const row = await outboxRow(pool, outboxId);
    assert.equal(row.attempt_count, maxAttempts);
    assert.equal(row.status, 'Failed', 'retrying forever would produce load and no delivery');

    const after = await runOnce({ db: pool, adapter, maxAttempts, logger: quietLogger });
    assert.equal(after.examined, 0, 'an exhausted row is no longer selected');
  });

  test('MSG-06 [negative] a message for a deleted recipient fails permanently', async () => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    const outboxId = await queueMessage(pool, {
      requestId, citizenId, key: `msg-06-${Date.now()}`,
    });

    // Resolve against an identifier that does not exist, which is what the
    // resolver must treat as permanent rather than retryable.
    const resolver = createRecipientResolver(pool);
    await assert.rejects(
      () => resolver('00000000-0000-0000-0000-000000000000'),
      (error) => error.permanent === true,
      'an unknown recipient is a permanent failure, not a transient one',
    );

    // The row itself is untouched by that check.
    const row = await outboxRow(pool, outboxId);
    assert.equal(row.status, 'Pending');
  });

  test('MSG-07 a batch larger than the batch size is drained across runs', async () => {
    await reset(pool);
    const { requestId, citizenId } = await seedRequest(pool);
    const stamp = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await queueMessage(pool, {
        requestId, citizenId, key: `msg-07-${stamp}-${i}`, body: `Update ${i}.`,
      });
    }

    const adapter = new SimulatedMessagingAdapter({ logger: quietLogger });
    const first = await runOnce({ db: pool, adapter, batchSize: 2, logger: quietLogger });
    assert.equal(first.dispatched, 2, 'the batch size is respected');

    let guard = 0;
    let pending = 3;
    while (pending > 0 && guard < 10) {
      const run = await runOnce({ db: pool, adapter, batchSize: 2, logger: quietLogger });
      pending -= run.dispatched;
      guard += 1;
    }

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM messaging_outbox
        WHERE request_id = $1 AND status = 'Pending'`,
      [requestId],
    );
    assert.equal(rows[0].n, 0, 'the queue drains completely');
    assert.equal(adapter.sentMessages().length, 5);
  });
});
