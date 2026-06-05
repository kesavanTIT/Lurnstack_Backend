const prisma = require("../src/config/db");
const { getTrainerStatus } = require("../src/controllers/trainerSessionController");

async function runTests() {
  console.log("Running getTrainerStatus unit tests...");

  // Mock response builder
  const mockRes = () => {
    const res = {};
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.body = data;
      return res;
    };
    return res;
  };

  // Setup temporary test user in database
  // Find or create a trainer user
  let testTrainer = await prisma.user.findFirst({
    where: { email: "test_trainer@lurnstack.com" }
  });
  if (!testTrainer) {
    testTrainer = await prisma.user.create({
      data: {
        fullName: "Test Trainer",
        email: "test_trainer@lurnstack.com",
        password: "hashedpassword123",
        role: "TRAINER",
        isActive: true
      }
    });
  } else {
    // Ensure active
    await prisma.user.update({
      where: { id: testTrainer.id },
      data: { isActive: true, role: "TRAINER" }
    });
  }

  // Test Case 1: Logged in user is not a trainer (e.g. STUDENT)
  {
    const req = {
      user: {
        id: testTrainer.id,
        role: "STUDENT"
      }
    };
    const res = mockRes();
    await getTrainerStatus(req, res);
    console.log("Test Case 1 (STUDENT user) Status:", res.statusCode);
    console.log("Test Case 1 (STUDENT user) Response:", res.body);
    if (res.statusCode !== 403) throw new Error("Expected 403 for non-trainer user");
  }

  // Test Case 2: Trainer exists and is active
  {
    const req = {
      user: {
        id: testTrainer.id,
        role: "TRAINER"
      }
    };
    const res = mockRes();
    await getTrainerStatus(req, res);
    console.log("Test Case 2 (Active Trainer) Status:", res.statusCode);
    console.log("Test Case 2 (Active Trainer) Response:", res.body);
    if (res.statusCode !== 200 || !res.body.success || res.body.data.isActive !== true) {
      throw new Error("Expected 200 and success with isActive: true");
    }
  }

  // Test Case 3: Trainer is inactive
  {
    await prisma.user.update({
      where: { id: testTrainer.id },
      data: { isActive: false }
    });

    const req = {
      user: {
        id: testTrainer.id,
        role: "TRAINER"
      }
    };
    const res = mockRes();
    await getTrainerStatus(req, res);
    console.log("Test Case 3 (Inactive Trainer) Status:", res.statusCode);
    console.log("Test Case 3 (Inactive Trainer) Response:", res.body);
    if (res.statusCode !== 200 || !res.body.success || res.body.data.isActive !== false) {
      throw new Error("Expected 200 and success with isActive: false");
    }
  }

  // Clean up
  await prisma.user.delete({
    where: { id: testTrainer.id }
  });

  console.log("All tests passed successfully! 🎉");
}

runTests()
  .catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
