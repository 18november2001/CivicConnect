'use strict';

const db = require('../config/database');
const argon2 = require('@node-rs/argon2');
const jwt = require('jsonwebtoken');

async function login(req, res, next) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'BadRequest',
      message: 'Email and password are required',
    });
  }

  try {
    const result = await db.query(
      `SELECT user_id, full_name, email, password_hash, role, department 
       FROM users 
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    const token = jwt.sign(
      {
        sub: user.user_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
      process.env.JWT_SECRET || 'civicconnect-dev-secret-key-32chars',
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      token,
      user: {
        id: user.user_id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
};
