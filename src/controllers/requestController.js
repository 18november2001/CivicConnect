'use strict';

const crypto = require('crypto');
const db = require('../config/database');
const { lifecycle } = require('../application/container');
const { STATES, ROLES } = require('../domain/fsm/states');
const { validateNewRequest, isUuid } = require('../domain/validation/inputValidation');
const { toServiceRequest } = require('../presentation/mappers');
const { buildQueueFilter } = require('../application/queueFilter');
const { errorBody } = require('../middleware/auth');

const STAFF_ROLES = [ROLES.STAFF, ROLES.SUPERVISOR, ROLES.ADMIN];
const SORT_COLUMNS = { createdAt: 'sr.created_at', slaDueAt: 'sr.sla_due_at', status: 'sr.status' };
const TRACKING_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const REQUEST_SELECT = `
  SELECT sr.*, rc.category_name
    FROM service_requests sr
    JOIN request_categories rc ON rc.category_id = sr.category_id`;

const clientIp = (req) => req.ip || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
const isStaff = (user) => STAFF_ROLES.includes(user.role);

function generateTrackingCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let suffix = '';
  for (const byte of crypto.randomBytes(4)) {
    suffix += TRACKING_ALPHABET[byte % TRACKING_ALPHABET.length];
  }
  return `REQ-${date}-${suffix}`;
}

/** Load one request with its public timeline, plus the internal audit trail for staff. */
async function loadDetail(id, { includeAudit }) {
  const { rows } = await db.query(`${REQUEST_SELECT} WHERE sr.request_id = $1`, [id]);
  if (!rows[0]) {
    return null;
  }
  const timeline = await db.query(
    `SELECT status_snapshot, public_message, posted_by_department, created_at
       FROM request_timeline_updates WHERE request_id = $1 ORDER BY created_at ASC`,
    [id],
  );
  let audit;
  if (includeAudit) {
    const result = await db.query(
      `SELECT a.created_at, u.full_name AS actor_name, a.action, a.previous_state,
              a.new_state, a.handover_notes
         FROM request_audit_log a JOIN users u ON u.user_id = a.actor_id
        WHERE a.request_id = $1 ORDER BY a.created_at ASC, a.audit_id ASC`,
      [id],
    );
    audit = result.rows;
  }
  return toServiceRequest(rows[0], { timeline: timeline.rows, audit });
}

/** POST /requests  (Citizen) - FR-001 */
async function createRequest(req, res) {
  const violations = validateNewRequest(req.body);
  if (violations.length) {
    return res
      .status(400)
      .json(errorBody('VALIDATION_FAILED', violations[0], violations));
  }
  const body = req.body;
  const requesterId = req.user.sub;
  const ip = clientIp(req);

  // A 4-character suffix can collide, so retry on a tracking_code unique violation.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const requestId = await db.transaction(async (tx) => {
        const category = await tx.query(
          `SELECT category_id, default_sla_hours FROM request_categories
            WHERE category_name = $1 AND is_active = TRUE`,
          [body.category.trim()],
        );
        if (!category.rows[0]) {
          return null;
        }
        const slaDueAt = new Date(Date.now() + category.rows[0].default_sla_hours * 3600 * 1000);
        const inserted = await tx.query(
          `INSERT INTO service_requests
             (tracking_code, requester_id, category_id, title, description,
              location_address, suburb, status, sla_due_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'Submitted', $8)
           RETURNING request_id`,
          [
            generateTrackingCode(), requesterId, category.rows[0].category_id,
            body.title.trim(), body.description.trim(), body.locationAddress.trim(),
            body.suburb.trim(), slaDueAt,
          ],
        );
        const id = inserted.rows[0].request_id;
        await tx.query(
          `INSERT INTO request_audit_log
             (request_id, actor_id, action, previous_state, new_state, originating_ip)
           VALUES ($1, $2, 'REQUEST_SUBMITTED', NULL, 'Submitted', $3)`,
          [id, requesterId, ip],
        );
        await tx.query(
          `INSERT INTO request_timeline_updates
             (request_id, status_snapshot, public_message, posted_by_department)
           VALUES ($1, 'Submitted', 'Request submitted.', 'System')`,
          [id],
        );
        return id;
      });

      if (!requestId) {
        const message = 'Select a valid category.';
        return res.status(400).json(errorBody('VALIDATION_FAILED', message, [message]));
      }
      return res.status(201).json(await loadDetail(requestId, { includeAudit: false }));
    } catch (err) {
      const isCodeCollision = err.code === '23505' && /tracking_code/.test(err.constraint || '');
      if (!isCodeCollision || attempt === 4) {
        throw err;
      }
    }
  }
  return undefined;
}

