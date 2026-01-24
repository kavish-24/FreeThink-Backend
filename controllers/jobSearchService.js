const { Job, CompanyProfile } = require('../models');
const Fuse = require("fuse.js");
const { Op, literal, Sequelize } = require('sequelize');

// ------------------- Utils -------------------
function normalizeText(text) {
  if (typeof text !== 'string') return '';
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

// ------------------- Keyword Search -------------------
async function searchJobsByQuery(query) {
  const normalizedQuery = normalizeText(query);

  // Fetch jobs that match the company name
 const jobsByCompany = await Job.findAll({
  attributes: [
    'id',
    'title',
    'tags',
    'location',
    'skills',
    'salary_range',
    'type',
    'posted_at',
    'experience_min'
  ],
  where: { status: 'open' },
  include: [
    {
      model: CompanyProfile,
      as: 'company',
      attributes: ['company_name'],
      where: {
        status: {
          [Op.or]: ['approved', 'pending']   // <-- allow both statuses
        },
        company_name: { [Op.like]: `%${query}%` }
      },
      required: true
    }
  ]
});

  // Fetch all jobs (approved companies only)
  const allJobs = await Job.findAll({
    attributes: ['id', 'title', 'tags', 'location', 'skills', 'salary_range', 'type', 'posted_at','experience_min'],
    where: { status: 'open' },
    include: [
      {
        model: CompanyProfile,
        as: 'company',
        attributes: ['company_name']
      }
    ]
  });

  const titleMatches = [];
  const tagMatches = [];

  for (const job of allJobs) {
    const title = normalizeText(job.title || '');
    let tags = [];

    try {
      tags = typeof job.tags === 'string' ? JSON.parse(job.tags) : job.tags || [];
    } catch {
      tags = [];
    }

    if (title.includes(normalizedQuery)) {
      titleMatches.push(job);
    } else if (tags.some(tag => normalizeText(tag).includes(normalizedQuery))) {
      tagMatches.push(job);
    }
  }

  // Merge results: company matches first, then title/tag matches
  const seen = new Set();
  const mergedResults = [];

  for (const job of [...jobsByCompany, ...titleMatches, ...tagMatches]) {
    if (!seen.has(job.id)) {
      seen.add(job.id);
      mergedResults.push(job);
    }
  }

  return mergedResults;
}

function tokenize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // strip punctuation like h.no, commas etc
    .split(/\s+/)                 // split on spaces
    .filter(Boolean);
}



async function searchByLocation(req, res) {
  try {
    const locationParam = (req.query.location || "").trim();
    if (!locationParam) {
      return res.status(400).json({ success: false, message: "Location parameter is required" });
    }

    const locLower = locationParam.toLowerCase();

    const includeCompany = [{
      model: CompanyProfile,
      as: "company",
      attributes: ["company_name"],
      where: { status: "approved" }
    }];

    const baseAttrs = ["id", "title", "tags", "location", "skills", "salary_range", "type", "posted_at", "experience_min"];

    // Fetch all open jobs with approved companies
    const allJobs = await Job.findAll({
      attributes: baseAttrs,
      include: includeCompany,
      where: { status: "open" },
      order: [["posted_at", "DESC"]]
    });

    if (allJobs.length === 0) {
      return res.json({ success: true, matchType: "none", jobs: [] });
    }

    // Fuse.js setup
    const fuse = new Fuse(allJobs, {
      keys: ["location"],
      threshold: 0.3,          // 0.0 = exact, 1.0 = very fuzzy
      ignoreLocation: true,    // match anywhere in the string
      isCaseSensitive: false,
    });

    const results = fuse.search(locLower).map(r => r.item);

    // Determine match type
    let matchType = "fuzzy";
    if (results.some(j => j.location.toLowerCase() === locLower)) {
      matchType = "exact";
    } else if (results.length > 0 && results.some(j => j.location.toLowerCase().includes(locLower))) {
      matchType = "substring";
    }

    return res.json({ success: true, matchType, jobs: results });
  } catch (error) {
    console.error("❌ Error fetching jobs by location:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


// ------------------- Export all -------------------
module.exports = {
  normalizeText,
  searchJobsByQuery,
  searchByLocation
};
