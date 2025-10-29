const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');
const {
  User,
  CompanyProfile,
  JobSeekerProfile,
  UserEducation,
  UserExperience,
  Job,
  JobApplication,
  Message,
  Conversation,
  Bookmark,
  Note,
  Notification,
  Broadcast
} = require('./models');

// Utility function to get random items from array
const getRandomItems = (array, count) => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Utility function to get random item from array
const getRandomItem = (array) => {
  return array[Math.floor(Math.random() * array.length)];
};

// Skills pool
const skills = [
  'JavaScript', 'Python', 'Java', 'React', 'Node.js', 'SQL', 'HTML', 'CSS',
  'TypeScript', 'Vue.js', 'Angular', 'PHP', 'C++', 'C#', 'Swift', 'Kotlin',
  'Go', 'Ruby', 'Rust', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP',
  'MongoDB', 'PostgreSQL', 'MySQL', 'Redis', 'Git', 'Linux',
  'Django', 'Flask', 'Spring Boot', 'Laravel', 'Express.js', 'FastAPI',
  'GraphQL', 'REST API', 'Microservices', 'DevOps', 'CI/CD', 'Jenkins',
  'Terraform', 'Ansible', 'Machine Learning', 'Data Science', 'AI'
];

// Job categories
const jobCategories = [
  'Software Development', 'Data Science', 'DevOps', 'Design',
  'Marketing', 'Sales', 'Human Resources', 'Finance', 'Customer Support',
  'Product Management', 'Engineering', 'Operations', 'Research'
];

// Industries
const industries = [
  'Technology', 'Finance', 'Healthcare', 'Education', 'E-commerce',
  'Manufacturing', 'Retail', 'Consulting', 'Media', 'Telecommunications',
  'Real Estate', 'Transportation', 'Energy', 'Hospitality', 'Insurance'
];

// Job types
const jobTypes = ['full-time', 'part-time', 'contract', 'freelance', 'internship'];

// Education levels
const educationLevels = ['high-school', 'bachelors', 'masters', 'phd', 'any'];

// Job status
const jobStatuses = ['draft', 'open', 'pending', 'approved', 'closed'];

// Application statuses
const applicationStatuses = ['applied', 'under_review', 'shortlisted', 'rejected', 'accepted'];

async function seedUsers() {
  console.log('Seeding users...');
  const users = [];

  // Hash password once for all users
  const passwordHash = await bcrypt.hash('12345678', 10);

  // Create 10 companies
  for (let i = 0; i < 10; i++) {
    const user = await User.create({
      name: faker.company.name(),
      email: faker.internet.email().toLowerCase(),
      password_hash: passwordHash,
      role: 'company',
      verified: true,
      phone: faker.phone.number(),
      status: 'active'
    });
    users.push(user);
  }

  // Create 30 job seekers
  for (let i = 0; i < 30; i++) {
    const user = await User.create({
      name: faker.person.fullName(),
      email: faker.internet.email().toLowerCase(),
      password_hash: passwordHash,
      role: 'job_seeker',
      verified: true,
      phone: faker.phone.number(),
      status: 'active'
    });
    users.push(user);
  }

  // Create 1 admin
  await User.create({
    name: 'Admin User',
    email: 'admin@jobhub.com',
    password_hash: passwordHash,
    role: 'admin',
    verified: true,
    phone: faker.phone.number(),
    status: 'active'
  });

  console.log(`Created ${users.length} users (10 companies, 30 job seekers, 1 admin)`);
  return users;
}

async function seedCompanyProfiles(users) {
  console.log('Seeding company profiles...');
  const companies = users.filter(u => u.role === 'company');
  const companyProfiles = [];

  for (const company of companies) {
    const profile = await CompanyProfile.create({
      user_id: company.id,
      companyName: company.name,
      industry: getRandomItem(industries),
      description: faker.company.catchPhrase() + '. ' + faker.lorem.paragraph(),
      website: faker.internet.url(),
      location: `${faker.location.city()}, ${faker.location.state()}`,
      companySize: getRandomItem(['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']),
      foundedYear: faker.date.past({ years: 30 }).getFullYear(),
      logo: faker.image.avatar(),
      socialLinks: JSON.stringify({
        linkedin: faker.internet.url(),
        twitter: faker.internet.url(),
        facebook: faker.internet.url()
      }),
      verified: Math.random() > 0.3
    });
    companyProfiles.push(profile);
  }

  console.log(`Created ${companyProfiles.length} company profiles`);
  return companyProfiles;
}

