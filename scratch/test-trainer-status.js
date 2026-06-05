require("dotenv").config();
const prisma = require("../src/config/db");
const jwt = require("jsonwebtoken");
const { loginUser } = require("../src/controllers/authController");
const { getTrainerStatus } = require("../src/controllers/trainerSessionController");

async function runTests() {
  console.log("Running comprehensive trainer auth and status tests...");

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

  // Find or create test trainer user
  let testTrainer = await prisma.user.findFirst({
    where: { email: "test_trainer@lurnstack.com" }
  });
  const bcrypt = require("bcryptjs");
  const salt = await bcrypt.genSalt(12);
  const hashedPassword = await bcrypt.hash("TrainerPassword123!", salt);

  if (!testTrainer) {
    testTrainer = await prisma.user.create({
      data: {
        fullName: "Test Trainer",
        email: "test_trainer@lurnstack.com",
        password: hashedPassword,
        role: "TRAINER",
        isActive: true
      }
    });
  } else {
    await prisma.user.update({
      where: { id: testTrainer.id },
      data: { isActive: true, role: "TRAINER", password: hashedPassword }
    });
  }

  // Find or create test student user
  let testStudent = await prisma.user.findFirst({
    where: { email: "test_student@lurnstack.com" }
  });
  if (!testStudent) {
    testStudent = await prisma.user.create({
      data: {
        fullName: "Test Student",
        email: "test_student@lurnstack.com",
        password: hashedPassword,
        role: "STUDENT",
        isActive: true
      }
    });
  } else {
    await prisma.user.update({
      where: { id: testStudent.id },
      data: { isActive: true, role: "STUDENT", password: hashedPassword }
    });
  }

  // ── TEST CASE 1: Trainer logs in with role/ROLE/userRole = "TRAINER" ──
  {
    console.log("\n--- Test Case 1: Trainer Login with role = 'TRAINER' ---");
    const req = {
      body: {
        email: "test_trainer@lurnstack.com",
        password: "TrainerPassword123!",
        role: "TRAINER"
      }
    };
    const res = mockRes();
    await loginUser(req, res);

    console.log("Status Code:", res.statusCode);
    console.log("Response Body:", res.body);

    if (res.statusCode !== 200) throw new Error("Expected status 200");
    if (!res.body.success) throw new Error("Expected success: true");
    if (res.body.user.role !== "trainer") throw new Error("Expected user.role to be lowercase 'trainer'");
    
    // Decode token to verify payload
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    console.log("Decoded JWT Payload:", decoded);
    if (decoded.role !== "trainer") throw new Error("Expected JWT role to be lowercase 'trainer'");
  }

  // ── TEST CASE 2: Active trainer logs in without specifying role (should still return 'trainer' token) ──
  {
    console.log("\n--- Test Case 2: Active Trainer Login without role parameter ---");
    const req = {
      body: {
        email: "test_trainer@lurnstack.com",
        password: "TrainerPassword123!"
      }
    };
    const res = mockRes();
    await loginUser(req, res);

    console.log("Status Code:", res.statusCode);
    console.log("Response Body:", res.body);

    if (res.statusCode !== 200) throw new Error("Expected status 200");
    if (res.body.user.role !== "trainer") throw new Error("Expected user.role to be lowercase 'trainer'");
    
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    if (decoded.role !== "trainer") throw new Error("Expected JWT role to be lowercase 'trainer'");
  }

  // ── TEST CASE 3: Student trying to log in requesting role = "TRAINER" (should fail with 403) ──
  {
    console.log("\n--- Test Case 3: Student Login requesting role = 'TRAINER' ---");
    const req = {
      body: {
        email: "test_student@lurnstack.com",
        password: "TrainerPassword123!",
        userRole: "TRAINER"
      }
    };
    const res = mockRes();
    await loginUser(req, res);

    console.log("Status Code:", res.statusCode);
    console.log("Response Body:", res.body);

    if (res.statusCode !== 403) throw new Error("Expected status 403");
  }

  // ── TEST CASE 4: GET /api/trainer/status accepts lowercase 'trainer' token ──
  {
    console.log("\n--- Test Case 4: getTrainerStatus with lowercase 'trainer' JWT role ---");
    const token = jwt.sign(
      { id: testTrainer.id, role: "trainer" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    
    // Simulate authMiddleware attaching req.user
    const req = {
      user: jwt.verify(token, process.env.JWT_SECRET)
    };
    const res = mockRes();
    await getTrainerStatus(req, res);

    console.log("Status Code:", res.statusCode);
    console.log("Response Body:", res.body);

    if (res.statusCode !== 200) throw new Error("Expected status 200");
    if (res.body.data.isActive !== true) throw new Error("Expected isActive: true");
  }

  // ── TEST CASE 5: GET /api/trainer/status rejects STUDENT role ──
  {
    console.log("\n--- Test Case 5: getTrainerStatus rejects STUDENT role ---");
    const token = jwt.sign(
      { id: testStudent.id, role: "STUDENT" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    
    const req = {
      user: jwt.verify(token, process.env.JWT_SECRET)
    };
    const res = mockRes();
    await getTrainerStatus(req, res);

    console.log("Status Code:", res.statusCode);
    console.log("Response Body:", res.body);

    if (res.statusCode !== 403) throw new Error("Expected status 403");
  }

  // Clean up
  await prisma.user.deleteMany({
    where: {
      email: {
        in: ["test_trainer@lurnstack.com", "test_student@lurnstack.com"]
      }
    }
  });

  console.log("\nAll comprehensive tests passed successfully! 🎉");
}

runTests()
  .catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
