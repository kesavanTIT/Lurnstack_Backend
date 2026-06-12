require("dotenv").config();
const prisma = require("../src/config/db");
const { handleAIChat } = require("../src/controllers/aiController");

async function runTest() {
  console.log("🔍 Running AI Chat Controller integration test...");

  // Find a student from the database
  const student = await prisma.user.findFirst({
    where: { role: "STUDENT" }
  });

  if (!student) {
    console.error("❌ No student found in the database. Can't run test.");
    process.exit(1);
  }

  console.log(`👤 Found student: ${student.fullName} (ID: ${student.id})`);

  // Mock req and res
  const req = {
    user: {
      id: student.id,
      role: "STUDENT"
    },
    body: {
      message: "How do I join my live class?",
      history: [],
      context: {
        pathname: "/dashboard",
        search: "?view=paid",
        pageUrl: "/dashboard?view=paid",
        user: {
          fullName: student.fullName,
          role: "student"
        }
      }
    }
  };

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      console.log("\n📥 Response Code:", this.statusCode);
      console.log("📥 Response Body:\n", JSON.stringify(data, null, 2));
      process.exit(0);
    }
  };

  try {
    await handleAIChat(req, res);
  } catch (error) {
    console.error("❌ Test failed with error:", error);
    process.exit(1);
  }
}

runTest();
