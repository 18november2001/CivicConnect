'use strict';

/**
 * Black-box functional verification of the CivicConnect request lifecycle.
 *
 * These cases are derived from the specification, not from the implementation.
 * Each one states its test basis, the technique that produced it, and the
 * acceptance criterion it demonstrates. The engine is treated as a closed box:
 * inputs in, permitted or refused out.
 *
 * Techniques applied:
 *   STT  State Transition Testing   (FR-006 lifecycle model)
 *   BVA  Boundary Value Analysis    (resolution note and rejection reason limits)
 *   DT   Decision Table Testing     (role and precondition combinations)
 *
 * Run: node --test tests/blackbox/lifecycleBlackBox.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { evaluateTransition } = require('../../src/domain/fsm/requestStateMachine');
const { STATES, ROLES } = require('../../src/domain/fsm/states');

/** Convenience wrapper so each case reads as a specification statement. */
function attempt(from, to, actorRole, context = {}) {
  return evaluateTransition({ from, to, actorRole, context });
}

const ACTIVE_STAFF = { assignedStaffId: 'staff-001', assignedStaffIsActive: true };

// ---------------------------------------------------------------------------
// BB-01  State Transition Testing: the valid lifecycle path
// Test basis: FR-006. A request must be able to complete the normal journey
// from submission to closure.
// ---------------------------------------------------------------------------
test('BB-01 [STT] the full valid lifecycle path is permitted end to end', () => {
  const journey = [
    [STATES.SUBMITTED, STATES.ASSIGNED, ROLES.STAFF, ACTIVE_STAFF],
    [STATES.ASSIGNED, STATES.IN_PROGRESS, ROLES.STAFF, {}],
    [
      STATES.IN_PROGRESS,
      STATES.RESOLVED,
      ROLES.STAFF,
      { resolutionNotes: 'Blocked stormwater drain cleared and tested.' },
    ],
    [STATES.RESOLVED, STATES.CLOSED, ROLES.SUPERVISOR, {}],
  ];

  for (const [from, to, role, context] of journey) {
    const result = attempt(from, to, role, context);
    assert.equal(
      result.allowed,
      true,
      `Expected ${from} -> ${to} as ${role} to be permitted, got: ${result.violations.join(' ')}`,
    );
  }
});

// ---------------------------------------------------------------------------
// BB-02  State Transition Testing: invalid transition pairs
// Test basis: FR-006. The specification lists which moves are legal; every
// other pair must be refused. These are "sneak path" cases: moves a user
// interface should never offer but an API caller could still attempt.
// ---------------------------------------------------------------------------
test('BB-02 [STT] transitions outside the specified model are refused', () => {
  const sneakPaths = [
    [STATES.SUBMITTED, STATES.IN_PROGRESS, 'work cannot start before assignment'],
    [STATES.SUBMITTED, STATES.CLOSED, 'a request cannot be closed before resolution'],
    [STATES.ASSIGNED, STATES.RESOLVED, 'resolution requires work to be in progress'],
    [STATES.ASSIGNED, STATES.CLOSED, 'closure requires resolution first'],
    [STATES.IN_PROGRESS, STATES.CLOSED, 'closure requires resolution first'],
    [STATES.IN_PROGRESS, STATES.SUBMITTED, 'a request cannot return to submission'],
    [STATES.RESOLVED, STATES.ASSIGNED, 'a resolved request reopens to In Progress, not Assigned'],
  ];

  for (const [from, to, reason] of sneakPaths) {
    const result = attempt(from, to, ROLES.SUPERVISOR, {
      ...ACTIVE_STAFF,
      resolutionNotes: 'A sufficiently long resolution note for this attempt.',
      rejectionReason: 'A sufficiently long rejection reason.',
    });
    assert.equal(result.allowed, false, `${from} -> ${to} should be refused: ${reason}`);
  }
});

