'use strict';

const jwt = require('jsonwebtoken');

let securityConfig = {};
try {
  securityConfig = require('../config/Database');
  securityConfig = require('../config/Security');
} catch {
  try {
    securityConfig = require('../config/Security');
  } catch {
    securityConfig = {};
  }
}

const JWT_SECRET = process.env.JWT_SECRET || securityConfig.JWT_SECRET || securityConfig.jwtSecret || 'civic-connect-super-secret-key-2026';

function verifyAndExtractUser(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  let token = null;

  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      token = authHeader.trim();
    }
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication token required.'
      }
    });
  }

  const decoded = verifyAndExtractUser(token);
  if (!decoded) {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Provided authentication token is invalid or expired.'
      }
    });
  }

  req.user = {
    ...decoded,
    id: decoded.id || decoded.user_id || decoded.userId,
    user_id: decoded.user_id || decoded.id || decoded.userId,
    role: (decoded.role || 'citizen').toLowerCase()
  };

  next();
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required.' }
      });
    }

    const currentRole = (req.user.role || '').toLowerCase();
    const isAllowed = allowedRoles.some((r) => r.toLowerCase() === currentRole);

    if (!isAllowed) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Access denied for your role.' }
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  requireAuth: authenticateToken,
  requireRoles,
  JWT_SECRET
};