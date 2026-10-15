'use strict';

/**
 * Integration verification of the CivicConnect lifecycle against a real
 * PostgreSQL database.
 *
 * These cases exist because the unit suite cannot reach them. A fake
 * transaction can confirm which SQL statement would be issued; only a real
 * database can confirm that a rolled-back transition leaves nothing behind,
 * that a CHECK constraint actually refuses a bad value, and that a REVOKE
 * actually prevents an UPDATE. PED section 34.4 recorded this gap, and these
 * tests close it.
 *
 * Boundary under test: Application layer to Persistence layer, including the
 * domain event subscribers registered on the transactional phase.
 *
 * Requirements: FR-003, FR-005, FR-006, NFR-002
 * Engineering records: ADR-DES-001, ADR-DES-002, ADR-INT-001
 *
 * Run: TEST_DATABASE_URL=postgres://... node --test tests/integration/*.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  databaseAvailable,
  createDb,
  resetRequestData,
  seedScenario,
} = require('../helpers/testDatabase');

const { LifecycleService } = require('../../src/application/services/lifecycleService');
const { DomainEventDispatcher } = require('../../src/domain/events/domainEvents');
const { auditLogHandler } = require('../../src/infrastructure/persistence/handlers/auditLogHandler');
const { timelineHandler } = require('../../src/infrastructure/persistence/handlers/timelineHandler');
const { makeMessagingOutboxHandler } = require('../../src/integration/messaging/messagingOutboxHandler');
const { IllegalTransitionError } = require('../../src/domain/fsm/requestStateMachine');
const { STATES, ROLES } = require('../../src/domain/fsm/states');

const skip = databaseAvailable
  ? false
  : 'TEST_DATABASE_URL is not set; integration suite skipped';

const SILENT = { info() {}, warn() {}, error() {} };

function buildService(db) {
  const dispatcher = new DomainEventDispatcher({ logger: SILENT });
  dispatcher.onTransactional('RequestStatusChanged', auditLogHandler);
  dispatcher.onTransactional('RequestStatusChanged', timelineHandler);
  dispatcher.onTransactional('RequestStatusChanged', makeMessagingOutboxHandler());
  return { service: new LifecycleService({ db, dispatcher }), dispatcher };
}

async function counts(db, requestId) {
  const [audit, timeline, outbox] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS n FROM request_audit_log WHERE request_id = $1', [requestId]),
    db.query('SELECT COUNT(*)::int AS n FROM request_timeline_updates WHERE request_id = $1', [requestId]),
    db.query('SELECT COUNT(*)::int AS n FROM messaging_outbox WHERE request_id = $1', [requestId]),
  ]);
  return {
    audit: audit.rows[0].n,
    timeline: timeline.rows[0].n,
    outbox: outbox.rows[0].n,
  };
}

// ---------------------------------------------------------------------------
// INT-01  A permitted transition commits the status change and every
//         transactional side effect together.
// Test basis: FR-006 with NFR-002. The claim under test is atomicity, which is
// the single thing PED section 34.4 recorded as unproven.
// ---------------------------------------------------------------------------
test('INT-01 a permitted transition writes status, audit, timeline and outbox atomically', { skip }, async (t) => {
  const db = createDb();
  t.after(() => db.end());

  await resetRequestData(db);
  const { staffId, request } = await seedScenario(db);
  const { service } = buildService(db);

  await service.transition({
    requestId: request.request_id,
    targetStatus: STATES.ASSIGNED,
    actorId: staffId,
    actorRole: ROLES.STAFF,
    actorDepartment: 'Roads',
    originatingIp: '196.25.1.10',
    expectedUpdatedAt: request.updated_at,
    context: { assignedStaffId: staffId, assignedStaffIsActive: true },
  });

  const { rows } = await db.query(
    'SELECT status, assigned_staff_id FROM service_requests WHERE request_id = $1',
    [request.request_id],
  );
  assert.equal(rows[0].status, STATES.ASSIGNED);
  assert.equal(rows[0].assigned_staff_id, staffId);

  const after = await counts(db, request.request_id);
  assert.equal(after.audit, 1, 'exactly one audit row');
  assert.equal(after.timeline, 1, 'exactly one timeline row');
  assert.equal(after.outbox, 1, 'exactly one outbox row');

  const { rows: auditRows } = await db.query(
    'SELECT action, previous_state, new_state, actor_id FROM request_audit_log WHERE request_id = $1',
    [request.request_id],
  );
  assert.equal(auditRows[0].action, 'STATUS_CHANGE');
  assert.equal(auditRows[0].previous_state, STATES.SUBMITTED);
  assert.equal(auditRows[0].new_state, STATES.ASSIGNED);
  assert.equal(auditRows[0].actor_id, staffId);
});

// ---------------------------------------------------------------------------
// INT-02  A refused transition leaves no trace at all.
// Test basis: NFR-002. An audit row for a transition that did not happen is a
// defect, so the rollback must take the subscribers with it.
// ---------------------------------------------------------------------------
test('INT-02 a refused transition rolls back and writes nothing', { skip }, async (t) => {
  const db = createDb();
  t.after(() => db.end());

  await resetRequestData(db);
  const { staffId, request } = await seedScenario(db);
  const { service } = buildService(db);

  await assert.rejects(
    () =>
      service.transition({
        requestId: request.request_id,
        // Submitted cannot move straight to Resolved.
        targetStatus: STATES.RESOLVED,
        actorId: staffId,
        actorRole: ROLES.STAFF,
        originatingIp: '196.25.1.10',
        expectedUpdatedAt: request.updated_at,
        context: { resolutionNotes: 'A resolution note of sufficient length here.' },
      }),
    (error) => error instanceof IllegalTransitionError,
  );

  const { rows } = await db.query(
    'SELECT status FROM service_requests WHERE request_id = $1',
    [request.request_id],
  );
  assert.equal(rows[0].status, STATES.SUBMITTED, 'status must be unchanged');

  const after = await counts(db, request.request_id);
  assert.deepEqual(
    after,
    { audit: 0, timeline: 0, outbox: 0 },
    'no side effect may survive a refused transition',
  );
});

// ---------------------------------------------------------------------------
// INT-03  Optimistic concurrency control.
// Test basis: FR-005. Two dispatchers claiming the same request must not
// silently overwrite one another. The second caller holds a stale updated_at.
// ---------------------------------------------------------------------------
test('INT-03 a stale write is rejected rather than overwriting another user', { skip }, async (t) => {
  const db = createDb();
  t.after(() => db.end());

  await resetRequestData(db);
  const { staffId, supervisorId, request } = await seedScenario(db);
  const { service } = buildService(db);

  // Both callers read the request at the same version.
  const staleVersion = request.updated_at;

  await service.transition({
    requestId: request.request_id,
    targetStatus: STATES.ASSIGNED,
    actorId: staffId,
    actorRole: ROLES.STAFF,
    originatingIp: '196.25.1.10',
    expectedUpdatedAt: staleVersion,
    context: { assignedStaffId: staffId, assignedStaffIsActive: true },
  });

  await assert.rejects(
    () =>
      service.transition({
        requestId: request.request_id,
        targetStatus: STATES.REJECTED,
        actorId: supervisorId,
        actorRole: ROLES.SUPERVISOR,
        originatingIp: '196.25.1.11',
        expectedUpdatedAt: staleVersion,
        context: { rejectionReason: 'Duplicate of an earlier report.' },
      }),
    (error) => {
      assert.equal(error.code, 'CONCURRENT_MODIFICATION');
      return true;
    },
  );

  const { rows } = await db.query(
    'SELECT status FROM service_requests WHERE request_id = $1',
    [request.request_id],
  );
  assert.equal(rows[0].status, STATES.ASSIGNED, 'the first writer must win');

  const after = await counts(db, request.request_id);
  assert.equal(after.audit, 1, 'the rejected second attempt must not be audited');
});

// ---------------------------------------------------------------------------
// INT-04  Database-level constraint enforcement.
// Test basis: NFR-002. The application guard and the CHECK constraint carry
// the same thresholds. This confirms the database refuses a bad value even if
// the application layer were bypassed entirely.
// ---------------------------------------------------------------------------
test('INT-04 the database refuses an out-of-range value even when the application is bypassed', { skip }, async (t) => {
  const db = createDb();
  t.after(() => db.end());

  await resetRequestData(db);
  const { request } = await seedScenario(db);

  // Direct write, deliberately bypassing the Lifecycle Service.
  await assert.rejects(
    () =>
      db.query(
        'UPDATE service_requests SET resolution_notes = $1 WHERE request_id = $2',
        ['too short', request.request_id],
      ),
    (error) => {
      assert.match(error.message, /resolution_notes/i);
      return true;
    },
    'a 9 character resolution note must violate the CHECK constraint',
  );

  await assert.rejects(
    () =>
      db.query(
        'UPDATE service_requests SET status = $1 WHERE request_id = $2',
        ['Escalated', request.request_id],
      ),
    (error) => {
      assert.match(error.message, /status/i);
      return true;
    },
    'an unrecognised status must violate the CHECK constraint',
  );
});

// ---------------------------------------------------------------------------
// INT-05  Outbox idempotency at the database level.
// Test basis: ADR-INT-001. Dispatch is at-least-once, so the unique
// idempotency key is what prevents a retry producing a second message.
// ---------------------------------------------------------------------------
test('INT-05 a duplicate outbox key is absorbed rather than creating a second message', { skip }, async (t) => {
  const db = createDb();
  t.after(() => db.end());

  await resetRequestData(db);
  const { citizenId, request } = await seedScenario(db);

  const insert = `
    INSERT INTO messaging_outbox
      (request_id, recipient_user_id, channel, message_body, idempotency_key, status, created_at)
    VALUES ($1, $2, 'WhatsApp', $3, $4, 'Pending', NOW())
    ON CONFLICT (idempotency_key) DO NOTHING`;

  const key = `${request.request_id}:Assigned:fixed-timestamp`;

  await db.query(insert, [request.request_id, citizenId, 'First attempt.', key]);
  await db.query(insert, [request.request_id, citizenId, 'Retry attempt.', key]);

  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n, MIN(message_body) AS body FROM messaging_outbox WHERE idempotency_key = $1',
    [key],
  );
  assert.equal(rows[0].n, 1, 'the retry must not create a second row');
  assert.equal(rows[0].body, 'First attempt.', 'the original row must be preserved');
});
