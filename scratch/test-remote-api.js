const https = require("https");
const jwt = require("jsonwebtoken");
const prisma = require("../src/config/db");
require("dotenv").config();

async function testRemoteAPI() {
  // Get Nivetha Rajam's user record for trainer token
  const trainer = await prisma.user.findFirst({
    where: { fullName: { contains: "Nivetha", mode: "insensitive" } },
    select: { id: true, email: true, role: true, fullName: true }
  });

  // Get Kesavamoorthy for tridin candidate token
  const candidate = await prisma.user.findFirst({
    where: { fullName: { contains: "Kesava", mode: "insensitive" } },
    select: { id: true, email: true, role: true, fullName: true }
  });

  console.log("Trainer:", trainer?.fullName, trainer?.role);
  console.log("Candidate:", candidate?.fullName, candidate?.role);

  const secret = process.env.JWT_SECRET || "lurnstacksecret2024";

  function makeToken(user) {
    return jwt.sign({ id: user.id, email: user.email, role: user.role }, secret, { expiresIn: "1d" });
  }

  function callApi(path, token) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.lurnstack.com",
        path,
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      });
      req.on("error", reject);
      req.end();
    });
  }

  if (candidate) {
    const candidateToken = makeToken(candidate);
    console.log("\n=== Calling REMOTE /api/tridin/live-sessions as candidate ===");
    const r = await callApi("/api/tridin/live-sessions", candidateToken);
    console.log("Status:", r.status);
    console.log("Sessions count:", r.body?.sessions?.length ?? r.body?.count ?? "N/A");
    if (r.body?.sessions) {
      r.body.sessions.forEach(s => {
        console.log(`  - ${s.title}: targetAudience=${s.targetAudience}, isTridinOnly=${s.isTridinOnly}, meetingLink=${s.meetingLink ? "YES" : "NO"}`);
      });
    } else {
      console.log("Response:", JSON.stringify(r.body).slice(0, 300));
    }
  }

  if (trainer) {
    const trainerToken = makeToken(trainer);
    console.log("\n=== Calling REMOTE /api/trainer/sessions as trainer ===");
    const r2 = await callApi("/api/trainer/sessions?page=1&limit=10", trainerToken);
    console.log("Status:", r2.status);
    if (r2.body?.sessions) {
      r2.body.sessions.slice(0, 5).forEach(s => {
        console.log(`  - ${s.title}: targetAudience=${s.targetAudience}, isTridinOnly=${s.isTridinOnly}`);
      });
    } else {
      console.log("Response:", JSON.stringify(r2.body).slice(0, 300));
    }
  }
}

testRemoteAPI().catch(console.error).finally(() => prisma.$disconnect());
