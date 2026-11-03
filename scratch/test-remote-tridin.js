const jwt = require("jsonwebtoken");
const axios = require("axios");
const prisma = require("../src/config/db");
require("dotenv").config();

async function testLiveApi() {
  const user = await prisma.user.findFirst({
    where: {
      fullName: { contains: "Kesava", mode: "insensitive" }
    }
  });

  console.log("Found user:", user ? { id: user.id, email: user.email, role: user.role } : "None");
  if (!user) return;

  const secret = process.env.JWT_SECRET || "your-secret-key";
  const token = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    secret,
    { expiresIn: "7d" }
  );

  console.log("Testing https://api.lurnstack.com/api/tridin/live-sessions with token...");
  try {
    const res = await axios.get("https://api.lurnstack.com/api/tridin/live-sessions", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    console.log("Response status:", res.status);
    console.log("Response data:", JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.log("API Error status:", err.response?.status);
    console.log("API Error data:", err.response?.data);
  }
}

testLiveApi()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
