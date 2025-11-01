const { JobApplication, Job, User, JobSeekerProfile,UserEducation,UserExperience } = require('../models');
// For Node.js versions 18+, fetch is built-in. For older versions, use node-fetch
const fetch = globalThis.fetch || require("node-fetch");
const { createClient } = require('@supabase/supabase-js');
const { sanitizeName, extractTextFromFile } = require("../utils/fileUtils");

const path = require('path');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const BUCKET_RESUMES = "resumes";
const BUCKET_COVERLETTERS = 'coverletter';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// File validation constants
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain'
];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Helper function to validate file
function validateFile(file, type) {
  if (!file) return { valid: true };
  
  if (!ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    return { 
      valid: false, 
      message: `Invalid ${type} file type. Only PDF, DOC, DOCX, and TXT files are allowed.` 
    };
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      message: `${type} file is too large. Maximum size is 5MB.` 
    };
  }
  
  return { valid: true };
}

// Helper function to cleanup uploaded files
async function cleanupFile(bucket, path) {
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch (error) {
    console.error(`Failed to cleanup file ${path}:`, error.message);
  }
}

// Configuration and Constants


// Qualification levels hierarchy (lowest to highest)

// Qualification aliases for normalization

/**
 * Normalize qualification strings to standard levels
 * @param {string} input - Raw qualification string
 * @returns {string|null} - Normalized qualification level or null if not recognized
 */
function normalizeQualification(input) {
  if (!input) return null;
  
  const normalized = input.toString().trim().toLowerCase();
  
  for (const [level, aliases] of Object.entries(QUALIFICATION_ALIASES)) {
    if (aliases.some(alias => normalized.includes(alias))) {
      return level;
    }
  }
  
  return null;
}

/**
 * Check if user's qualification meets job requirements
 * @param {string} jobQualification - Required qualification for job
 * @param {string} userQualification - User's highest qualification
 * @returns {Object} - Eligibility result with status and message
 */
function checkQualificationEligibility(jobQualification, userQualification) {
  const jobLevel = normalizeQualification(jobQualification);
  const userLevel = normalizeQualification(userQualification);

  if (!jobLevel) {
    console.warn(`Unknown job qualification: ${jobQualification}`);
    return { eligible: true, message: 'Job qualification not recognized, proceeding with application' };
  }

  if (!userLevel) {
    return { 
      eligible: false, 
      message: 'Your qualification is missing or not recognized' 
    };
  }

  const jobIndex = QUALIFICATION_LEVELS.indexOf(jobLevel);
  const userIndex = QUALIFICATION_LEVELS.indexOf(userLevel);

  if (userIndex < jobIndex) {
    return {
      eligible: false,
      message: `You are not eligible. Required: ${jobQualification}, but your highest qualification is ${userQualification}`
    };
  }

  return { eligible: true, message: 'Qualification requirements met' };
}

/**
 * Create ATS scoring prompt for AI evaluation
 * @param {Object} job - Job details
 * @returns {string} - Formatted prompt for AI scoring
 */
function createScoringPrompt(job) {
  const skillsList = Array.isArray(job.skills) ? job.skills.join(', ') : (job.skills || 'Not specified');
  const tagsList = Array.isArray(job.tags) ? job.tags.join(', ') : (job.tags || 'Not specified');

  return `You are an ATS AI system. Evaluate the candidate's resume against the job requirements. 
Score strictly from 0–100. 

Use the following weighted criteria:
- Skills match (${ATS_SCORING_WEIGHTS.skillsMatch}%)
- Experience vs. minimum required (${ATS_SCORING_WEIGHTS.experience}%)
- Education match (${ATS_SCORING_WEIGHTS.education}%)
- Job category & role relevance (${ATS_SCORING_WEIGHTS.roleRelevance}%)
- Other details like projects, certifications, achievements (${ATS_SCORING_WEIGHTS.otherDetails}%)

### Job Details:
Title: ${job.title}
Description: ${job.description}
Location: ${job.location || 'Not specified'}
Type: ${job.type}
Salary Range: ${job.salary_range || 'Not specified'}
Education Requirement: ${job.education || 'Not specified'}
Minimum Experience: ${job.experience_min || 0} years
Skills Required: ${skillsList}
Tags: ${tagsList}
Category: ${job.category || 'Not specified'}

### Candidate Resume:
{{RESUME_TEXT}}

Return JSON only in the following format:
{
  "score": <number 0-100>,
  "feedback": "<short bullet points about strengths/weaknesses>"
}`;
}

