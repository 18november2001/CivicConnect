'use strict';

/**
 * Create the demo accounts the front end login page advertises.
 *   node scripts/seedDemo.js
 * Idempotent (re-running resets the demo passwords). Refuses to run in production.
 */

require('dotenv').config();
const argon2 = require('@node-rs/argon2');
const db = require('../src/config/database');

const DEMO_PASSWORD = 'password';
const DEMO_USERS = [
  ['Thandi Citizen', 'citizen@demo.test', 'Citizen', null],
  ['Sipho Staff', 'staff@demo.test', 'Staff', 'Roads'],
  ['Sue Supervisor', 'super@demo.test', 'Supervisor', 'Roads'],
  ['Alex Admin', 'admin@demo.test', 'Admin', null],
];

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed demo accounts with a known password in production.');
  }
  const hash = await argon2.hash(DEMO_PASSWORD);
  for (const [name, email, role, department] of DEMO_USERS) {
    await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [name, email, hash, role, department],
    );
    console.log(`seeded ${role.padEnd(10)} ${email}`);
  }
  console.log(`Password for all demo accounts: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
