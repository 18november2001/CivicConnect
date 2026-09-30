'use strict';

/**
 * Transactional subscriber: records the intent to send a WhatsApp/SMS message.
 *
 * Architecture layer: Messaging Integration Boundary (ADR-ARCH-001).
 *
 * Messaging is the one subscriber whose work leaves CivicConnect. A sent
 * message cannot be withdrawn by a database rollback, so the provider call must
 * not sit inside the transaction; and the intent to send must not be lost if
 * the process stops immediately after committing.
 *
 * The transactional outbox resolves both. An outbox row is written inside the
 * same transaction as the status change, so a rolled-back transition leaves no
 * row and sends nothing. A separate dispatch worker reads pending rows and
 * calls the messaging port, so a provider outage delays delivery instead of
 * failing an authorised status change.
 *
 * Engineering records: ADR-INT-001
 * Requirements: WhatsApp/SMS interaction (CHG-001), FR-003
 * ASRs: ASR-05 (Reliability and Error Handling), ASR-08
 */

const { CHANNELS } = require('./messagingPort');

/** Transitions the requester is messaged about, with the text sent. */
const MESSAGE_TEMPLATES = Object.freeze({
  Assigned: (ref) => `CivicConnect: request ${ref} has been assigned to a staff member.`,
  In_Progress: (ref) => `CivicConnect: work has started on request ${ref}.`,
  Resolved: (ref) => `CivicConnect: request ${ref} has been resolved.`,
  Closed: (ref) => `CivicConnect: request ${ref} has been closed.`,
  Rejected: (ref) => `CivicConnect: request ${ref} was not accepted. Please see your request history.`,
});

/**
 * Build the idempotency key. Derived from data already in the event so the same
 * transition always produces the same key, which is what allows the dispatch
 * worker to retry without sending twice.
 */
function buildIdempotencyKey(event) {
  return `${event.requestId}:${event.newStatus}:${event.occurredAt.toISOString()}`;
}

function makeMessagingOutboxHandler({ channel = CHANNELS.WHATSAPP } = {}) {
  return async function messagingOutboxHandler(event, tx) {
    const template = MESSAGE_TEMPLATES[event.newStatus];
    if (!template) {
      return;
    }

    const reference = event.trackingCode || event.requestId;

    await tx.query(
      `INSERT INTO messaging_outbox
         (request_id, recipient_user_id, channel, message_body,
          idempotency_key, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'Pending', $6)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        event.requestId,
        event.requesterId,
        channel,
        template(reference),
        buildIdempotencyKey(event),
        event.occurredAt,
      ],
    );
  };
}

/**
 * Post-commit subscriber: asks the dispatch worker to run now rather than
 * waiting for its next poll.
 *
 * This is a latency optimisation and nothing more. It is registered on the
 * post-commit phase and its failure is contained, because the outbox row is
 * already committed and the polling worker collects it regardless.
 */
function makeMessagingNudge(dispatchWorker) {
  return async function messagingNudge() {
    await dispatchWorker.runOnce();
  };
}

module.exports = {
  makeMessagingOutboxHandler,
  makeMessagingNudge,
  buildIdempotencyKey,
  MESSAGE_TEMPLATES,
};
