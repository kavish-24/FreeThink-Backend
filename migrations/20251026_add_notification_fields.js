const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add new columns to notifications table
    await queryInterface.addColumn('notifications', 'type', {
      type: DataTypes.STRING,
      defaultValue: 'info',
      allowNull: false,
    });

    await queryInterface.addColumn('notifications', 'action_url', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('notifications', 'action_text', {
      type: DataTypes.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('notifications', 'read', {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the columns if we need to rollback
    await queryInterface.removeColumn('notifications', 'type');
    await queryInterface.removeColumn('notifications', 'action_url');
    await queryInterface.removeColumn('notifications', 'action_text');
    await queryInterface.removeColumn('notifications', 'read');
  }
};