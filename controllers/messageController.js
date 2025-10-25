const { Message, Conversation, User, Job, sequelize } = require('../models');
const { Op } = require('sequelize');

const messageController = {
  // Get all conversations for a user
  getConversations: async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;
      
      let whereClause = {};
      if (userRole === 'company') {
        whereClause.employerId = userId;
      } else {
        whereClause.jobSeekerId = userId;
      }

      const conversations = await Conversation.findAll({
        where: {
          ...whereClause,
          isDeleted: false
        },
        include: [
          {
            model: User,
            as: 'employer',
            attributes: ['id', 'name', 'email']
          },
          {
            model: User,
            as: 'jobSeeker',
            attributes: ['id', 'name', 'email']
          },
          {
            model: Job,
            as: 'job',
            attributes: ['id', 'title', 'location']
          }
        ],
        order: [['lastMessageAt', 'DESC']]
      });

      // Get last message for each conversation separately
      const conversationsWithMessages = await Promise.all(
        conversations.map(async (conv) => {
          const lastMessage = await Message.findOne({
            where: { conversationId: conv.id },
            order: [['createdAt', 'DESC']],
            attributes: ['content', 'createdAt', 'senderId', 'messageType']
          });

          return {
            id: conv.id,
            title: conv.title,
            participant: userRole === 'company' ? conv.jobSeeker : conv.employer,
            job: conv.job,
            lastMessage: lastMessage || null,
            unreadCount: userRole === 'company' ? conv.employerUnreadCount : conv.jobSeekerUnreadCount,
            lastMessageAt: conv.lastMessageAt,
            status: conv.status
          };
        })
      );

      res.json({
        success: true,
        conversations: conversationsWithMessages
      });
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch conversations',
        error: error.message
      });
    }
  },

  // Get messages for a specific conversation
  getMessages: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 50 } = req.query;

      // Verify user is part of this conversation
      const conversation = await Conversation.findOne({
        where: {
          id: conversationId,
          [Op.or]: [
            { employerId: userId },
            { jobSeekerId: userId }
          ],
          isDeleted: false
        }
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied'
        });
      }

      const offset = (page - 1) * limit;
      
      const messages = await Message.findAndCountAll({
        where: { conversationId },
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Mark messages as read for the current user
      await Message.update(
        { 
          isRead: true, 
          readAt: new Date() 
        },
        {
          where: {
            conversationId,
            receiverId: userId,
            isRead: false
          }
        }
      );

      // Update unread count
      const userRole = req.user.role;
      const updateField = userRole === 'company' ? 'employerUnreadCount' : 'jobSeekerUnreadCount';
      await Conversation.update(
        { [updateField]: 0 },
        { where: { id: conversationId } }
      );

      res.json({
        success: true,
        messages: messages.rows.reverse(), // Reverse to show oldest first
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(messages.count / limit),
          totalMessages: messages.count,
          hasNextPage: offset + messages.rows.length < messages.count,
          hasPreviousPage: page > 1
        }
      });
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch messages',
        error: error.message
      });
    }
  },

  // Send a new message
  sendMessage: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { conversationId, content, messageType = 'text', attachmentUrl } = req.body;
      const senderId = req.user.id;

      // Validate input
      if (!conversationId || !content) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Conversation ID and content are required'
        });
      }

      // Verify conversation exists and user is part of it
      const conversation = await Conversation.findOne({
        where: {
          id: conversationId,
          [Op.or]: [
            { employerId: senderId },
            { jobSeekerId: senderId }
          ],
          isDeleted: false
        },
        transaction
      });

      if (!conversation) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied'
        });
      }

      // Determine receiver
      const receiverId = conversation.employerId === senderId 
        ? conversation.jobSeekerId 
        : conversation.employerId;

      // Create message
      const message = await Message.create({
        conversationId,
        senderId,
        receiverId,
        content: content.trim(),
        messageType,
        attachmentUrl
      }, { transaction });

      // Update conversation
      const userRole = req.user.role;
      const unreadField = userRole === 'company' ? 'jobSeekerUnreadCount' : 'employerUnreadCount';
      
      await Conversation.update(
        {
          lastMessageAt: new Date(),
          [unreadField]: sequelize.literal(`${unreadField} + 1`)
        },
        {
          where: { id: conversationId },
          transaction
        }
      );

      await transaction.commit();

      // Fetch the complete message with sender info
      const completeMessage = await Message.findByPk(message.id, {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['id', 'name']
          }
        ]
      });

      // Create notification for the receiver
      try {
        const { createNotification } = require('../utils/notificationService');
        const senderName = completeMessage.sender?.name || 'Unknown User';
        const notificationMessage = `New message from ${senderName}`;
        
        await createNotification(receiverId, notificationMessage, 'message', `/messages?conversation=${conversationId}`, 'View Message', req.io);
      } catch (notificationError) {
        console.warn('Failed to create notification for new message:', notificationError.message);
        // Don't fail the message send if notification fails
      }

      // Emit real-time event via WebSocket
      if (req.io) {
        req.io.to(`conversation_${conversationId}`).emit('new_message', completeMessage);
      }

      res.status(201).json({
        success: true,
        message: completeMessage
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: error.message
      });
    }
  },

  // Create or get conversation
  createConversation: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { participantId, jobId, initialMessage } = req.body;
      const userId = req.user.id;
      const userRole = req.user.role;

      // Validate input
      if (!participantId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Participant ID is required'
        });
      }

      if (userId === participantId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cannot create conversation with yourself'
        });
      }

      // Verify participant exists
      const participant = await User.findByPk(participantId);
      if (!participant) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Participant not found'
        });
      }

      // Determine employer and job seeker
      let employerId, jobSeekerId;
      if (userRole === 'company') {
        employerId = userId;
        jobSeekerId = participantId;
      } else {
        employerId = participantId;
        jobSeekerId = userId;
      }

      // Check if conversation already exists
      let conversation = await Conversation.findOne({
        where: {
          employerId,
          jobSeekerId,
          jobId: jobId || null,
          isDeleted: false
        },
        transaction
      });

      if (!conversation) {
        // Create new conversation
        let title = 'General Inquiry';
        if (jobId) {
          const job = await Job.findByPk(jobId);
          title = job ? `Regarding: ${job.title}` : 'Regarding Job Application';
        }

        conversation = await Conversation.create({
          employerId,
          jobSeekerId,
          jobId: jobId || null,
          title,
          lastMessageAt: new Date()
        }, { transaction });
      }

      // Send initial message if provided
      if (initialMessage && initialMessage.trim()) {
        const receiverId = userRole === 'company' ? jobSeekerId : employerId;
        
        const message = await Message.create({
          conversationId: conversation.id,
          senderId: userId,
          receiverId,
          content: initialMessage.trim(),
          messageType: 'text'
        }, { transaction });

        // Update unread count
        const unreadField = userRole === 'company' ? 'jobSeekerUnreadCount' : 'employerUnreadCount';
        await Conversation.update(
          { 
            [unreadField]: sequelize.literal(`${unreadField} + 1`),
            lastMessageAt: new Date()
          },
          { 
            where: { id: conversation.id },
            transaction
          }
        );

        // Create notification for the receiver of the initial message
        try {
          const { createNotification } = require('../utils/notificationService');
          const sender = await User.findByPk(userId, { attributes: ['name'] });
          const senderName = sender?.name || 'Unknown User';
          const notificationMessage = `New message from ${senderName}`;
          
          await createNotification(receiverId, notificationMessage, 'message', `/messages?conversation=${conversation.id}`, 'View Message', req.io);
        } catch (notificationError) {
          console.warn('Failed to create notification for initial message:', notificationError.message);
          // Don't fail the conversation creation if notification fails
        }
      }

      await transaction.commit();

      res.status(201).json({
        success: true,
        conversation: {
          id: conversation.id,
          title: conversation.title,
          participantId,
          jobId: conversation.jobId
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating conversation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create conversation',
        error: error.message
      });
    }
  },

  // Delete conversation (soft delete)
  deleteConversation: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;

      const conversation = await Conversation.findOne({
        where: {
          id: conversationId,
          [Op.or]: [
            { employerId: userId },
            { jobSeekerId: userId }
          ]
        }
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied'
        });
      }

      await Conversation.update(
        { isDeleted: true },
        { where: { id: conversationId } }
      );

      res.json({
        success: true,
        message: 'Conversation deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete conversation',
        error: error.message
      });
    }
  },

  // Mark messages as read
  markAsRead: async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.id;

      // Verify user is part of this conversation
      const conversation = await Conversation.findOne({
        where: {
          id: conversationId,
          [Op.or]: [
            { employerId: userId },
            { jobSeekerId: userId }
          ],
          isDeleted: false
        }
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Conversation not found or access denied'
        });
      }

      await Message.update(
        { 
          isRead: true, 
          readAt: new Date() 
        },
        {
          where: {
            conversationId,
            receiverId: userId,
            isRead: false
          }
        }
      );

      // Update unread count
      const userRole = req.user.role;
      const updateField = userRole === 'company' ? 'employerUnreadCount' : 'jobSeekerUnreadCount';
      await Conversation.update(
        { [updateField]: 0 },
        { where: { id: conversationId } }
      );

      // Emit real-time event
      if (req.io) {
        req.io.to(`conversation_${conversationId}`).emit('message_read', {
          conversationId,
          userId
        });
      }

      res.json({
        success: true,
        message: 'Messages marked as read'
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark messages as read',
        error: error.message
      });
    }
  },

  // Get unread message count
  getUnreadCount: async (req, res) => {
    try {
      const userId = req.user.id;
      const userRole = req.user.role;

      let whereClause = {};
      if (userRole === 'company') {
        whereClause.employerId = userId;
      } else {
        whereClause.jobSeekerId = userId;
      }

      const unreadField = userRole === 'company' ? 'employerUnreadCount' : 'jobSeekerUnreadCount';

      const result = await Conversation.sum(unreadField, {
        where: {
          ...whereClause,
          isDeleted: false
        }
      });

      res.json({
        success: true,
        unreadCount: result || 0
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: error.message
      });
    }
  }
};

module.exports = messageController;