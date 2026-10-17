-- CivicConnect schema 002: query indexes and audit immutability
--
-- Implements the indexing strategy and the database-level immutability policy
-- described in the PED Data and Persistence Baseline. Prior to M3 this file
-- existed in the repository but was empty, so neither NFR-002 immutability nor
-- the NFR-003 access paths had any implementation behind the written claim.
--
-- Requirements: NFR-002 (data integrity, immutability, traceability),
--               NFR-003 (query performance)
-- Verified by:  tests/integration/persistenceIntegration.test.js

-- ---------------------------------------------------------------------------
-- Indexes: one per dominant access path, matching both the filter predicate
-- and the sort order so the planner can use an index range scan rather than a
-- sequential scan followed by an external sort.
-- ---------------------------------------------------------------------------

-- FR-002: a requester views their own history, newest first.
CREATE INDEX IF NOT EXISTS idx_service_requests_requester_history
    ON service_requests (requester_id, created_at DESC);

-- FR-004: staff filter the queue by status and category, newest first.
CREATE INDEX IF NOT EXISTS idx_service_requests_queue_filter
    ON service_requests (status, category_id, created_at DESC);

-- Regional allocation of work by suburb.
CREATE INDEX IF NOT EXISTS idx_service_requests_suburb_status
    ON service_requests (suburb, status);

-- FR-007: management overdue reporting. Partial, because a closed or rejected
-- request can never be overdue, so those rows do not belong in the index.
CREATE INDEX IF NOT EXISTS idx_service_requests_sla_monitoring
    ON service_requests (sla_due_at)
    WHERE status NOT IN ('Resolved', 'Closed', 'Rejected');

-- Audit and timeline are read per request, in event order.
CREATE INDEX IF NOT EXISTS idx_request_audit_log_request
    ON request_audit_log (request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_request_timeline_request
    ON request_timeline_updates (request_id, created_at);

-- ---------------------------------------------------------------------------
-- Audit immutability.
--
-- A REVOKE only has effect against a role that is not the table owner and is
-- not a superuser, so the application connects as civicconnect_app rather than
-- as the owning role. Without this separation the written immutability claim
-- would be unenforceable, because the owner can always modify its own tables.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'civicconnect_app') THEN
        CREATE ROLE civicconnect_app LOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO civicconnect_app;

GRANT SELECT, INSERT, UPDATE, DELETE
    ON users, request_categories, service_requests
    TO civicconnect_app;

-- Append-only records: the application may insert and read, never alter.
GRANT SELECT, INSERT ON request_audit_log, request_timeline_updates
    TO civicconnect_app;
REVOKE UPDATE, DELETE, TRUNCATE ON request_audit_log FROM civicconnect_app;
REVOKE UPDATE, DELETE, TRUNCATE ON request_timeline_updates FROM civicconnect_app;

-- Sequence access for the identity columns the application inserts into.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO civicconnect_app;
