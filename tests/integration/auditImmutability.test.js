'use strict';

/**
 * Integration verification of the audit immutability claim.
 *
 * The PED states that UPDATE, DELETE and TRUNCATE are revoked on the audit and
 * timeline tables at database level, so that a compromised application or an
 * abused administrative account cannot alter history. That is a privilege
 * claim, and a privilege claim can only be verified by attempting the
 * forbidden operation as the restricted role.
 *
 * These tests connect as civicconnect_app, the role the application uses. They
 * would pass trivially and meaninglessly if run as the table owner, which is
 * why the connection string is deliberately different from the one the rest of
 * the integration suite uses.
 *
 * Test basis: NFR-002 (data integrity, immutability and traceability)
 * Engineering records: ADR-DES-002
 *
 * Run: TEST_DATABASE_URL=... TEST_APP_DATABASE_URL=... node --test tests/integration/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  databaseAvailable,
  createDb,
  resetRequestData,
  seedScenario,
} = require('../helpers/testDatabase');

const APP_CONNECTION = process.env.TEST_APP_DATABASE_URL;

const skip = !databaseAvailable
  ? 'TEST_DATABASE_URL is not set; integration suite skipped'
  : !APP_CONNECTION
    ? 'TEST_APP_DATABASE_URL is not set; privilege tests skipped'
    : false;

/** Insert one audit row as the owning role, so there is something to attack. */
async function seedAuditRow(ownerDb) {
  const { staffId, request } = await seedScenario(ownerDb);
  await ownerDb.query(
    `INSERT INTO request_audit_log
       (request_id, actor_id, action, previous_state, new_state, originating_ip)
     VALUES ($1, $2, 'STATUS_CHANGE', 'Submitted', 'Assigned', '196.25.1.10')`,
    [request.request_id, staffId],
  );
  await ownerDb.query(
    `INSERT INTO request_timeline_updates
       (request_id, status_snapshot, public_message, posted_by_department)
     VALUES ($1, 'Assigned', 'Your request has been assigned.', 'Roads')`,
    [request.request_id],
  );
  return request;
}

// ---------------------------------------------------------------------------
// SEC-01  The application role cannot modify an audit record.
// ---------------------------------------------------------------------------
test('SEC-01 [negative] the application role cannot UPDATE the audit log', { skip }, async (t) => {
  const owner = createDb();
  const app = createDb(APP_CONNECTION);
  t.after(async () => {
    await app.end();
    await owner.end();
  });

  await resetRequestData(owner);
  const request = await seedAuditRow(owner);

  await assert.rejects(
    () =>
      app.query(
        `UPDATE request_audit_log SET new_state = 'Closed' WHERE request_id = $1`,
        [request.request_id],
      ),
    (error) => {
      assert.match(error.message, /permission denied/i);
      return true;
    },
    'an UPDATE on request_audit_log must be refused for the application role',
  );
});

// ---------------------------------------------------------------------------
// SEC-02  The application role cannot delete an audit record.
// ---------------------------------------------------------------------------
test('SEC-02 [negative] the application role cannot DELETE from the audit log', { skip }, async (t) => {
  const owner = createDb();
  const app = createDb(APP_CONNECTION);
  t.after(async () => {
    await app.end();
    await owner.end();
  });

  await resetRequestData(owner);
  const request = await seedAuditRow(owner);

  await assert.rejects(
    () => app.query('DELETE FROM request_audit_log WHERE request_id = $1', [request.request_id]),
    (error) => {
      assert.match(error.message, /permission denied/i);
      return true;
    },
    'a DELETE on request_audit_log must be refused for the application role',
  );

  const { rows } = await owner.query(
    'SELECT COUNT(*)::int AS n FROM request_audit_log WHERE request_id = $1',
    [request.request_id],
  );
  assert.equal(rows[0].n, 1, 'the audit row must survive the attempt');
});

// ---------------------------------------------------------------------------
// SEC-03  The public timeline is append-only on the same basis.
// ---------------------------------------------------------------------------
test('SEC-03 [negative] the application role cannot alter a published timeline entry', { skip }, async (t) => {
  const owner = createDb();
  const app = createDb(APP_CONNECTION);
  t.after(async () => {
    await app.end();
    await owner.end();
  });

  await resetRequestData(owner);
  const request = await seedAuditRow(owner);

  await assert.rejects(
    () =>
      app.query(
        `UPDATE request_timeline_updates SET public_message = 'Edited after publication.'
          WHERE request_id = $1`,
        [request.request_id],
      ),
    (error) => /permission denied/i.test(error.message),
    'a published timeline entry must not be editable by the application',
  );
});

// ---------------------------------------------------------------------------
// SEC-04  The restriction is targeted, not blanket.
// A control that blocked everything would be indistinguishable from a broken
// connection, so this confirms the application can still do its actual work.
// ---------------------------------------------------------------------------
test('SEC-04 the application role retains the permissions it legitimately needs', { skip }, async (t) => {
  const owner = createDb();
  const app = createDb(APP_CONNECTION);
  t.after(async () => {
    await app.end();
    await owner.end();
  });

  await resetRequestData(owner);
  const { staffId, request } = await seedScenario(owner);

  // Appending is permitted.
  await app.query(
    `INSERT INTO request_audit_log
       (request_id, actor_id, action, previous_state, new_state, originating_ip)
     VALUES ($1, $2, 'STATUS_CHANGE', 'Submitted', 'Assigned', '196.25.1.10')`,
    [request.request_id, staffId],
  );

  // Reading is permitted.
  const { rows } = await app.query(
    'SELECT COUNT(*)::int AS n FROM request_audit_log WHERE request_id = $1',
    [request.request_id],
  );
  assert.equal(rows[0].n, 1);

  // Updating the request itself is permitted; only history is protected.
  await app.query(
    `UPDATE service_requests SET status = 'Assigned', updated_at = NOW() WHERE request_id = $1`,
    [request.request_id],
  );
});
