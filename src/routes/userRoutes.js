'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/Database');
const authMiddleware = require('../middleware/auth');

const requireAuth =
  authMiddleware.requireAuth ||
  authMiddleware.authenticateToken ||
  ((req, res, next) => next());

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const { role } = req.query;
    let query = `
      SELECT 
        user_id, 
        user_id AS id, 
        full_name, 
        full_name AS name, 
        email, 
        role 
      FROM users
    `;
    const params = [];

    if (role) {
      query += ` WHERE LOWER(role) = LOWER($1)`;
      params.push(role);
    }

    query += ` ORDER BY full_name ASC`;

    const result = await db.query(query, params);

    // Return an array directly (if frontend expects `res.map`)
    return res.status(200).json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;