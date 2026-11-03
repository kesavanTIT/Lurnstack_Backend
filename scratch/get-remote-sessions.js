const https = require("https");
const jwt = require("jsonwebtoken");
const prisma = require("../src/config/db");
require("dotenv").config();

async function getFullTridinSessions() {
  const candidate = await prisma.user.findFirst({
    where: { fullName: { contains: "Kesava", mode: "insensitive" } },
    select: { id: true, email: true, role: true, fullName: true }
  });

  const secret = process.env.JWT_SECRET || "lurnstacksecret2024";
  const token = jwt.sign({ id: candidate.id, email: candidate.email, role: candidate.role }, secret, { expiresIn: "1d" });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.lurnstack.com",
      path: "/api/tridin/live-sessions",
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const body = JSON.parse(data);
          const sessions = body.sessions || body.data || [];
          console.log(`Remote /api/tridin/live-sessions: ${sessions.length} sessions\n`);
          sessions.forEach(s => {
            console.log(`  ID: ${s.id}`);
            console.log(`  Title: ${s.title}`);
            console.log(`  meetingLink: "${s.meetingLink}"`);
            console.log(`  meetUrl: "${s.meetUrl}"`);
            console.log(`  targetAudience: ${s.targetAudience}`);
            console.log(`  isTridinOnly: ${s.isTridinOnly}`);
            console.log(`  status: ${s.status}`);
            console.log(`  ---`);
          });
          resolve();
        } catch(e) { console.log("Raw:", data.slice(0, 500)); resolve(); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

getFullTridinSessions().catch(console.error).finally(() => prisma.$disconnect());
