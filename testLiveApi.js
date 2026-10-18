'use strict';

async function testApi() {
  const BASE_URL = 'http://localhost:5000/api/v1';

  try {
    console.log('1. Logging in as citizen...');
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'citizen@civicconnect.gov.za',
        password: 'password'
      })
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);

    const token = loginData.token || loginData.data?.token;
    console.log('✓ Login successful! Token received.');

    console.log('\n2. Creating a live service request...');
    const createRes = await fetch(`${BASE_URL}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        categoryId: 2, // Water
        title: 'Terminal Integration Test Leak',
        description: 'Verified live submission sent directly from terminal script.',
        locationAddress: '45 Monument Road',
        suburb: 'Kempton Park'
      })
    });

    const createData = await createRes.json();
    if (!createRes.ok) throw new Error(`Request submission failed: ${JSON.stringify(createData)}`);

    console.log('✓ Request created in PostgreSQL!');
    console.log(createData);

  } catch (err) {
    console.error('❌ Test failed:', err.message);
  }
}

testApi();