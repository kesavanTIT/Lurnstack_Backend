const https = require("https");
const jwt = require("jsonwebtoken");
const prisma = require("../src/config/db");
require("dotenv").config();

async function checkVersion() {
  const candidate = await prisma.user.findFirst({
    where: { fullName: { contains: "Kesava", mode: "insensitive" } },
    select: { id: true, email: true, role: true }
  });

  const secret = process.env.JWT_SECRET || "lurnstacksecret2024";
  const token = jwt.sign({ id: candidate.id, email: candidate.email, role: candidate.role }, secret, { expiresIn: "1d" });

  return new Promise((resolve) => {
    const options = {
      hostname: "api.lurnstack.com",
      path: "/api/tridin/live-sessions",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        const body = JSON.parse(data);
        const sessions = body.sessions || [];
        console.log(`Sessions count: ${sessions.length}`);
        if (sessions.length > 0) {
          const first = sessions[0];
          // Check ALL fields returned
          console.log("\nFirst session full response keys:", Object.keys(first));
          console.log("targetAudience value:", first.targetAudience);
          console.log("isTridinOnly value:", first.isTridinOnly);
          console.log("meetingLink value:", JSON.stringify(first.meetingLink));
          console.log("title:", first.title);
        }
        resolve();
      });
    });
    req.on("error", e => { console.error(e); resolve(); });
    req.end();
  });
}

checkVersion().catch(console.error).finally(() => prisma.$disconnect());
