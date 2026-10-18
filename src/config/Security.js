'use strict';
 
require('dotenv').config();
 
const JWT_SECRET = process.env.JWT_SECRET || 'civic-connect-super-secret-key-2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
 
module.exports = {
  JWT_SECRET,
  jwtSecret: JWT_SECRET,
  JWT_EXPIRES_IN,
  jwtExpiresIn: JWT_EXPIRES_IN,
  BCRYPT_SALT_ROUNDS,
  saltRounds: BCRYPT_SALT_ROUNDS,
  corsOptions: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }
};
 