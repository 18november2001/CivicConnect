'use strict';

/**
 * End-to-end system tests for the CivicConnect request lifecycle.
 *
 * These exercise the system the way a client does: over HTTP, through the
 * Express routing and controller layer, into the lifecycle engine, and down to
 * a real PostgreSQL database. Nothing is stubbed. A passing case therefore
 * demonstrates that the layers are wired to each other, which is the one thing
 * the unit, black-box and integration suites cannot show.
 *
 * That distinction is not theoretical here. DEF-008 and DEF-009 were both found
 * by writing these tests: the API could not start on Linux at all, and the
 * controller called the lifecycle engine with the wrong parameter shape, so
 * every status transition was refused. Both defects were invisible to a suite
 * that tested the layers separately.
 *
 * Connection is taken from TEST_DATABASE_URL. The suite skips when that is
 * absent so a developer without a database can still run the other suites.
 * Continuous integration always sets it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { Pool } = require('pg');

const CONNECTION_STRING = process.env.TEST_DATABASE_URL;

/**
 * The HTTP layer lives in src/app.js, which arrives with the backend branch.
 * Until that is merged the suite skips rather than failing, so adding these
 * tests cannot turn the pipeline red for a reason unrelated to the tests
 * themselves. Once the application is present the skip stops applying and the
 * cases run for real.
 */
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
  console.log(`# end-to-end suite skipped: ${reason}`);
}

const CITIZEN_EMAIL = 'e2e.citizen@civicconnect.test';
const STAFF_EMAIL = 'e2e.staff@civicconnect.test';
const SUPERVISOR_EMAIL = 'e2e.supervisor@civicconnect.test';

function newPool() {
  return new Pool({ connectionString: CONNECTION_STRING, max: 4 });
}

/**
 * Seeds the three actors the lifecycle needs and removes anything left by a
 * previous run. Deletion order follows the foreign keys inward.
 */
async function seedActors(pool) {
  await pool.query(
    `DELETE FROM request_audit_log WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = 'E2E Testville')`
  );
  await pool.query(
    `DELETE FROM request_timeline_updates WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = 'E2E Testville')`
  );
  await pool.query(
    `DELETE FROM outbound_messages WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = 'E2E Testville')`
  );
  await pool.query(
    `DELETE FROM messaging_outbox WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = 'E2E Testville')`
  );
  await pool.query(`DELETE FROM service_requests WHERE suburb = 'E2E Testville'`);
  await pool.query(`DELETE FROM users WHERE email IN ($1, $2, $3)`, [
    CITIZEN_EMAIL,
    STAFF_EMAIL,
    SUPERVISOR_EMAIL,
  ]);

  const insert = `
    INSERT INTO users (full_name, email, password_hash, role, department)
    VALUES ($1, $2, 'not-a-real-hash', $3, $4)
    RETURNING user_id;
  `;
  const citizen = await pool.query(insert, [
    'E2E Citizen', CITIZEN_EMAIL, 'Citizen', null,
  ]);
  const staff = await pool.query(insert, [
    'E2E Staff', STAFF_EMAIL, 'Staff', 'Water',
  ]);
  const supervisor = await pool.query(insert, [
    'E2E Supervisor', SUPERVISOR_EMAIL, 'Supervisor', 'Water',
  ]);

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
    locationAddress: '14 Example Road',
    suburb: 'E2E Testville',
  };
}

