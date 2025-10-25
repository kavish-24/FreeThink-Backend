const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { isLoggedIn } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(isLoggedIn);

// Conversation routes
router.get('/conversations', messageController.getConversations);
router.post('/conversations', messageController.createConversation);
router.delete('/conversations/:conversationId', messageController.deleteConversation);

// Message routes
router.get('/conversations/:conversationId/messages', messageController.getMessages);
router.post('/messages', messageController.sendMessage);
router.put('/conversations/:conversationId/read', messageController.markAsRead);
router.get('/unread-count', messageController.getUnreadCount);

module.exports = router;