// utils/notificationService.js
const { Notification } = require("../models");

async function createNotification(userId, message, type = 'info', action_url = null, action_text = null, io = null) {
  const notification = await Notification.create({
    user_id: userId,
    message,
    type: type || 'info',
    action_url,
    action_text,
    seen: false,
  });

  // Emit real-time WebSocket event if Socket.IO is available
  if (io) {
    io.emit('new_notification', {
      id: notification.id,
      userId: notification.user_id,
      message: notification.message,
      type: notification.type,
      action_url: notification.action_url,
      action_text: notification.action_text,
      createdAt: notification.createdAt
    });
  }

  return notification;
}

module.exports = { createNotification };
