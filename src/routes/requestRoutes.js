'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/Database');

let authMiddleware = {};
try {
  authMiddleware = require('../middleware/auth');
} catch (e) {
  console.warn('Warning: auth middleware failed to load in requestRoutes', e.message);
}

const requireAuth =
  authMiddleware.requireAuth ||
  authMiddleware.authenticateToken ||
  ((req, res, next) => next());

const requireRoles = (...allowed) => {
  if (typeof authMiddleware.requireRoles === 'function') {
    return authMiddleware.requireRoles(...allowed);
  }
  return (req, res, next) => {
    const role = (req.user?.role || '').toLowerCase();
    const isAllowed = allowed.some((r) => r.toLowerCase() === role);
    if (!isAllowed) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied for this role.' }
      });
    }
    next();
  };
};

const staffOnly = requireRoles('Staff', 'Supervisor', 'Admin');

const asyncHandler = (fn) => {
  if (typeof fn !== 'function') {
    return (req, res, next) => next();
  }
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

async function handleGetCitizenRequests(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize, 10) || 10);
    const offset = (page - 1) * pageSize;
    const userId = req.user?.id || req.user?.user_id;

    const countResult = await db.query(
      'SELECT COUNT(*) FROM service_requests WHERE requester_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0]?.count || 0, 10);

    const query = `
      SELECT
        sr.request_id,
        sr.request_id AS id,
        sr.tracking_code,
        sr.tracking_code AS "trackingCode",
        sr.tracking_code AS "trackingId",
        sr.requester_id,
        sr.requester_id AS "requesterId",
        sr.category_id,
        rc.category_name AS category,
        rc.category_name AS "categoryName",
        sr.title,
        sr.description,
        sr.location_address,
        sr.location_address AS "locationAddress",
        sr.location_address AS "streetAddress",
        sr.suburb,
        sr.status,
        sr.assigned_staff_id,
        sr.assigned_staff_id AS assigned_to,
        sr.assigned_staff_id AS "assignedTo",
        COALESCE(sr.sla_due_at, sr.created_at + INTERVAL '48 hours') AS "slaDueAt",
        COALESCE(sr.sla_due_at, sr.created_at + INTERVAL '48 hours') AS sla_due_at,
        sr.created_at,
        sr.created_at AS "createdAt"
      FROM service_requests sr
      LEFT JOIN request_categories rc ON sr.category_id = rc.category_id
      WHERE sr.requester_id = $1
      ORDER BY sr.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await db.query(query, [userId, pageSize, offset]);

    return res.status(200).json({
      items: result.rows,
      requests: result.rows,
      data: result.rows,
      page,
      pageSize,
      total,
      pages: Math.ceil(total / pageSize) || 1
    });
  } catch (err) {
    next(err);
  }
}

async function handleCreateRequest(req, res, next) {
  try {
    const {
      title,
      category,
      category_id,
      description,
      location_address,
      street_address,
      streetAddress,
      address,
      suburb
    } = req.body;

    const requesterId = req.user?.id || req.user?.user_id;

    let targetCategoryId = category_id;
    let slaHours = 48;

    if (!targetCategoryId && category) {
      try {
        const catLookup = await db.query(
          'SELECT category_id, default_sla_hours FROM request_categories WHERE category_name ILIKE $1 LIMIT 1',
          [category]
        );
        if (catLookup.rows.length) {
          targetCategoryId = catLookup.rows[0].category_id;
          slaHours = catLookup.rows[0].default_sla_hours || 48;
        }
      } catch {
      }
    }

    if (!targetCategoryId) {
      try {
        const firstCat = await db.query('SELECT category_id, default_sla_hours FROM request_categories LIMIT 1');
        if (firstCat.rows.length) {
          targetCategoryId = firstCat.rows[0].category_id;
          slaHours = firstCat.rows[0].default_sla_hours || 48;
        } else {
          targetCategoryId = 1;
        }
      } catch {
        targetCategoryId = 1;
      }
    }

    const trackingCode = `CC-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const street = location_address || street_address || streetAddress || address || 'Default Street Address';

    const insertQuery = `
      INSERT INTO service_requests (
        request_id,
        tracking_code,
        requester_id,
        category_id,
        title,
        description,
        location_address,
        suburb,
        status,
        sla_due_at,
        created_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'Submitted',
        NOW() + ($8 || ' hours')::interval,
        NOW()
      ) RETURNING *;
    `;

    const result = await db.query(insertQuery, [
      trackingCode,
      requesterId,
      targetCategoryId,
      title,
      description,
      street,
      suburb,
      slaHours
    ]);

    const created = result.rows[0];

    return res.status(201).json({
      ...created,
      id: created.request_id,
      trackingId: created.tracking_code,
      trackingCode: created.tracking_code,
      createdAt: created.created_at
    });
  } catch (err) {
    next(err);
  }
}

