'use strict';

const express = require('express');
const { listMine } = require('../controllers/requestController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/requests', requireAuth, asyncHandler(listMine));

module.exports = router;
