'use strict';

const db = require('./src/config/database');

const query = typeof db.query === 'function' 
  ? db.query.bind(db) 
  : (typeof db === 'function' ? db : null);

if (!query) {
  console.error('❌ Could not locate query function on src/config/database module.');
  process.exit(1);
}

const CREATE_TABLES_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('Citizen', 'Staff', 'Supervisor', 'Admin')),
    department VARCHAR(50) CHECK (department IN ('Roads', 'Water', 'Electricity', 'Refuse', 'Sanitation', NULL)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories Table
CREATE TABLE IF NOT EXISTS request_categories (
    category_id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_name VARCHAR(50) UNIQUE NOT NULL,
    default_sla_hours INT NOT NULL CHECK (default_sla_hours > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Primary Service Requests
CREATE TABLE IF NOT EXISTS service_requests (
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

-- Feedback Timeline
CREATE TABLE IF NOT EXISTS request_timeline_updates (
    update_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
    status_snapshot VARCHAR(30) NOT NULL,
    public_message TEXT NOT NULL,
    posted_by_department VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Operational Audit Log
CREATE TABLE IF NOT EXISTS request_audit_log (
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

-- Outbound Queue
CREATE TABLE IF NOT EXISTS outbound_messages (
    message_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES service_requests(request_id) ON DELETE CASCADE,
    recipient_phone VARCHAR(20) NOT NULL,
    channel VARCHAR(20) NOT NULL CHECK (channel IN ('WhatsApp', 'SMS')),
    message_body VARCHAR(1000) NOT NULL,
    dispatch_status VARCHAR(30) NOT NULL DEFAULT 'SIMULATED_SENT' 
        CHECK (dispatch_status IN ('PENDING', 'SIMULATED_SENT', 'SENT', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function main() {
  try {
    console.log('1. Ensuring tables exist...');
    await query(CREATE_TABLES_SQL);
    console.log('   ✓ Schema verified.');

    console.log('2. Resetting table data...');
    // Truncate tables cleanly without dropping
    await query(`
      TRUNCATE TABLE 
        outbound_messages, 
        request_audit_log, 
        request_timeline_updates, 
        service_requests, 
        users 
      CASCADE;
    `);
    console.log('   ✓ Old records cleared.');

    console.log('3. Seeding categories...');
    await query(`
      INSERT INTO request_categories (category_name, default_sla_hours)
      VALUES
        ('Roads', 72),
        ('Water', 24),
        ('Electricity', 12),
        ('Refuse', 48),
        ('Sanitation', 24)
      ON CONFLICT (category_name) DO NOTHING;
    `);

    console.log('4. Seeding default accounts...');
    // Pre-hashed bcrypt standard ($2b$10$...)
    const hashedAdmin = '$2b$10$7Zz/7Q2ZJvV0hVd4ZqO7b.X5e11vP5zL51ZtH9O0M3W1mX4yV7fWq';
    const hashedCitizen = '$2b$10$7Zz/7Q2ZJvV0hVd4ZqO7b.X5e11vP5zL51ZtH9O0M3W1mX4yV7fWq';

    const userRes = await query(`
      INSERT INTO users (full_name, email, password_hash, role, department)
      VALUES 
        ('System Administrator', 'admin@civicconnect.gov.za', $1, 'Admin', 'Water'),
        ('John Doe', 'citizen@civicconnect.gov.za', $2, 'Citizen', NULL)
      RETURNING user_id, full_name, email, role, department;
    `, [hashedAdmin, hashedCitizen]);

    console.log('   ✓ Seeded users:');
    console.table(userRes.rows);

    console.log('\n--- VERIFYING CATEGORIES ---');
    const catRes = await query('SELECT category_id, category_name, default_sla_hours FROM request_categories;');
    console.table(catRes.rows);

    console.log('\n✓ Database initialization and seeding complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
    process.exit(1);
  }
}

main();