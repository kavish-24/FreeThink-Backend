const { Broadcast, User, Job, JobApplication } = require('../models');
const { Op } = require('sequelize');

const broadcastController = {
  // Create a new broadcast
  createBroadcast: async (req, res) => {
    try {
      const { title, content, targetAudience, targetJobId, targetUserIds, scheduledAt, expiryDate, priority } = req.body;
      const senderId = req.user.id;

      // Validate required fields
      if (!title || !content || !targetAudience) {
        return res.status(400).json({
          success: false,
          message: 'Title, content, and target audience are required'
        });
      }

      // Calculate total recipients based on target audience
      let totalRecipients = 0;
      if (targetAudience === 'all_candidates') {
        totalRecipients = await User.count({ where: { role: 'job_seeker' } });
      } else if (targetAudience === 'all_employers') {
        totalRecipients = await User.count({ where: { role: 'company' } });
      } else if (targetAudience === 'specific_job' && targetJobId) {
        // Count applicants for specific job
        totalRecipients = await User.count({
          include: [{
            model: JobApplication,
            where: { job_id: targetJobId }
          }]
        });
      } else if (targetAudience === 'custom' && targetUserIds) {
        totalRecipients = targetUserIds.length;
      }

      const broadcast = await Broadcast.create({
        senderId,
        title,
        content,
        targetAudience,
        targetJobId,
        targetUserIds,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        priority: priority || 'medium',
        totalRecipients,
        status: scheduledAt ? 'scheduled' : 'sent',
        sentAt: scheduledAt ? null : new Date()
      });

      res.status(201).json({
        success: true,
        broadcast,
        message: 'Broadcast created successfully'
      });
    } catch (error) {
      console.error('Error creating broadcast:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create broadcast',
        error: error.message
      });
    }
  },

  // Get all broadcasts for a user
  getBroadcasts: async (req, res) => {
    try {
      const senderId = req.user.id;
      const { page = 1, limit = 20, status } = req.query;

      const whereClause = { senderId };
      if (status) {
        whereClause.status = status;
      }

      const offset = (page - 1) * limit;

      const broadcasts = await Broadcast.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name', 'email']
          },
          {
            model: Job,
            as: 'targetJob',
            attributes: ['id', 'title', 'location'],
            required: false
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset
      });

      res.json({
        success: true,
        broadcasts: broadcasts.rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(broadcasts.count / limit),
          totalBroadcasts: broadcasts.count
        }
      });
    } catch (error) {
      console.error('Error fetching broadcasts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch broadcasts',
        error: error.message
      });
    }
  },

  // Get active broadcasts for dashboard
  getActiveBroadcasts: async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      let whereClause = {
        status: 'sent',
        [Op.or]: [
          { expiryDate: null },
          { expiryDate: { [Op.gt]: new Date() } }
        ]
      };

      // Filter based on target audience
      if (userRole === 'job_seeker') {
        whereClause[Op.or] = [
          { targetAudience: 'all_candidates' },
          { 
            targetAudience: 'custom',
            targetUserIds: { [Op.contains]: [userId] }
          }
        ];
      } else if (userRole === 'company') {
        whereClause[Op.or] = [
          { targetAudience: 'all_employers' },
          { 
            targetAudience: 'custom',
            targetUserIds: { [Op.contains]: [userId] }
          }
        ];
      }

      const broadcasts = await Broadcast.findAll({
        where: whereClause,
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name']
          }
        ],
        order: [['priority', 'DESC'], ['createdAt', 'DESC']],
        limit: 10
      });

      res.json({
        success: true,
        broadcasts
      });
    } catch (error) {
      console.error('Error fetching active broadcasts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch active broadcasts',
        error: error.message
      });
    }
  },

  // Update broadcast
  updateBroadcast: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      const updates = req.body;

      const broadcast = await Broadcast.findOne({
        where: { id, senderId: userId }
      });

      if (!broadcast) {
        return res.status(404).json({
          success: false,
          message: 'Broadcast not found'
        });
      }

      if (broadcast.status === 'sent') {
        return res.status(400).json({
          success: false,
          message: 'Cannot update a broadcast that has already been sent'
        });
      }

      await broadcast.update(updates);

      res.json({
        success: true,
        broadcast,
        message: 'Broadcast updated successfully'
      });
    } catch (error) {
      console.error('Error updating broadcast:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update broadcast',
        error: error.message
      });
    }
  },

  // Delete broadcast
  deleteBroadcast: async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const broadcast = await Broadcast.findOne({
        where: { id, senderId: userId }
      });

      if (!broadcast) {
        return res.status(404).json({
          success: false,
          message: 'Broadcast not found'
        });
      }

      if (broadcast.status === 'sent') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete a broadcast that has already been sent'
        });
      }

      await broadcast.destroy();

      res.json({
        success: true,
        message: 'Broadcast deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting broadcast:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete broadcast',
        error: error.message
      });
    }
  },

  // Mark broadcast as read (for analytics)
  markBroadcastAsRead: async (req, res) => {
    try {
      const { id } = req.params;

      const broadcast = await Broadcast.findByPk(id);
      if (!broadcast) {
        return res.status(404).json({
          success: false,
          message: 'Broadcast not found'
        });
      }

      await broadcast.increment('readCount');

      res.json({
        success: true,
        message: 'Broadcast marked as read'
      });
    } catch (error) {
      console.error('Error marking broadcast as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark broadcast as read',
        error: error.message
      });
    }
  }
};

module.exports = broadcastController;