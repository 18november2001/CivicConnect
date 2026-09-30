'use strict';

/**
 * CivicConnect service-request lifecycle definition.
 *
 * Architecture layer: Domain / Business Logic (ADR-ARCH-001).
 *
 * This module is the single authoritative statement of which lifecycle
 * transitions are legal and what each one requires. It contains no database
 * access, no HTTP handling and no framework dependency, so that every legal and
 * illegal transition can be verified in memory without infrastructure (ASR-06).
 *
 * Guard thresholds deliberately mirror the CHECK constraints declared on
 * service_requests in the persistence baseline. Validation that disagrees
 * between the application layer and the database is a defect, so the numbers
 * are stated once here and once in the schema, and any change must update both.
 *
 * Engineering records: ADR-DES-001
 * Requirements: FR-006, NFR-005
 * ASRs: ASR-03 (Controlled Request Lifecycle), ASR-06 (Testability)
 * Risk mitigated: R-ARCH-02 (lifecycle rules duplicated across components)
 */

const STATES = Object.freeze({
  SUBMITTED: 'Submitted',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In_Progress',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REJECTED: 'Rejected',
});

/** States from which no further transition is permitted. */
const TERMINAL_STATES = Object.freeze([STATES.CLOSED, STATES.REJECTED]);

/** Roles as declared by the CHECK constraint on users.role. */
const ROLES = Object.freeze({
  CITIZEN: 'Citizen',
  STAFF: 'Staff',
  SUPERVISOR: 'Supervisor',
  ADMIN: 'Admin',
});

/**
 * Minimum lengths, mirroring the CHECK constraints on service_requests.
 * resolution_notes  CHECK (char_length(resolution_notes) >= 20)
 * rejection_reason  CHECK (char_length(rejection_reason) >= 15)
 */
const MIN_RESOLUTION_NOTE_LENGTH = 20;
const MIN_REJECTION_REASON_LENGTH = 15;

/**
 * Guards are pure predicates over the transition context. Each returns an array
 * of violation messages; an empty array means the precondition is satisfied.
 * Guards never throw, so a caller can collect every violation at once rather
 * than the requester discovering them one rejected submission at a time.
 */
const guards = {
  requireActiveStaff(ctx) {
    if (!ctx.assignedStaffId) {
      return ['An assigned staff member is required.'];
    }
    if (ctx.assignedStaffIsActive === false) {
      return ['The assigned staff member is not an active user.'];
    }
    return [];
  },

  requireResolutionNotes(ctx) {
    const notes = (ctx.resolutionNotes || '').trim();
    if (notes.length === 0) {
      return ['Resolution notes are required before a request can be resolved.'];
    }
    if (notes.length < MIN_RESOLUTION_NOTE_LENGTH) {
      return [
        `Resolution notes must be at least ${MIN_RESOLUTION_NOTE_LENGTH} characters.`,
      ];
    }
    return [];
  },

  requireRejectionReason(ctx) {
    const reason = (ctx.rejectionReason || '').trim();
    if (reason.length === 0) {
      return ['A rejection reason is required before a request can be rejected.'];
    }
    if (reason.length < MIN_REJECTION_REASON_LENGTH) {
      return [
        `A rejection reason must be at least ${MIN_REJECTION_REASON_LENGTH} characters.`,
      ];
    }
    return [];
  },
};

/**
 * The transition table.
 *
 * Every state is a key, including terminal states, so the table is total: a
 * state with no legal outbound transition says so explicitly rather than being
 * absent. A missing key would be indistinguishable from a typing error.
 */
const TRANSITIONS = Object.freeze({
  [STATES.SUBMITTED]: [
    {
      to: STATES.ASSIGNED,
      allowedRoles: [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [guards.requireActiveStaff],
    },
    {
      to: STATES.REJECTED,
      allowedRoles: [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [guards.requireRejectionReason],
    },
  ],

  [STATES.ASSIGNED]: [
    {
      to: STATES.IN_PROGRESS,
      allowedRoles: [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [],
    },
    {
      // Reassignment to a different staff member leaves the request Assigned.
      to: STATES.ASSIGNED,
      allowedRoles: [ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [guards.requireActiveStaff],
    },
    {
      to: STATES.REJECTED,
      allowedRoles: [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [guards.requireRejectionReason],
    },
  ],

  [STATES.IN_PROGRESS]: [
    {
      to: STATES.RESOLVED,
      allowedRoles: [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [guards.requireResolutionNotes],
    },
    {
      // Returning a request to the queue without losing the work already logged.
      to: STATES.ASSIGNED,
      allowedRoles: [ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [guards.requireActiveStaff],
    },
  ],

  [STATES.RESOLVED]: [
    {
      // Closure is a supervisory act. The staff member who resolved a request
      // may not also close it.
      to: STATES.CLOSED,
      allowedRoles: [ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [],
    },
    {
      // Reopening a resolution that did not hold.
      to: STATES.IN_PROGRESS,
      allowedRoles: [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN],
      guards: [],
    },
  ],

  [STATES.CLOSED]: [],
  [STATES.REJECTED]: [],
});

module.exports = {
  STATES,
  TERMINAL_STATES,
  ROLES,
  MIN_RESOLUTION_NOTE_LENGTH,
  MIN_REJECTION_REASON_LENGTH,
  TRANSITIONS,
  guards,
};
