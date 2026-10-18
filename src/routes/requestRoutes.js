'use strict';

const express = require('express');
const controller = require('../controllers/requestController');
const asyncHandler = require('../middleware/asyncHandler');
const { requireAuth, requireRoles } = require('../middleware/auth');

const router = express.Router();
const staffOnly = requireRoles('Staff', 'Supervisor', 'Admin');

router.use(requireAuth);

router.post('/', requireRoles('Citizen'), asyncHandler(controller.createRequest));
router.get('/', staffOnly, asyncHandler(controller.listQueue));
// Fixed paths must be registered before '/:id' or they would be read as an id.
router.get('/suburbs', staffOnly, asyncHandler(controller.listSuburbs));
router.get('/:id', asyncHandler(controller.getRequestById));
router.patch('/:id/assign', staffOnly, asyncHandler(controller.assignRequest));
router.patch('/:id/status', staffOnly, asyncHandler(controller.updateRequestStatus));

module.exports = router;
