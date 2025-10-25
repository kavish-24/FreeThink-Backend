const express = require('express');
const router = express.Router();
const broadcastController = require('../controllers/broadcastController');
const { isLoggedIn } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(isLoggedIn);

// Broadcast routes
router.post('/', broadcastController.createBroadcast);
router.get('/', broadcastController.getBroadcasts);
router.get('/active', broadcastController.getActiveBroadcasts);
router.put('/:id', broadcastController.updateBroadcast);
router.delete('/:id', broadcastController.deleteBroadcast);
router.post('/:id/read', broadcastController.markBroadcastAsRead);

module.exports = router;