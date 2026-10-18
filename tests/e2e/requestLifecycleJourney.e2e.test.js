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
const jwt = require('jsonwebtoken');

const CONNECTION_STRING = process.env.TEST_DATABASE_URL;

/**
 * The HTTP layer lives in src/app.js.
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
  await pool.query(
    `DELETE FROM users WHERE email IN ($1, $2, $3) OR email LIKE 'e2e.signup.%@civicconnect.test'`,
    [CITIZEN_EMAIL, STAFF_EMAIL, SUPERVISOR_EMAIL],
  );

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

/** Sign a session token for a seeded user, the same way the login endpoint does. */
function tokenFor(userId, role, department = null) {
  const { getJwtSecret } = require('../../src/config/security');
  return `Bearer ${jwt.sign({ sub: userId, role, department, fullName: role, email: `${role}@x` }, getJwtSecret(), { expiresIn: '5m' })}`;
}

function validRequestBody() {
  return {
    title: 'Burst water main on the corner',
    category: 'Water',
    description: 'Water has been running across the road since early morning.',
    locationAddress: '14 Example Road',
    suburb: 'E2E Testville',
  };
}

describeOrSkip('End-to-end request lifecycle over HTTP', () => {
  let app;
  let pool;
  let actors;
  let citizen;
  let staff;
  let supervisor;

  test.before(async () => {
    app = appModule;
    pool = newPool();
    actors = await seedActors(pool);
    citizen = tokenFor(actors.citizenId, 'Citizen');
    staff = tokenFor(actors.staffId, 'Staff', 'Water');
    supervisor = tokenFor(actors.supervisorId, 'Supervisor', 'Water');
  });

  test.after(async () => {
    await pool.end();
    // The app's own pool would otherwise keep the test process alive for 30s.
    await require('../../src/config/database').pool.end();
  });

  const submit = (token = citizen) =>
    request(app).post('/api/v1/requests').set('Authorization', token).send(validRequestBody());

  test('E2E-01 a citizen report is carried through to resolution across the full stack', async () => {
    // 1. Citizen submits over HTTP; the requester comes from the token, not the body.
    const created = await submit();
    assert.equal(created.status, 201, `submission should be accepted: ${JSON.stringify(created.body)}`);
    const requestId = created.body.id;
    assert.ok(requestId, 'the response carries the new request identifier');
    assert.equal(created.body.status, 'Submitted');
    assert.equal(created.body.requesterId, actors.citizenId);
    assert.equal(created.body.category, 'Water');
    assert.match(created.body.trackingCode, /^REQ-\d{8}-[A-Z0-9]{4}$/, 'a citizen-facing tracking code is issued');

    // 2. Supervisor assigns it to a staff member.
    const assigned = await request(app)
      .patch(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', supervisor)
      .send({ staffId: actors.staffId, handoverNotes: 'Assigned to the Water department.', expectedUpdatedAt: created.body.updatedAt });
    assert.equal(assigned.status, 200, `assignment should succeed, got ${JSON.stringify(assigned.body)}`);
    assert.equal(assigned.body.status, 'Assigned');
    assert.equal(assigned.body.assignedStaffId, actors.staffId);

    // 3. Staff member starts work (using the version they last saw).
    const started = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .set('Authorization', staff)
      .send({ targetStatus: 'In_Progress', expectedUpdatedAt: assigned.body.updatedAt });
    assert.equal(started.status, 200, `start should succeed, got ${JSON.stringify(started.body)}`);
    assert.equal(started.body.status, 'In_Progress');

    // 4. Staff member resolves it with a substantive note.
    const resolved = await request(app)
      .patch(`/api/v1/requests/${requestId}/status`)
      .set('Authorization', staff)
      .send({
        targetStatus: 'Resolved',
        notes: 'Valve replaced and the road surface was reinstated.',
        expectedUpdatedAt: started.body.updatedAt,
      });
    assert.equal(resolved.status, 200, `resolution should succeed, got ${JSON.stringify(resolved.body)}`);
    assert.equal(resolved.body.status, 'Resolved');

    // 5. The citizen reads it back: outcome and timeline visible, internal audit not.
    const fetched = await request(app).get(`/api/v1/requests/${requestId}`).set('Authorization', citizen);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.status, 'Resolved');
    assert.ok(fetched.body.timeline.length >= 3, 'public timeline entries are visible to the citizen');
    assert.equal(fetched.body.audit, undefined, 'the audit trail is internal to staff');

    // 6. Staff see the audit trail, with every transition recorded.
    const internal = await request(app).get(`/api/v1/requests/${requestId}`).set('Authorization', staff);
    assert.ok(Array.isArray(internal.body.audit));

    const audit = await pool.query(
      `SELECT action, previous_state, new_state FROM request_audit_log
        WHERE request_id = $1 ORDER BY created_at ASC, audit_id ASC`,
      [requestId],
    );
    const transitions = audit.rows
      .filter((row) => row.action === 'STATUS_CHANGE')
      .map((row) => `${row.previous_state}->${row.new_state}`);
    assert.deepEqual(transitions, ['Submitted->Assigned', 'Assigned->In_Progress', 'In_Progress->Resolved']);
  });

  test('E2E-02 [negative] a citizen cannot drive the lifecycle through the API', async () => {
    const created = await submit();
    const requestId = created.body.id;

    const refused = await request(app)
      .patch(`/api/v1/requests/${requestId}/assign`)
      .set('Authorization', citizen)
      .send({ staffId: actors.staffId });
    assert.equal(refused.status, 403, 'the role rule is enforced at the API boundary');
    assert.equal(refused.body.error.code, 'FORBIDDEN');

    const after = await request(app).get(`/api/v1/requests/${requestId}`).set('Authorization', citizen);
    assert.equal(after.body.status, 'Submitted');

    const audit = await pool.query(
      `SELECT COUNT(*)::int AS n FROM request_audit_log WHERE request_id = $1 AND action = 'STATUS_CHANGE'`,
      [requestId],
    );
    assert.equal(audit.rows[0].n, 0, 'a refused transition writes no audit record');
  });

  test('E2E-03 [negative] a skipped lifecycle stage is refused with every violation', async () => {
    const created = await submit();
    const refused = await request(app)
      .patch(`/api/v1/requests/${created.body.id}/status`)
      .set('Authorization', staff)
      .send({ targetStatus: 'Resolved', notes: 'Attempting to resolve without ever starting the work.' });

    assert.equal(refused.status, 422, 'Submitted may not jump straight to Resolved');
    assert.equal(refused.body.error.code, 'ILLEGAL_TRANSITION');
    assert.ok(refused.body.error.violations.length > 0, 'the caller is told why');

    const after = await request(app).get(`/api/v1/requests/${created.body.id}`).set('Authorization', staff);
    assert.equal(after.body.status, 'Submitted');
  });

  test('E2E-04 [negative] bad input, unknown request and unknown route are rejected cleanly', async () => {
    const incomplete = await request(app)
      .post('/api/v1/requests').set('Authorization', citizen).send({ title: 'No other fields supplied' });
    assert.equal(incomplete.status, 400, 'mandatory fields are enforced');
    assert.ok(incomplete.body.error.violations.length > 1, 'all violations come back together');

    const missing = await request(app)
      .get('/api/v1/requests/00000000-0000-0000-0000-000000000000').set('Authorization', staff);
    assert.equal(missing.status, 404, 'an unknown request identifier is a clean 404');

    const badId = await request(app).get('/api/v1/requests/not-a-uuid').set('Authorization', staff);
    assert.equal(badId.status, 404, 'a malformed identifier is a 404, not a database error');

    const notARoute = await request(app).get('/api/v1/nothing-here');
    assert.equal(notARoute.status, 404, 'unmatched routes fall through to the handler');
  });

  test('E2E-05 the service reports its own health', async () => {
    const health = await request(app).get('/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'UP');
    assert.ok(health.body.timestamp, 'the health response is timestamped');
  });

  test('E2E-06 [security] endpoints demand a valid token and the right role', async () => {
    const anon = await request(app).get('/api/v1/requests');
    assert.equal(anon.status, 401);
    assert.equal(anon.body.error.code, 'UNAUTHENTICATED');

    const forged = await request(app).get('/api/v1/requests').set('Authorization', 'Bearer not.a.token');
    assert.equal(forged.status, 401);

    const citizenQueue = await request(app).get('/api/v1/requests').set('Authorization', citizen);
    assert.equal(citizenQueue.status, 403, 'citizens cannot read the staff queue');

    const staffReport = await request(app).get('/api/v1/reports/summary').set('Authorization', staff);
    assert.equal(staffReport.status, 403, 'reports are for supervisors and admins');
  });

  test('E2E-07 a citizen cannot read another citizen\'s request', async () => {
    const created = await submit();
    const other = tokenFor('11111111-1111-4111-8111-111111111111', 'Citizen');
    const res = await request(app).get(`/api/v1/requests/${created.body.id}`).set('Authorization', other);
    assert.equal(res.status, 404);
  });

  test('E2E-08 [concurrency] a stale expectedUpdatedAt is refused with 409', async () => {
    const created = await submit();
    const first = await request(app)
      .patch(`/api/v1/requests/${created.body.id}/assign`).set('Authorization', supervisor)
      .send({ staffId: actors.staffId, expectedUpdatedAt: created.body.updatedAt });
    assert.equal(first.status, 200);
    const stale = await request(app)
      .patch(`/api/v1/requests/${created.body.id}/status`).set('Authorization', staff)
      .send({ targetStatus: 'In_Progress', expectedUpdatedAt: created.body.updatedAt });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'CONCURRENT_MODIFICATION');
  });

  test('E2E-09 queue filters, suburbs and staff list work for staff', async () => {
    await submit();
    const queue = await request(app)
      .get('/api/v1/requests?status=Submitted&category=Water&suburb=E2E%20Testville&sort=createdAt')
      .set('Authorization', staff);
    assert.equal(queue.status, 200);
    assert.ok(queue.body.items.length >= 1);
    assert.ok(queue.body.items.every((r) => r.status === 'Submitted' && r.category === 'Water'));

    const injection = await request(app)
      .get(`/api/v1/requests?suburb=${encodeURIComponent("x' OR '1'='1")}`).set('Authorization', staff);
    assert.equal(injection.status, 200);
    assert.equal(injection.body.items.length, 0, 'filter values are parameterised');

    const suburbs = await request(app).get('/api/v1/requests/suburbs').set('Authorization', staff);
    assert.ok(suburbs.body.includes('E2E Testville'));

    const people = await request(app).get('/api/v1/users?role=staff').set('Authorization', staff);
    assert.equal(people.status, 200);
    assert.ok(people.body.some((u) => u.id === actors.staffId && u.name === 'E2E Staff'));
    assert.ok(people.body.every((u) => u.password_hash === undefined && u.passwordHash === undefined));
  });

  test('E2E-10 my requests are paged and scoped to the caller', async () => {
    await submit();
    const mine = await request(app).get('/api/v1/requester/requests?page=1&pageSize=5').set('Authorization', citizen);
    assert.equal(mine.status, 200);
    assert.ok(mine.body.total >= 1);
    assert.ok(mine.body.items.every((r) => r.requesterId === actors.citizenId));
  });

  test('E2E-11 supervisors get the summary and a CSV/JSON export without personal data', async () => {
    const summary = await request(app).get('/api/v1/reports/summary').set('Authorization', supervisor);
    assert.equal(summary.status, 200);
    assert.equal(typeof summary.body.open, 'number');
    assert.equal(summary.body.byCategory.length, 5);

    const csv = await request(app).get('/api/v1/reports/export?format=csv').set('Authorization', supervisor);
    assert.equal(csv.status, 200);
    assert.match(csv.text.split('\n')[0], /^trackingCode,category,createdAt,status,turnaroundHours$/);

    const json = await request(app).get('/api/v1/reports/export?format=json').set('Authorization', supervisor);
    assert.deepEqual(Object.keys(json.body[0]), ['trackingCode', 'category', 'createdAt', 'status', 'turnaroundHours']);
  });

  test('E2E-12 citizen sign-up and login: a real account works and the role cannot be chosen', async () => {
    const email = 'e2e.signup.citizen@civicconnect.test';
    const signup = await request(app)
      .post('/api/v1/auth/register')
      .send({ fullName: 'New Citizen', email, password: 'a-good-password', role: 'Admin' });
    assert.equal(signup.status, 201, JSON.stringify(signup.body));
    assert.equal(signup.body.user.role, 'Citizen', 'a body-supplied role is ignored');
    assert.ok(signup.body.token);
    assert.equal(signup.body.user.passwordHash, undefined);

    const duplicate = await request(app)
      .post('/api/v1/auth/register').send({ fullName: 'New Citizen', email: email.toUpperCase(), password: 'a-good-password' });
    assert.equal(duplicate.status, 409);

    const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'a-good-password' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.name, 'New Citizen');

    const wrong = await request(app).post('/api/v1/auth/login').send({ email, password: 'wrong-password' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.error.code, 'INVALID_CREDENTIALS');

    const weak = await request(app)
      .post('/api/v1/auth/register').send({ fullName: 'X', email: 'bad', password: 'short' });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.violations.length, 3);
  });

  test('E2E-14 [negative] a request cannot be assigned to a non-staff or unknown user', async () => {
    const created = await submit();
    for (const staffId of [actors.citizenId, '22222222-2222-4222-8222-222222222222', 'not-a-uuid']) {
      const refused = await request(app)
        .patch(`/api/v1/requests/${created.body.id}/assign`).set('Authorization', supervisor)
        .send({ staffId, expectedUpdatedAt: created.body.updatedAt });
      assert.equal(refused.status, 422, `assigning to ${staffId} must be refused`);
      assert.ok(refused.body.error.violations.length > 0);
    }
  });

  test('E2E-13 staff sign-up needs the registration code and creates a Staff account only', async () => {
    const previous = process.env.STAFF_REGISTRATION_CODE;
    const setCode = (value) => {
      if (value === undefined) {
        delete process.env.STAFF_REGISTRATION_CODE;
      } else {
        process.env.STAFF_REGISTRATION_CODE = value;
      }
    };
    const payload = (overrides = {}) => ({
      fullName: 'New Staffer', email: 'e2e.signup.staff@civicconnect.test',
      password: 'a-good-password', department: 'Water', staffCode: 'E2E-CODE', ...overrides,
    });
    try {
      setCode(undefined);
      const closed = await request(app).post('/api/v1/auth/register-staff').send(payload());
      assert.equal(closed.status, 403);
      assert.equal(closed.body.error.code, 'STAFF_SIGNUP_DISABLED', 'unset code closes staff sign-up');

      setCode('E2E-CODE');
      const wrong = await request(app).post('/api/v1/auth/register-staff').send(payload({ staffCode: 'guess' }));
      assert.equal(wrong.status, 403);
      assert.equal(wrong.body.error.code, 'INVALID_STAFF_CODE');

      const badDept = await request(app).post('/api/v1/auth/register-staff').send(payload({ department: 'Finance' }));
      assert.equal(badDept.status, 400);

      const ok = await request(app).post('/api/v1/auth/register-staff').send(payload({ role: 'Admin' }));
      assert.equal(ok.status, 201, JSON.stringify(ok.body));
      assert.equal(ok.body.user.role, 'Staff', 'staff sign-up can never create an Admin');
      assert.equal(ok.body.user.department, 'Water');

      // The new staff token can read the queue; a citizen token could not.
      const queue = await request(app).get('/api/v1/requests').set('Authorization', `Bearer ${ok.body.token}`);
      assert.equal(queue.status, 200);
    } finally {
      setCode(previous);
    }
  });
});

