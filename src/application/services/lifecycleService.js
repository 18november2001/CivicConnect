'use strict';

/**
 * Lifecycle Service: coordinates a single CivicConnect status transition.
 *
 * Architecture layer: Application / Services (ADR-ARCH-001).
 *
 * This service is the only path by which a service_requests row changes status.
 * It owns the order of operations and nothing else: the rules live in the
 * domain state machine, and the side effects live in their own subscribers.
 *
 *   1. Load the request under a row lock and confirm the caller saw the
 *      current version.
 *   2. Ask the state machine whether the transition is permitted.
 *   3. Write the new status.
 *   4. Dispatch transactional subscribers inside the same transaction.
 *   5. Commit.
 *   6. Dispatch post-commit subscribers outside the transaction.
 *
 * Step 2 before step 3 is what makes an illegal transition impossible to
 * persist. Step 4 inside the transaction is what keeps the audit ledger, the
 * public timeline and the status in agreement. Step 6 outside it is what stops
 * an external messaging outage from failing an authorised action.
 *
 * Engineering records: ADR-DES-001, ADR-DES-002, ADR-INT-001
 * Requirements: FR-005, FR-006, NFR-002, NFR-005
 * ASRs: ASR-02, ASR-03, ASR-05, ASR-06
 * Risk mitigated: R-ARCH-02 (lifecycle rules duplicated across components)
 */

const {
  assertTransition,
  IllegalTransitionError,
} = require('../../domain/fsm/requestStateMachine');
const { requestStatusChanged } = require('../../domain/events/domainEvents');
const { STATES } = require('../../domain/fsm/states');

class RequestNotFoundError extends Error {
  constructor(requestId) {
    super(`Service request ${requestId} was not found.`);
    this.name = 'RequestNotFoundError';
    this.code = 'REQUEST_NOT_FOUND';
  }
}

/**
 * Raised when the request changed after the caller read it. Surfaces as HTTP
 * 409 Conflict so that two dispatchers claiming the same request do not
 * silently overwrite one another.
 */
class ConcurrentModificationError extends Error {
  constructor(requestId) {
    super(`Service request ${requestId} was modified by another user.`);
    this.name = 'ConcurrentModificationError';
    this.code = 'CONCURRENT_MODIFICATION';
  }
}

class LifecycleService {
  constructor({ db, dispatcher }) {
    this.db = db;
    this.dispatcher = dispatcher;
  }

  /**
   * @param {object} command
   * @param {string} command.requestId
   * @param {string} command.targetStatus
   * @param {string} command.actorId
   * @param {string} command.actorRole
   * @param {string} [command.actorDepartment]
   * @param {string} command.originatingIp
   * @param {Date}   command.expectedUpdatedAt  Version the caller last saw.
   * @param {object} [command.context]          Guard data: assignedStaffId,
   *   assignedStaffIsActive, resolutionNotes, rejectionReason.
   * @returns {Promise<object>} The RequestStatusChanged event that was raised.
   */
  async transition(command) {
    const {
      requestId,
      targetStatus,
      actorId,
      actorRole,
      actorDepartment = null,
      originatingIp,
      expectedUpdatedAt,
      context = {},
    } = command;

    const event = await this.db.transaction(async (tx) => {
      const { rows } = await tx.query(
        `SELECT request_id, tracking_code, requester_id, status, updated_at
           FROM service_requests
          WHERE request_id = $1
          FOR UPDATE`,
        [requestId],
      );

      const request = rows[0];
      if (!request) {
        throw new RequestNotFoundError(requestId);
      }

      // Optimistic concurrency control: reject a write based on a stale read.
      if (
        expectedUpdatedAt &&
        new Date(request.updated_at).getTime() !==
          new Date(expectedUpdatedAt).getTime()
      ) {
        throw new ConcurrentModificationError(requestId);
      }

      // Throws IllegalTransitionError carrying every failed precondition.
      assertTransition({
        from: request.status,
        to: targetStatus,
        actorRole,
        context,
      });

      const occurredAt = new Date();

      await tx.query(
        `UPDATE service_requests
            SET status = $1,
                assigned_staff_id = COALESCE($2, assigned_staff_id),
                resolution_notes = COALESCE($3, resolution_notes),
                rejection_reason = COALESCE($4, rejection_reason),
                updated_at = $5
          WHERE request_id = $6`,
        [
          targetStatus,
          context.assignedStaffId || null,
          targetStatus === STATES.RESOLVED ? context.resolutionNotes || null : null,
          targetStatus === STATES.REJECTED ? context.rejectionReason || null : null,
          occurredAt,
          requestId,
        ],
      );

      const statusChanged = requestStatusChanged({
        requestId,
        trackingCode: request.tracking_code,
        requesterId: request.requester_id,
        previousStatus: request.status,
        newStatus: targetStatus,
        actorId,
        actorRole,
        actorDepartment,
        notes: context.resolutionNotes || context.rejectionReason || null,
        originatingIp,
        occurredAt,
      });

      // Audit row, public timeline entry and the messaging outbox row all
      // commit or roll back together with the status change.
      await this.dispatcher.dispatchTransactional(statusChanged, tx);

      return statusChanged;
    });

    // Anything a rollback could not undo runs only after the commit, and its
    // failure is contained by the dispatcher.
    await this.dispatcher.dispatchPostCommit(event);

    return event;
  }
}

module.exports = {
  LifecycleService,
  RequestNotFoundError,
  ConcurrentModificationError,
  IllegalTransitionError,
};
