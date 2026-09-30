CREATE EXTENSION IF NOT EXIST "uuid-ossp";

DROP TABLE IF EXISTS outbound_messages CASCADE;
DROP TABLE IF EXISTS request_audit_log CASCADE;
DROP TABLE IF EXISTS request_timeline_updates CASCADE;
DROP TABLE IF EXISTS service_request CASCADE;
DROP TABLE IF EXISTS request_categories CASCADE;
DROP TABLE IF EXISTS users CASCADE;

--Users Table (Identity & RBAC Core - NFR-001)
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('Citizen', 'Staff', 'Supervisor', 'Admin')),
    department VARCHAR(50) CHECK (department IN ('Roads', 'Water', 'Electricity', 'Refuse', 'Sanitation', NULL)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--Controlled Categories Table (FR-001)
CREATE TABLE request_categories (
    category_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_name VARCHAR(50) UNIQUE NOT NULL,
    default_sla_hours INT NOT NULL CHECK (default_sla_hours > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

--Primary Service Requests Table (Aggregate Root - FR-001, FR-006)
CREATE TABLE service_requests (
    request_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_code VARCHAR(25) UNIQUE NOT NULL,
    requester_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    category_id INT NOT NULL REFERENCES request_categories(category_id) ON DELETE RESTRICT,
    title VARCHAR(100) NOT NULL CHECK (char_length(title) >= 5),
    description TEXT NOT NULL CHECK (char_length(description) >= 20 AND char_length(description) <= 2000),
    location_address VARCHAR(255) NOT NULL CHECK (char_length(location_address) >= 10),
    suburb VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Submitted' 
    CHECK (status IN ('Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed', 'Rejected')),
    assigned_staff_id UUID NULL REFERENCES users(user_id) ON DELETE SET NULL,
    resolution_notes TEXT NULL CHECK (resolution_notes IS NULL OR char_length(resolution_notes) >= 20),
    rejection_reason TEXT NULL CHECK (rejection_reason IS NULL OR char_length(rejection_reason) >= 15),
    sla_due_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--Citizen Public Feedback Timeline (FR-003)
CREATE TABLE request_timeline_updates (
    update_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
    status_snapshot VARCHAR(30) NOT NULL,
    public_message TEXT NOT NULL,
    posted_by_department VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--Immutable Operational Audit Table (NFR-002)
CREATE TABLE request_audit_log (
    audit_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES service_requests(request_id) ON DELETE RESTRICT,
    actor_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    action VARCHAR(50) NOT NULL,
    previous_state VARCHAR(30) NULL,
    new_state VARCHAR(30) NOT NULL,
    handover_notes TEXT NULL,
    originating_ip VARCHAR(45) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--Messaging Boundary & Outbound Queue (CHG-001 / ASR-08 / FR-009)
CREATE TABLE outbound_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
    recipient_phone VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('WhatsApp', 'SMS')),
    message_body VARCHAR(1000) NOT NULL,
    dispatch_status VARCHAR(30) NOT NULL DEFAULT 'SIMULATED_SENT' 
        CHECK (dispatch_status IN ('PENDING', 'SIMULATED_SENT', 'SENT', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed Reference Categories
INSERT INTO request_categories (category_name, default_sla_hours) VALUES
('Roads', 72),
('Water', 24),
('Electricity', 12),
('Refuse', 48),
('Sanitation', 24);