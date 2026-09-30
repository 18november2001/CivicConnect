'use strict';

/**
 * Transactional subscriber: writes the requester-visible timeline entry.
 *
 * Architecture layer: Persistence / Infrastructure (ADR-ARCH-001).
 *
 * The audit ledger and the public timeline are deliberately separate tables
 * with separate subscribers. The audit row records what happened internally,
 * including the acting staff identity. The timeline records what the requester
 * is told, attributed to a department rather than to an individual worker. Not
 * every transition is publishable and the wording differs, so one table cannot
 * serve both purposes.
 *
 * Writes to request_timeline_updates, on which UPDATE and DELETE are revoked.
 *
 * Engineering records: ADR-DES-002
 * Requirements: FR-003 (Public Feedback and Lifecycle Timeline)
 * ASRs: ASR-02
 */

/**
 * The transitions a requester is shown, with the wording used for each.
 * A transition absent from this map is internal and produces no timeline entry,
 * which is how internal reassignment is kept out of the public record.
 */
const PUBLIC_MESSAGES = Object.freeze({
  Assigned: 'Your request has been assigned to a municipal staff member.',
  In_Progress: 'Work has started on your request.',
  Resolved: 'Your request has been resolved. Please see the accompanying note.',
  Closed: 'Your request has been closed.',
  Rejected: 'Your request was not accepted. Please see the accompanying reason.',
});

/** Shown when the acting user has no department, for example an Admin account. */
const DEFAULT_DEPARTMENT = 'Municipal Services';

async function timelineHandler(event, tx) {
  const message = PUBLIC_MESSAGES[event.newStatus];
  if (!message) {
    return;
  }

  await tx.query(
    `INSERT INTO request_timeline_updates
       (request_id, status_snapshot, public_message, posted_by_department, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      event.requestId,
      event.newStatus,
      message,
      event.actorDepartment || DEFAULT_DEPARTMENT,
      event.occurredAt,
    ],
  );
}

module.exports = { timelineHandler, PUBLIC_MESSAGES, DEFAULT_DEPARTMENT };
