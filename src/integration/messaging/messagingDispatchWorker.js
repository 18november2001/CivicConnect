'use strict';

/**
 * Messaging dispatch worker.
 *
 * Architecture layer: Messaging Integration Boundary (ADR-ARCH-001).
 *
 * Reads pending rows from messaging_outbox and hands each to the configured
 * messaging adapter. Runs outside the transaction that created the row, which
 * is what keeps provider latency and provider outages away from the lifecycle.
 *
 * Failure handling distinguishes the two cases the port defines. A transient
 * failure leaves the row Pending and increments the attempt count, so the next
 * run retries it. A permanent failure marks the row Failed, because retrying an
 * invalid recipient forever produces load and no delivery.
 *
 * Engineering records: ADR-INT-001
 * Requirements: WhatsApp/SMS interaction (CHG-001)
 * ASRs: ASR-05, ASR-08
 */

const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_ATTEMPTS = 5;

class MessagingDispatchWorker {
  constructor({
    db,
    messagingPort,
    recipientResolver,
    batchSize = DEFAULT_BATCH_SIZE,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    logger = console,
  }) {
    this.db = db;
    this.messagingPort = messagingPort;
    this.recipientResolver = recipientResolver;
    this.batchSize = batchSize;
    this.maxAttempts = maxAttempts;
    this.logger = logger;
    this.running = false;
  }

  /**
   * Process one batch of pending messages.
   * Guarded so that a nudge arriving during a run does not start a second pass
   * over the same rows.
   */
  async runOnce() {
    if (this.running) {
      return { skipped: true };
    }
    this.running = true;

    try {
      const { rows } = await this.db.query(
        `SELECT outbox_id, request_id, recipient_user_id, channel,
                message_body, idempotency_key, attempt_count
           FROM messaging_outbox
          WHERE status = 'Pending'
            AND attempt_count < $1
          ORDER BY created_at
          LIMIT $2`,
        [this.maxAttempts, this.batchSize],
      );

      let dispatched = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          const recipient = await this.recipientResolver(row.recipient_user_id);

          const receipt = await this.messagingPort.send({
            channel: row.channel,
            recipient,
            body: row.message_body,
            idempotencyKey: row.idempotency_key,
          });

          await this.db.query(
            `UPDATE messaging_outbox
                SET status = 'Dispatched',
                    attempt_count = attempt_count + 1,
                    dispatched_at = $1,
                    last_error = NULL
              WHERE outbox_id = $2`,
            [receipt.acceptedAt, row.outbox_id],
          );
          dispatched += 1;
        } catch (error) {
          const permanent = error.permanent === true;
          const attempts = row.attempt_count + 1;
          const exhausted = attempts >= this.maxAttempts;

          await this.db.query(
            `UPDATE messaging_outbox
                SET status = $1,
                    attempt_count = $2,
                    last_error = $3
              WHERE outbox_id = $4`,
            [
              permanent || exhausted ? 'Failed' : 'Pending',
              attempts,
              error.message,
              row.outbox_id,
            ],
          );

          failed += 1;
          this.logger.warn(
            `[messaging-dispatch] outbox ${row.outbox_id} attempt ${attempts} failed: ${error.message}`,
          );
        }
      }

      return { skipped: false, examined: rows.length, dispatched, failed };
    } finally {
      this.running = false;
    }
  }
}

module.exports = { MessagingDispatchWorker };
