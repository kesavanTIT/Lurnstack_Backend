require("dotenv").config();
const prisma = require('../src/config/db');
const { handleAIChat } = require('../src/controllers/aiController');

async function testFullAIChat() {
  const student = await prisma.user.findFirst({
    where: { role: 'STUDENT' }
  });

  if (!student) {
    console.log("No student user found in DB!");
    return;
  }

  console.log("Testing handleAIChat with student:", student.id, student.fullName);

  const req = {
    body: {
      message: "hiii what is django",
      history: [],
      context: {}
    },
    user: {
      id: student.id,
      role: student.role
    }
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      console.log("\n=== CONTROLLER RESPONSE ===");
      console.log("STATUS CODE:", this.statusCode);
      console.log("DATA:", JSON.stringify(data, null, 2));
      return this;
    }
  };

  await handleAIChat(req, res);
}

testFullAIChat().finally(() => prisma.$disconnect());
