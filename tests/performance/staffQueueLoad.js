'use strict';

/**
 * Performance exercise: the staff queue filter.
 *
 * Why this operation. It is the only read in the system that a staff member
 * performs repeatedly during a shift, it filters and sorts over the table that
 * grows without bound, and it is the operation the composite indexes in
 * 002_indexes_and_security.sql were written to support. Until Milestone 3 those
 * indexes did not exist in the repository at all (DEF-003), so this exercise
 * also answers whether adding them achieved anything.
 *
 * What is measured. Wall-clock latency of GET /api/v1/requests with a status
 * and suburb filter, measured at the HTTP boundary so routing, serialisation
 * and the database round trip are all included.
 *
 * Usage:
 *   TEST_DATABASE_URL=... node tests/performance/staffQueueLoad.js
 *   TEST_DATABASE_URL=... node tests/performance/staffQueueLoad.js --rows 5000 --iterations 200
 */

const { Pool } = require('pg');
const http = require('node:http');

const CONNECTION_STRING = process.env.TEST_DATABASE_URL;
if (!CONNECTION_STRING) {
  console.error('TEST_DATABASE_URL is not set. Nothing to measure against.');
  process.exit(1);
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
}

const ROWS = arg('rows', 2000);
const ITERATIONS = arg('iterations', 100);
const WARMUP = arg('warmup', 10);
const TARGET_P95_MS = arg('target', 300);
const SUBURB = 'PerfTestville';
const SEED_EMAIL = 'perf.citizen@civicconnect.test';

function percentile(sorted, p) {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function seed(pool) {
  await pool.query(
    `DELETE FROM request_audit_log WHERE request_id IN (
       SELECT request_id FROM service_requests WHERE suburb = $1)`, [SUBURB]
  );
  await pool.query(`DELETE FROM service_requests WHERE suburb = $1`, [SUBURB]);
  await pool.query(`DELETE FROM users WHERE email = $1`, [SEED_EMAIL]);

  const citizen = await pool.query(
    `INSERT INTO users (full_name, email, password_hash, role)
     VALUES ('Perf Citizen', $1, 'not-a-real-hash', 'Citizen') RETURNING user_id`,
    [SEED_EMAIL]
  );
  const citizenId = citizen.rows[0].user_id;

  // A realistic queue is mostly not in the state being filtered for, so the
  // filter has to discriminate rather than return everything.
  const statuses = ['Submitted', 'Assigned', 'In_Progress', 'Resolved', 'Closed'];
  const values = [];
  const params = [];
  for (let i = 0; i < ROWS; i += 1) {
    const base = i * 6;
    params.push(
      `PERF-${String(i).padStart(8, '0')}`,
      citizenId,
      (i % 5) + 1,
      `Performance seed row ${i}`,
      'Seeded row for the staff queue load exercise.',
      statuses[i % statuses.length]
    );
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, '1 Perf Road', '${SUBURB}', $${base + 6}, NOW() + INTERVAL '48 hours')`
    );
  }

  const CHUNK = 500;
  for (let start = 0; start < ROWS; start += CHUNK) {
    const slice = values.slice(start, start + CHUNK);
    const sliceParams = params.slice(start * 6, (start + CHUNK) * 6);
    const renumbered = slice.map((row) =>
      row.replace(/\$(\d+)/g, (_, n) => `$${Number(n) - start * 6}`)
    );
    await pool.query(
      `INSERT INTO service_requests
         (tracking_code, requester_id, category_id, title, description, location_address, suburb, status, sla_due_at)
       VALUES ${renumbered.join(',')}`,
      sliceParams
    );
  }

  await pool.query('ANALYZE service_requests');
  return citizenId;
}

function timeOneRequest(port, path) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      res.on('end', () => {
        const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
        resolve({ ms: elapsedMs, status: res.statusCode });
      });
    });
    req.on('error', reject);
  });
}

async function main() {
  const pool = new Pool({ connectionString: CONNECTION_STRING, max: 4 });

  console.log(`Seeding ${ROWS} service requests in ${SUBURB}...`);
  await seed(pool);

  const app = require('../../src/app');
  const server = app.listen(0);
  await new Promise((resolve) => {
    server.once('listening', resolve);
  });
  const { port } = server.address();

  const path = `/api/v1/requests?status=Submitted&suburb=${encodeURIComponent(SUBURB)}&limit=50`;

  for (let i = 0; i < WARMUP; i += 1) {
    await timeOneRequest(port, path);
  }

  const samples = [];
  let nonOk = 0;
  for (let i = 0; i < ITERATIONS; i += 1) {
    const { ms, status } = await timeOneRequest(port, path);
    if (status !== 200) nonOk += 1;
    samples.push(ms);
  }

  samples.sort((a, b) => a - b);
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const max = samples[samples.length - 1];

  const plan = await pool.query(
    `EXPLAIN (FORMAT TEXT)
     SELECT sr.request_id FROM service_requests sr
      WHERE sr.status = 'Submitted' AND sr.suburb = $1
      ORDER BY sr.created_at DESC LIMIT 50`,
    [SUBURB]
  );

  console.log('');
  console.log('CivicConnect performance exercise: staff queue filter');
  console.log('-----------------------------------------------------');
  console.log(`Operation       GET /api/v1/requests?status=Submitted&suburb=${SUBURB}&limit=50`);
  console.log(`Workload        ${ROWS} seeded requests, ${ITERATIONS} sequential calls after ${WARMUP} warm-up calls`);
  console.log(`Environment     Node ${process.version}, PostgreSQL via ${CONNECTION_STRING.replace(/:[^:@]*@/, ':***@')}`);
  console.log(`Non-200 responses  ${nonOk}`);
  console.log('');
  console.log(`mean   ${mean.toFixed(1)} ms`);
  console.log(`p50    ${p50.toFixed(1)} ms`);
  console.log(`p95    ${p95.toFixed(1)} ms`);
  console.log(`max    ${max.toFixed(1)} ms`);
  console.log('');
  console.log(`Target  p95 under ${TARGET_P95_MS} ms  ->  ${p95 <= TARGET_P95_MS ? 'MET' : 'NOT MET'}`);
  console.log('');
  console.log('Query plan for the filtered read:');
  plan.rows.forEach((r) => console.log('  ' + r['QUERY PLAN']));
  console.log('');
  console.log('Limitations. Calls are sequential, so this measures latency of a');
  console.log('single user and says nothing about behaviour under concurrent load.');
  console.log('The database is local to the process, so no network latency is');
  console.log('included. The dataset is synthetic and uniformly distributed, which');
  console.log('is kinder to the index than real municipal data would be.');

  server.close();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

