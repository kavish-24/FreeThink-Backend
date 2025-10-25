const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  employerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'employerId',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  jobSeekerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'jobSeekerId',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  jobId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'jobId',
    references: {
      model: 'jobs',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lastMessageAt'
  },
  employerUnreadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'employerUnreadCount'
  },
  jobSeekerUnreadCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'jobSeekerUnreadCount'
  },
  status: {
    type: DataTypes.ENUM('active', 'archived', 'blocked'),
    defaultValue: 'active'
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'isDeleted'
  }
}, {
  tableName: 'conversations',
  timestamps: true,
  underscored: false,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['employerId']
    },
    {
      fields: ['jobSeekerId']
    },
    {
      fields: ['jobId']
    },
    {
      fields: ['lastMessageAt']
    },
    {
      unique: true,
      fields: ['employerId', 'jobSeekerId', 'jobId']
    }
  ]
});

module.exports = Conversation;