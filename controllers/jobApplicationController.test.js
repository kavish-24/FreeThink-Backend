/**
 * Test file for scoreResume()
 * Run with: node testScoreResume.js
 */

// -------------------- MOCKS & CONFIG --------------------

// Simulate environment
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-api-key'; // comment this to test missing key case

global.fetch = async (url, options) => {
  console.log('\nMock fetch called');
  console.log('URL:', url);
  console.log('Payload:', JSON.parse(options.body));

  // ✅ SUCCESS MOCK
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: `
SCORE: 78
FEEDBACK:
- Strong JavaScript fundamentals
- Lacks system design depth
- Resume formatting can be improved
`
          }
        }
      ]
    })
  };

  // ❌ FAILURE MOCK (uncomment to test error handling)
  /*
  return {
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error'
  };
  */
};

const OPENROUTER_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'openai/gpt-4o-mini',
  maxTokens: 500,
  temperature: 0.3,
};

// -------------------- HELPERS --------------------

function createScoringPrompt(job) {
  return `
Evaluate the resume for the following job:

Job Title: ${job.title}
Skills Required: ${job.skills.join(', ')}

Resume:
{{RESUME_TEXT}}

Return:
SCORE: <number 0-100>
FEEDBACK: <text>
`;
}

function parseAIResponse(text) {
  const scoreMatch = text.match(/SCORE:\s*(\d+)/i);
  const feedbackMatch = text.match(/FEEDBACK:\s*([\s\S]*)/i);

  return {
    score: scoreMatch ? Number(scoreMatch[1]) : null,
    feedback: feedbackMatch ? feedbackMatch[1].trim() : 'No feedback'
  };
}

// -------------------- FUNCTION UNDER TEST --------------------

async function scoreResume(resumeText, job) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('OPENROUTER_API_KEY not found, skipping AI scoring');
    return { score: null, feedback: 'AI scoring not configured' };
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

    console.log('\nAI Raw Response:\n', aiResponse);

    const result = parseAIResponse(aiResponse);
    return result;

  } catch (error) {
    console.error('Error scoring resume:', error.message);
    return { score: null, feedback: 'Scoring failed due to technical error' };
  }
}

// -------------------- TEST RUNNER --------------------

(async () => {
  const fakeResume = `
Frontend Developer with 3 years experience.
Skills: JavaScript, React, Node.js
Worked on scalable web applications.
`;

  const fakeJob = {
    title: 'Frontend Engineer',
    skills: ['JavaScript', 'React', 'HTML', 'CSS']
  };

  console.log('\n===== RUNNING scoreResume TEST =====');

  const result = await scoreResume(fakeResume, fakeJob);

  console.log('\n===== FINAL RESULT =====');
  console.log(result);
})();
