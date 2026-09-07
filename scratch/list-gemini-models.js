require("dotenv").config();
const axios = require("axios");

async function listModels() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  try {
    const res = await axios.get(url);
    console.log("Available models:");
    const models = res.data.models || [];
    models.forEach(m => {
      if (m.supportedGenerationMethods?.includes("generateContent")) {
        console.log(`- ${m.name.replace("models/", "")} (${m.displayName})`);
      }
    });
  } catch (err) {
    console.error("Error listing models:", err.response?.data || err.message);
  }
}

listModels();
