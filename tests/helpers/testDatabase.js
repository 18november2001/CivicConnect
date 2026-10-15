'use strict';

/**
 * Test database helper for the CivicConnect integration suite.
 *
 * Provides a connection, a transaction wrapper matching the interface the
 * Lifecycle Service expects, and seeding and cleanup for a known starting
 * state. Integration tests run against a real PostgreSQL instance, because the
 * behaviour under test is precisely the behaviour a fake cannot reproduce:
 * transactional rollback, constraint enforcement and privilege checks.
 *
 * Connection is taken from TEST_DATABASE_URL. When that variable is absent the
 * suite skips rather than fails, so a developer without a local database can
 * still run the unit and black-box suites. Continuous integration always sets
 * it, so the skip never hides a genuine failure there.
 */

const { Pool } = require('pg');

const CONNECTION_STRING = process.env.TEST_DATABASE_URL;

/** True when an integration database is configured for this run. */
const databaseAvailable = Boolean(CONNECTION_STRING);

/**
 * A database facade with the same shape the Lifecycle Service depends on:
 * query(), and transaction() which commits on success and rolls back on throw.
 *
 * Each call creates its own pool so that a test closing its connection cannot
 * affect any other test in the run.
 */
function createDb(connectionString = CONNECTION_STRING) {
  const localPool = new Pool({ connectionString, max: 4 });

  return {
    query: (text, params) => localPool.query(text, params),

    async transaction(work) {
      const client = await localPool.connect();
      try {
        await client.query('BEGIN');
        const result = await work({
          query: (text, params) => client.query(text, params),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    end: () => localPool.end(),
  };
}

/** Remove all request-related rows, leaving reference data in place. */
async function resetRequestData(db) {
  await db.query('DELETE FROM messaging_outbox');
  await db.query('DELETE FROM request_timeline_updates');
  await db.query('DELETE FROM request_audit_log');
  await db.query('DELETE FROM outbound_messages');
  await db.query('DELETE FROM service_requests');
  await db.query("DELETE FROM users WHERE email LIKE '%@test.civicconnect.local'");
}

/**
 * Seed one citizen, one staff member, one supervisor and one Submitted
 * request. Returns the identifiers the tests need.
 */
async function seedScenario(db) {
  const { rows: userRows } = await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, department)
     VALUES
       ('Test Citizen',    'citizen@test.civicconnect.local',    'not-a-real-hash', 'Citizen',    NULL),
       ('Test Staff',      'staff@test.civicconnect.local',      'not-a-real-hash', 'Staff',      'Roads'),
       ('Test Supervisor', 'supervisor@test.civicconnect.local', 'not-a-real-hash', 'Supervisor', 'Roads')
     RETURNING user_id, role`,
  );

  const byRole = Object.fromEntries(userRows.map((r) => [r.role, r.user_id]));

  const { rows: categoryRows } = await db.query(
    `SELECT category_id FROM request_categories WHERE category_name = 'Roads'`,
  );

  const { rows: requestRows } = await db.query(
    `INSERT INTO service_requests
       (tracking_code, requester_id, category_id, title, description,
        location_address, suburb, status, sla_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'Submitted', NOW() + INTERVAL '72 hours')
     RETURNING request_id, tracking_code, updated_at`,
    [
      `REQ-TEST-${Date.now().toString().slice(-6)}`,
      byRole.Citizen,
      categoryRows[0].category_id,
      'Pothole on the corner',
      'A large pothole has formed at the intersection and is damaging vehicles.',
      '14 Test Street, Testville',
      'Testville',
    ],
  );

  return {
    citizenId: byRole.Citizen,
    staffId: byRole.Staff,
    supervisorId: byRole.Supervisor,
    request: requestRows[0],
  };
}

module.exports = {
  databaseAvailable,
  createDb,
  resetRequestData,
  seedScenario,
  CONNECTION_STRING,
};
