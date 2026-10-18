'use strict';

const crypto = require('crypto');

const DEV_FALLBACK_SECRET = 'civicconnect-dev-secret-key-32chars';

/**
 * The JWT signing secret. A hard-coded fallback is tolerated for local
 * development and tests only; in production a missing secret is a startup error
 * rather than a silently forgeable token.
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set when NODE_ENV=production.');
  }
  return DEV_FALLBACK_SECRET;
}

/**
 * Constant-time string comparison (hashes first so lengths never leak).
 */
function safeEqual(a, b) {
  const digest = (value) => crypto.createHash('sha256').update(String(value)).digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

/** The shared code municipal HR gives new staff. Unset means staff sign-up is closed. */
function getStaffRegistrationCode() {
  return process.env.STAFF_REGISTRATION_CODE || '';
}

module.exports = { getJwtSecret, safeEqual, getStaffRegistrationCode };