router.use(requireAuth);

router.get('/', asyncHandler(async (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();

  if (['staff', 'supervisor', 'admin'].includes(role)) {
    try {
      const { q, status, category, suburb, assignee, sort, from, to } = req.query;

      const whereClauses = [];
      const values = [];

      if (q && q.trim() !== '') {
        values.push(`%${q.trim()}%`);
        whereClauses.push(`(sr.title ILIKE $${values.length} OR sr.tracking_code ILIKE $${values.length} OR sr.location_address ILIKE $${values.length})`);
      }

      if (status && status !== 'Overdue') {
        const normStatus = status.includes(' ') ? status.replace(' ', '_') : status;
        values.push(normStatus);
        whereClauses.push(`sr.status = $${values.length}`);
      } else if (status === 'Overdue') {
        whereClauses.push(`sr.sla_due_at < NOW() AND sr.status NOT IN ('Resolved', 'Closed')`);
      }

      if (category && category.trim() !== '') {
        values.push(category.trim());
        whereClauses.push(`rc.category_name ILIKE $${values.length}`);
      }

      if (suburb && suburb.trim() !== '') {
        values.push(suburb.trim());
        whereClauses.push(`sr.suburb ILIKE $${values.length}`);
      }

      if (assignee && assignee !== '') {
        if (assignee === 'none') {
          whereClauses.push(`sr.assigned_staff_id IS NULL`);
        } else {
          values.push(assignee);
          whereClauses.push(`sr.assigned_staff_id::text = $${values.length}`);
        }
      }

      if (from) {
        values.push(from);
        whereClauses.push(`sr.created_at >= $${values.length}::date`);
      }

      if (to) {
        values.push(to);
        whereClauses.push(`sr.created_at <= ($${values.length}::date + INTERVAL '1 day')`);
      }

      const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const orderBy = sort === 'slaDueAt' ? 'sr.sla_due_at ASC NULLS LAST' : 'sr.created_at DESC';

      const query = `
        SELECT
          sr.request_id,
          sr.request_id AS id,
          sr.tracking_code,
          sr.tracking_code AS "trackingCode",
          sr.tracking_code AS "trackingId",
          sr.title,
          sr.description,
          COALESCE(rc.category_name, 'General') AS category,
          COALESCE(rc.category_name, 'General') AS "categoryName",
          sr.location_address,
          sr.location_address AS "locationAddress",
          sr.location_address AS "streetAddress",
          sr.suburb,
          sr.status,
          sr.assigned_staff_id,
          sr.assigned_staff_id AS assigned_to,
          sr.assigned_staff_id AS "assignedTo",
          u.full_name AS "assigneeName",
          sr.resolution_notes,
          sr.rejection_reason,
          sr.sla_due_at,
          sr.sla_due_at AS "slaDueAt",
          sr.created_at,
          sr.created_at AS "createdAt",
          sr.updated_at,
          sr.updated_at AS "updatedAt"
        FROM service_requests sr
        LEFT JOIN request_categories rc ON sr.category_id = rc.category_id
        LEFT JOIN users u ON sr.assigned_staff_id = u.user_id
        ${whereSQL}
        ORDER BY ${orderBy};
      `;

      const result = await db.query(query, values);

      return res.status(200).json({
        items: result.rows,
        requests: result.rows,
        data: result.rows,
        total: result.rowCount,
        page: 1,
        pageSize: result.rowCount,
        pages: 1
      });
    } catch (err) {
      console.error('Staff queue query error:', err.message);
      return res.status(500).json({ error: { message: err.message } });
    }
  }

  return handleGetCitizenRequests(req, res, next);
}));

router.get('/requests', asyncHandler(async (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (['staff', 'supervisor', 'admin'].includes(role)) {
    return router.handle({ ...req, url: '/' }, res, next);
  }
  return handleGetCitizenRequests(req, res, next);
}));

