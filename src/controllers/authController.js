'use strict';

const db = require('../config/database');
const argon2 = require('@node-rs/argon2');
const jwt = require('jsonwebtoken');
const { getJwtSecret, getStaffRegistrationCode, safeEqual } = require('../config/security');
const { validateCredentials, validateStaffSignup } = require('../domain/validation/inputValidation');
const { toUser } = require('../presentation/mappers');
const { errorBody } = require('../middleware/auth');

const USER_COLUMNS = 'user_id, full_name, email, password_hash, role, department';

// Verified against when the email is unknown, so "no such user" and "wrong
// password" take about the same time (limits account enumeration).
let dummyHashPromise = null;
const dummyHash = () => {
  dummyHashPromise = dummyHashPromise || argon2.hash('not-a-real-password');
  return dummyHashPromise;
};

function issueSession(row) {
  const user = toUser(row);
  const token = jwt.sign(
    {
      sub: user.id,
      fullName: user.name,
      email: user.email,
      role: user.role,
      department: user.department || null,
    },
    getJwtSecret(),
    { expiresIn: '8h' },
  );
  return { token, user };
}

async function login(req, res, next) {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(400).json(errorBody('BAD_REQUEST', 'Email and password are required'));
  }

  try {
    const { rows } = await db.query(
      `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(email) = LOWER($1)`,
      [email.trim()],
    );
    const user = rows[0];
    const valid = await argon2.verify(user ? user.password_hash : await dummyHash(), password);
    if (!user || !valid) {
      return res.status(401).json(errorBody('INVALID_CREDENTIALS', 'Invalid email or password'));
    }
    return res.status(200).json(issueSession(user));
  } catch (err) {
    return next(err);
  }
}

async function createAccount(res, next, { fullName, email, password, role, department }) {
  try {
    const passwordHash = await argon2.hash(password);
    const { rows } = await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, department)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${USER_COLUMNS}`,
      [fullName.trim(), email.trim().toLowerCase(), passwordHash, role, department || null],
    );
    return res.status(201).json(issueSession(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res
        .status(409)
        .json(errorBody('EMAIL_TAKEN', 'An account with this email already exists.'));
    }
    return next(err);
  }
}

/** Public citizen sign-up. Always creates a Citizen; the role is never taken from the body. */
async function register(req, res, next) {
  const body = req.body || {};
  const violations = validateCredentials(body);
  if (violations.length) {
    return res.status(400).json(errorBody('VALIDATION_FAILED', violations[0], violations));
  }
  return createAccount(res, next, { ...body, role: 'Citizen', department: null });
}

/**
 * Staff sign-up. Gated by STAFF_REGISTRATION_CODE (shared out-of-band by the
 * municipality). If the code is not configured the endpoint is closed. Always
 * creates role 'Staff'; Supervisors and Admins are created with
 * scripts/createUser.js so nobody can self-promote.
 */
async function registerStaff(req, res, next) {
  const expected = getStaffRegistrationCode();
  if (!expected) {
    return res
      .status(403)
      .json(errorBody('STAFF_SIGNUP_DISABLED', 'Staff registration is not enabled.'));
  }

  const body = req.body || {};
  const violations = validateStaffSignup(body);
  if (violations.length) {
    return res.status(400).json(errorBody('VALIDATION_FAILED', violations[0], violations));
  }
  if (!safeEqual(body.staffCode.trim(), expected)) {
    return res
      .status(403)
      .json(errorBody('INVALID_STAFF_CODE', 'The staff registration code is not valid.'));
  }
  return createAccount(res, next, { ...body, role: 'Staff' });
}

module.exports = { login, register, registerStaff };
