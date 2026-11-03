const https = require("https");
const jwt = require("jsonwebtoken");
const prisma = require("../src/config/db");
require("dotenv").config();

async function main() {
  const trainers = await prisma.user.findMany({
    where: { role: "TRAINER" },
    select: { id: true, email: true, fullName: true, role: true }
  });
  console.log("Trainers found in DB:", trainers);

  if (trainers.length === 0) return;
  const trainer = trainers[0];

  const secret = process.env.JWT_SECRET || "lurnstacksecret2024";
  const token = jwt.sign({ id: trainer.id, email: trainer.email, role: trainer.role }, secret, { expiresIn: "1d" });

  const options = {
    hostname: "api.lurnstack.com",
    path: "/api/trainer/sessions",
    method: "GET",
    headers: { Authorization: `Bearer ${token}` }
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", c => data += c);
    res.on("end", () => {
      console.log("Status:", res.statusCode);
      try {
        const body = JSON.parse(data);
        console.log("Body success:", body.success);
        const list = body.data || body.sessions || [];
        console.log("Found sessions count:", list.length);
        list.forEach(s => {
          console.log(`Session: "${s.title}" (${s.id})`);
          console.log(`  targetAudience: ${s.targetAudience}, isTridinOnly: ${s.isTridinOnly}`);
        });
      } catch (e) {
        console.log("Raw body:", data.slice(0, 300));
      }
    });
  });
  req.on("error", console.error);
  req.end();
}

main().finally(() => prisma.$disconnect());
