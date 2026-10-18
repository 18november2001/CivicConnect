'use strict';

/**
 * End-to-end system tests for the complete notification chain.
 *
 * This is the system integration case for outbound messaging: a citizen's
 * request changes state over HTTP, a message is queued in the same database
 * transaction, the dispatch worker drains it, and the provider receives it.
 * Four components, three of them written at different milestones by different
 * people, exercised as one path with nothing stubbed except the provider
 * itself.
 *
 * It exists because the chain was broken in two separate places and neither
 * break was visible from inside any single component:
 *
 *   DEF-011  MessagingDispatchWorker was never invoked by anything, so rows
 *            entered the outbox and were never sent.
 *   DEF-012  The API controller performed its own status update rather than
 *            going through the lifecycle service, so no outbox row was ever
 *            written by a real API call. The messaging boundary was connected
 *            to a service the running application did not use.
 *
 * Both components were individually correct and individually tested. The fault
 * was that nothing joined them, which is the class of defect only a chain test
 * detects.
 *
 * Skips cleanly when the database or the HTTP layer is absent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Pool } = require('pg');

const CONNECTION_STRING = process.env.TEST_DATABASE_URL;

let appModule = null;
let appLoadError = null;
try {
  appModule = require('../../src/app');
} catch (err) {
  appLoadError = err;
}

const canRun = Boolean(CONNECTION_STRING) && appModule !== null;
const describeOrSkip = canRun ? test.describe : test.describe.skip;

if (!canRun) {
  const reason = !CONNECTION_STRING
    ? 'TEST_DATABASE_URL is not set'
    : `the HTTP application could not be loaded (${appLoadError && appLoadError.message})`;
  console.log(`# messaging chain suite skipped: ${reason}`);
}

const { runOnce } = require('../../src/integration/messaging/dispatchRunner');
const {
  SimulatedMessagingAdapter,
} = require('../../src/integration/messaging/simulatedMessagingAdapter');

const SUBURB = 'ChainTestville';
const CITIZEN_EMAIL = 'chain.citizen@civicconnect.test';
const STAFF_EMAIL = 'chain.staff@civicconnect.test';
const SUPERVISOR_EMAIL = 'chain.supervisor@civicconnect.test';

const quietLogger = { info() {}, warn() {}, error() {} };

function newPool() {
  return new Pool({ connectionString: CONNECTION_STRING, max: 4 });
}

async function reset(pool) {
  await pool.query(
    `UPDATE messaging_outbox SET status = 'Dispatched', dispatched_at = NOW()
      WHERE status = 'Pending'`);
  const scoped = `(SELECT request_id FROM service_requests WHERE suburb = $1)`;
  await pool.query(`DELETE FROM messaging_outbox WHERE request_id IN ${scoped}`, [SUBURB]);
  await pool.query(`DELETE FROM request_audit_log WHERE request_id IN ${scoped}`, [SUBURB]);
  await pool.query(`DELETE FROM request_timeline_updates WHERE request_id IN ${scoped}`, [SUBURB]);
  await pool.query(`DELETE FROM outbound_messages WHERE request_id IN ${scoped}`, [SUBURB]);
  await pool.query(`DELETE FROM service_requests WHERE suburb = $1`, [SUBURB]);
  await pool.query(`DELETE FROM users WHERE email IN ($1,$2,$3)`,
    [CITIZEN_EMAIL, STAFF_EMAIL, SUPERVISOR_EMAIL]);
}

async function seedActors(pool) {
  const insert = `
    INSERT INTO users (full_name, email, password_hash, role, department)
    VALUES ($1, $2, 'not-a-real-hash', $3, $4) RETURNING user_id`;
  const citizen = await pool.query(insert, ['Chain Citizen', CITIZEN_EMAIL, 'Citizen', null]);
  const staff = await pool.query(insert, ['Chain Staff', STAFF_EMAIL, 'Staff', 'Water']);
  const supervisor = await pool.query(insert, ['Chain Supervisor', SUPERVISOR_EMAIL, 'Supervisor', 'Water']);
  return {
    citizenId: citizen.rows[0].user_id,
    staffId: staff.rows[0].user_id,
    supervisorId: supervisor.rows[0].user_id,
  };
}

function validRequestBody(citizenId) {
  return {
    requesterId: citizenId,
    categoryId: 2,
    title: 'Burst water main on the corner',
    description: 'Water has been running across the road since early morning.',
    locationAddress: '14 Example Road, Kelvin',
    suburb: SUBURB,
  };
}

async function outboxFor(pool, requestId) {
  const { rows } = await pool.query(
    `SELECT outbox_id, status, channel, message_body, idempotency_key, attempt_count
       FROM messaging_outbox WHERE request_id = $1 ORDER BY outbox_id`,
    [requestId],
  );
  return rows;
}

describeOrSkip('Notification chain, API to provider', () => {
  let app;
  let pool;
  let actors;

  test.before(async () => {
    app = appModule;
    pool = newPool();
    await reset(pool);
    actors = await seedActors(pool);
  });

  test.after(async () => {
    await reset(pool);
    await pool.end();
  });

  test('CHAIN-01 a lifecycle change over HTTP reaches the provider', async (t) => {
    const created = await request(app)
      .post('/api/v1/requests')
      .send(validRequestBody(actors.citizenId));
    assert.equal(created.status, 201);
    const requestId = created.body.data.request_id;
    const trackingCode = created.body.data.tracking_code;

    // 1. The transition is made the way a real client makes it.
    const assigned = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({
        nextStatus: 'Assigned',
        actorId: actors.supervisorId,
        assignedStaffId: actors.staffId,
      });
    assert.equal(assigned.status, 200, `assignment should succeed: ${JSON.stringify(assigned.body)}`);

    // 2. A message is queued, in the same transaction, addressed to the
    //    requester rather than the actor who made the change.
    const queued = await outboxFor(pool, requestId);
    assert.equal(queued.length, 1, 'exactly one message is queued for the transition');
    assert.equal(queued[0].status, 'Pending');
    assert.equal(queued[0].attempt_count, 0);
    assert.match(queued[0].message_body, new RegExp(trackingCode),
      'the citizen sees their own tracking code, not an internal identifier');
    assert.match(queued[0].message_body, /assigned to a staff member/);

    // 3. The worker drains it and the provider receives it.
    const adapter = new SimulatedMessagingAdapter({ logger: quietLogger });
    const result = await runOnce({ db: pool, adapter, logger: quietLogger });
    assert.equal(result.failed, 0);

    const dispatched = await outboxFor(pool, requestId);
    assert.equal(dispatched[0].status, 'Dispatched');
    assert.equal(dispatched[0].attempt_count, 1);

    const sent = adapter.sentMessages();
    assert.equal(sent.length, 1, 'the provider received exactly one message');
    t.diagnostic(`provider reference ${sent[0].providerMessageId}`);
  });

  test('CHAIN-02 [negative] a refused transition queues no message', async () => {
    const created = await request(app)
      .post('/api/v1/requests')
      .send(validRequestBody(actors.citizenId));
    const requestId = created.body.data.request_id;

    // A citizen attempting a supervisor's action. The lifecycle rules refuse
    // it, and the whole transaction including the outbox write rolls back.
    const refused = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({
        nextStatus: 'Assigned',
        actorId: actors.citizenId,
        assignedStaffId: actors.staffId,
      });
    assert.equal(refused.status, 422);

    const queued = await outboxFor(pool, requestId);
    assert.equal(queued.length, 0,
      'a message for an event that did not happen would be worse than no message');

    const adapter = new SimulatedMessagingAdapter({ logger: quietLogger });
    await runOnce({ db: pool, adapter, logger: quietLogger });
    assert.equal(adapter.sentMessages().length, 0);
  });

  test('CHAIN-03 each stage of the journey notifies the citizen once', async () => {
    const created = await request(app)
      .post('/api/v1/requests')
      .send(validRequestBody(actors.citizenId));
    const requestId = created.body.data.request_id;

    const steps = [
      { nextStatus: 'Assigned', actorId: actors.supervisorId, assignedStaffId: actors.staffId },
      { nextStatus: 'In_Progress', actorId: actors.staffId },
      {
        nextStatus: 'Resolved',
        actorId: actors.staffId,
        resolutionNotes: 'Valve replaced and the road surface was reinstated.',
      },
    ];

    for (const body of steps) {
      const res = await request(app)
        .patch(`/api/v1/requests/${requestId}/status`)
        .send(body);
      assert.equal(res.status, 200, `${body.nextStatus} should succeed: ${JSON.stringify(res.body)}`);
    }

    const queued = await outboxFor(pool, requestId);
    assert.equal(queued.length, 3, 'one message per stage, not one per request');

    const keys = new Set(queued.map((r) => r.idempotency_key));
    assert.equal(keys.size, 3, 'each stage has its own idempotency key');

    const adapter = new SimulatedMessagingAdapter({ logger: quietLogger });
    const result = await runOnce({ db: pool, adapter, logger: quietLogger });
    assert.equal(result.dispatched, 3);
    assert.equal(adapter.sentMessages().length, 3);

    const again = await runOnce({ db: pool, adapter, logger: quietLogger });
    assert.equal(again.examined, 0, 'a second drain sends nothing further');
    assert.equal(adapter.sentMessages().length, 3, 'the citizen is not messaged twice');
  });
});
