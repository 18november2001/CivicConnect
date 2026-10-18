'use strict';

const express = require('express');
const { listStaff } = require('../controllers/userController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRoles('Staff', 'Supervisor', 'Admin'), asyncHandler(listStaff));

module.exports = router;
