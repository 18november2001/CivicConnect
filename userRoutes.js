'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/Database');
const { authenticateToken, requireAuth } = require('../middleware/auth');

const authGuard = requireAuth || authenticateToken || ((req, res, next) => next());

router.use(authGuard);

router.get('/', async (req, res, next) => {
  try {
    const { role } = req.query;
    let query = `
      SELECT user_id, user_id AS id, full_name, full_name AS name, email, role 
      FROM users
    `;
    const params = [];

    if (role) {
      query += ` WHERE LOWER(role) = LOWER($1)`;
      params.push(role);
    }

    query += ` ORDER BY full_name ASC`;

    const result = await db.query(query, params);

    // Return format supporting array or object with items
    return res.status(200).json({
      items: result.rows,
      users: result.rows,
      total: result.rowCount
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;