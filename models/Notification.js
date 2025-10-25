// models/Notification.js
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        defaultValue: 'info',
        allowNull: false,
      },
      action_url: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      action_text: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      seen: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      read: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "notifications",
      timestamps: false,
    }
  );

  return Notification;
};
