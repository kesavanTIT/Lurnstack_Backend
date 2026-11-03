const https = require("https");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const secret = process.env.JWT_SECRET || "lurnstack_super_secret_jwt_key_2024";

async function checkIds() {
  for (let id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 20, 25, 30, 40, 44, 45, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 70, 80, 90, 100]) {
    const token = jwt.sign({ id, role: "TRAINER" }, secret, { expiresIn: "1h" });
    const r = await new Promise(resolve => {
      const req = https.request({
        hostname: "api.lurnstack.com",
        path: "/api/trainer/sessions",
        method: "GET",
        headers: { Authorization: `Bearer ${token}` }
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => resolve({ code: res.statusCode, body: d }));
      });
      req.on("error", e => resolve({ err: e.message }));
      req.end();
    });
    if (r.code === 200) {
      try {
        const j = JSON.parse(r.body);
        if (j.data && j.data.length > 0) {
          console.log(`FOUND ID ${id}: count=${j.data.length}, first="${j.data[0].title}", trainer="${j.data[0].trainerName}"`);
        }
      } catch {}
    } else {
      console.log(`ID ${id} failed: ${r.code}`);
    }
  }
}

checkIds();