/** GET /requester/requests?page&pageSize  (any signed-in user: their own history) - FR-002 */
async function listMine(req, res) {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const size = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 100);
  const [count, rows] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS total FROM service_requests WHERE requester_id = $1', [req.user.sub]),
    db.query(
      `${REQUEST_SELECT} WHERE sr.requester_id = $1
        ORDER BY sr.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.sub, size, (page - 1) * size],
    ),
  ]);
  return res.json({ total: count.rows[0].total, items: rows.rows.map((r) => toServiceRequest(r)) });
}

/** GET /requests/:id - citizens see only their own; staff see all plus the audit trail. */
async function getRequestById(req, res) {
  const notFound = () => res.status(404).json(errorBody('REQUEST_NOT_FOUND', 'Service request not found.'));
  if (!isUuid(req.params.id)) {
    return notFound();
  }
  const detail = await loadDetail(req.params.id, { includeAudit: isStaff(req.user) });
  if (!detail || (!isStaff(req.user) && detail.requesterId !== req.user.sub)) {
    return notFound();
  }
  return res.json(detail);
}

/** GET /requests  (staff) - FR-004: search, filter and sort */
async function listQueue(req, res) {
  const { where, params } = buildQueueFilter(req.query);
  const sortColumn = SORT_COLUMNS[req.query.sort] || SORT_COLUMNS.slaDueAt;
  const { rows } = await db.query(
    `${REQUEST_SELECT} ${where} ORDER BY ${sortColumn} ASC, sr.created_at DESC LIMIT 200`,
    params,
  );
  return res.json({ items: rows.map((r) => toServiceRequest(r)) });
}

/** GET /requests/suburbs  (staff) */
async function listSuburbs(req, res) {
  const { rows } = await db.query('SELECT DISTINCT suburb FROM service_requests ORDER BY suburb');
  return res.json(rows.map((r) => r.suburb));
}

/** Run one lifecycle transition and answer with the refreshed request. */
async function runTransition(req, res, { targetStatus, context }) {
  if (!isUuid(req.params.id)) {
    return res.status(404).json(errorBody('REQUEST_NOT_FOUND', 'Service request not found.'));
  }
  await lifecycle.transition({
    requestId: req.params.id,
    targetStatus,
    actorId: req.user.sub,
    actorRole: req.user.role,
    actorDepartment: req.user.department || null,
    originatingIp: clientIp(req),
    expectedUpdatedAt: req.body.expectedUpdatedAt,
    context,
  });
  return res.json(await loadDetail(req.params.id, { includeAudit: true }));
}

/** PATCH /requests/:id/assign  (staff) - claim, assign or reassign - FR-005 */
async function assignRequest(req, res) {
  const { staffId, handoverNotes } = req.body || {};
  let staffIsActive = false;
  if (isUuid(staffId)) {
    const { rows } = await db.query(
      'SELECT 1 FROM users WHERE user_id = $1 AND role = ANY($2::text[])',
      [staffId, STAFF_ROLES],
    );
    staffIsActive = rows.length > 0;
  }
  return runTransition(req, res, {
    targetStatus: STATES.ASSIGNED,
    context: {
      assignedStaffId: isUuid(staffId) ? staffId : null,
      assignedStaffIsActive: staffIsActive,
      handoverNotes: typeof handoverNotes === 'string' ? handoverNotes.trim() : null,
    },
  });
}

/** PATCH /requests/:id/status  (staff) - controlled lifecycle change - FR-006 */
async function updateRequestStatus(req, res) {
  const { targetStatus, notes } = req.body || {};
  const note = typeof notes === 'string' ? notes.trim() : '';
  if (targetStatus === STATES.ASSIGNED) {
    const message = 'Use the assign endpoint to assign or reassign a request.';
    return res.status(422).json(errorBody('ILLEGAL_TRANSITION', message, [message]));
  }
  return runTransition(req, res, {
    targetStatus,
    context: {
      resolutionNotes: targetStatus === STATES.RESOLVED ? note : undefined,
      rejectionReason: targetStatus === STATES.REJECTED ? note : undefined,
      handoverNotes: targetStatus !== STATES.RESOLVED && targetStatus !== STATES.REJECTED ? note || null : null,
    },
  });
}

module.exports = {
  createRequest,
  listMine,
  getRequestById,
  listQueue,
  listSuburbs,
  assignRequest,
  updateRequestStatus,
  generateTrackingCode,
};