async function seedJobSeekerProfiles(users) {
  console.log('Seeding job seeker profiles...');
  const jobSeekers = users.filter(u => u.role === 'jobseeker');
  const jobSeekerProfiles = [];

  for (const jobSeeker of jobSeekers) {
    const userSkills = getRandomItems(skills, faker.number.int({ min: 3, max: 10 }));
    const profile = await JobSeekerProfile.create({
      user_id: jobSeeker.id,
      bio: faker.person.bio(),
      skills: JSON.stringify(userSkills),
      experience_years: faker.number.int({ min: 0, max: 20 }),
      location: `${faker.location.city()}, ${faker.location.state()}`,
      resume_url: faker.internet.url(),
      portfolio_url: Math.random() > 0.5 ? faker.internet.url() : null,
      github_url: Math.random() > 0.5 ? `https://github.com/${faker.internet.userName()}` : null,
      linkedin_url: Math.random() > 0.5 ? faker.internet.url() : null,
      availability: getRandomItem(['immediate', 'two_weeks', 'one_month', 'not_looking']),
      preferred_job_type: getRandomItem(jobTypes),
      expected_salary: `$${faker.number.int({ min: 50, max: 200 })}k - $${faker.number.int({ min: 80, max: 250 })}k`
    });
    jobSeekerProfiles.push(profile);
  }

  console.log(`Created ${jobSeekerProfiles.length} job seeker profiles`);
  return jobSeekerProfiles;
}

async function seedEducation(jobSeekerProfiles) {
  console.log('Seeding education records...');
  let count = 0;

  for (const profile of jobSeekerProfiles) {
    const numEducation = faker.number.int({ min: 1, max: 3 });
    
    for (let i = 0; i < numEducation; i++) {
      const startYear = faker.date.past({ years: 15 }).getFullYear();
      const endYear = startYear + faker.number.int({ min: 2, max: 6 });
      
      await UserEducation.create({
        user_id: profile.user_id,
        degree: getRandomItem(['Bachelor of Science', 'Master of Science', 'Bachelor of Arts', 'Master of Arts', 'PhD', 'Associate Degree']),
        field_of_study: getRandomItem(['Computer Science', 'Software Engineering', 'Data Science', 'Business Administration', 'Marketing', 'Design', 'Engineering']),
        institution: faker.company.name() + ' University',
        start_date: new Date(startYear, 8, 1),
        end_date: Math.random() > 0.2 ? new Date(endYear, 5, 1) : null,
        grade: Math.random() > 0.5 ? faker.number.float({ min: 3.0, max: 4.0, precision: 0.1 }).toFixed(1) : null,
        description: faker.lorem.sentence()
      });
      count++;
    }
  }

  console.log(`Created ${count} education records`);
}

async function seedExperience(jobSeekerProfiles) {
  console.log('Seeding experience records...');
  let count = 0;

  for (const profile of jobSeekerProfiles) {
    const numExperience = faker.number.int({ min: 1, max: 4 });
    
    for (let i = 0; i < numExperience; i++) {
      const startYear = faker.date.past({ years: 10 }).getFullYear();
      const isCurrent = i === 0 && Math.random() > 0.5;
      const endYear = isCurrent ? null : startYear + faker.number.int({ min: 1, max: 5 });
      
      await UserExperience.create({
        user_id: profile.user_id,
        job_title: faker.person.jobTitle(),
        company: faker.company.name(),
        location: `${faker.location.city()}, ${faker.location.state()}`,
        start_date: new Date(startYear, faker.number.int({ min: 0, max: 11 }), 1),
        end_date: endYear ? new Date(endYear, faker.number.int({ min: 0, max: 11 }), 1) : null,
        is_current: isCurrent,
        description: faker.lorem.paragraph()
      });
      count++;
    }
  }

  console.log(`Created ${count} experience records`);
}

