const prisma = require('../src/config/db');
const studentController = require('../src/controllers/studentController');

async function test() {
  console.log("✅ studentController.js imported successfully!");
}

test().catch(err => {
  console.error("❌ Test error:", err);
}).finally(() => {
  prisma.$disconnect();
});
