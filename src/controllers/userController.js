'use strict';

const db = require('../config/database');
const { toUser } = require('../presentation/mappers');
const { errorBody } = require('../middleware/auth');

/** GET /users?role=staff - people a request can be assigned to. */
async function listStaff(req, res) {
  if (req.query.role !== 'staff') {
    return res.status(400).json(errorBody('BAD_REQUEST', "Only role=staff is supported."));
  }
  const { rows } = await db.query(
    `SELECT user_id, full_name, email, role, department
       FROM users WHERE role IN ('Staff', 'Supervisor') ORDER BY full_name`,
  );
  return res.json(rows.map(toUser));
}

module.exports = { listStaff };
