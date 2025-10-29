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
      const { JobApplication } = require('../models');
      const job_seeker_id = req.user.id;

      const stats = await JobApplication.findAll({
        where: { job_seeker_id },
        attributes: [
          'status',
          [JobApplication.sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status'],
        raw: true
      });

      // Transform to object format
      const statsObj = {
        total: 0,
        applied: 0,
        under_review: 0,
        approved: 0,
        rejected: 0,
        withdrawn: 0
      };

      stats.forEach(stat => {
        statsObj[stat.status] = parseInt(stat.count);
        statsObj.total += parseInt(stat.count);
      });

      res.json({
        success: true,
        stats: statsObj
      });
    } catch (error) {
      console.error('Error fetching application stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch application statistics'
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