'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/Database');

const JWT_SECRET = process.env.JWT_SECRET || 'civic-connect-super-secret-key-2026';

const formatUser = (user) => ({
  id: user.user_id,
  name: user.full_name,
  email: user.email,
  role: user.role.toLowerCase()
});

// POST /api/v1/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { fullName, name, email, password } = req.body;
    const displayName = (fullName || name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!displayName || !cleanEmail || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Full name, email, and password are required.'
        }
      });
    }

    const existing = await db.query(
      'SELECT user_id FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email address already exists.'
        }
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertQuery = `
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, 'Citizen')
      RETURNING user_id, full_name, email, role;
    `;
    const result = await db.query(insertQuery, [displayName, cleanEmail, passwordHash]);
    const safeUser = formatUser(result.rows[0]);

    const token = jwt.sign(
      {
        id: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
        name: safeUser.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/register-staff
router.post('/register-staff', async (req, res, next) => {
  try {
    const { fullName, name, email, password, role } = req.body;
    const displayName = (fullName || name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const targetRole = role && role.toLowerCase() === 'admin' ? 'Admin' : 'Staff';

    if (!displayName || !cleanEmail || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Full name, email, and password are required.'
        }
      });
    }

    const existing = await db.query(
      'SELECT user_id FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: 'EMAIL_EXISTS',
          message: 'An account with this email address already exists.'
        }
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const insertQuery = `
      INSERT INTO users (full_name, email, password_hash, role)
      VALUES ($1, $2, $3, $4)
      RETURNING user_id, full_name, email, role;
    `;
    const result = await db.query(insertQuery, [displayName, cleanEmail, passwordHash, targetRole]);
    const safeUser = formatUser(result.rows[0]);

    const token = jwt.sign(
      {
        id: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
        name: safeUser.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      token,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const cleanEmail = (email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Email and password are required.'
        }
      });
    }

    const result = await db.query(
      'SELECT user_id, full_name, email, password_hash, role FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.'
        }
      });
    }

    const user = result.rows[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.'
        }
      });
    }

    const safeUser = formatUser(user);
    const token = jwt.sign(
      {
        id: safeUser.id,
        email: safeUser.email,
        role: safeUser.role,
        name: safeUser.name
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      token,
      user: safeUser
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;