async function seedJobs(companyProfiles) {
  console.log('Seeding jobs...');
  const jobs = [];

  for (const company of companyProfiles) {
    const numJobs = faker.number.int({ min: 2, max: 8 });
    
    for (let i = 0; i < numJobs; i++) {
      const jobSkills = getRandomItems(skills, faker.number.int({ min: 3, max: 8 }));
      const postedDate = faker.date.past({ days: 60 });
      const deadlineDate = new Date(postedDate);
      deadlineDate.setDate(deadlineDate.getDate() + faker.number.int({ min: 15, max: 90 }));
      
      const job = await Job.create({
        company_id: company.user_id,
        title: faker.person.jobTitle(),
        description: faker.lorem.paragraphs(3),
        location: Math.random() > 0.3 ? `${faker.location.city()}, ${faker.location.state()}` : 'Remote',
        type: getRandomItem(jobTypes),
        category: getRandomItem(jobCategories),
        salary_range: `$${faker.number.int({ min: 50, max: 120 })}k - $${faker.number.int({ min: 80, max: 200 })}k`,
        experience_min: faker.number.int({ min: 0, max: 10 }),
        education: getRandomItem(educationLevels),
        skills: JSON.stringify(jobSkills),
        benefits: faker.lorem.paragraph(),
        status: getRandomItem(jobStatuses.filter(s => s !== 'draft')), // Mostly open/approved jobs
        deadline: deadlineDate,
        tags: JSON.stringify(getRandomItems(['Remote', 'Flexible Hours', 'Health Benefits', 'Stock Options', 'Competitive Salary', '401k', 'Paid Time Off'], 3)),
        posted_at: postedDate
      });
      jobs.push(job);
    }
  }

  console.log(`Created ${jobs.length} jobs`);
  return jobs;
}

async function seedJobApplications(jobs, jobSeekerProfiles) {
  console.log('Seeding job applications...');
  let count = 0;

  const openJobs = jobs.filter(j => ['open', 'approved'].includes(j.status));

  for (const profile of jobSeekerProfiles) {
    const numApplications = faker.number.int({ min: 2, max: 10 });
    const appliedJobs = getRandomItems(openJobs, Math.min(numApplications, openJobs.length));
    
    for (const job of appliedJobs) {
      const applicationDate = faker.date.between({ 
        from: job.posted_at, 
        to: job.deadline 
      });
      
      await JobApplication.create({
        job_id: job.id,
        job_seeker_id: profile.user_id,
        resume_url: faker.internet.url(),
        cover_letter: faker.lorem.paragraphs(2),
        status: getRandomItem(applicationStatuses),
        applied_at: applicationDate
      });
      count++;
    }
  }

  console.log(`Created ${count} job applications`);
}

async function seedConversationsAndMessages(users) {
  console.log('Seeding conversations and messages...');
  const companies = users.filter(u => u.role === 'company');
  const jobSeekers = users.filter(u => u.role === 'jobseeker');
  let conversationCount = 0;
  let messageCount = 0;

  for (const company of companies) {
    const numConversations = faker.number.int({ min: 2, max: 6 });
    const participants = getRandomItems(jobSeekers, Math.min(numConversations, jobSeekers.length));
    
    for (const jobSeeker of participants) {
      const conversation = await Conversation.create({
        participant1_id: company.id,
        participant2_id: jobSeeker.id,
        job_id: null,
        title: `Conversation with ${jobSeeker.name}`,
        last_message_at: faker.date.recent({ days: 30 })
      });
      conversationCount++;

      // Add messages to conversation
      const numMessages = faker.number.int({ min: 3, max: 15 });
      for (let i = 0; i < numMessages; i++) {
        const senderId = Math.random() > 0.5 ? company.id : jobSeeker.id;
        const receiverId = senderId === company.id ? jobSeeker.id : company.id;
        
        await Message.create({
          conversation_id: conversation.id,
          sender_id: senderId,
          receiver_id: receiverId,
          content: faker.lorem.sentence(),
          message_type: 'text',
          read: Math.random() > 0.3,
          created_at: faker.date.recent({ days: 30 })
        });
        messageCount++;
      }
    }
  }

  console.log(`Created ${conversationCount} conversations and ${messageCount} messages`);
}

