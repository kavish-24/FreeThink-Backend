const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const CompanyProfile = sequelize.define('CompanyProfile', {
  userId: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id',
    },
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
  },
  companyName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'company_name',
  },
  contactNumber: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'contact_number',
  },
  status: {
  type: DataTypes.ENUM('pending', 'approved', 'rejected'),
  allowNull: false,
  defaultValue: 'pending'
},
rejectionReason: {
  type: DataTypes.TEXT,
  allowNull: true,
  field: 'rejection_reason'
},
  logo: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  website: {
    type: DataTypes.STRING(512),
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  industry: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
 positionsAvailable: {
  type: DataTypes.JSON,
  allowNull: true,
  field: 'positions_available',
},

  numberOfEmployees: { // NEW FIELD
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'number_of_employees',
  },
  submitted_at: {
  type: DataTypes.DATE,
  allowNull: false,
  defaultValue: DataTypes.NOW
}

}, {
  tableName: 'company_profiles',
  timestamps: false,
  underscored: true,
});

module.exports = CompanyProfile;
