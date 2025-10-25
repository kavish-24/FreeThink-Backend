const { sequelize } = require('../config/database');
const User = require('./User');
const CompanyProfile = require('./CompanyProfile');
const JobSeekerProfile = require('./JobSeekerProfile');
const Job = require('./Job');
const { DataTypes } = require('sequelize');
const Bookmark = require('./Bookmark')(sequelize, DataTypes);
const AdminLog = require('./AdminLog');
const JobApplication = require('./JobApplication')(sequelize);
const UserEducation = require('./UserEducation');
const UserExperience = require('./UserExperience');
const Notification = require("./Notification")(sequelize, DataTypes); // <-- add this
const Note = require("./Note")(sequelize, DataTypes);
const Broadcast = require('./Broadcast');
const Conversation = require('./Conversation');
const Message = require('./Message');
// associations
User.hasMany(Notification, { foreignKey: "user_id", as: "notifications" });
Notification.belongsTo(User, { foreignKey: "user_id", as: "user" });


// JobApplication associations
Job.hasMany(JobApplication, { foreignKey: 'job_id', as: 'applications' });
JobApplication.belongsTo(Job, { foreignKey: 'job_id', as: 'job' });

User.hasMany(JobApplication, { foreignKey: 'job_seeker_id', as: 'jobApplications' });
JobApplication.belongsTo(User, { foreignKey: 'job_seeker_id', as: 'jobSeeker' });
// Job ↔ Note (one-to-many)
Job.hasMany(Note, { foreignKey: "job_id", as: "notes" });
Note.belongsTo(Job, { foreignKey: "job_id", as: "job" });

// User ↔ Note (one-to-many)
User.hasMany(Note, { foreignKey: "user_id", as: "notes" });
Note.belongsTo(User, { foreignKey: "user_id", as: "applicant" });
 
// Define associations
// User to CompanyProfile (One-to-One)
User.hasOne(CompanyProfile, {
  foreignKey: 'userId',
  as: 'companyProfile',
  onDelete: 'CASCADE',
  hooks: true
});

CompanyProfile.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// User to JobSeekerProfile (One-to-One)
User.hasOne(JobSeekerProfile, {
  foreignKey: 'userId',
  as: 'jobSeekerProfile',
  onDelete: 'CASCADE',
  hooks: true
});

JobSeekerProfile.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});
// JobSeekerProfile to Education (One-to-Many)
JobSeekerProfile.hasMany(UserEducation, {
  foreignKey: 'user_id',
  as: 'education',
  onDelete: 'CASCADE',
});
UserEducation.belongsTo(JobSeekerProfile, {
  foreignKey: 'user_id',
  as: 'jobSeeker',
});

// JobSeekerProfile to Experience (One-to-Many)
JobSeekerProfile.hasMany(UserExperience, {
  foreignKey: 'user_id',
  as: 'experience',
  onDelete: 'CASCADE',
});
UserExperience.belongsTo(JobSeekerProfile, {
  foreignKey: 'user_id',
  as: 'jobSeeker',
});

// Set up associations for AdminLog (One-to-Many)
User.hasMany(AdminLog, {
  foreignKey: 'adminId',
  as: 'adminLogs',
  onDelete: 'CASCADE'
});

AdminLog.belongsTo(User, {
  foreignKey: 'adminId',
  as: 'admin'
});
// Bookmark belongs to Job
Bookmark.belongsTo(Job, {
  foreignKey: 'job_id',
  as: 'job'
});

// Job includes CompanyProfile via User → This is optional chaining later
Job.belongsTo(User, {
  foreignKey: 'company_id',
  as: 'companyUser'
});
User.hasMany(UserExperience, {
  foreignKey: 'user_id',
  as: 'experiences',
  onDelete: 'CASCADE',
});

UserExperience.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
});

// Broadcast associations
User.hasMany(Broadcast, {
  foreignKey: 'senderId',
  as: 'broadcasts',
  onDelete: 'CASCADE'
});

Broadcast.belongsTo(User, {
  foreignKey: 'senderId',
  as: 'sender'
});

Job.hasMany(Broadcast, {
  foreignKey: 'targetJobId',
  as: 'broadcasts',
  onDelete: 'SET NULL'
});

Broadcast.belongsTo(Job, {
  foreignKey: 'targetJobId',
  as: 'targetJob'
});

// Conversation associations
User.hasMany(Conversation, {
  foreignKey: 'employerId',
  as: 'employerConversations',
  onDelete: 'CASCADE'
});

User.hasMany(Conversation, {
  foreignKey: 'jobSeekerId',
  as: 'jobSeekerConversations',
  onDelete: 'CASCADE'
});

Conversation.belongsTo(User, {
  foreignKey: 'employerId',
  as: 'employer'
});

Conversation.belongsTo(User, {
  foreignKey: 'jobSeekerId',
  as: 'jobSeeker'
});

Job.hasMany(Conversation, {
  foreignKey: 'jobId',
  as: 'conversations',
  onDelete: 'SET NULL'
});

Conversation.belongsTo(Job, {
  foreignKey: 'jobId',
  as: 'job'
});

// Message associations
Conversation.hasMany(Message, {
  foreignKey: 'conversationId',
  as: 'messages',
  onDelete: 'CASCADE'
});

Message.belongsTo(Conversation, {
  foreignKey: 'conversationId',
  as: 'conversation'
});

User.hasMany(Message, {
  foreignKey: 'senderId',
  as: 'sentMessages',
  onDelete: 'CASCADE'
});

User.hasMany(Message, {
  foreignKey: 'receiverId',
  as: 'receivedMessages',
  onDelete: 'CASCADE'
});

Message.belongsTo(User, {
  foreignKey: 'senderId',
  as: 'sender'
});

Message.belongsTo(User, {
  foreignKey: 'receiverId',
  as: 'receiver'
});

// Add lastMessage association for conversations
Conversation.hasMany(Message, {
  foreignKey: 'conversationId',
  as: 'lastMessage',
  limit: 1,
  order: [['createdAt', 'DESC']]
});


module.exports = {
  sequelize,
  User,
  CompanyProfile,
  JobSeekerProfile,
  Job,
  Bookmark,
  AdminLog,
  JobApplication,
  UserEducation,
  UserExperience,
  Notification,
  Note,
  Broadcast,
  Conversation,
  Message,
};

