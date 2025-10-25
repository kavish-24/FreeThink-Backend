const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  conversationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'conversationId',
    references: {
      model: 'conversations',
      key: 'id'
    }
  },
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'senderId',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  receiverId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'receiverId',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  messageType: {
    type: DataTypes.ENUM('text', 'file', 'image', 'notification'),
    defaultValue: 'text',
    field: 'messageType'
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'isRead'
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'readAt'
  },
  attachmentUrl: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'attachmentUrl'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  tableName: 'messages',
  timestamps: true,
  underscored: false,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['conversationId']
    },
    {
      fields: ['senderId']
    },
    {
      fields: ['receiverId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = Message;