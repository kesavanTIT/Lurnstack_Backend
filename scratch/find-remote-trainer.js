const https = require("https");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const secret = process.env.JWT_SECRET || "lurnstack_super_secret_jwt_key_2024";

async function testTrainerId(id) {
  const token = jwt.sign({ id, role: "TRAINER" }, secret, { expiresIn: "1h" });
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "api.lurnstack.com",
      path: "/api/trainer/sessions",
      method: "GET",
      headers: { Authorization: `Bearer ${token}` }
    }, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const body = JSON.parse(data);
          if (body.success && body.data && body.data.length > 0) {
            console.log(`>>> MATCH FOUND for user ID ${id}! Sessions count: ${body.data.length}`);
            console.log(`Trainer name: ${body.data[0].trainerName}, email: ${body.data[0].trainerEmail}`);
            body.data.forEach(s => console.log(`  - [${s.id}] ${s.title} (${s.targetAudience})`));
            resolve({ found: true, id, data: body.data });
          } else {
            resolve({ found: false, id });
          }
        } catch { resolve({ found: false, id }); }
      });
    });
    req.on("error", () => resolve({ found: false, id }));
    req.end();
  });
}

async function findTrainer() {
  console.log("Searching for Nivetha Rajam's user ID on remote server...");
  for (let id = 1; id <= 60; id++) {
    const res = await testTrainerId(id);
    if (res.found) break;
  }
}

findTrainer();
