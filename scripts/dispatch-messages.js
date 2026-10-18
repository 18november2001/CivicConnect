#!/usr/bin/env node
'use strict';

/**
 * Operational entry point for the messaging dispatch boundary.
 *
 * Two uses:
 *   node scripts/dispatch-messages.js          drain the queue once and report
 *   node scripts/dispatch-messages.js --watch  poll until interrupted
 *
 * The single-run mode is also the deployment verification check for outbound
 * messaging: it reports the queue depth before and after, so a deployment can
 * be shown to have a working messaging boundary rather than merely a deployed
 * one. It exits non-zero when a message fails, so it can gate a deployment.
 *
 * Connection comes from DATABASE_URL, or the discrete DB_* variables the rest
 * of the application uses.
 *
 * Engineering records: ADR-INT-001, DEF-011
 */

const { Pool } = require('pg');
const { runOnce, runForever } = require('../src/integration/messaging/dispatchRunner');

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'civicconnect_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
}

async function queueDepth(db) {
  const { rows } = await db.query(
    `SELECT status, COUNT(*)::int AS n
       FROM messaging_outbox
      GROUP BY status
      ORDER BY status`,
  );
  return rows;
}

function printDepth(label, rows) {
  if (rows.length === 0) {
    console.log(`${label}: queue empty`);
    return;
  }
  console.log(`${label}:`);
  rows.forEach((r) => console.log(`  ${r.status.padEnd(12)} ${r.n}`));
}

async function main() {
  const watch = process.argv.includes('--watch');
  const db = new Pool({ ...connectionConfig(), max: 4 });

  if (watch) {
    console.log('CivicConnect messaging dispatch: polling. Ctrl+C to stop.');
    const stop = runForever({ db });
    process.on('SIGINT', async () => {
      stop();
      await db.end();
      console.log('\nstopped.');
      process.exit(0);
    });
    return;
  }

  console.log('CivicConnect messaging dispatch: single run');
  console.log(`Started ${new Date().toISOString()}`);
  console.log('');

  const before = await queueDepth(db);
  printDepth('Queue before', before);

  const result = await runOnce({ db });

  console.log('');
  console.log(`Examined   ${result.examined}`);
  console.log(`Dispatched ${result.dispatched}`);
  console.log(`Failed     ${result.failed}`);
  console.log('');

  const after = await queueDepth(db);
  printDepth('Queue after', after);

  await db.end();

  if (result.failed > 0) {
    console.error('\nOne or more messages failed. See messaging_outbox.last_error.');
    process.exit(1);
  }
  console.log('\nMessaging boundary verified.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
