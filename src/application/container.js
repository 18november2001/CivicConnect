'use strict';

/**
 * Composition root: the one place the lifecycle engine is wired to its
 * subscribers (ADR-DES-002). Controllers import `lifecycle` from here and never
 * touch the dispatcher, so every status change takes the same path.
 *
 *   transactional : audit ledger, public timeline, messaging outbox row
 *   post-commit   : nudge the messaging dispatch worker
 */

const db = require('../config/database');
const { DomainEventDispatcher } = require('../domain/events/domainEvents');
const { LifecycleService } = require('./services/lifecycleService');
const { auditLogHandler } = require('../infrastructure/persistence/handlers/auditLogHandler');
const { timelineHandler } = require('../infrastructure/persistence/handlers/timelineHandler');
const {
  makeMessagingOutboxHandler,
  makeMessagingNudge,
} = require('../integration/messaging/messagingOutboxHandler');
const { MessagingDispatchWorker } = require('../integration/messaging/messagingDispatchWorker');
const { SimulatedMessagingAdapter } = require('../integration/messaging/simulatedMessagingAdapter');

const EVENT = 'RequestStatusChanged';

// Users have no phone number column yet, so the simulated provider is addressed by email.
async function resolveRecipient(userId) {
  const { rows } = await db.query('SELECT email FROM users WHERE user_id = $1', [userId]);
  if (!rows[0]) {
    throw new Error(`Recipient ${userId} no longer exists.`);
  }
  return rows[0].email;
}

const messagingWorker = new MessagingDispatchWorker({
  db,
  messagingPort: new SimulatedMessagingAdapter(),
  recipientResolver: resolveRecipient,
});

const dispatcher = new DomainEventDispatcher()
  .onTransactional(EVENT, auditLogHandler)
  .onTransactional(EVENT, timelineHandler)
  .onTransactional(EVENT, makeMessagingOutboxHandler())
  .onPostCommit(EVENT, makeMessagingNudge(messagingWorker));

const lifecycle = new LifecycleService({ db, dispatcher });

/** Poll for outbox rows the nudge missed (for example after a restart). Called from server.js. */
function startMessagingPolling(intervalMs = 15000) {
  const timer = setInterval(() => {
    messagingWorker.runOnce().catch((err) => console.error('[messaging] poll failed:', err.message));
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { lifecycle, dispatcher, messagingWorker, startMessagingPolling };