/**
 * Parse AI response and extract JSON data
 * @param {string} text - Raw AI response text
 * @returns {Object} - Parsed score and feedback
 */
function parseAIResponse(text) {
  let cleanText = text.trim();
  
  // Extract from markdown code blocks if present
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1];
  }
  
  // Extract JSON object from response
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : cleanText;
  
  try {
    const parsed = JSON.parse(jsonText);
    
    // Validate and normalize score
    if (parsed.score !== null && typeof parsed.score === 'number') {
      parsed.score = Math.min(100, Math.max(0, Math.round(parsed.score)));
    } else if (parsed.score !== null) {
      const scoreNum = parseInt(parsed.score);
      parsed.score = isNaN(scoreNum) ? null : Math.min(100, Math.max(0, scoreNum));
    }
    
    return {
      score: parsed.score,
      feedback: parsed.feedback || 'No feedback provided'
    };
    
  } catch (error) {
    console.warn('Failed to parse JSON, attempting manual extraction:', error.message);
    return extractScoreManually(text);
  }
}

/**
 * Manually extract score and feedback when JSON parsing fails
 * @param {string} text - Raw AI response text
 * @returns {Object} - Extracted score and feedback
 */
function extractScoreManually(text) {
  const scoreMatch = text.match(/(?:"score":\s*|score":\s*)(\d{1,3})/i);
  const feedbackMatch = text.match(/(?:"feedback":\s*"|feedback":\s*")([^"]*(?:\\.[^"]*)*)/i);
  
  let score = null;
  if (scoreMatch) {
    score = Math.min(100, Math.max(0, parseInt(scoreMatch[1])));
  } else {
    // Fallback to any number in the text
    const anyNumberMatch = text.match(/\b(\d{1,3})\b/);
    score = anyNumberMatch ? Math.min(100, Math.max(0, parseInt(anyNumberMatch[1]))) : null;
  }
  
  let feedback = text;
  if (feedbackMatch) {
    feedback = feedbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  return { score, feedback };
}

/**
 * Score resume using AI-based ATS system
 * @param {string} resumeText - Combined text from resume and cover letter
 * @param {Object} job - Job details for comparison
 * @returns {Promise<Object>} - Score and feedback from AI evaluation
 */
async function scoreResume(resumeText, job) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not found, skipping AI scoring');
    return { 
      score: null, 
      feedback: 'AI scoring not configured' 
    };
  }

  const prompt = createScoringPrompt(job).replace('{{RESUME_TEXT}}', resumeText);

  try {
    const response = await fetch(OPENROUTER_CONFIG.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_CONFIG.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: OPENROUTER_CONFIG.maxTokens,
        temperature: OPENROUTER_CONFIG.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      throw new Error('No response from AI service');
    }

    console.log('AI Response:', aiResponse);
    const result = parseAIResponse(aiResponse);
    console.log('Parsed result:', { score: result.score, feedbackLength: result.feedback?.length });
    
    return result;

  } catch (error) {
    console.error('Error scoring resume:', error.message);
    return { 
      score: null, 
      feedback: 'Scoring failed due to technical error' 
    };
  }
}

/**
 * Upload file to Supabase storage
 * @param {Object} file - File object from multer
 * @param {string} bucket - Storage bucket name
 * @param {string} filePath - Path for file in storage
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadFile(file, bucket, filePath) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Main controller function to handle job applications
 */
// Configuration and Constants
const OPENROUTER_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'mistralai/mistral-7b-instruct',
  maxTokens: 300,
  temperature: 0.3
};

const ATS_SCORING_WEIGHTS = {
  skillsMatch: 40,
  experience: 25,
  education: 15,
  roleRelevance: 10,
  otherDetails: 10
};

// Qualification levels hierarchy (lowest to highest)
const QUALIFICATION_LEVELS = [
  'high_school',
  'diploma', 
  'associate',
  'bachelors',
  'masters',
  'phd'
];

// Qualification aliases for normalization
const QUALIFICATION_ALIASES = {
  high_school: ['high school', 'secondary', 'ssc', '10th', 'matric', 'hssc', '12th', 'intermediate', 'junior college'],
  diploma: ['diploma', 'polytechnic'],
  associate: ['associate', 'associate degree'],
  bachelors: ['bachelor', 'bachelors', 'undergraduate', 'grad', 'college degree', 'btech', 'b.sc', 'bcom', 'ba'],
  masters: ['master', 'masters', 'postgraduate', 'm.sc', 'mba', 'ma', 'mtech'],
  phd: ['phd', 'doctorate', 'doctoral', 'dphil']
};

/**
 * Normalize qualification strings to standard levels
 * @param {string} input - Raw qualification string
 * @returns {string|null} - Normalized qualification level or null if not recognized
 */
function normalizeQualification(input) {
  if (!input) return null;
  
  const normalized = input.toString().trim().toLowerCase();
  
  for (const [level, aliases] of Object.entries(QUALIFICATION_ALIASES)) {
    if (aliases.some(alias => normalized.includes(alias))) {
      return level;
    }
  }
  
  return null;
}

/**
 * Check if user's qualification meets job requirements
 * User is eligible if they have the SAME or HIGHER qualification than required
 * @param {string} jobQualification - Required qualification for job
 * @param {Array} userEducationRecords - Array of user's education records
 * @returns {Object} - Eligibility result with status and message
 */
function checkQualificationEligibility(jobQualification, userEducationRecords) {
  const jobLevel = normalizeQualification(jobQualification);
  
  if (!jobLevel) {
    console.warn(`Unknown job qualification: ${jobQualification}`);
    return { 
      eligible: true, 
      message: 'Job qualification not recognized, proceeding with application' 
    };
  }

  if (!userEducationRecords || userEducationRecords.length === 0) {
    return { 
      eligible: false, 
      message: 'No education records found. Please add your qualifications to apply.' 
    };
  }

  // Get all user qualification levels
  const userQualificationLevels = userEducationRecords
    .map(edu => normalizeQualification(edu.qualification))
    .filter(level => level !== null); // Remove unrecognized qualifications

  if (userQualificationLevels.length === 0) {
    return {
      eligible: false,
      message: 'None of your qualifications are recognized. Please update your education details.'
    };
  }

  // Find the highest qualification level the user has
  const userHighestLevelIndex = Math.max(
    ...userQualificationLevels.map(level => QUALIFICATION_LEVELS.indexOf(level))
  );
  
  const jobRequiredIndex = QUALIFICATION_LEVELS.indexOf(jobLevel);

  // User is eligible if their highest qualification is >= job requirement
  if (userHighestLevelIndex >= jobRequiredIndex) {
    const userHighestLevel = QUALIFICATION_LEVELS[userHighestLevelIndex];
    const userHighestQualification = userEducationRecords.find(
      edu => normalizeQualification(edu.qualification) === userHighestLevel
    )?.qualification;

    return { 
      eligible: true, 
      message: `Qualification requirements met. Your highest qualification: ${userHighestQualification}, Required: ${jobQualification}` 
    };
  } else {
    // User is not eligible - their highest qualification is below requirement
    const userHighestLevel = QUALIFICATION_LEVELS[userHighestLevelIndex];
    const userHighestQualification = userEducationRecords.find(
      edu => normalizeQualification(edu.qualification) === userHighestLevel
    )?.qualification;

    return {
      eligible: false,
      message: `You are not eligible. Required: ${jobQualification}, but your highest qualification is: ${userHighestQualification}`
    };
  }
}

/**
 * Create ATS scoring prompt for AI evaluation
 * @param {Object} job - Job details
 * @returns {string} - Formatted prompt for AI scoring
 */
function createScoringPrompt(job) {
  const skillsList = Array.isArray(job.skills) ? job.skills.join(', ') : (job.skills || 'Not specified');
  const tagsList = Array.isArray(job.tags) ? job.tags.join(', ') : (job.tags || 'Not specified');

  return `You are an ATS AI system. Evaluate the candidate's resume against the job requirements. 
Score strictly from 0–100. 

Use the following weighted criteria:
- Skills match (${ATS_SCORING_WEIGHTS.skillsMatch}%)
- Experience vs. minimum required (${ATS_SCORING_WEIGHTS.experience}%)
- Education match (${ATS_SCORING_WEIGHTS.education}%)
- Job category & role relevance (${ATS_SCORING_WEIGHTS.roleRelevance}%)
- Other details like projects, certifications, achievements (${ATS_SCORING_WEIGHTS.otherDetails}%)

### Job Details:
Title: ${job.title}
Description: ${job.description}
Location: ${job.location || 'Not specified'}
Type: ${job.type}
Salary Range: ${job.salary_range || 'Not specified'}
Education Requirement: ${job.education || 'Not specified'}
Minimum Experience: ${job.experience_min || 0} years
Skills Required: ${skillsList}
Tags: ${tagsList}
Category: ${job.category || 'Not specified'}

### Candidate Resume:
{{RESUME_TEXT}}

Return JSON only in the following format:
{
  "score": <number 0-100>,
  "feedback": "<short bullet points about strengths/weaknesses>"
}`;
}

/**
 * Parse AI response and extract JSON data
 * @param {string} text - Raw AI response text
 * @returns {Object} - Parsed score and feedback
 */
function parseAIResponse(text) {
  let cleanText = text.trim();
  
  // Extract from markdown code blocks if present
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1];
  }
  
  // Extract JSON object from response
  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  const jsonText = jsonMatch ? jsonMatch[0] : cleanText;
  
  try {
    const parsed = JSON.parse(jsonText);
    
    // Validate and normalize score
    if (parsed.score !== null && typeof parsed.score === 'number') {
      parsed.score = Math.min(100, Math.max(0, Math.round(parsed.score)));
    } else if (parsed.score !== null) {
      const scoreNum = parseInt(parsed.score);
      parsed.score = isNaN(scoreNum) ? null : Math.min(100, Math.max(0, scoreNum));
    }
    
    return {
      score: parsed.score,
      feedback: parsed.feedback || 'No feedback provided'
    };
    
  } catch (error) {
    console.warn('Failed to parse JSON, attempting manual extraction:', error.message);
    return extractScoreManually(text);
  }
}

/**
 * Manually extract score and feedback when JSON parsing fails
 * @param {string} text - Raw AI response text
 * @returns {Object} - Extracted score and feedback
 */
function extractScoreManually(text) {
  const scoreMatch = text.match(/(?:"score":\s*|score":\s*)(\d{1,3})/i);
  const feedbackMatch = text.match(/(?:"feedback":\s*"|feedback":\s*")([^"]*(?:\\.[^"]*)*)/i);
  
  let score = null;
  if (scoreMatch) {
    score = Math.min(100, Math.max(0, parseInt(scoreMatch[1])));
  } else {
    // Fallback to any number in the text
    const anyNumberMatch = text.match(/\b(\d{1,3})\b/);
    score = anyNumberMatch ? Math.min(100, Math.max(0, parseInt(anyNumberMatch[1]))) : null;
  }
  
  let feedback = text;
  if (feedbackMatch) {
    feedback = feedbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
  }
  
  return { score, feedback };
}

/**
 * Score resume using AI-based ATS system
 * @param {string} resumeText - Combined text from resume and cover letter
 * @param {Object} job - Job details for comparison
 * @returns {Promise<Object>} - Score and feedback from AI evaluation
 */
async function scoreResume(resumeText, job) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not found, skipping AI scoring');
    return { 
      score: null, 
      feedback: 'AI scoring not configured' 
    };
  }

  const prompt = createScoringPrompt(job).replace('{{RESUME_TEXT}}', resumeText);

  try {
    const response = await fetch(OPENROUTER_CONFIG.baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENROUTER_CONFIG.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: OPENROUTER_CONFIG.maxTokens,
        temperature: OPENROUTER_CONFIG.temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content?.trim();
    
    if (!aiResponse) {
      throw new Error('No response from AI service');
    }

    console.log('AI Response:', aiResponse);
    const result = parseAIResponse(aiResponse);
    console.log('Parsed result:', { score: result.score, feedbackLength: result.feedback?.length });
    
    return result;

  } catch (error) {
    console.error('Error scoring resume:', error.message);
    return { 
      score: null, 
      feedback: 'Scoring failed due to technical error' 
    };
  }
}

/**
 * Upload file to Supabase storage
 * @param {Object} file - File object from multer
 * @param {string} bucket - Storage bucket name
 * @param {string} filePath - Path for file in storage
 * @returns {Promise<string>} - Public URL of uploaded file
 */
async function uploadFile(file, bucket, filePath) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (error) {
    throw new Error(`File upload failed: ${error.message}`);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Main controller function to handle job applications
 */
exports.applyToJob = async (req, res) => {
  let transaction;
  let resumePath = null;
  let coverPath = null;

  try {
    transaction = await JobApplication.sequelize.transaction();
    const { job_id } = req.body;
    const job_seeker_id = req.user.id;

    // Validate job ID
    if (!job_id || isNaN(parseInt(job_id))) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid job ID format' 
      });
    }

    const resumeFile = req.files?.resume?.[0];
    const coverLetterFile = req.files?.coverLetter?.[0];

    // Validate uploaded files
    const resumeValidation = validateFile(resumeFile, 'Resume');
    const coverValidation = validateFile(coverLetterFile, 'Cover Letter');
    
    if (!resumeValidation.valid) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: resumeValidation.message 
      });
    }
    
    if (!coverValidation.valid) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: coverValidation.message 
      });
    }

    if (!resumeFile && !coverLetterFile) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'At least one file (resume or cover letter) is required' 
      });
    }

    // Check if job exists
    const job = await Job.findByPk(job_id);
    if (!job) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false, 
        message: 'Job not found' 
      });
    }

    // Check qualification eligibility
   if (job.education) {
  // Fetch all education records for the user
  const userEducationRecords = await UserEducation.findAll({
    where: { user_id: job_seeker_id },
    order: [['id', 'DESC']]
  });

  // If user has no education records
  if (!userEducationRecords || userEducationRecords.length === 0) {
    await transaction.rollback();
    return res.status(403).json({
      success: false,
      message: 'No education records found. Please add your qualifications to apply.'
    });
  }

  // Normalize job requirement
  const jobLevel = normalizeQualification(job.education);

  if (!jobLevel) {
    console.warn(`Unknown job qualification requirement: ${job.education}`);
    // Proceed if job requirement is not recognized
  } else {
    // Normalize all user degrees
    const userLevels = userEducationRecords
      .map(edu => normalizeQualification(edu.degree))
      .filter(lvl => lvl !== null); // remove unrecognized degrees

    if (userLevels.length === 0) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'None of your qualifications are recognized. Please update your education details.'
      });
    }

    // Find highest user level
    const userHighestIndex = Math.max(...userLevels.map(lvl => QUALIFICATION_LEVELS.indexOf(lvl)));
    const jobRequiredIndex = QUALIFICATION_LEVELS.indexOf(jobLevel);

    // Cross-validation
    if (userHighestIndex < jobRequiredIndex) {
      const userHighest = userEducationRecords.find(
        edu => normalizeQualification(edu.degree) === QUALIFICATION_LEVELS[userHighestIndex]
      )?.degree;

      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: `You are not eligible. Required: ${job.education}, but your highest qualification is: ${userHighest}`
      });
    }

    console.log('Qualification check passed:', {
      required: job.education,
      userHighest: userEducationRecords.find(
        edu => normalizeQualification(edu.degree) === QUALIFICATION_LEVELS[userHighestIndex]
      )?.degree
    });
  }
}


    // Check for duplicate applications
    const existingApplication = await JobApplication.findOne({
      where: { job_id: parseInt(job_id), job_seeker_id },
      transaction
    });
    
    if (existingApplication) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Already applied to this job' 
      });
    }

    // Upload files to storage
    let resume_link = null;
    let cover_letter_link = null;

    if (resumeFile) {
      resumePath = `user_${job_seeker_id}_job_${job_id}/${Date.now()}_${sanitizeName(resumeFile.originalname)}`;
      resume_link = await uploadFile(resumeFile, process.env.BUCKET_RESUMES, resumePath);
    }

    if (coverLetterFile) {
      coverPath = `user_${job_seeker_id}_job_${job_id}/${Date.now()}_${sanitizeName(coverLetterFile.originalname)}`;
      cover_letter_link = await uploadFile(coverLetterFile, process.env.BUCKET_COVERLETTERS, coverPath);
    }

    // Perform ATS scoring
    let atsScore = null;
    let atsFeedback = null;
    
    try {
      let combinedText = '';
      
      if (resumeFile) {
        combinedText += await extractTextFromFile(resumeFile);
      }
      
      if (coverLetterFile) {
        combinedText += `\n\nCover Letter:\n${await extractTextFromFile(coverLetterFile)}`;
      }
      
      if (combinedText.trim()) {
        const scoringResult = await scoreResume(combinedText, job);
        atsScore = scoringResult.score;
        
        // Ensure feedback is a string
        let feedback = scoringResult.feedback;
        if (Array.isArray(feedback)) {
          feedback = feedback.join('\n');
        } else if (typeof feedback === 'object') {
          feedback = JSON.stringify(feedback);
        }
        atsFeedback = feedback ? feedback.toString() : 'No feedback provided';
      }
    } catch (scoringError) {
      console.error('ATS scoring failed:', scoringError.message);
      atsFeedback = 'ATS scoring temporarily unavailable';
    }

    // Create job application record
    const application = await JobApplication.create({
      job_id: parseInt(job_id),
      job_seeker_id,
      cover_letter: cover_letter_link,
      resume_link,
      ats_score: atsScore,
      ats_feedback: atsFeedback,
      status: 'applied',
      applied_at: new Date()
    }, { transaction });

    await transaction.commit();

    // Return success response
    res.status(201).json({
      success: true,
      application: {
        id: application.id,
        job_id: application.job_id,
        status: application.status,
        ats_score: application.ats_score,
        ats_feedback: application.ats_feedback,
        applied_at: application.applied_at,
        resume_link: application.resume_link,
        cover_letter: application.cover_letter
      }
    });

  } catch (error) {
    console.error('Apply controller error:', error);
    
    if (transaction) {
      await transaction.rollback();
    }
    
    // Cleanup uploaded files on error
    if (resumePath) {
      await cleanupFile(process.env.BUCKET_RESUMES, resumePath);
    }
    if (coverPath) {
      await cleanupFile(process.env.BUCKET_COVERLETTERS, coverPath);
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Failed to apply to job'
    });
  }
};
// Get all applications for the logged-in job seeker
exports.getMyApplications = async (req, res) => {
  try {
    const job_seeker_id = req.user.id;
    const applications = await JobApplication.findAll({
      where: { job_seeker_id },
      include: [{ model: Job, as: 'job' }]
    });
    res.json({ success: true, applications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Failed to fetch applications' });
  }
};

// Get candidates for a company
exports.getCompanyCandidates = async (req, res) => {
  try {
    const company_id = parseInt(req.params.companyId);

    if (isNaN(company_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid company ID format'
      });
    }

 const applications = await JobApplication.findAll({
  where: {},
  include: [
    {
      model: Job,
      as: 'job',
      where: { company_id },
      attributes: ['id', 'title', 'location', 'type', 'company_id']
    },
    {
      model: User,
      as: 'jobSeeker',
      attributes: ['id', 'name', 'email'],
      include: [
        {
          model: JobSeekerProfile,
          as: 'jobSeekerProfile',
          attributes: ['skills_json', 'phone_number'],
          required: false,
          include: [
            {
              model: UserExperience,
              as: 'experience', // alias defined in JobSeekerProfile model
              attributes: ['id', 'title', 'company', 'start_date', 'end_date', 'description'],
              required: false
            },
            {
              model: UserEducation,
              as: 'education', // alias defined in JobSeekerProfile model
              attributes: ['id', 'school', 'degree', 'field', 'start_date', 'end_date'],
              required: false
            }
          ]
        }
      ]
    }
  ],
  attributes: ['id', 'job_id', 'job_seeker_id', 'cover_letter', 'resume_link', 'ats_score', 'status', 'applied_at', 'ats_feedback'],
  order: [['applied_at', 'DESC']]
});


    res.json({ 
      success: true, 
      applications,
      total: applications.length 
    });
  } catch (err) {
    console.error('Error fetching company candidates:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch company candidates' 
    });
  }
};

