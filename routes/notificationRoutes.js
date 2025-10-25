const express = require("express");
const router = express.Router();
const { Notification } = require("../models");
const { Op } = require("sequelize");

// Constants for pagination
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;

// ✅ Get all notifications for a user with pagination
// GET /:userId?page=<page>&limit=<limit>
// Returns: { notifications: Array, hasMore: Boolean }
router.get("/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || DEFAULT_PAGE;
    const limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
    const offset = (page - 1) * limit;

    const { count, rows } = await Notification.findAndCountAll({
      where: { user_id: userId },
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    res.json({
      notifications: rows,
      hasMore: offset + rows.length < count,
    });
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications", details: err.message });
  }
});

// ✅ Get unread notification count for a user
// GET /unread-count/:userId
// Returns: { count: Number }
router.get("/unread-count/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const count = await Notification.count({
      where: { 
        user_id: userId,
        seen: false
      }
    });
    res.json({ count });
  } catch (err) {
    console.error("Error fetching unread notification count:", err);
    res.status(500).json({ error: "Failed to fetch unread notification count", details: err.message });
  }
});

// ✅ Get single notification by ID
// GET /single/:id
// Returns: Notification object
router.get("/single/:id", async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json(notification);
  } catch (err) {
    console.error("Error fetching notification:", err);
    res.status(500).json({ error: "Failed to fetch notification", details: err.message });
  }
});

// ✅ Create a new notification
// POST /
// Body: { user_id, message, type, action_url, action_text }
// Returns: Created Notification object
router.post("/", async (req, res) => {
  try {
    const { user_id, message, type, action_url, action_text } = req.body;

    // Basic validation
    if (!user_id || !message) {
      return res.status(400).json({ error: "user_id and message are required" });
    }

    const notification = await Notification.create({
      user_id,
      message,
      type: type || "info",
      action_url,
      action_text,
      read: false,
    });
    res.status(201).json(notification);
  } catch (err) {
    console.error("Error creating notification:", err);
    res.status(500).json({ error: "Failed to create notification", details: err.message });
  }
});


router.put("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findByPk(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    notification.seen = true;
    await notification.save();
    res.json({ success: true, notification });
  } catch (err) {
    console.error("Error marking notification as seen:", err);
    res.status(500).json({ error: "Failed to mark notification as seen", details: err.message });
  }
});

// Mark multiple notifications as seen
router.put("/bulk-read", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array" });
    }

    await Notification.update(
      { seen: true },
      { where: { id: { [Op.in]: ids } } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error marking notifications as seen:", err);
    res.status(500).json({ error: "Failed to mark notifications as seen", details: err.message });
  }
});

// ✅ Delete a notification
// DELETE /:id
// Returns: { success: Boolean }
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Notification.destroy({
      where: { id: req.params.id },
    });
    if (!deleted) {
      return res.status(404).json({ error: "Notification not found" });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting notification:", err);
    res.status(500).json({ error: "Failed to delete notification", details: err.message });
  }
});

// ✅ Delete all notifications for a user
// DELETE /user/:userId
// Returns: { success: Boolean }
router.delete("/user/:userId", async (req, res) => {
  try {
    await Notification.destroy({
      where: { user_id: req.params.userId },
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting user notifications:", err);
    res.status(500).json({ error: "Failed to delete user notifications", details: err.message });
  }
});

module.exports = router;