async function seedBookmarks(jobs, jobSeekerProfiles) {
  console.log('Seeding bookmarks...');
  let count = 0;

  for (const profile of jobSeekerProfiles) {
    const numBookmarks = faker.number.int({ min: 1, max: 8 });
    const bookmarkedJobs = getRandomItems(jobs, Math.min(numBookmarks, jobs.length));
    
    for (const job of bookmarkedJobs) {
      await Bookmark.create({
        user_id: profile.user_id,
        job_id: job.id
      });
      count++;
    }
  }

  console.log(`Created ${count} bookmarks`);
}

async function seedNotes(jobSeekerProfiles) {
  console.log('Seeding notes...');
  let count = 0;

  for (const profile of jobSeekerProfiles) {
    const numNotes = faker.number.int({ min: 0, max: 5 });
    
    for (let i = 0; i < numNotes; i++) {
      await Note.create({
        user_id: profile.user_id,
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraphs(2)
      });
      count++;
    }
  }

  console.log(`Created ${count} notes`);
}

async function seedNotifications(users) {
  console.log('Seeding notifications...');
  let count = 0;

  for (const user of users) {
    const numNotifications = faker.number.int({ min: 3, max: 15 });
    
    for (let i = 0; i < numNotifications; i++) {
      const notifType = getRandomItem(['application_status', 'new_message', 'job_posted', 'profile_view', 'bookmark_reminder', 'system']);
      
      await Notification.create({
        user_id: user.id,
        type: notifType,
        title: faker.lorem.sentence(),
        message: faker.lorem.paragraph(),
        read: Math.random() > 0.4,
        action_url: Math.random() > 0.5 ? `/job/${faker.number.int({ min: 1, max: 100 })}` : null,
        created_at: faker.date.recent({ days: 30 })
      });
      count++;
    }
  }

  console.log(`Created ${count} notifications`);
}

async function seedBroadcasts(companies) {
  console.log('Seeding broadcasts...');
  let count = 0;

  for (const company of companies) {
    const numBroadcasts = faker.number.int({ min: 0, max: 3 });
    
    for (let i = 0; i < numBroadcasts; i++) {
      await Broadcast.create({
        company_id: company.user_id,
        title: faker.lorem.sentence(),
        content: faker.lorem.paragraphs(2),
        target_audience: getRandomItem(['all', 'applied', 'conversations']),
        status: getRandomItem(['draft', 'sent', 'scheduled']),
        scheduled_for: Math.random() > 0.7 ? faker.date.future({ days: 30 }) : null,
        sent_at: Math.random() > 0.5 ? faker.date.recent({ days: 30 }) : null
      });
      count++;
    }
  }

  console.log(`Created ${count} broadcasts`);
}

async function seedAll() {
  try {
    console.log('Starting database seeding...\n');
    console.log('Adding test data to existing database...\n');

    // Seed data - this will ADD to existing data, not replace it
    const users = await seedUsers();
    const companyProfiles = await seedCompanyProfiles(users);
    const jobSeekerProfiles = await seedJobSeekerProfiles(users);
    await seedEducation(jobSeekerProfiles);
    await seedExperience(jobSeekerProfiles);
    const jobs = await seedJobs(companyProfiles);
    await seedJobApplications(jobs, jobSeekerProfiles);
    await seedConversationsAndMessages(users);
    await seedBookmarks(jobs, jobSeekerProfiles);
    await seedNotes(jobSeekerProfiles);
    await seedNotifications(users);
    await seedBroadcasts(companyProfiles);

    console.log('\n✅ Database seeding completed successfully!');
    console.log('\nNew login credentials added:');
    console.log('Admin: admin@jobhub.com / 12345678');
    console.log('All new users: [their email] / 12345678');
    
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seeder
seedAll()
  .then(() => {
    console.log('Seeding finished');
    process.exit(0);
  })
  .catch(error => {
    console.error('Seeding failed:', error);
    process.exit(1);
  });

module.exports = { seedAll };
