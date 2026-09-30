'use strict';

/**
 * Centralised finite state machine engine for CivicConnect service requests.
 *
 * Architecture layer: Domain / Business Logic (ADR-ARCH-001).
 *
 * A Finite State Machine (FSM) is a way of controlling the stages through which
 * a service request may move. This engine evaluates a proposed move against the
 * table declared in states.js and reports every precondition that move fails.
 * It performs no persistence and raises no events; a caller that needs those
 * effects composes them around the engine.
 *
 * Because the engine is pure, the complete transition space can be verified
 * without a database, and no future controller or user interface can reach a
 * status change without passing through this module.
 *
 * Engineering records: ADR-DES-001
 * Requirements: FR-006, NFR-005
 * ASRs: ASR-03, ASR-06
 * Risk mitigated: R-ARCH-02
 */

const { STATES, TRANSITIONS, TERMINAL_STATES } = require('./states');

/**
 * Raised when a transition is not permitted. Carries every violation rather
 * than only the first, so the caller can return a complete error response.
 */
class IllegalTransitionError extends Error {
  constructor(from, to, violations) {
    super(`Transition ${from} -> ${to} is not permitted: ${violations.join(' ')}`);
    this.name = 'IllegalTransitionError';
    this.code = 'ILLEGAL_TRANSITION';
    this.from = from;
    this.to = to;
    this.violations = violations;
  }
}

/** True if the supplied value is a recognised lifecycle state. */
function isKnownState(state) {
  return Object.values(STATES).includes(state);
}

/** The states reachable from the supplied state, ignoring role and guards. */
function legalTargetsFrom(state) {
  const rules = TRANSITIONS[state];
  if (!rules) {
    return [];
  }
  return rules.map((rule) => rule.to);
}

/** True if no transition at all is permitted out of the supplied state. */
function isTerminal(state) {
  return TERMINAL_STATES.includes(state);
}

/**
 * Evaluate a proposed transition.
 *
 * @param {object} params
 * @param {string} params.from      Current persisted status.
 * @param {string} params.to        Proposed status.
 * @param {string} params.actorRole Role of the user attempting the transition.
 * @param {object} [params.context] Data the guards inspect: assignedStaffId,
 *   assignedStaffIsActive, resolutionNotes, rejectionReason.
 * @returns {{allowed: boolean, violations: string[]}}
 */
function evaluateTransition({ from, to, actorRole, context = {} }) {
  const violations = [];

  if (!isKnownState(from)) {
    violations.push(`Current status '${from}' is not a recognised state.`);
  }
  if (!isKnownState(to)) {
    violations.push(`Target status '${to}' is not a recognised state.`);
  }
  if (violations.length > 0) {
    return { allowed: false, violations };
  }

  if (isTerminal(from)) {
    return {
      allowed: false,
      violations: [`'${from}' is a terminal state and cannot be transitioned.`],
    };
  }

  const rule = (TRANSITIONS[from] || []).find((candidate) => candidate.to === to);
  if (!rule) {
    const targets = legalTargetsFrom(from);
    const permitted = targets.length > 0 ? targets.join(', ') : 'none';
    return {
      allowed: false,
      violations: [
        `'${from}' cannot move to '${to}'. Permitted targets: ${permitted}.`,
      ],
    };
  }

  if (!rule.allowedRoles.includes(actorRole)) {
    violations.push(
      `Role '${actorRole}' may not perform this transition. Required: ${rule.allowedRoles.join(' or ')}.`,
    );
  }

  for (const guard of rule.guards) {
    violations.push(...guard(context));
  }

  return { allowed: violations.length === 0, violations };
}

/**
 * Evaluate a transition and throw if it is not permitted. Used by the
 * application layer, which treats an illegal transition as a client error
 * rather than a condition to handle inline.
 */
function assertTransition(params) {
  const { allowed, violations } = evaluateTransition(params);
  if (!allowed) {
    throw new IllegalTransitionError(params.from, params.to, violations);
  }
  return true;
}

module.exports = {
  evaluateTransition,
  assertTransition,
  legalTargetsFrom,
  isTerminal,
  isKnownState,
  IllegalTransitionError,
};
