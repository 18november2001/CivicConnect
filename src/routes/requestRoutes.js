const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');

router.post('/', requestController.createRequest);
router.get('/', requestController.getRequests);

router.get('/:id', requestController.getRequestById);
router.patch('/:id/status', requestController.updateRequestStatus);

module.exports = router;