router.get('/suburbs', staffOnly, asyncHandler(async (_req, res, next) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT suburb 
       FROM service_requests 
       WHERE suburb IS NOT NULL AND TRIM(suburb) != '' 
       ORDER BY suburb ASC`
    );
    const suburbs = result.rows.map((r) => r.suburb);
    return res.status(200).json(suburbs);
  } catch (err) {
    next(err);
  }
}));

router.post('/', asyncHandler(handleCreateRequest));
router.post('/requests', asyncHandler(handleCreateRequest));

router.get('/:id', asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const query = `
      SELECT
        sr.*,
        sr.request_id AS id,
        sr.tracking_code AS "trackingCode",
        sr.tracking_code AS "trackingId",
        sr.assigned_staff_id,
        sr.assigned_staff_id AS assigned_to,
        sr.assigned_staff_id AS "assignedTo",
        COALESCE(sr.sla_due_at, sr.created_at + INTERVAL '48 hours') AS "slaDueAt",
        COALESCE(sr.sla_due_at, sr.created_at + INTERVAL '48 hours') AS sla_due_at,
        COALESCE(rc.category_name, 'General') AS category,
        COALESCE(rc.category_name, 'General') AS "categoryName",
        u.full_name AS "assigneeName"
      FROM service_requests sr
      LEFT JOIN request_categories rc ON sr.category_id = rc.category_id
      LEFT JOIN users u ON sr.assigned_staff_id = u.user_id
      WHERE sr.request_id::text = $1 OR sr.tracking_code = $1
      LIMIT 1;
    `;
    const result = await db.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: { message: 'Service request not found.' } });
    }

    const row = result.rows[0];

    let auditList = [];
    try {
      const auditRes = await db.query(
        `SELECT 
           created_at AS at, 
           actor_name AS actor, 
           action, 
           from_status AS "from", 
           to_status AS "to", 
           note 
         FROM audit_logs 
         WHERE request_id = $1 
         ORDER BY created_at ASC`,
        [row.request_id]
      );
      auditList = auditRes.rows;
    } catch {
      try {
        const altRes = await db.query(
          `SELECT created_at AS at, note FROM request_audit_logs WHERE request_id = $1 ORDER BY created_at ASC`,
          [row.request_id]
        );
        auditList = altRes.rows.map((a) => ({
          at: a.at,
          actor: 'System',
          action: 'LOG',
          from: '',
          to: '',
          note: a.note
        }));
      } catch {
        auditList = [];
      }
    }

    return res.status(200).json({
      ...row,
      audit: auditList
    });
  } catch (err) {
    next(err);
  }
}));

router.patch('/:id/assign', staffOnly, asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    const rawAssignee =
      req.body.assignee ||
      req.body.assigneeId ||
      req.body.assignee_id ||
      req.body.staffId ||
      req.body.staff_id ||
      req.body.assigned_staff_id ||
      req.body.assignedTo ||
      req.body.assigned_to ||
      req.body.userId ||
      req.body.user_id;

    const note = req.body.note || 'Ticket assigned to staff member';
    const currentStaffId = req.user?.id || req.user?.user_id;
    const actorName = req.user?.name || req.user?.full_name || 'Staff Member';

    if (!rawAssignee) {
      return res.status(400).json({ error: { message: 'No staff member specified for assignment.' } });
    }

    const staffLookup = await db.query(
      `SELECT user_id, full_name FROM users WHERE user_id::text = $1 OR email ILIKE $1 LIMIT 1`,
      [rawAssignee.toString().trim()]
    );

    const targetStaffId = staffLookup.rows[0]?.user_id || rawAssignee;
    const targetStaffName = staffLookup.rows[0]?.full_name || 'Staff';

    const prevRes = await db.query(
      `SELECT request_id, status FROM service_requests WHERE request_id::text = $1 OR tracking_code = $1`,
      [id]
    );

    if (prevRes.rowCount === 0) {
      return res.status(404).json({ error: { message: 'Ticket not found.' } });
    }

    const previousStatus = prevRes.rows[0].status;
    const actualRequestId = prevRes.rows[0].request_id;
    const newStatus = previousStatus === 'Submitted' ? 'In_Progress' : previousStatus;

    const updateQuery = `
      UPDATE service_requests
      SET 
        assigned_staff_id = $1, 
        status = $2::character varying, 
        updated_at = NOW()
      WHERE request_id = $3
      RETURNING 
        *, 
        request_id AS id,
        tracking_code AS "trackingCode",
        assigned_staff_id AS "assignedStaffId",
        assigned_staff_id AS assigned_to;
    `;
    const result = await db.query(updateQuery, [targetStaffId, newStatus, actualRequestId]);
    const row = result.rows[0];

    try {
      await db.query(
        `INSERT INTO audit_logs (request_id, actor_id, actor_name, action, from_status, to_status, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [actualRequestId, currentStaffId, actorName, 'ASSIGNMENT', previousStatus, newStatus, `Assigned to ${targetStaffName} - ${note}`]
      );
    } catch {
      try {
        await db.query(
          `INSERT INTO request_audit_logs (request_id, user_id, action, note, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [actualRequestId, currentStaffId, `Assigned to ${targetStaffName}`, note]
        );
      } catch {
      }
    }

    return res.status(200).json({
      ok: true,
      req: {
        ...row,
        id: row.request_id,
        trackingCode: row.tracking_code,
        assignedStaffId: row.assigned_staff_id,
        assigneeName: targetStaffName
      }
    });
  } catch (err) {
    console.error('Failed to assign ticket:', err.message);
    return res.status(500).json({ error: { message: err.message } });
  }
}));

router.patch('/:id/status', staffOnly, asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    let { status, to, note, resolution_notes, rejection_reason } = req.body;

    let target = (status || to || '').toString().trim();
    let dbStatus = 'In_Progress';

    if (target === 'Reject' || target === 'Rejected') {
      dbStatus = 'Rejected';
    } else if (target === 'Resolve' || target === 'Resolved') {
      dbStatus = 'Resolved';
    } else if (target === 'Close' || target === 'Closed') {
      dbStatus = 'Closed';
    } else if (target === 'Assign' || target === 'Assigned') {
      dbStatus = 'Assigned';
    } else {
      dbStatus = 'In_Progress';
    }

    const noteText = note || resolution_notes || rejection_reason || 'Status updated';
    const currentStaffId = req.user?.id || req.user?.user_id;
    const actorName = req.user?.name || req.user?.full_name || 'Staff Member';

    const prevRes = await db.query(
      `SELECT request_id, status FROM service_requests WHERE request_id::text = $1 OR tracking_code = $1`,
      [id]
    );
    if (prevRes.rowCount === 0) {
      return res.status(404).json({ error: { message: 'Ticket not found.' } });
    }
    const previousStatus = prevRes.rows[0].status;
    const actualRequestId = prevRes.rows[0].request_id;

    let updateQuery;
    let queryParams;

    if (dbStatus === 'In_Progress') {
      updateQuery = `
        UPDATE service_requests
        SET 
          status = $1::character varying,
          assigned_staff_id = COALESCE(assigned_staff_id, $2),
          updated_at = NOW()
        WHERE request_id = $3
        RETURNING 
          *, 
          request_id AS id,
          tracking_code AS "trackingCode",
          assigned_staff_id AS "assignedStaffId", 
          assigned_staff_id AS assigned_to;
      `;
      queryParams = [dbStatus, currentStaffId, actualRequestId];
    } else if (dbStatus === 'Rejected') {
      updateQuery = `
        UPDATE service_requests
        SET 
          status = $1::character varying,
          rejection_reason = COALESCE($2, rejection_reason),
          updated_at = NOW()
        WHERE request_id = $3
        RETURNING 
          *, 
          request_id AS id,
          tracking_code AS "trackingCode",
          assigned_staff_id AS "assignedStaffId", 
          assigned_staff_id AS assigned_to;
      `;
      queryParams = [dbStatus, noteText, actualRequestId];
    } else if (dbStatus === 'Resolved') {
      updateQuery = `
        UPDATE service_requests
        SET 
          status = $1::character varying,
          resolution_notes = COALESCE($2, resolution_notes),
          updated_at = NOW()
        WHERE request_id = $3
        RETURNING 
          *, 
          request_id AS id,
          tracking_code AS "trackingCode",
          assigned_staff_id AS "assignedStaffId", 
          assigned_staff_id AS assigned_to;
      `;
      queryParams = [dbStatus, noteText, actualRequestId];
    } else {
      updateQuery = `
        UPDATE service_requests
        SET 
          status = $1::character varying,
          updated_at = NOW()
        WHERE request_id = $2
        RETURNING 
          *, 
          request_id AS id,
          tracking_code AS "trackingCode",
          assigned_staff_id AS "assignedStaffId", 
          assigned_staff_id AS assigned_to;
      `;
      queryParams = [dbStatus, actualRequestId];
    }

    const result = await db.query(updateQuery, queryParams);
    const updated = result.rows[0];

    try {
      await db.query(
        `INSERT INTO audit_logs (request_id, actor_id, actor_name, action, from_status, to_status, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [actualRequestId, currentStaffId, actorName, 'STATUS_CHANGE', previousStatus, dbStatus, noteText]
      );
    } catch {
      try {
        await db.query(
          `INSERT INTO request_audit_logs (request_id, user_id, action, note, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [actualRequestId, currentStaffId, `Transitioned from ${previousStatus} to ${dbStatus}`, noteText]
        );
      } catch {
      }
    }

    return res.status(200).json({
      ok: true,
      req: {
        ...updated,
        id: updated.request_id,
        trackingCode: updated.tracking_code,
        assignedStaffId: updated.assigned_staff_id
      }
    });
  } catch (err) {
    console.error('Failed to update status:', err.message);
    return res.status(500).json({ error: { message: err.message } });
  }
}));

module.exports = router;