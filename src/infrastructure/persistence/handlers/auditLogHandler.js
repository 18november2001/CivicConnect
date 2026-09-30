'use strict';

/**
 * Transactional subscriber: appends an immutable audit row for every lifecycle
 * transition.
 *
 * Architecture layer: Persistence / Infrastructure (ADR-ARCH-001).
 *
 * Registered on the transactional phase because the audit ledger is the record
 * that a transition happened. An audit row without a status change, and a
 * status change without an audit row, are both defects, so the two must share a
 * transaction.
 *
 * Writes to request_audit_log, on which UPDATE, DELETE and TRUNCATE are
 * revoked at database level.
 *
 * Engineering records: ADR-DES-002
 * Requirements: NFR-002 (Data Integrity, Immutability and Traceability), FR-005
 * ASRs: ASR-02
 */

async function auditLogHandler(event, tx) {
  await tx.query(
    `INSERT INTO request_audit_log
       (request_id, actor_id, action, previous_state, new_state,
        handover_notes, originating_ip, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event.requestId,
      event.actorId,
      'STATUS_CHANGE',
      event.previousStatus,
      event.newStatus,
      event.notes,
      event.originatingIp,
      event.occurredAt,
    ],
  );
}

module.exports = { auditLogHandler };
