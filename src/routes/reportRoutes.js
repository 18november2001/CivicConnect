'use strict';

const express = require('express');
const { summary, exportReport } = require('../controllers/reportController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRoles('Supervisor', 'Admin'));
router.get('/summary', asyncHandler(summary));
router.get('/export', asyncHandler(exportReport));

module.exports = router;
