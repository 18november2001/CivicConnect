'use strict';

/**
 * Simulated messaging adapter.
 *
 * Architecture layer: Messaging Integration Boundary (ADR-ARCH-001).
 *
 * Implements MessagingPort without contacting a third-party provider. It exists
 * so that WhatsApp/SMS interaction can be demonstrated and verified during
 * development, as permitted by assumption A-ARCH-02.
 *
 * The simulator deliberately behaves like a remote provider rather than like a
 * local function call. It applies an artificial latency, it can be configured
 * to fail transiently or permanently, and it enforces idempotency on
 * idempotencyKey. Building it this way is the mitigation for R-ARCH-03: if the
 * simulator were a synchronous call that always succeeds, the surrounding code
 * would encode assumptions that break the moment a real provider is introduced.
 *
 * Engineering records: ADR-INT-001
 * Requirements: WhatsApp/SMS interaction (CHG-001)
 * ASRs: ASR-08
 * Risk mitigated: R-ARCH-03
 *
 * Documented simulator assumptions:
 *   1. Acceptance by the provider is reported, delivery to the handset is not.
 *      A real provider reports delivery asynchronously through a callback that
 *      CivicConnect does not yet receive.
 *   2. No message size, rate or template restrictions are enforced. Real
 *      WhatsApp Business messaging applies all three.
 *   3. No cost is incurred, so nothing here reflects the operational cost of
 *      the eventual provider.
 */

const {
  MessagingPort,
  CHANNELS,
  PermanentDeliveryError,
  TransientDeliveryError,
} = require('./messagingPort');

class SimulatedMessagingAdapter extends MessagingPort {
  /**
   * @param {object} [options]
   * @param {number} [options.latencyMs]        Artificial provider latency.
   * @param {number} [options.transientFailureRate] 0 to 1, for resilience testing.
   * @param {object} [options.logger]
   */
  constructor({ latencyMs = 0, transientFailureRate = 0, logger = console } = {}) {
    super();
    this.latencyMs = latencyMs;
    this.transientFailureRate = transientFailureRate;
    this.logger = logger;
    /** Messages accepted, keyed by idempotency key. Inspectable in tests. */
    this.accepted = new Map();
    this.sequence = 0;
  }

  get name() {
    return 'SimulatedMessagingAdapter';
  }

  async send({ channel, recipient, body, idempotencyKey }) {
    if (!Object.values(CHANNELS).includes(channel)) {
      throw new PermanentDeliveryError(`Unsupported channel '${channel}'.`);
    }
    if (!recipient || String(recipient).trim().length === 0) {
      throw new PermanentDeliveryError('A recipient address is required.');
    }
    if (!body || String(body).trim().length === 0) {
      throw new PermanentDeliveryError('A message body is required.');
    }
    if (!idempotencyKey) {
      throw new PermanentDeliveryError('An idempotency key is required.');
    }

    // Idempotency: the same key returns the original acceptance rather than
    // producing a second message.
    if (this.accepted.has(idempotencyKey)) {
      return this.accepted.get(idempotencyKey);
    }

    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }

    if (this.transientFailureRate > 0 && Math.random() < this.transientFailureRate) {
      throw new TransientDeliveryError(
        'Simulated provider is temporarily unavailable.',
      );
    }

    this.sequence += 1;
    const receipt = Object.freeze({
      providerMessageId: `SIM-${String(this.sequence).padStart(8, '0')}`,
      acceptedAt: new Date(),
    });

    this.accepted.set(idempotencyKey, receipt);
    this.logger.info(
      `[simulated-messaging] ${channel} to ${recipient}: ${body} (${receipt.providerMessageId})`,
    );

    return receipt;
  }

  /** Test helper: every message the simulator has accepted, in order. */
  sentMessages() {
    return Array.from(this.accepted.entries()).map(([key, receipt]) => ({
      idempotencyKey: key,
      ...receipt,
    }));
  }
}

module.exports = { SimulatedMessagingAdapter };
