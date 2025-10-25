// app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
require('./jobsCron'); // path to your cron file

// Ensure uploads/resumes directory exists
const uploadDir = path.join(__dirname, 'uploads/resumes');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('Created uploads/resumes directory');
}



// Import database connection and models
const { sequelize } = require('./models');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const suggestRoutes = require('./routes/suggest');
const jobSearchRoutes = require('./routes/jobRoutes'); 
const applicationRoutes = require('./routes/application');
const profileRoutes = require('./routes/profile');
const bookmarkRoutes = require('./routes/bookmark');
const passwordRoutes = require('./routes/passwordRoutes');
const companyRoutes = require('./routes/companyRoutes');
const jobseekerRoutes = require('./routes/jobseeker.routes');
const emailRoutes = require("./routes/emailRoutes");
const notificationsRouter = require('./routes/notificationRoutes');
const noteRoutes = require('./routes/noteRoutes');
const recommendationRoutes = require('./routes/recommendations');
const resumeBuilderRoutes = require('./routes/resumeBuilder'); 
const broadcastRoutes = require('./routes/broadcasts');
const messageRoutes = require('./routes/messages'); 

// Create Express app
const app = express();

// Middlewar

// CORS configuration with environment variables
const allowedOrigins = [
  process.env.FRONTEND_URL
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: allowedOrigins,
  credentials: true,                 // allow cookies/credentials
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(helmet());
app.use(express.json());

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', suggestRoutes);
app.use('/api/jobs', jobSearchRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/admin', require('./routes/admin'));
app.use('/api/password', passwordRoutes); 
app.use('/api', companyRoutes);
app.use('/api/jobseeker', jobseekerRoutes);
app.use("/api/emails", emailRoutes);
app.use('/api/notifications', notificationsRouter); 
app.use('/api/notes', noteRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/resume-builder', resumeBuilderRoutes);
app.use('/api/broadcasts', broadcastRoutes);
app.use('/api/messages', messageRoutes);
// Health check endpoint
app.get('/', (_, res) => res.status(200).json({ status: 'ok', message: 'Job Portal API is running' }));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use('/api', profileRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Database connection and server start
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    
    // Sync database models
    if (process.env.NODE_ENV !== 'test') {
      await sequelize.sync();
      console.log('Database synchronized');
    }
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database:', error);
    process.exit(1);
  }
};

// Only start the server if this file is run directly (not when imported for tests)
if (require.main === module) {
  startServer();
}

module.exports = app;// Export for testing
