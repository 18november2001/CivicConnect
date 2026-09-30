'use strict';

/**
 * Unit verification of the CivicConnect lifecycle state machine.
 *
 * Requirements: FR-006, NFR-005
 * ASRs: ASR-03, ASR-06
 * Engineering records: ADR-DES-001
 *
 * These tests use the Node.js built-in test runner, so they require no
 * third-party dependency and no database. That is a direct consequence of the
 * engine being pure, and it is the practical payoff of ASR-06.
 *
 * Run with:  node --test tests/unit/requestStateMachine.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateTransition,
  assertTransition,
  legalTargetsFrom,
  isTerminal,
  IllegalTransitionError,
} = require('../../src/domain/fsm/requestStateMachine');
const {
  STATES,
  ROLES,
  TRANSITIONS,
  MIN_RESOLUTION_NOTE_LENGTH,
  MIN_REJECTION_REASON_LENGTH,
} = require('../../src/domain/fsm/states');

const VALID_NOTES = 'Pothole filled and the road surface was re-compacted on site.';
const VALID_REASON = 'Duplicate of request REQ-20260915-0042.';

test('the transition table covers every declared state', () => {
  for (const state of Object.values(STATES)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(TRANSITIONS, state),
      `State '${state}' is missing from the transition table.`,
    );
  }
});

test('guard thresholds match the database CHECK constraints', () => {
  // service_requests.resolution_notes CHECK (char_length >= 20)
  assert.equal(MIN_RESOLUTION_NOTE_LENGTH, 20);
  // service_requests.rejection_reason CHECK (char_length >= 15)
  assert.equal(MIN_REJECTION_REASON_LENGTH, 15);
});

test('a submitted request can be assigned to an active staff member', () => {
  const result = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.ASSIGNED,
    actorRole: ROLES.STAFF,
    context: { assignedStaffId: 'staff-42', assignedStaffIsActive: true },
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.violations, []);
});

test('assignment is refused when no staff member is supplied', () => {
  const result = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.ASSIGNED,
    actorRole: ROLES.STAFF,
    context: {},
  });
  assert.equal(result.allowed, false);
  assert.match(result.violations.join(' '), /assigned staff member is required/i);
});

test('assignment is refused when the staff member is not active', () => {
  const result = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.ASSIGNED,
    actorRole: ROLES.STAFF,
    context: { assignedStaffId: 'staff-42', assignedStaffIsActive: false },
  });
  assert.equal(result.allowed, false);
  assert.match(result.violations.join(' '), /not an active user/i);
});

test('a submitted request cannot skip straight to resolved', () => {
  const result = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.RESOLVED,
    actorRole: ROLES.STAFF,
    context: { resolutionNotes: VALID_NOTES },
  });
  assert.equal(result.allowed, false);
  assert.match(result.violations.join(' '), /Permitted targets/);
});

test('resolution requires a substantive note of at least 20 characters', () => {
  const missing = evaluateTransition({
    from: STATES.IN_PROGRESS,
    to: STATES.RESOLVED,
    actorRole: ROLES.STAFF,
    context: {},
  });
  assert.equal(missing.allowed, false);
  assert.match(missing.violations.join(' '), /Resolution notes are required/i);

  const tooShort = evaluateTransition({
    from: STATES.IN_PROGRESS,
    to: STATES.RESOLVED,
    actorRole: ROLES.STAFF,
    context: { resolutionNotes: 'done' },
  });
  assert.equal(tooShort.allowed, false);
  assert.match(tooShort.violations.join(' '), /at least 20 characters/i);

  const valid = evaluateTransition({
    from: STATES.IN_PROGRESS,
    to: STATES.RESOLVED,
    actorRole: ROLES.STAFF,
    context: { resolutionNotes: VALID_NOTES },
  });
  assert.equal(valid.allowed, true);
});

test('rejection requires a reason of at least 15 characters', () => {
  const missing = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.REJECTED,
    actorRole: ROLES.STAFF,
    context: {},
  });
  assert.equal(missing.allowed, false);
  assert.match(missing.violations.join(' '), /rejection reason is required/i);

  const tooShort = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.REJECTED,
    actorRole: ROLES.STAFF,
    context: { rejectionReason: 'no' },
  });
  assert.equal(tooShort.allowed, false);
  assert.match(tooShort.violations.join(' '), /at least 15 characters/i);

  const valid = evaluateTransition({
    from: STATES.SUBMITTED,
    to: STATES.REJECTED,
    actorRole: ROLES.STAFF,
    context: { rejectionReason: VALID_REASON },
  });
  assert.equal(valid.allowed, true);
});

test('closure is reserved to a supervisor or admin', () => {
  const byStaff = evaluateTransition({
    from: STATES.RESOLVED,
    to: STATES.CLOSED,
    actorRole: ROLES.STAFF,
    context: {},
  });
  assert.equal(byStaff.allowed, false);
  assert.match(byStaff.violations.join(' '), /may not perform this transition/i);

  const bySupervisor = evaluateTransition({
    from: STATES.RESOLVED,
    to: STATES.CLOSED,
    actorRole: ROLES.SUPERVISOR,
    context: {},
  });
  assert.equal(bySupervisor.allowed, true);
});

test('a citizen cannot drive the lifecycle', () => {
  for (const target of [STATES.ASSIGNED, STATES.REJECTED]) {
    const result = evaluateTransition({
      from: STATES.SUBMITTED,
      to: target,
      actorRole: ROLES.CITIZEN,
      context: {
        assignedStaffId: 'staff-42',
        assignedStaffIsActive: true,
        rejectionReason: VALID_REASON,
      },
    });
    assert.equal(result.allowed, false, `Citizen should not reach ${target}`);
  }
});

test('terminal states accept no further transition', () => {
  for (const terminal of [STATES.CLOSED, STATES.REJECTED]) {
    assert.equal(isTerminal(terminal), true);
    assert.deepEqual(legalTargetsFrom(terminal), []);

    const result = evaluateTransition({
      from: terminal,
      to: STATES.IN_PROGRESS,
      actorRole: ROLES.SUPERVISOR,
      context: {},
    });
    assert.equal(result.allowed, false);
    assert.match(result.violations.join(' '), /terminal state/i);
  }
});

test('an unrecognised status is rejected rather than silently accepted', () => {
  const result = evaluateTransition({
    from: STATES.SUBMITTED,
    to: 'Escalated',
    actorRole: ROLES.SUPERVISOR,
    context: {},
  });
  assert.equal(result.allowed, false);
  assert.match(result.violations.join(' '), /not a recognised state/i);
});

test('every failed precondition is reported at once, not only the first', () => {
  const result = evaluateTransition({
    from: STATES.IN_PROGRESS,
    to: STATES.RESOLVED,
    actorRole: ROLES.CITIZEN,
    context: {},
  });
  assert.equal(result.allowed, false);
  // Both the role failure and the missing resolution note are reported.
  assert.ok(result.violations.length >= 2, 'Expected both violations to be reported');
});

test('a resolved request may be reopened by staff', () => {
  const result = evaluateTransition({
    from: STATES.RESOLVED,
    to: STATES.IN_PROGRESS,
    actorRole: ROLES.STAFF,
    context: {},
  });
  assert.equal(result.allowed, true);
});

test('assertTransition throws IllegalTransitionError carrying the violations', () => {
  assert.throws(
    () =>
      assertTransition({
        from: STATES.IN_PROGRESS,
        to: STATES.RESOLVED,
        actorRole: ROLES.STAFF,
        context: { resolutionNotes: 'ok' },
      }),
    (error) => {
      assert.ok(error instanceof IllegalTransitionError);
      assert.equal(error.code, 'ILLEGAL_TRANSITION');
      assert.ok(Array.isArray(error.violations));
      assert.equal(error.from, STATES.IN_PROGRESS);
      assert.equal(error.to, STATES.RESOLVED);
      return true;
    },
  );
});
