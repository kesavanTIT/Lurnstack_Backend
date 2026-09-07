require("dotenv").config();
const axios = require("axios");

async function testGemini() {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  console.log("GEMINI_API_KEY present:", !!GEMINI_API_KEY);
  if (GEMINI_API_KEY) {
    console.log("Key length:", GEMINI_API_KEY.length);
    console.log("Key prefix:", GEMINI_API_KEY.substring(0, 6) + "...");
  }

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent";
    console.log("Testing URL:", url);

    const response = await axios.post(
      url,
      {
        contents: [
          {
            role: "user",
            parts: [{ text: "Hello" }]
          }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": GEMINI_API_KEY || ""
        }
      }
    );

    console.log("Status:", response.status);
    console.log("Data:", JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error("Error status:", error.response?.status);
    console.error("Error data:", JSON.stringify(error.response?.data, null, 2) || error.message);
  }
}

testGemini();
