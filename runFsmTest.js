const http = require('http');
const db = require('./src/config/database');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'POST',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function patch(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(
      {
        hostname: 'localhost',
        port: 5000,
        path,
        method: 'PATCH',
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testLifecycle() {
  console.log('====================================================');
  console.log('1. Authenticating Admin User...');
  console.log('====================================================');
  const loginRes = await post('/api/v1/auth/login', {
    email: 'admin@civicconnect.gov.za',
    password: 'AdminPassword123!',
  });

  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes.data || loginRes.raw);
    process.exit(1);
  }

  const token = loginRes.data.token;
  const adminId = loginRes.data.user.id;
  console.log('Admin Authenticated. User ID:', adminId);

  console.log('\n====================================================');
  console.log('2. Creating New Clean Ticket (State: Submitted)...');
  console.log('====================================================');
  const createRes = await post(
    '/api/v1/requests',
    {
      requesterId: adminId,
      categoryId: 1,
      title: 'Water pipe leak on Monument Rd',
      description: 'Burst main water line flooding the street',
      locationAddress: '12 Monument Road',
      suburb: 'Kempton Park',
      contactPhone: '+27829998877',
      notifyChannel: 'SMS',
    },
    token
  );

  const ticket = createRes.data.data || createRes.data;
  const ticketId = ticket.request_id || ticket.requestId;
  console.log('Created Ticket ID:', ticketId);

  console.log('\n====================================================');
  console.log('3. Transition 1: Submitted -> Assigned');
  console.log('====================================================');
  const step1 = await patch(
    `/api/v1/requests/${ticketId}/status`,
    {
      nextStatus: 'Assigned',
      actorId: adminId,
      assignedStaffId: adminId,
      handoverNotes: 'Assigned to water works maintenance division',
    },
    token
  );
  console.log('Status Code (Expected 200):', step1.status);

  console.log('\n====================================================');
  console.log('4. Transition 2: Assigned -> In_Progress');
  console.log('====================================================');
  const step2 = await patch(
    `/api/v1/requests/${ticketId}/status`,
    {
      nextStatus: 'In_Progress',
      actorId: adminId,
      handoverNotes: 'Crew arrived on site and began excavation',
    },
    token
  );
  console.log('Status Code (Expected 200):', step2.status);

  console.log('\n====================================================');
  console.log('5. Transition 3: In_Progress -> Resolved');
  console.log('====================================================');
  const step3 = await patch(
    `/api/v1/requests/${ticketId}/status`,
    {
      nextStatus: 'Resolved',
      actorId: adminId,
      resolutionNotes: 'Pipe replaced and water pressure restored successfully',
    },
    token
  );
  console.log('Status Code (Expected 200):', step3.status);

  console.log('\n====================================================');
  console.log('6. Transition 4: Resolved -> Closed (Terminal State)');
  console.log('====================================================');
  const step4 = await patch(
    `/api/v1/requests/${ticketId}/status`,
    {
      nextStatus: 'Closed',
      actorId: adminId,
      handoverNotes: 'Supervisory audit and municipal sign-off complete',
    },
    token
  );
  console.log('Status Code (Expected 200):', step4.status);

  console.log('\n====================================================');
  console.log('7. Guard Test: Illegal Transition from Terminal State (Closed -> In_Progress)');
  console.log('====================================================');
  const step5 = await patch(
    `/api/v1/requests/${ticketId}/status`,
    {
      nextStatus: 'In_Progress',
      actorId: adminId,
      handoverNotes: 'Attempting illegal reopen from terminal state',
    },
    token
  );
  console.log('Status Code (Expected 422):', step5.status);
  console.log('Response Body:', JSON.stringify(step5.data || step5.raw));

  console.log('\n====================================================');
  console.log('8. Verifying Immutable Audit Trail in Database');
  console.log('====================================================');
  try {
    const auditRes = await db.query(
      'SELECT * FROM request_audit_log WHERE request_id = $1 ORDER BY created_at ASC',
      [ticketId]
    );
    console.table(auditRes.rows);
  } catch (dbErr) {
    console.error('Database query error on audit table:', dbErr.message);
  } finally {
    process.exit(0);
  }
}

testLifecycle().catch((err) => {
  console.error(err);
  process.exit(1);
});