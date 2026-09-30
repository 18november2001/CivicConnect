'use strict';

/**
 * Two-phase in-process domain event dispatcher.
 *
 * Architecture layer: Domain / Business Logic (ADR-ARCH-001).
 *
 * A domain event is a record that something meaningful happened in the
 * business, which other parts of the system may react to without the part that
 * raised it needing to know who they are.
 *
 * CivicConnect raises one event, RequestStatusChanged. Several unrelated
 * responsibilities react to it: the audit ledger, the public timeline and
 * messaging. Those subscribers do not share the same consistency needs, which
 * is why the dispatcher has two phases rather than one.
 *
 *   Transactional phase  Subscribers that write to the CivicConnect database
 *                        and must be atomic with the status change. If one
 *                        fails, the status change is rolled back with it.
 *
 *   Post-commit phase    Subscribers whose effect a rollback cannot undo,
 *                        principally anything crossing a system boundary.
 *                        These run only after commit, and their failure is
 *                        logged rather than propagated, so that an external
 *                        outage cannot fail an authorised status change.
 *
 * The rule for choosing a phase is stated once, here: a subscriber belongs in
 * the post-commit phase if and only if its effect cannot be undone by a
 * database rollback.
 *
 * Engineering records: ADR-DES-002
 * Requirements: FR-003, FR-005, NFR-002
 * ASRs: ASR-02 (Data Integrity and Traceability), ASR-05 (Reliability and
 *       Error Handling), ASR-07 (Maintainability)
 */

class DomainEventDispatcher {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.transactionalHandlers = new Map();
    this.postCommitHandlers = new Map();
  }

  /**
   * Register a subscriber that participates in the caller's transaction.
   * @param {string} eventName
   * @param {(event: object, tx: object) => Promise<void>} handler
   */
  onTransactional(eventName, handler) {
    const existing = this.transactionalHandlers.get(eventName) || [];
    existing.push(handler);
    this.transactionalHandlers.set(eventName, existing);
    return this;
  }

  /**
   * Register a subscriber that runs only after the transaction has committed.
   * @param {string} eventName
   * @param {(event: object) => Promise<void>} handler
   */
  onPostCommit(eventName, handler) {
    const existing = this.postCommitHandlers.get(eventName) || [];
    existing.push(handler);
    this.postCommitHandlers.set(eventName, existing);
    return this;
  }

  /**
   * Run the transactional subscribers. Failures propagate deliberately: the
   * caller is inside a transaction and must roll back.
   */
  async dispatchTransactional(event, tx) {
    const handlers = this.transactionalHandlers.get(event.name) || [];
    for (const handler of handlers) {
      await handler(event, tx);
    }
  }

  /**
   * Run the post-commit subscribers. Failures are contained: the status change
   * has already committed and is correct, so one failing subscriber must not
   * surface as an error on an action that succeeded.
   */
  async dispatchPostCommit(event) {
    const handlers = this.postCommitHandlers.get(event.name) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        this.logger.error(
          `Post-commit subscriber failed for ${event.name} on request ${event.requestId}:`,
          error.message,
        );
      }
    }
  }
}

/**
 * Construct the RequestStatusChanged event. Kept as a factory so every
 * subscriber receives the same shape, and a new field cannot be added at one
 * call site only.
 */
function requestStatusChanged({
  requestId,
  trackingCode,
  requesterId,
  previousStatus,
  newStatus,
  actorId,
  actorRole,
  actorDepartment = null,
  notes = null,
  originatingIp,
  occurredAt = new Date(),
}) {
  return Object.freeze({
    name: 'RequestStatusChanged',
    requestId,
    trackingCode,
    requesterId,
    previousStatus,
    newStatus,
    actorId,
    actorRole,
    actorDepartment,
    notes,
    originatingIp,
    occurredAt,
  });
}

module.exports = { DomainEventDispatcher, requestStatusChanged };
