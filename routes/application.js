const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { isLoggedIn } = require('../middleware/authMiddleware');
const { applyJobValidator } = require('../validations/applicationValidators');
const { validate } = require('../middleware/validationMiddleware');
const { 
  applyToJob, 
  getMyApplications, 
  getCompanyCandidates,
  updateApplicationStatus,
  getApplicationAnalytics,
  checkApplicationStatus
} = require('../controllers/jobApplicationController');

// Add logging wrapper around middleware to detect hangs
const logMiddleware = (name, middleware) => {
  return async (req, res, next) => {
    console.log(`[Middleware] ${name} start`);
    try {
      if (typeof middleware === 'function') {
        const result = middleware(req, res, (error) => {
          if (error) {
            console.log(`[Middleware] ${name} error:`, error.message);
            return next(error);
          }
          console.log(`[Middleware] ${name} end`);
          next();
        });
        
        // Handle async middleware
        if (result && typeof result.then === 'function') {
          await result;
        }
      } else {
        console.log(`[Middleware] ${name} end`);
        next();
      }
    } catch (error) {
      console.log(`[Middleware] ${name} error:`, error.message);
      next(error);
    }
  };
};

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'File too large. Maximum size allowed is 5MB.'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Too many files. Maximum 2 files allowed.'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Unexpected file field. Only "resume" and "coverLetter" fields are allowed.'
        });
      default:
        return res.status(400).json({
          success: false,
          message: `Upload error: ${error.message}`
        });
    }
  }
  
  if (error.message && (
    error.message.includes('Invalid file type') || 
    error.message.includes('Only PDF, DOC, DOCX')
  )) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 2 // Maximum 2 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF, DOC, DOCX, and TXT files are allowed.`), false);
    }
  }
});

// Apply to job route
router.post('/apply',
  logMiddleware('isLoggedIn', isLoggedIn),
  logMiddleware('upload.fields', upload.fields([
    { name: 'resume', maxCount: 1 },
    { name: 'coverLetter', maxCount: 1 }
  ])),
  handleMulterError,
  logMiddleware('validation', async (req, res, next) => {
    try {
      if (applyJobValidator && Array.isArray(applyJobValidator)) {
        await Promise.all(applyJobValidator.map(v => v.run(req)));
      }
      next();
    } catch (error) {
      next(error);
    }
  }),
  logMiddleware('validate', validate([])),
  logMiddleware('applyToJob', applyToJob)
);

// Get user's job applications
router.get('/my-applications', isLoggedIn, getMyApplications);

// Get company candidates (for employers)
router.get('/company-candidates/:companyId',
  // Note: You might want to add authentication for employers here
  logMiddleware('getCompanyCandidates', getCompanyCandidates)
);

// Update application status
router.put('/:applicationId/status',
  // Note: You might want to add authentication for employers here
  logMiddleware('updateApplicationStatus', updateApplicationStatus)
);

// Get specific application details
router.get('/applications/:id',
  logMiddleware('isLoggedIn', isLoggedIn),
  async (req, res) => {
    try {
      const { JobApplication, Job } = require('../models');
      const applicationId = parseInt(req.params.id);

      if (isNaN(applicationId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid application ID format'
        });
      }

      const application = await JobApplication.findOne({
        where: { 
          id: applicationId,
          job_seeker_id: req.user.id 
        },
        include: [{
          model: Job,
          as: 'job',
          attributes: ['id', 'title', 'company', 'location', 'type', 'description', 'salary_range']
        }]
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found'
        });
      }

      res.json({
        success: true,
        application
      });
    } catch (error) {
      console.error('Error fetching application:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch application'
      });
    }
  }
);

// Withdraw application
router.patch('/applications/:id/withdraw',
  logMiddleware('isLoggedIn', isLoggedIn),
  async (req, res) => {
    try {
      const { JobApplication } = require('../models');
      const applicationId = parseInt(req.params.id);

      if (isNaN(applicationId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid application ID format'
        });
      }

      const application = await JobApplication.findOne({
        where: { 
          id: applicationId,
          job_seeker_id: req.user.id,
          status: ['applied', 'under_review'] // Can only withdraw these statuses
        }
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found or cannot be withdrawn'
        });
      }

      await application.update({ status: 'withdrawn' });

      res.json({
        success: true,
        message: 'Application withdrawn successfully',
        application: {
          id: application.id,
          status: application.status
        }
      });
    } catch (error) {
      console.error('Error withdrawing application:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to withdraw application'
      });
    }
  }
);

