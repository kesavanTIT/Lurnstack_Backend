require("dotenv").config();
const axios = require("axios");

const modelsToTest = [
  "gemini-3.6-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest"
];

async function testModels() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const prompt = "Hello! Answer in 1 sentence.";

  for (const model of modelsToTest) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    try {
      const res = await axios.post(
        url,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }]
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": GEMINI_API_KEY
          }
        }
      );
      console.log(`[SUCCESS] Model: ${model} | Status: ${res.status}`);
    } catch (err) {
      console.log(`[FAILED] Model: ${model} | Code: ${err.response?.status} | Message: ${JSON.stringify(err.response?.data || err.message)}`);
    }
  }
}

testModels();
