'use strict';
 
const express = require('express');
const router = express.Router();
const db = require('../config/Database');
 
// 1. Safely import auth middleware with fallbacks
let authMiddleware = {};
try {
  authMiddleware = require('../middleware/auth');
} catch (e) {
  console.warn('Warning: auth middleware failed to load', e.message);
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
 
// 2. Safe asyncHandler helper
const asyncHandler = (fn) => {
  if (typeof fn !== 'function') {
    return (req, res, next) => next();
  }
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
 
// 3. Controller fallback
let controller = {};
try {
  controller = require('../controllers/requestController');
} catch {
  controller = {};
}
 
const staffOnly = requireRoles('Staff', 'Supervisor', 'Admin');
 
// Citizen: Fetch personal requests
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
        sr.tracking_code AS "tracking_id",
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
        sr.created_at,
        sr.created_at AS "createdAt",
        sr.created_at AS "submittedAt",
        sr.created_at AS "submitted"
      FROM service_requests sr
      LEFT JOIN request_categories rc ON sr.category_id = rc.category_id
      WHERE sr.requester_id = $1
      ORDER BY sr.created_at DESC
      LIMIT $2 OFFSET $3
    `;
 
    const result = await db.query(query, [userId, pageSize, offset]);
 
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
}
 
// Create new service request
async function handleCreateRequest(req, res, next) {
  if (typeof controller.createRequest === 'function') {
    return controller.createRequest(req, res, next);
  }
 
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
      const catLookup = await db.query(
        'SELECT category_id, default_sla_hours FROM request_categories WHERE category_name ILIKE $1 LIMIT 1',
        [category]
      );
      if (catLookup.rows.length) {
        targetCategoryId = catLookup.rows[0].category_id;
        slaHours = catLookup.rows[0].default_sla_hours || 48;
      }
    }
 
    if (!targetCategoryId) {
      const firstCat = await db.query('SELECT category_id, default_sla_hours FROM request_categories LIMIT 1');
      if (firstCat.rows.length) {
        targetCategoryId = firstCat.rows[0].category_id;
        slaHours = firstCat.rows[0].default_sla_hours || 48;
      } else {
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
      submittedAt: created.created_at,
      createdAt: created.created_at
    });
  } catch (err) {
    next(err);
  }
}
 
// Guard all request routes
router.use(requireAuth);
 
router.get('/', asyncHandler(async (req, res, next) => {
  const role = (req.user?.role || '').toLowerCase();
  if (['staff', 'supervisor', 'admin'].includes(role) && typeof controller.listQueue === 'function') {
    return controller.listQueue(req, res, next);
  }
  return handleGetCitizenRequests(req, res, next);
}));
 
router.get('/requests', asyncHandler(handleGetCitizenRequests));
router.post('/', asyncHandler(handleCreateRequest));
router.post('/requests', asyncHandler(handleCreateRequest));
 
// Only register endpoints if valid controller functions exist
if (typeof controller.listSuburbs === 'function') {
  router.get('/suburbs', staffOnly, asyncHandler(controller.listSuburbs));
}
 
if (typeof controller.getRequestById === 'function') {
  router.get('/:id', asyncHandler(controller.getRequestById));
}
 
if (typeof controller.assignRequest === 'function') {
  router.patch('/:id/assign', staffOnly, asyncHandler(controller.assignRequest));
}
 
if (typeof controller.updateStatus === 'function') {
  router.patch('/:id/status', staffOnly, asyncHandler(controller.updateStatus));
} else if (typeof controller.updateRequestStatus === 'function') {
  router.patch('/:id/status', staffOnly, asyncHandler(controller.updateRequestStatus));
}
 
module.exports = router;
 