// Get application statistics (optional)
router.get('/stats',
  logMiddleware('isLoggedIn', isLoggedIn),
  async (req, res) => {
    try {
      const { JobApplication, Job } = require('../models');
      const company_id = req.user.id;

      console.log('Fetching company stats for company_id:', company_id);

      // Get all applications for jobs posted by this company
      const applications = await JobApplication.findAll({
        include: [{
          model: Job,
          as: 'job',
          where: { company_id }, // Filter for jobs posted by this company
          attributes: ['id', 'title']
        }],
        attributes: [
          'status',
          [JobApplication.sequelize.fn('COUNT', JobApplication.sequelize.col('JobApplication.id')), 'count']
        ],
        group: ['status', 'job.id', 'job.title'],
        raw: true
      });

      console.log('Raw applications data:', applications);

      // Initialize stats object
      // Initialize stats object
      const statsObj = {
        total: 0,
        applied: 0,
        under_review: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0
      };

      // Process applications data
      applications.forEach(app => {
        const count = parseInt(app.count) || 0;
        if (app.status && typeof statsObj[app.status] !== 'undefined') {
          statsObj[app.status] += count;
          statsObj.total += count;
        }
      });

      // Log the user info and query parameters for debugging
      console.log('User ID:', job_seeker_id);
      console.log('User object:', req.user);
      console.log('Final stats object:', statsObj);

      console.log('Final stats object:', statsObj);

      res.json({
        success: true,
        stats: statsObj
      });
    } catch (error) {
      console.error('Error fetching application stats:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch application statistics',
        error: error.message
      });
    }
  }
);

// Check if user has already applied to a specific job
router.get('/check/:jobId', isLoggedIn, checkApplicationStatus);

// Get applicant count per job (for a single job)
router.get('/count/:jobId',
  async (req, res) => {
    try {
      const { JobApplication } = require('../models');
      const jobId = parseInt(req.params.jobId);

      if (isNaN(jobId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid job ID format'
        });
      }

      const count = await JobApplication.count({
        where: { job_id: jobId }
      });

      res.json({
        success: true,
        jobId: jobId,
        applicantCount: count
      });
    } catch (error) {
      console.error('Error fetching applicant count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch applicant count'
      });
    }
  }
);

// Get applicant counts for multiple jobs (for company dashboard)
router.post('/counts',
  async (req, res) => {
    try {
      const { JobApplication } = require('../models');
      const { jobIds } = req.body;

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'jobIds array is required'
        });
      }

      // Validate all job IDs are numbers
      const validJobIds = jobIds.filter(id => !isNaN(parseInt(id))).map(id => parseInt(id));

      if (validJobIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid job IDs provided'
        });
      }

      const counts = await JobApplication.findAll({
        where: { job_id: validJobIds },
        attributes: [
          'job_id',
          [JobApplication.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['job_id'],
        raw: true
      });

      // Transform to object format { jobId: count }
      const countsObj = {};
      validJobIds.forEach(jobId => {
        countsObj[jobId] = 0; // Initialize with 0
      });

      counts.forEach(item => {
        countsObj[item.job_id] = parseInt(item.count);
      });

      res.json({
        success: true,
        counts: countsObj
      });
    } catch (error) {
      console.error('Error fetching applicant counts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch applicant counts'
      });
    }
  }
);

