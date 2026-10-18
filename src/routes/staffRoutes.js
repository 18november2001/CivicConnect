const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
 
// Middleware to ensure role is Admin or Staff
function requireStaffOrAdmin(req, res, next) {
  const role = req.user?.role?.toLowerCase();
  if (role === 'admin' || role === 'staff' || role === 'official') {
    return next();
  }
  return res.status(403).json({ error: 'Access denied. Municipal staff only.' });
}
 
// GET all service requests across the municipality
router.get('/requests', authenticateToken, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.max(1, parseInt(req.query.pageSize, 10) || 10);
    const offset = (page - 1) * pageSize;
    const { status, category_id } = req.query;
 
    const conditions = [];
    const params = [];
 
    if (status) {
      params.push(status);
      conditions.push(`sr.status ILIKE $${params.length}`);
    }
 
    if (category_id) {
      params.push(category_id);
      conditions.push(`sr.category_id = $${params.length}`);
    }
 
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
 
    const countQuery = `SELECT COUNT(*) FROM service_requests sr ${whereClause}`;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0]?.count || 0, 10);
 
    const dataParams = [...params, pageSize, offset];
    const dataQuery = `
      SELECT 
        sr.request_id,
        sr.request_id AS id,
        sr.tracking_code,
        sr.tracking_code AS "trackingCode",
        sr.tracking_code AS "trackingId",
        sr.tracking_code AS "tracking_id",
        sr.requester_id,
        sr.requester_id AS "requesterId",
        u.email AS "requesterEmail",
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
        sr.assigned_staff_id AS "assignedStaffId",
        sr.resolution_notes,
        sr.resolution_notes AS "resolutionNotes",
        sr.rejection_reason,
        sr.sla_due_at,
        sr.sla_due_at AS "slaDueAt",
        sr.created_at,
        sr.created_at AS "createdAt",
        sr.created_at AS "submittedAt",
        sr.created_at AS "submitted"
      FROM service_requests sr
      LEFT JOIN request_categories rc ON sr.category_id = rc.category_id
      LEFT JOIN users u ON sr.requester_id = u.user_id
      ${whereClause}
      ORDER BY sr.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `;
 
    const result = await db.query(dataQuery, dataParams);
 
    return res.status(200).json({
      items: result.rows,
      page,
      pageSize,
      total,
      pages: Math.ceil(total / pageSize) || 1
    });
  } catch (err) {
    next(err);
  }
});
 
// GET request categories lookup
router.get('/categories', authenticateToken, async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT category_id, category_name, default_sla_hours, is_active FROM request_categories ORDER BY category_id ASC'
    );
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});
 
// PATCH / PUT update request status and notes
router.patch('/requests/:id', authenticateToken, requireStaffOrAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, assigned_staff_id, assignedStaffId, resolution_notes, resolutionNotes, rejection_reason } = req.body;
 
    const assignedStaff = assigned_staff_id || assignedStaffId || null;
    const notes = resolution_notes || resolutionNotes || null;
 
    const updateQuery = `
      UPDATE service_requests
      SET 
        status = COALESCE($1, status),
        assigned_staff_id = COALESCE($2, assigned_staff_id),
        resolution_notes = COALESCE($3, resolution_notes),
        rejection_reason = COALESCE($4, rejection_reason),
        updated_at = NOW()
      WHERE request_id = $5 OR tracking_code = $5
      RETURNING *;
    `;
 
    const result = await db.query(updateQuery, [status, assignedStaff, notes, rejection_reason, id]);
 
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }
 
    return res.status(200).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});
 
module.exports = router;
 