// ---------------------------------------------------------------------------
// BB-03  State Transition Testing: terminal states
// Test basis: FR-006. Closed and Rejected are end states. Nothing may follow.
// ---------------------------------------------------------------------------
test('BB-03 [STT] no transition is permitted out of a terminal state', () => {
  const liveStates = [
    STATES.SUBMITTED,
    STATES.ASSIGNED,
    STATES.IN_PROGRESS,
    STATES.RESOLVED,
  ];

  for (const terminal of [STATES.CLOSED, STATES.REJECTED]) {
    for (const target of liveStates) {
      const result = attempt(terminal, target, ROLES.ADMIN, ACTIVE_STAFF);
      assert.equal(
        result.allowed,
        false,
        `${terminal} is terminal and must not move to ${target}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// BB-04  Boundary Value Analysis: resolution note length
// Test basis: acceptance criterion for FR-006 resolution, and the CHECK
// constraint on service_requests.resolution_notes (minimum 20 characters).
// Values tested: 19 (just below), 20 (at), 21 (just above), plus empty.
// ---------------------------------------------------------------------------
test('BB-04 [BVA] resolution note length is enforced at the 20 character boundary', () => {
  const cases = [
    { length: 0, expected: false, label: 'empty' },
    { length: 19, expected: false, label: 'one below the minimum' },
    { length: 20, expected: true, label: 'exactly the minimum' },
    { length: 21, expected: true, label: 'one above the minimum' },
  ];

  for (const { length, expected, label } of cases) {
    const result = attempt(STATES.IN_PROGRESS, STATES.RESOLVED, ROLES.STAFF, {
      resolutionNotes: 'x'.repeat(length),
    });
    assert.equal(
      result.allowed,
      expected,
      `A resolution note of ${length} characters (${label}) should be ${expected ? 'accepted' : 'refused'}`,
    );
  }
});

// ---------------------------------------------------------------------------
// BB-05  Boundary Value Analysis: rejection reason length
// Test basis: acceptance criterion for FR-006 rejection, and the CHECK
// constraint on service_requests.rejection_reason (minimum 15 characters).
// Values tested: 14 (just below), 15 (at), 16 (just above), plus empty.
// ---------------------------------------------------------------------------
test('BB-05 [BVA] rejection reason length is enforced at the 15 character boundary', () => {
  const cases = [
    { length: 0, expected: false, label: 'empty' },
    { length: 14, expected: false, label: 'one below the minimum' },
    { length: 15, expected: true, label: 'exactly the minimum' },
    { length: 16, expected: true, label: 'one above the minimum' },
  ];

  for (const { length, expected, label } of cases) {
    const result = attempt(STATES.SUBMITTED, STATES.REJECTED, ROLES.STAFF, {
      rejectionReason: 'x'.repeat(length),
    });
    assert.equal(
      result.allowed,
      expected,
      `A rejection reason of ${length} characters (${label}) should be ${expected ? 'accepted' : 'refused'}`,
    );
  }
});

// ---------------------------------------------------------------------------
// BB-06  Decision Table Testing: closure authority
// Test basis: FR-006 and NFR-001. Closure is a supervisory act. Two conditions
// combine: the role of the actor, and whether the request is in Resolved.
//
//   Role        | From Resolved | Expected
//   Citizen     | yes           | refused (role)
//   Staff       | yes           | refused (role)
//   Supervisor  | yes           | permitted
//   Admin       | yes           | permitted
//   Supervisor  | no            | refused (state)
// ---------------------------------------------------------------------------
test('BB-06 [DT] closure authority depends on both role and current state', () => {
  const decisionTable = [
    { role: ROLES.CITIZEN, from: STATES.RESOLVED, expected: false },
    { role: ROLES.STAFF, from: STATES.RESOLVED, expected: false },
    { role: ROLES.SUPERVISOR, from: STATES.RESOLVED, expected: true },
    { role: ROLES.ADMIN, from: STATES.RESOLVED, expected: true },
    { role: ROLES.SUPERVISOR, from: STATES.IN_PROGRESS, expected: false },
  ];

  for (const { role, from, expected } of decisionTable) {
    const result = attempt(from, STATES.CLOSED, role, {});
    assert.equal(
      result.allowed,
      expected,
      `Closure from ${from} as ${role} should be ${expected ? 'permitted' : 'refused'}`,
    );
  }
});

// ---------------------------------------------------------------------------
// BB-07  Negative / unauthorised: a citizen cannot drive the lifecycle
// Test basis: NFR-001 role-based access control. A requester may submit and
// view, but may not change the status of their own request.
// ---------------------------------------------------------------------------
test('BB-07 [negative] a citizen is refused every lifecycle transition', () => {
  const attempts = [
    [STATES.SUBMITTED, STATES.ASSIGNED, ACTIVE_STAFF],
    [STATES.SUBMITTED, STATES.REJECTED, { rejectionReason: 'I changed my mind about this.' }],
    [STATES.ASSIGNED, STATES.IN_PROGRESS, {}],
    [
      STATES.IN_PROGRESS,
      STATES.RESOLVED,
      { resolutionNotes: 'I believe this has been dealt with now.' },
    ],
    [STATES.RESOLVED, STATES.CLOSED, {}],
  ];

  for (const [from, to, context] of attempts) {
    const result = attempt(from, to, ROLES.CITIZEN, context);
    assert.equal(result.allowed, false, `A citizen must not move ${from} -> ${to}`);
  }
});

// ---------------------------------------------------------------------------
// BB-08  Negative / malformed input
// Test basis: NFR-004 reliability and error handling. An unrecognised status
// supplied by a caller must be refused with a clear reason rather than
// silently accepted or causing an unhandled error.
// ---------------------------------------------------------------------------
test('BB-08 [negative] unrecognised status values are refused, not accepted', () => {
  const malformed = ['Escalated', 'closed', 'In Progress', '', null, undefined, 42];

  for (const value of malformed) {
    const result = attempt(STATES.SUBMITTED, value, ROLES.SUPERVISOR, ACTIVE_STAFF);
    assert.equal(
      result.allowed,
      false,
      `Target status ${JSON.stringify(value)} must be refused`,
    );
    assert.ok(result.violations.length > 0, 'A reason must be supplied');
  }
});

// ---------------------------------------------------------------------------
// BB-09  Negative / unauthorised: assignment to an inactive staff member
// Test basis: FR-005. Work may only be allocated to an active user account, so
// that a deactivated account cannot silently hold open work.
// ---------------------------------------------------------------------------
test('BB-09 [negative] a request cannot be assigned to an inactive staff account', () => {
  const result = attempt(STATES.SUBMITTED, STATES.ASSIGNED, ROLES.STAFF, {
    assignedStaffId: 'staff-999',
    assignedStaffIsActive: false,
  });

  assert.equal(result.allowed, false);
  assert.match(result.violations.join(' '), /not an active user/i);
});

// ---------------------------------------------------------------------------
// BB-10  Error reporting quality
// Test basis: NFR-004. When several preconditions fail together, the caller
// must receive all of them, so a user is not forced through repeated rejected
// submissions discovering one problem at a time.
// ---------------------------------------------------------------------------
test('BB-10 [DT] every failed precondition is reported in a single response', () => {
  const result = attempt(STATES.IN_PROGRESS, STATES.RESOLVED, ROLES.CITIZEN, {
    resolutionNotes: 'too short',
  });

  assert.equal(result.allowed, false);
  assert.ok(
    result.violations.length >= 2,
    `Expected the role failure and the note-length failure together, got: ${result.violations.join(' | ')}`,
  );
  assert.match(result.violations.join(' '), /may not perform this transition/i);
  assert.match(result.violations.join(' '), /at least 20 characters/i);
});
