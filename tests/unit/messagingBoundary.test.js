'use strict';

/**
 * Unit verification of the messaging integration boundary.
 *
 * Requirements: WhatsApp/SMS interaction (CHG-001), FR-003
 * ASRs: ASR-05, ASR-08
 * Engineering records: ADR-INT-001
 * Risk verified: R-ARCH-03 (simulation differs from later real integration)
 *
 * The outbox handler is exercised against a fake transaction object rather than
 * a live database, which verifies the SQL parameters and the conditional
 * behaviour without infrastructure.
 *
 * Run with:  node --test tests/unit/messagingBoundary.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SimulatedMessagingAdapter,
} = require('../../src/integration/messaging/simulatedMessagingAdapter');
const {
  CHANNELS,
  PermanentDeliveryError,
} = require('../../src/integration/messaging/messagingPort');
const {
  makeMessagingOutboxHandler,
  buildIdempotencyKey,
} = require('../../src/integration/messaging/messagingOutboxHandler');

const SILENT = { info() {}, warn() {}, error() {} };

/** Minimal stand-in for a transaction, recording the statements issued. */
function fakeTx() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
}

function statusEvent(overrides = {}) {
  return {
    name: 'RequestStatusChanged',
    requestId: '11111111-1111-1111-1111-111111111111',
    trackingCode: 'REQ-20260930-0007',
    requesterId: '22222222-2222-2222-2222-222222222222',
    previousStatus: 'Assigned',
    newStatus: 'In_Progress',
    actorId: '33333333-3333-3333-3333-333333333333',
    actorRole: 'Staff',
    actorDepartment: 'Roads',
    notes: null,
    originatingIp: '196.25.1.10',
    occurredAt: new Date('2026-09-30T08:00:00.000Z'),
    ...overrides,
  };
}

test('the outbox handler writes one pending row for a publishable transition', async () => {
  const handler = makeMessagingOutboxHandler({ channel: CHANNELS.WHATSAPP });
  const tx = fakeTx();

  await handler(statusEvent(), tx);

  assert.equal(tx.calls.length, 1);
  assert.match(tx.calls[0].sql, /INSERT INTO messaging_outbox/);
  assert.match(tx.calls[0].sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/);

  const [requestId, recipientId, channel, body] = tx.calls[0].params;
  assert.equal(requestId, '11111111-1111-1111-1111-111111111111');
  assert.equal(recipientId, '22222222-2222-2222-2222-222222222222');
  assert.equal(channel, CHANNELS.WHATSAPP);
  assert.match(body, /REQ-20260930-0007/);
});

test('the outbox handler writes nothing for a non-publishable transition', async () => {
  const handler = makeMessagingOutboxHandler();
  const tx = fakeTx();

  await handler(statusEvent({ newStatus: 'Submitted' }), tx);

  assert.equal(tx.calls.length, 0);
});

test('the idempotency key is stable for the same transition', () => {
  const event = statusEvent();
  assert.equal(buildIdempotencyKey(event), buildIdempotencyKey(statusEvent()));
  assert.notEqual(
    buildIdempotencyKey(event),
    buildIdempotencyKey(statusEvent({ newStatus: 'Resolved' })),
  );
});

test('the simulator accepts a valid message and returns a provider reference', async () => {
  const adapter = new SimulatedMessagingAdapter({ logger: SILENT });

  const receipt = await adapter.send({
    channel: CHANNELS.WHATSAPP,
    recipient: '+27821234567',
    body: 'CivicConnect: work has started on request REQ-20260930-0007.',
    idempotencyKey: 'key-1',
  });

  assert.match(receipt.providerMessageId, /^SIM-\d{8}$/);
  assert.ok(receipt.acceptedAt instanceof Date);
  assert.equal(adapter.sentMessages().length, 1);
});

test('the simulator is idempotent: the same key does not send twice', async () => {
  const adapter = new SimulatedMessagingAdapter({ logger: SILENT });

  const first = await adapter.send({
    channel: CHANNELS.SMS,
    recipient: '+27821234567',
    body: 'First attempt.',
    idempotencyKey: 'key-repeat',
  });
  const second = await adapter.send({
    channel: CHANNELS.SMS,
    recipient: '+27821234567',
    body: 'Retry after an ambiguous response.',
    idempotencyKey: 'key-repeat',
  });

  assert.equal(first.providerMessageId, second.providerMessageId);
  assert.equal(adapter.sentMessages().length, 1);
});

test('the simulator rejects invalid input permanently rather than transiently', async () => {
  const adapter = new SimulatedMessagingAdapter({ logger: SILENT });

  await assert.rejects(
    () =>
      adapter.send({
        channel: 'Telegram',
        recipient: '+27821234567',
        body: 'Test',
        idempotencyKey: 'key-2',
      }),
    (error) => {
      assert.ok(error instanceof PermanentDeliveryError);
      assert.equal(error.permanent, true);
      return true;
    },
  );

  await assert.rejects(
    () =>
      adapter.send({
        channel: CHANNELS.SMS,
        recipient: '',
        body: 'Test',
        idempotencyKey: 'key-3',
      }),
    (error) => error.permanent === true,
  );
});

test('the simulator can be configured to fail transiently for resilience testing', async () => {
  const adapter = new SimulatedMessagingAdapter({
    transientFailureRate: 1,
    logger: SILENT,
  });

  await assert.rejects(
    () =>
      adapter.send({
        channel: CHANNELS.WHATSAPP,
        recipient: '+27821234567',
        body: 'Test',
        idempotencyKey: 'key-4',
      }),
    (error) => {
      assert.equal(error.permanent, false);
      return true;
    },
  );
});
