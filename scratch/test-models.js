require("dotenv").config();
const axios = require("axios");

const modelsToTest = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-flash-latest",
  "gemini-1.5-pro"
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
      console.log(`[FAILED] Model: ${model} | Code: ${err.response?.status} | Message: ${err.response?.data?.error?.message || err.message}`);
    }
  }
}

testModels();
