const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Broadcast = sequelize.define('Broadcast', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
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
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  targetAudience: {
    type: DataTypes.ENUM('all_candidates', 'specific_job', 'all_employers', 'custom'),
    allowNull: false,
    field: 'targetAudience'
  },
  targetJobId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'targetJobId',
    references: {
      model: 'jobs',
      key: 'id'
    }
  },
  targetUserIds: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'targetUserIds'
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduledAt'
  },
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expiryDate'
  },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'sent', 'expired'),
    defaultValue: 'draft'
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'sentAt'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high'),
    defaultValue: 'medium'
  },
  readCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'readCount'
  },
  totalRecipients: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'totalRecipients'
  }
}, {
  tableName: 'broadcasts',
  timestamps: true,
  underscored: false,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      fields: ['senderId']
    },
    {
      fields: ['targetJobId']
    },
    {
      fields: ['scheduledAt']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = Broadcast;