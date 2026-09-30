-- CivicConnect migration 002: messaging outbox
--
-- Supports the messaging integration boundary (ADR-INT-001, ASR-08, CHG-001).
--
-- A row is inserted inside the same transaction as the lifecycle status change
-- that caused it, so a rolled-back transition leaves no row and no message is
-- sent. The dispatch worker reads pending rows outside that transaction, which
-- keeps provider latency and provider outages away from the request lifecycle.

CREATE TABLE messaging_outbox (
    outbox_id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    request_id        UUID         NOT NULL
                                   REFERENCES service_requests(request_id)
                                   ON DELETE RESTRICT,

    recipient_user_id UUID         NOT NULL
                                   REFERENCES users(user_id)
                                   ON DELETE RESTRICT,

    channel           VARCHAR(20)  NOT NULL
                                   CHECK (channel IN ('WhatsApp', 'SMS', 'Email')),

    message_body      TEXT         NOT NULL
                                   CHECK (char_length(message_body) > 0),

    -- Derived from request, target status and transition timestamp. The UNIQUE
    -- constraint is what makes at-least-once dispatch safe: a retry after an
    -- ambiguous provider response cannot create a second message.
    idempotency_key   VARCHAR(120) NOT NULL UNIQUE,

    status            VARCHAR(20)  NOT NULL DEFAULT 'Pending'
                                   CHECK (status IN ('Pending', 'Dispatched', 'Failed')),

    attempt_count     INT          NOT NULL DEFAULT 0
                                   CHECK (attempt_count >= 0),

    last_error        TEXT         NULL,

    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    dispatched_at     TIMESTAMPTZ  NULL
);

-- The dispatch worker only ever reads pending rows, so the index covers that
-- predicate alone rather than the whole table.
CREATE INDEX idx_messaging_outbox_pending
    ON messaging_outbox (created_at)
    WHERE status = 'Pending';

-- Supports operational review of delivery failures.
CREATE INDEX idx_messaging_outbox_failed
    ON messaging_outbox (created_at DESC)
    WHERE status = 'Failed';

COMMENT ON TABLE messaging_outbox IS
    'Transactional outbox for WhatsApp/SMS messaging. Written atomically with a lifecycle status change; dispatched asynchronously. See ADR-INT-001.';
