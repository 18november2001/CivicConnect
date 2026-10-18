const http = require('http');


const PORT = process.env.PORT || 5000;
const HOST = '127.0.0.1';

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });
    req.on('error', (err) => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runRollbackTest() {
  console.log('--- TEST: TRANSACTION ROLLBACK & ATOMICITY ---');


  console.log(`Connecting to http://${HOST}:${PORT}/api/v1/auth/login...`);
  let authRes;
  try {
    authRes = await request({
      host: HOST,
      port: PORT,
      path: '/api/v1/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { email: 'admin@civicconnect.gov.za', password: 'Password123!' });
  } catch (err) {
    console.error(`\N Could not connect to server on port ${PORT}:`, err.message);
    console.log('Make sure you ran `npm start` in another terminal window first!\n');
    return;
  }

  console.log(`Auth Response Status: ${authRes.status}`);
  if (authRes.status !== 200) {
    console.error('Login rejected by server. Response payload:', authRes.data || authRes.raw);
    console.log('Check your database seed or runFsmTest.js to confirm the admin email and password.');
    return;
  }

  const token = authRes.data?.token || authRes.data?.data?.token;
  console.log('✓ Token acquired successfully.');

  
  const createRes = await request({
    host: HOST,
    port: PORT,
    path: '/api/v1/requests',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  }, {
    title: 'Water pipe leak for rollback check',
    description: 'Verifying atomic rollback on illegal state transitions',
    category_id: 1,
    address: 'Monument Road leak site',
  });

  const reqId = createRes.data?.id || 
                createRes.data?.data?.id || 
                createRes.data?.request?.id || 
                createRes.data?.request_id;

  console.log(`Initial Ticket Created: ${reqId}`);

  if (!reqId) {
    console.error('Could not parse request ID. Create response:', createRes.data || createRes.raw);
    return;
  }

 
  const failRes = await request({
    host: HOST,
    port: PORT,
    path: `/api/v1/requests/${reqId}/status`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  }, { status: 'Closed' });

  console.log(`Illegal Transition Status: ${failRes.status} (Expected: 422)`);

  
  const checkRes = await request({
    host: HOST,
    port: PORT,
    path: `/api/v1/requests/${reqId}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const currentStatus = checkRes.data?.status || 
                        checkRes.data?.data?.status || 
                        checkRes.data?.request?.status;

  console.log(`Current DB Status: ${currentStatus}`);

  if (currentStatus === 'Submitted' && failRes.status === 422) {
    console.log('✓ PASS: State remained "Submitted". Zero illegal mutation or state leakage.\n');
  } else {
    console.log(`Result: Transition returned ${failRes.status}, current status is ${currentStatus}.\n`);
  }
}

runRollbackTest().catch(console.error);