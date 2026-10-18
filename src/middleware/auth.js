'use strict';

const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/security');

/** Error body shape shared by every endpoint: { error: { code, message, violations? } }. */
function errorBody(code, message, violations) {
  return { error: { code, message, ...(violations ? { violations } : {}) } };
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(errorBody('UNAUTHENTICATED', 'Bearer token is required'));
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, getJwtSecret());
    return next();
  } catch {
    return res.status(401).json(errorBody('UNAUTHENTICATED', 'Invalid or expired token'));
  }
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res
        .status(403)
        .json(errorBody('FORBIDDEN', 'Insufficient permissions for this action'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRoles, errorBody };
