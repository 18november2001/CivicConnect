'use strict';

/**
 * Messaging dispatch runner.
 *
 * Architecture layer: Messaging Integration Boundary (ADR-ARCH-001).
 *
 * The composition root for outbound messaging. MessagingDispatchWorker was
 * written at Milestone 2 and was never invoked by anything, so rows entered
 * messaging_outbox and were never drained: the transactional half of the
 * outbox pattern existed and the dispatch half did not. This module supplies
 * the three collaborators the worker needs and gives the team a way to run it.
 *
 * It introduces no new messaging behaviour. The port contract, the simulated
 * adapter and the worker are unchanged; this wires them together and resolves
 * a recipient identifier into a contact address.
 *
 * Two run modes, because they answer different questions:
 *   runOnce   drains the queue a single time and reports what happened, which
 *             is what a deployment check and an operator both want.
 *   runForever polls on an interval, which is how it would run in a deployed
 *             environment.
 *
 * Engineering records: ADR-INT-001, DEF-011
 * Requirements: WhatsApp/SMS interaction (CHG-001)
 * ASRs: ASR-05, ASR-08
 */

const { MessagingDispatchWorker } = require('./messagingDispatchWorker');
const { SimulatedMessagingAdapter } = require('./simulatedMessagingAdapter');

const DEFAULT_POLL_INTERVAL_MS = 5000;

/**
 * Resolves a recipient user into the address the provider needs.
 *
 * The outbox stores a user identifier rather than a phone number on purpose: a
 * number captured at submission time would be stale by the time the message is
 * sent, and storing it twice creates two places to correct it. The resolver
 * therefore reads the current contact details at dispatch time.
 *
 * CivicConnect's users table carries no phone column, so for the simulated
 * provider the e-mail address is used as the address and the limitation is
 * recorded rather than hidden. A real provider integration would require a
 * verified phone number and the schema change to carry it.
 */
function createRecipientResolver(db) {
  return async function resolveRecipient(userId) {
    const { rows } = await db.query(
      'SELECT user_id, full_name, email FROM users WHERE user_id = $1',
      [userId],
    );

    if (rows.length === 0) {
      const error = new Error(`Recipient ${userId} no longer exists.`);
      error.permanent = true;
      throw error;
    }

    // The port takes a plain address string, so the resolver returns one
    // rather than a record. Anything richer would have to be flattened by the
    // worker, which would put knowledge of the provider's contract in the
    // wrong layer.
    return rows[0].email;
  };
}

function createDispatchWorker({ db, adapter, batchSize, maxAttempts, logger } = {}) {
  if (!db) {
    throw new Error('A database client is required.');
  }

  return new MessagingDispatchWorker({
    db,
    messagingPort: adapter || new SimulatedMessagingAdapter(),
    recipientResolver: createRecipientResolver(db),
    ...(batchSize ? { batchSize } : {}),
    ...(maxAttempts ? { maxAttempts } : {}),
    ...(logger ? { logger } : {}),
  });
}

/**
 * Drains the queue once and returns the outcome. Reported rather than logged
 * only, so a caller can assert on it and a deployment check can use it as
 * evidence that the messaging boundary is alive.
 */
async function runOnce(options) {
  const worker = createDispatchWorker(options);
  return worker.runOnce();
}

/**
 * Polls until stopped. Returns a stop function rather than running
 * unconditionally, so a test or a shutdown handler can end it deterministically.
 */
function runForever(options = {}) {
  const worker = createDispatchWorker(options);
  const intervalMs = options.intervalMs || DEFAULT_POLL_INTERVAL_MS;
  const logger = options.logger || console;
  let stopped = false;

  const timer = setInterval(async () => {
    if (stopped) return;
    try {
      const result = await worker.runOnce();
      if (!result.skipped && result.examined > 0) {
        logger.info(
          `[messaging-dispatch] examined ${result.examined}, dispatched ${result.dispatched}, failed ${result.failed}`,
        );
      }
    } catch (error) {
      logger.error(`[messaging-dispatch] run failed: ${error.message}`);
    }
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return function stop() {
    stopped = true;
    clearInterval(timer);
  };
}

module.exports = {
  createRecipientResolver,
  createDispatchWorker,
  runOnce,
  runForever,
  DEFAULT_POLL_INTERVAL_MS,
};
