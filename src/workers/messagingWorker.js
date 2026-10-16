'use strict';

const db = require('../config/database');
const { SimulatedMessagingAdapter } = require('../integration/messaging/simulatedMessagingAdapter');

const adapter = new SimulatedMessagingAdapter();

async function processOutboundMessages() {
  const client = await db.getClient();
  try {
    const pending = await client.query(
      `SELECT id, channel, recipient, body, idempotency_key, attempts
       FROM outbound_messages
       WHERE status = 'Pending' AND attempts < 5
       ORDER BY created_at ASC
       LIMIT 10
       FOR UPDATE SKIP LOCKED`
    );

    for (const msg of pending.rows) {
      try {
        await adapter.send({
          channel: msg.channel,
          recipient: msg.recipient,
          body: msg.body,
          idempotencyKey: msg.idempotency_key,
        });

        await client.query(
          `UPDATE outbound_messages 
           SET status = 'Sent', processed_at = NOW(), attempts = attempts + 1
           WHERE id = $1`,
          [msg.id]
        );
      } catch (err) {
        const nextStatus = err.isTransient === false ? 'FailedPermanently' : 'Pending';
        await client.query(
          `UPDATE outbound_messages 
           SET status = $1, attempts = attempts + 1, last_error = $2
           WHERE id = $3`,
          [nextStatus, err.message, msg.id]
        );
      }
    }
  } catch (err) {
    console.error('[MessagingWorker] Error processing queue:', err.message);
  } finally {
    client.release();
  }
}

function startMessagingWorker(intervalMs = 10000) {
  setInterval(processOutboundMessages, intervalMs);
}

module.exports = {
  processOutboundMessages,
  startMessagingWorker,
};