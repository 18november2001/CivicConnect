'use strict';

/**
 * Messaging integration contract (port).
 *
 * Architecture layer: Messaging Integration Boundary (ADR-ARCH-001).
 *
 * A port is an interface owned by the application that states what CivicConnect
 * needs from a messaging provider. An adapter is a class that implements the
 * port for one particular provider. Because the application depends on the port
 * and never on an adapter, the simulator used during development can be
 * replaced by a real WhatsApp or SMS provider without any change to lifecycle
 * or handler code.
 *
 * Engineering records: ADR-INT-001
 * Requirements: WhatsApp/SMS interaction (CHG-001), FR-003
 * ASRs: ASR-08 (Messaging Integration)
 * Assumption: A-ARCH-02 (messaging may be simulated during current development)
 * Risk mitigated: R-ARCH-03 (simulation differs from later real integration)
 */

/** Channels CivicConnect may send on. */
const CHANNELS = Object.freeze({
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  EMAIL: 'Email',
});

/**
 * Raised when a provider declines a message permanently, for example an invalid
 * recipient. Distinguished from a transient failure because a permanent failure
 * must not be retried indefinitely.
 */
class PermanentDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentDeliveryError';
    this.code = 'PERMANENT_DELIVERY_FAILURE';
    this.permanent = true;
  }
}

/**
 * Raised when a provider is temporarily unavailable. The dispatch worker
 * retries these.
 */
class TransientDeliveryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TransientDeliveryError';
    this.code = 'TRANSIENT_DELIVERY_FAILURE';
    this.permanent = false;
  }
}

/**
 * The contract every messaging adapter must satisfy.
 *
 * Implementations must be idempotent with respect to idempotencyKey: sending
 * the same key twice must not deliver two messages, because the outbox
 * guarantees at-least-once delivery rather than exactly-once.
 */
class MessagingPort {
  /**
   * @param {object} message
   * @param {string} message.channel         One of CHANNELS.
   * @param {string} message.recipient       Address or number for the channel.
   * @param {string} message.body            Message text.
   * @param {string} message.idempotencyKey  Stable key for de-duplication.
   * @returns {Promise<{providerMessageId: string, acceptedAt: Date}>}
   */
  // eslint-disable-next-line no-unused-vars
  async send(message) {
    throw new Error('MessagingPort.send must be implemented by an adapter.');
  }

  /** Human-readable adapter name, recorded against dispatch attempts. */
  get name() {
    throw new Error('MessagingPort.name must be implemented by an adapter.');
  }
}

module.exports = {
  MessagingPort,
  CHANNELS,
  PermanentDeliveryError,
  TransientDeliveryError,
};
