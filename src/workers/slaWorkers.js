'use strict';

const db = require('../config/database');

async function checkSlaBreaches() {
  try {
    const result = await db.query(
      `UPDATE service_requests
       SET is_sla_breached = TRUE
       WHERE status NOT IN ('Resolved', 'Closed', 'Rejected')
         AND sla_due_at < NOW()
         AND is_sla_breached = FALSE
       RETURNING id, tracking_code`
    );

    if (result.rows.length > 0) {
      console.log(`[SlaWorker] Flagged ${result.rows.length} requests for SLA breach.`);
    }
  } catch (err) {
    console.error('[SlaWorker] Error executing SLA breach scan:', err.message);
  }
}

function startSlaWorker(intervalMs = 60000) {
  setInterval(checkSlaBreaches, intervalMs);
}

module.exports = {
  checkSlaBreaches,
  startSlaWorker,
};