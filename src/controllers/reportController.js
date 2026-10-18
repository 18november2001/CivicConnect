'use strict';

const db = require('../config/database');
const { errorBody } = require('../middleware/auth');

const CLOSED_SQL = "('Resolved', 'Closed', 'Rejected')";
const EXPORT_FIELDS = ['trackingCode', 'category', 'createdAt', 'status', 'turnaroundHours'];

/** GET /reports/summary  (Supervisor, Admin) - FR-007 */
async function summary(req, res) {
  const totals = await db.query(`
    SELECT COUNT(*) FILTER (WHERE status = 'Submitted')::int   AS open,
           COUNT(*) FILTER (WHERE status = 'Assigned')::int    AS assigned,
           COUNT(*) FILTER (WHERE status = 'In_Progress')::int AS in_progress,
           COUNT(*) FILTER (WHERE status NOT IN ${CLOSED_SQL} AND sla_due_at < NOW())::int AS overdue,
           COUNT(*) FILTER (WHERE status = 'Closed')::int      AS closed
      FROM service_requests`);
  const byCategory = await db.query(`
    SELECT rc.category_name AS category,
           COUNT(sr.request_id) FILTER (WHERE sr.status NOT IN ('Closed', 'Rejected'))::int AS count
      FROM request_categories rc
      LEFT JOIN service_requests sr ON sr.category_id = rc.category_id
     GROUP BY rc.category_id, rc.category_name ORDER BY rc.category_id`);
  const t = totals.rows[0];
  return res.json({
    open: t.open,
    assigned: t.assigned,
    inProgress: t.in_progress,
    overdue: t.overdue,
    closed: t.closed,
    byCategory: byCategory.rows,
  });
}

const csvCell = (value) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** GET /reports/export?format=csv|json&status&category  (Supervisor, Admin) - FR-008 */
async function exportReport(req, res) {
  const format = req.query.format === 'json' ? 'json' : 'csv';
  if (req.query.format && !['csv', 'json'].includes(req.query.format)) {
    return res.status(400).json(errorBody('BAD_REQUEST', 'format must be csv or json.'));
  }
  const params = [];
  const clauses = [];
  if (req.query.status) {
    params.push(String(req.query.status));
    clauses.push(`sr.status = $${params.length}`);
  }
  if (req.query.category) {
    params.push(String(req.query.category));
    clauses.push(`rc.category_name = $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT sr.tracking_code, rc.category_name, sr.created_at, sr.status,
            ROUND(EXTRACT(EPOCH FROM (
              CASE WHEN sr.status IN ${CLOSED_SQL} THEN sr.updated_at ELSE NOW() END - sr.created_at
            )) / 3600)::int AS turnaround_hours
       FROM service_requests sr JOIN request_categories rc ON rc.category_id = sr.category_id
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
      ORDER BY sr.created_at DESC`,
    params,
  );
  // Only non-personal fields leave the system (FR-008): no names, addresses or descriptions.
  const data = rows.map((r) => ({
    trackingCode: r.tracking_code,
    category: r.category_name,
    createdAt: r.created_at.toISOString(),
    status: r.status,
    turnaroundHours: r.turnaround_hours,
  }));
  res.setHeader('Content-Disposition', `attachment; filename="civicconnect-export.${format}"`);
  if (format === 'json') {
    return res.json(data);
  }
  const lines = [EXPORT_FIELDS.join(','), ...data.map((d) => EXPORT_FIELDS.map((f) => csvCell(d[f])).join(','))];
  return res.type('text/csv').send(lines.join('\n'));
}

module.exports = { summary, exportReport };