// Get company application statistics
router.get('/company-stats',
  logMiddleware('isLoggedIn', isLoggedIn),
  async (req, res) => {
    try {
      const { JobApplication, Job } = require('../models');
      const company_id = req.user.id;

      console.log('Fetching company stats for company_id:', company_id);

      // Get all applications for jobs posted by this company
      const applications = await JobApplication.findAll({
        include: [{
          model: Job,
          as: 'job',
          where: { company_id },
          attributes: ['id', 'title']
        }],
        attributes: [
          'status',
          [JobApplication.sequelize.fn('COUNT', JobApplication.sequelize.col('JobApplication.id')), 'count']
        ],
        group: ['status', 'job.id', 'job.title'],
        raw: true
      });

      // Initialize stats object
      const stats = {
        total: 0,
        applied: 0,
        under_review: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0
      };

      // Process applications data
      applications.forEach(app => {
        const count = parseInt(app.count) || 0;
        if (app.status && typeof stats[app.status] !== 'undefined') {
          stats[app.status] += count;
          stats.total += count;
        }
      });

      res.json({
        success: true,
        stats,
        details: {
          total_active_jobs: [...new Set(applications.map(a => a['job.id']))].length,
          most_active_job: applications.reduce((max, curr) => {
            const count = parseInt(curr.count) || 0;
            return count > (max.count || 0) ? { 
              jobId: curr['job.id'], 
              jobTitle: curr['job.title'], 
              count 
            } : max;
          }, {}),
          recent_applications: applications.slice(0, 5).map(app => ({
            jobId: app['job.id'],
            jobTitle: app['job.title'],
            status: app.status,
            count: parseInt(app.count) || 0
          }))
        }
      });
    } catch (error) {
      console.error('Error fetching company application stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch application statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

// Get application trends for charts (last 7 days)
router.get('/trends',
  logMiddleware('isLoggedIn', isLoggedIn),
  async (req, res) => {
    try {
      const { JobApplication, Job } = require('../models');
      const { Op } = require('sequelize');
      const company_id = req.user.id;

      console.log('Fetching application trends for company_id:', company_id);

      // Calculate date range for last 7 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 6); // Last 7 days including today

      // Format dates for SQL query (YYYY-MM-DD)
      const formatDate = (date) => {
        return date.toISOString().split('T')[0];
      };

      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endDate);

      console.log('Date range:', startDateStr, 'to', endDateStr);

      // Get applications grouped by date and status for the last 7 days
      const trendsData = await JobApplication.findAll({
        attributes: [
          [JobApplication.sequelize.fn('DATE', JobApplication.sequelize.col('JobApplication.applied_at')), 'date'],
          'status',
          [JobApplication.sequelize.fn('COUNT', JobApplication.sequelize.col('JobApplication.id')), 'count']
        ],
        include: [{
          model: Job,
          as: 'job',
          where: { company_id },
          attributes: []
        }],
        where: {
          applied_at: {
            [Op.between]: [startDateStr + ' 00:00:00', endDateStr + ' 23:59:59']
          }
        },
        group: [
          JobApplication.sequelize.fn('DATE', JobApplication.sequelize.col('JobApplication.applied_at')),
          'status'
        ],
        order: [
          [JobApplication.sequelize.fn('DATE', JobApplication.sequelize.col('JobApplication.applied_at')), 'ASC']
        ],
        raw: true
      });

      console.log('Raw trends data:', trendsData);

      // Generate all dates in range
      const dateArray = [];
      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        dateArray.push(formatDate(new Date(currentDate)));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Initialize data structure for all dates and statuses
      const statusTypes = ['applied', 'under_review', 'approved', 'rejected', 'withdrawn'];
      const trendsResult = {
        dates: dateArray,
        series: statusTypes.map(status => ({
          name: status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          data: dateArray.map(() => 0)
        }))
      };

      // Fill in actual data
      trendsData.forEach(item => {
        const dateIndex = dateArray.indexOf(item.date);
        const seriesIndex = statusTypes.indexOf(item.status);
        
        if (dateIndex !== -1 && seriesIndex !== -1) {
          trendsResult.series[seriesIndex].data[dateIndex] = parseInt(item.count) || 0;
        }
      });

      // Format dates for display (e.g., "Nov 01")
      trendsResult.categories = dateArray.map(date => {
        const d = new Date(date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
      });

      console.log('Processed trends result:', trendsResult);

      res.json({
        success: true,
        data: trendsResult,
        meta: {
          start_date: startDateStr,
          end_date: endDateStr,
          total_days: dateArray.length
        }
      });
    } catch (error) {
      console.error('Error fetching application trends:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch application trends',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  });

// Get applicant count per job for a company
router.get('/company/:companyId/counts',
  async (req, res) => {
    try {
      const { JobApplication, Job } = require('../models');
      const companyId = parseInt(req.params.companyId);

      if (isNaN(companyId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid company ID format'
        });
      }

      const counts = await JobApplication.findAll({
        attributes: [
          'job_id',
          [JobApplication.sequelize.fn('COUNT', '*'), 'applicant_count']
        ],
        include: [{
          model: Job,
          as: 'job',
          attributes: ['id', 'title'],
          where: { company_id: companyId },
          required: true
        }],
        group: ['job_id', 'job.id', 'job.title'],
        raw: false
      });

      // Format the response
      const formattedCounts = counts.map(item => ({
        jobId: item.job_id,
        jobTitle: item.job?.title,
        applicantCount: parseInt(item.dataValues.applicant_count)
      }));

      res.json({
        success: true,
        companyId: companyId,
        jobCounts: formattedCounts
      });
    } catch (error) {
      console.error('Error fetching company job counts:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch applicant counts for company jobs'
      });
    }
  }
);

module.exports = router;