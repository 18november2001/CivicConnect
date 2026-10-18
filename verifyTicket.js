'use strict';

const db = require('./src/config/database');

async function verify() {
  try {
    // 1. Fetch the latest service request
    const reqRes = await db.query(
      `SELECT request_id, tracking_code, title, status, sla_due_at, created_at 
       FROM service_requests 
       ORDER BY created_at DESC 
       LIMIT 1;`
    );

    console.log('\n--- 1. LATEST SERVICE REQUEST ---');
    console.table(reqRes.rows);

    if (reqRes.rows.length === 0) {
      console.log('No service requests found in the database.');
      process.exit(0);
    }

    const requestId = reqRes.rows[0].request_id;

    // 2. Fetch corresponding audit log entries
    const auditRes = await db.query(
      `SELECT audit_id, action, previous_state, new_state, originating_ip, created_at 
       FROM request_audit_log 
       WHERE request_id = $1 
       ORDER BY created_at ASC;`,
      [requestId]
    );

    console.log('\n--- 2. IMMUTABLE AUDIT LOG ---');
    console.table(auditRes.rows);

    // 3. Fetch simulated outbound messaging queue entries
    const msgRes = await db.query(
      `SELECT message_id, recipient_phone, channel, dispatch_status, message_body 
       FROM outbound_messages 
       WHERE request_id = $1;`,
      [requestId]
    );

    console.log('\n--- 3. OUTBOUND MESSAGING QUEUE ---');
    console.table(msgRes.rows);

    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
}

verify();