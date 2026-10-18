'use strict';

/**
 * Create a Supervisor or Admin (or Staff/Citizen) account. Supervisors and
 * Admins cannot self-register, by design; this is how the first one is made.
 *
 *   node scripts/createUser.js --name "Sue Jones" --email sue@city.gov \
 *        --role Supervisor --department Water --password 'a long passphrase'
 *
 * Prefer passing the password via the CC_PASSWORD environment variable so it
 * does not end up in your shell history.
 */

require('dotenv').config();
const argon2 = require('@node-rs/argon2');
const db = require('../src/config/database');
const { DEPARTMENTS, validateCredentials } = require('../src/domain/validation/inputValidation');

const ROLES = ['Citizen', 'Staff', 'Supervisor', 'Admin'];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    out[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const password = process.env.CC_PASSWORD || args.password;
  const input = { fullName: args.name, email: args.email, password };

  const problems = validateCredentials(input);
  if (!ROLES.includes(args.role)) {
    problems.push(`--role must be one of ${ROLES.join(', ')}.`);
  }
  if (args.department && !DEPARTMENTS.includes(args.department)) {
    problems.push(`--department must be one of ${DEPARTMENTS.join(', ')}.`);
  }
  if (problems.length) {
    throw new Error(problems.join('\n'));
  }

  await db.query(
    `INSERT INTO users (full_name, email, password_hash, role, department)
     VALUES ($1, $2, $3, $4, $5)`,
    [args.name.trim(), args.email.trim().toLowerCase(), await argon2.hash(password), args.role, args.department || null],
  );
  console.log(`Created ${args.role} ${args.email}`);
}

main()
  .catch((err) => {
    console.error(err.code === '23505' ? 'That email already exists.' : err.message);
    process.exitCode = 1;
  })
  .finally(() => db.pool.end());
