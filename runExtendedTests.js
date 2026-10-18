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
      { hostname: 'localhost', port: 5000, path, method: 'POST', headers },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(raw) });
          } catch{
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
      { hostname: 'localhost', port: 5000, path, method: 'PATCH', headers },
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

async function runExtendedTests() {
  console.log('====================================================');
  console.log('Authenticating Admin...');
  console.log('====================================================');
  const loginRes = await post('/api/v1/auth/login', {
    email: 'admin@civicconnect.gov.za',
    password: 'AdminPassword123!',
  });
  const token = loginRes.data.token;
  const adminId = loginRes.data.user.id;

  // Helper to create fresh ticket
  async function createTicket(title) {
    const res = await post(
      '/api/v1/requests',
      {
        requesterId: adminId,
        categoryId: 1,
        title,
        description: 'Automated test request payload verification',
        locationAddress: 'Test Road',
        suburb: 'Kempton Park',
        contactPhone: '+27829998877',
        notifyChannel: 'SMS',
      },
      token
    );
    const ticket = res.data.data || res.data;
    return ticket.request_id || ticket.requestId;
  }

  console.log('\n====================================================');
  console.log('TEST 1 [Negative / State Graph]: Illegal State Skip (Submitted -> Resolved)');
  console.log('====================================================');
  const t1Id = await createTicket('Illegal skip test');
  const test1 = await patch(
    `/api/v1/requests/${t1Id}/status`,
    { nextStatus: 'Resolved', actorId: adminId, resolutionNotes: 'Attempting invalid jump' },
    token
  );
  console.log('Status Code (Expected 422):', test1.status);
  console.log('Response:', JSON.stringify(test1.data || test1.raw));

  console.log('\n====================================================');
  console.log('TEST 2 [Boundary Value / Guard]: Rejection Without Valid Reason');
  console.log('====================================================');
  const t2Id = await createTicket('Rejection guard test');
  
  const test2a = await patch(
    `/api/v1/requests/${t2Id}/status`,
    { nextStatus: 'Rejected', actorId: adminId },
    token
  );
  console.log('Attempt 2a - Missing reason (Expected 422):', test2a.status);
  console.log('Response:', JSON.stringify(test2a.data || test2a.raw));

  // Attempt 2b: Boundary check (reason too short, e.g. < 10 chars)
  const test2b = await patch(
    `/api/v1/requests/${t2Id}/status`,
    { nextStatus: 'Rejected', actorId: adminId, rejectionReason: 'Short' },
    token
  );
  console.log('Attempt 2b - Sub-boundary reason "Short" (Expected 422):', test2b.status);
  console.log('Response:', JSON.stringify(test2b.data || test2b.raw));

  console.log('\n====================================================');
  console.log('TEST 3 [Lifecycle / Valid Path]: Legal Rejection (Submitted -> Rejected)');
  console.log('====================================================');
  const test3 = await patch(
    `/api/v1/requests/${t2Id}/status`,
    {
      nextStatus: 'Rejected',
      actorId: adminId,
      rejectionReason: 'Duplicate ticket logged for Monument Road leak',
    },
    token
  );
  console.log('Status Code (Expected 200):', test3.status);
  console.log('Response:', JSON.stringify(test3.data || test3.raw));

  console.log('\n====================================================');
  console.log('TEST 4 [Terminal Lock]: Illegal Transition from Rejected (Terminal State)');
  console.log('====================================================');
  const test4 = await patch(
    `/api/v1/requests/${t2Id}/status`,
    { nextStatus: 'Assigned', actorId: adminId, assignedStaffId: adminId },
    token
  );
  console.log('Status Code (Expected 422):', test4.status);
  console.log('Response:', JSON.stringify(test4.data || test4.raw));

  console.log('\n====================================================');
  console.log('Database Audit Log Verification for Rejection Flow');
  console.log('====================================================');
  const auditRes = await db.query(
    'SELECT audit_id, request_id, action, previous_state, new_state, handover_notes, created_at FROM request_audit_log WHERE request_id = $1 ORDER BY created_at ASC',
    [t2Id]
  );
  console.table(auditRes.rows);

  process.exit(0);
}

runExtendedTests().catch((err) => {
  console.error(err);
  process.exit(1);
});