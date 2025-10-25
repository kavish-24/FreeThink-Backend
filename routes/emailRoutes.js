const express = require("express");
const router = express.Router();
const sendEmail = require("../utils/sendEmail");
const { User } = require("../models");
const { createNotification } = require("../utils/notificationService");

// POST /emails/send
router.post("/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Recipient (to) is required" });
    }

    // send single email
    await sendEmail({ to, subject, text, html });

    // create notification if user exists
    const user = await User.findOne({ where: { email: to } });
    if (user) {
      await createNotification(user.id, "You have received a new email from the company.", 'email', null, null, req.io);
    }

    res.json({ message: "Email sent successfully" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ error: "Failed to send email" });
  }
});

// POST /emails/bulk
router.post("/bulk", async (req, res) => {
  try {
    const { recipients, subject, text, html } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "Recipients array is required" });
    }

    // Send emails in bulk
    const results = await Promise.allSettled(
      recipients.map(email =>
        sendEmail({ to: email, subject, text, html })
      )
    );

    // Create notifications for each valid user
    for (let email of recipients) {
      const user = await User.findOne({ where: { email } });
      if (user) {
        await createNotification(user.id, "You have received a new email from the company.", 'email', null, null, req.io);
      }
    }

    res.json({
      message: "Bulk email process finished",
      results,
    });
  } catch (error) {
    console.error("Error sending bulk emails:", error);
    res.status(500).json({ error: "Failed to send bulk emails" });
  }
});

module.exports = router;