// Update application status
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const id = parseInt(req.params.applicationId, 10);

    if (isNaN(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid application ID' 
      });
    }

    const validStatuses = ['applied', 'under_review', 'approved', 'rejected', 'withdrawn'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
      });
    }

    const application = await JobApplication.findByPk(id, {
      include: [
        { model: Job, as: 'job' },
        { model: User, as: 'jobSeeker' }
      ]
    });

    if (!application) {
      return res.status(404).json({ 
        success: false, 
        message: 'Application not found' 
      });
    }

    // Update status
    application.status = status;
    await application.save();

    // Create notification for the candidate (if notification service exists)
    try {
      const { createNotification } = require('../utils/notificationService');
      
      let notificationMessage = '';
      switch (status) {
        case 'under_review':
          notificationMessage = `Your application for ${application.job.title} is now under review.`;
          break;
        case 'approved':
          notificationMessage = `Congratulations! Your application for ${application.job.title} has been approved.`;
          break;
        case 'rejected':
          notificationMessage = `Unfortunately, your application for ${application.job.title} was not selected.`;
          break;
      }
      
      if (notificationMessage) {
        await createNotification(application.jobSeeker.id, notificationMessage, 'application', null, null, req.io);
      }
    } catch (notificationError) {
      console.warn('Failed to create notification:', notificationError.message);
      // Don't fail the status update if notification fails
    }

    res.json({ 
      success: true, 
      application: {
        id: application.id,
        status: application.status,
        job: {
          id: application.job.id,
          title: application.job.title
        },
        jobSeeker: {
          id: application.jobSeeker.id,
          name: application.jobSeeker.name,
          email: application.jobSeeker.email
        }
      }
    });
  } catch (err) {
    console.error('Error updating application status:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating status', 
      details: err.message 
    });
  }
};
exports.getApplicationAnalytics = async (req, res) => {
  try {
    const jobSeekerId = req.user.id;

    // Aggregate counts by date and status for the last 7 days (including today)
    const [rows] = await sequelize.query(
      `
      SELECT DATE(applied_at) AS day, status, COUNT(*) AS count
      FROM applications
      WHERE job_seeker_id = :jobSeekerId
        AND applied_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(applied_at), status
      ORDER BY day ASC
      `,
      { replacements: { jobSeekerId } }
    );

    // Normalize SQL DATE value to 'YYYY-MM-DD' and build a map for quick lookup
    const toYmd = (value) => {
      if (!value) return '';
      if (value instanceof Date) return value.toISOString().slice(0, 10);
      // Fallback for string or other formats like 'YYYY-MM-DDT00:00:00.000Z' or 'YYYY-MM-DD'
      const str = String(value);
      return str.slice(0, 10);
    };

    const countsMap = new Map(); // key: `${day}|${status}` -> count
    rows.forEach(r => {
      const keyDay = toYmd(r.day);
      countsMap.set(`${keyDay}|${r.status}`, Number(r.count));
    });

    // Prepare last 7 days labels (YYYY-MM-DD)
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      days.push(`${yyyy}-${mm}-${dd}`);
    }

    const statuses = ['applied', 'approved', 'rejected'];
    const series = {
      applied: [],
      approved: [],
      rejected: []
    };

    days.forEach(day => {
      statuses.forEach(status => {
        const key = `${day}|${status}`;
        const val = countsMap.get(key) || 0;
        series[status].push(val);
      });
    });

    return res.json({
      success: true,
      data: {
        days, // 'YYYY-MM-DD'
        series
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
};

// Check if user has already applied to a specific job
exports.checkApplicationStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id; // Assuming you have middleware that sets req.user from JWT token

    // Validate jobId
    if (!jobId || isNaN(parseInt(jobId))) {
      return res.status(400).json({
        success: false,
        message: 'Invalid job ID format'
      });
    }

    // Check if application exists for this user and job
    const existingApplication = await JobApplication.findOne({
      where: { 
        job_seeker_id: userId, 
        job_id: parseInt(jobId) 
      },
      attributes: ['id', 'status', 'applied_at']
    });

    const hasApplied = !!existingApplication;

    res.status(200).json({
      success: true,
      hasApplied: hasApplied,
      application: hasApplied ? {
        id: existingApplication.id,
        status: existingApplication.status,
        applied_at: existingApplication.applied_at
      } : null,
      message: hasApplied ? 'User has already applied for this job' : 'User has not applied for this job'
    });

  } catch (error) {
    console.error('Error checking application status:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error while checking application status',
      error: error.message
    });
  }
};