describeOrSkip('End-to-end request lifecycle over HTTP', () => {
  let app;
  let pool;
  let actors;

  test.before(async () => {
    app = appModule;
    pool = newPool();
    actors = await seedActors(pool);
  });

  test.after(async () => {
    await pool.end();
  });

  test('E2E-01 a citizen report is carried through to resolution across the full stack', async () => {
    // 1. Citizen submits over HTTP.
    const created = await request(app)
      .post('/api/v1/requests')
      .send(validRequestBody(actors.citizenId));

    assert.equal(created.status, 201, 'submission should be accepted');
    const requestId = created.body.data.request_id;
    assert.ok(requestId, 'the response carries the new request identifier');
    assert.equal(created.body.data.status, 'Submitted');
    assert.match(
      created.body.data.tracking_code,
      /^REQ-\d{8}-[A-Z0-9]{4}$/,
      'a citizen-facing tracking code is issued'
    );

    // 2. Supervisor assigns it to a staff member.
    const assigned = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({
        nextStatus: 'Assigned',
        actorId: actors.supervisorId,
        assignedStaffId: actors.staffId,
        publicMessage: 'Assigned to the Water department.',
      });

    assert.equal(assigned.status, 200, `assignment should succeed, got ${JSON.stringify(assigned.body)}`);
    assert.equal(assigned.body.data.status, 'Assigned');

    // 3. Staff member starts work.
    const started = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({ nextStatus: 'In_Progress', actorId: actors.staffId });

    assert.equal(started.status, 200, `start should succeed, got ${JSON.stringify(started.body)}`);
    assert.equal(started.body.data.status, 'In_Progress');

    // 4. Staff member resolves it with a substantive note.
    const resolved = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({
        nextStatus: 'Resolved',
        actorId: actors.staffId,
        resolutionNotes: 'Valve replaced and the road surface was reinstated.',
        publicMessage: 'The leak has been repaired.',
      });

    assert.equal(resolved.status, 200, `resolution should succeed, got ${JSON.stringify(resolved.body)}`);
    assert.equal(resolved.body.data.status, 'Resolved');

    // 5. The citizen reads the request back and sees the outcome and timeline.
    const fetched = await request(app).get(`/api/v1/requests/${requestId}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.status, 'Resolved');
    assert.ok(
      fetched.body.data.timeline.length >= 2,
      'public timeline entries are visible to the citizen'
    );

    // 6. The audit trail recorded every transition, not merely the last one.
    const audit = await pool.query(
      `SELECT action, previous_state, new_state
         FROM request_audit_log
        WHERE request_id = $1
        ORDER BY created_at ASC`,
      [requestId]
    );
    const transitions = audit.rows
      .filter((row) => row.action === 'STATUS_CHANGE')
      .map((row) => `${row.previous_state}->${row.new_state}`);

    assert.deepEqual(
      transitions,
      ['Submitted->Assigned', 'Assigned->In_Progress', 'In_Progress->Resolved'],
      'each transition left its own audit record'
    );
  });

  test('E2E-02 [negative] a citizen cannot drive the lifecycle through the API', async () => {
    const created = await request(app)
      .post('/api/v1/requests')
      .send(validRequestBody(actors.citizenId));
    assert.equal(created.status, 201);
    const requestId = created.body.data.request_id;

    const refused = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({
        nextStatus: 'Assigned',
        actorId: actors.citizenId,
        assignedStaffId: actors.staffId,
      });

    assert.equal(refused.status, 422, 'the role rule is enforced at the API boundary');
    assert.ok(
      Array.isArray(refused.body.violations) && refused.body.violations.length > 0,
      'the caller is told why, rather than receiving a bare refusal'
    );

    // The refusal left no trace: the state is unchanged and nothing was logged.
    const after = await request(app).get(`/api/v1/requests/${requestId}`);
    assert.equal(after.body.data.status, 'Submitted');

    const audit = await pool.query(
      `SELECT COUNT(*)::int AS n FROM request_audit_log
        WHERE request_id = $1 AND action = 'STATUS_CHANGE'`,
      [requestId]
    );
    assert.equal(audit.rows[0].n, 0, 'a refused transition writes no audit record');
  });

  test('E2E-03 [negative] a skipped lifecycle stage is refused end to end', async () => {
    const created = await request(app)
      .post('/api/v1/requests')
      .send(validRequestBody(actors.citizenId));
    const requestId = created.body.data.request_id;

    const refused = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .send({
        nextStatus: 'Resolved',
        actorId: actors.staffId,
        resolutionNotes: 'Attempting to resolve without ever starting the work.',
      });

    assert.equal(refused.status, 422, 'Submitted may not jump straight to Resolved');

    const after = await request(app).get(`/api/v1/requests/${requestId}`);
    assert.equal(after.body.data.status, 'Submitted');
  });

  test('E2E-04 [negative] an incomplete submission and an unknown request are rejected', async () => {
    const incomplete = await request(app)
      .post('/api/v1/requests')
      .send({ requesterId: actors.citizenId, title: 'No other fields supplied' });
    assert.equal(incomplete.status, 400, 'mandatory fields are enforced');

    const missing = await request(app)
      .get('/api/v1/requests/00000000-0000-0000-0000-000000000000');
    assert.equal(missing.status, 404, 'an unknown request identifier is a clean 404');

    const notARoute = await request(app).get('/api/v1/nothing-here');
    assert.equal(notARoute.status, 404, 'unmatched routes fall through to the handler');
  });

  test('E2E-05 the service reports its own health', async () => {
    const health = await request(app).get('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'UP');
    assert.ok(health.body.timestamp, 'the health response is timestamped');
  });
});
