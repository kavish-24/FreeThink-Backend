const axios = require('axios');

const API_KEY = "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";

async function testQwen() {
  try {
    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "qwen/qwen-2.5-72b-instruct",
      messages: [
        {
          role: "user",
          content: "Hello, test if API key works."
        }
      ]
    }, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      }
    });

    console.log("Success:", response.data);
  } catch (err) {
    console.error("API key test failed:", err.response?.data || err.message);
  }
}

testQwen();
