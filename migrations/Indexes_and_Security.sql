-- PERFORMANCE INDEXING STRATEGY (NFR-003 & CHG-004)

-- Requester Portal History (FR-002: Citizen lookup ordered chronologically)
CREATE INDEX IF NOT EXISTS idx_service_requests_requester_history 
ON service_requests (requester_id, created_at DESC);

-- Multi-Criteria Staff Queue Filtering (FR-004: Status, Category, Ingestion Date)
CREATE INDEX IF NOT EXISTS idx_service_requests_queue_filter 
ON service_requests (status, category_id, created_at DESC);

--Regional Management & Suburb Allocation (FR-004: District routing)
CREATE INDEX IF NOT EXISTS idx_service_requests_status_suburb 
ON service_requests (status, suburb, created_at DESC);

--Management SLA Engine (FR-007: Partial index for unresolved tickets)
CREATE INDEX IF NOT EXISTS idx_service_requests_sla_monitoring 
ON service_requests (sla_due_at) 
WHERE status IN ('Submitted', 'Assigned', 'In_Progress');

--Staff Workbench Assigned Queue (FR-005: Operational assignment filtering)
CREATE INDEX IF NOT EXISTS idx_service_requests_assigned_staff 
ON service_requests (assigned_staff_id, status, created_at DESC)
WHERE assigned_staff_id IS NOT NULL;

--Outbound Messaging Queue Lookup (CHG-001 / ASR-08)
CREATE INDEX IF NOT EXISTS idx_outbound_messages_request_id 
ON outbound_messages (request_id);


-- ==========================================
-- SECURITY & IMMUTABILITY POLICIES (NFR-002)
-- ==========================================

-- Strip mutation permissions from public/unprivileged access on audit and timeline tables
REVOKE UPDATE, DELETE, TRUNCATE ON request_audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON request_timeline_updates FROM PUBLIC;

-- Create dedicated app role if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'civic_app_user') THEN
    CREATE ROLE civic_app_user WITH LOGIN PASSWORD 'civic_secure_pass_2026';
  END IF;
END
$$;

-- Grant permissions adhering to the principle of least privilege
GRANT SELECT, INSERT, UPDATE ON users, service_requests, outbound_messages TO civic_app_user;
GRANT SELECT ON request_categories TO civic_app_user;

-- Enforce strict append-only privilege on audit and timeline ledgers
GRANT SELECT, INSERT ON request_audit_log, request_timeline_updates TO civic_app_user;

-- Grant sequence consumption permissions for auto-increment identity columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO civic_app_user;