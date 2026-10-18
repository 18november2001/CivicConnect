'use strict';
 
const express = require('express');
const router = express.Router();
const db = require('../config/Database');
 
// 1. Auth & role middleware fallbacks
let authMiddleware = {};
try {
  authMiddleware = require('../middleware/auth');
} catch (e) {
  console.warn('Warning: auth middleware failed to load in staffRoutes', e.message);
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
 
// 2. Safe async wrapper
const asyncHandler = (fn) => {
  if (typeof fn !== 'function') {
    return (req, res, next) => next();
  }
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
 
// 3. Fallback handlers directly from the database if controller functions are missing
async function handleListStaff(req, res, next) {
  try {
    const result = await db.query(
      `SELECT user_id, full_name, email, role, created_at 
       FROM users 
       WHERE LOWER(role) IN ('staff', 'supervisor', 'admin') 
       ORDER BY full_name ASC`
    );
    return res.status(200).json({
      items: result.rows,
      total: result.rowCount
    });
  } catch (err) {
    next(err);
  }
}
 
// 4. Try loading controller functions if they exist
let staffController = {};
try {
  staffController = require('../controllers/staffController');
} catch {
  staffController = {};
}
 
// Guard all staff routes
router.use(requireAuth);
router.use(staffOnly);
 
// Route definition with fallback to avoid passing undefined
router.get(
  '/',
  asyncHandler(
    typeof staffController.listStaff === 'function'
      ? staffController.listStaff
      : (typeof staffController.getStaff === 'function' ? staffController.getStaff : handleListStaff)
  )
);
 
if (typeof staffController.getStaffById === 'function') {
  router.get('/:id', asyncHandler(staffController.getStaffById));
}
 
module.exports = router;
 