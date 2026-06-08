require("dotenv").config();
const prisma = require("../src/config/db");
const jwt = require("jsonwebtoken");
const axios = require("axios");

// Start the server on a unique port
process.env.PORT = 5999;
const app = require("../src/server");

async function runVerification() {
  console.log("=== STARTING ROUTE VERIFICATION ===");

  // Find or create trainer
  let trainer = await prisma.user.findFirst({
    where: { email: "verify_trainer@lurnstack.com" }
  });
  if (!trainer) {
    trainer = await prisma.user.create({
      data: {
        fullName: "Verify Route Trainer",
        email: "verify_trainer@lurnstack.com",
        password: "password123",
        role: "TRAINER",
        isActive: true
      }
    });
  } else {
    // Cleanup
    await prisma.trainerPayoutRequestHistory.deleteMany({ where: { trainerId: trainer.id } });
    await prisma.trainerPayoutRequest.deleteMany({ where: { trainerId: trainer.id } });
    await prisma.trainerPayoutAccountHistory.deleteMany({ where: { trainerId: trainer.id } });
    await prisma.trainerPayoutAccount.deleteMany({ where: { trainerId: trainer.id } });
  }

  const token = jwt.sign(
    { id: trainer.id, role: "TRAINER" },
    process.env.JWT_SECRET
  );

  const client = axios.create({
    baseURL: "http://localhost:5999",
    headers: {
      Authorization: `Bearer ${token}`
    },
    validateStatus: () => true // Don't throw on 4xx/5xx
  });

  // Test 1: GET /api/trainer/payment-summary
  console.log("\n1. GET /api/trainer/payment-summary");
  const resSummary = await client.get("/api/trainer/payment-summary");
  console.log("Status:", resSummary.status);
  console.log("Body:", JSON.stringify(resSummary.data, null, 2));
  if (resSummary.status !== 200) {
    throw new Error(`payment-summary returned status ${resSummary.status}`);
  }

  // Test 2: GET /api/trainer/session-earnings?limit=100
  console.log("\n2. GET /api/trainer/session-earnings?limit=100");
  const resEarnings = await client.get("/api/trainer/session-earnings?limit=100");
  console.log("Status:", resEarnings.status);
  console.log("Body:", JSON.stringify(resEarnings.data, null, 2));
  if (resEarnings.status !== 200) {
    throw new Error(`session-earnings returned status ${resEarnings.status}`);
  }

  // Test 3: GET /api/trainer/payout-account
  console.log("\n3. GET /api/trainer/payout-account");
  const resAccountGet = await client.get("/api/trainer/payout-account");
  console.log("Status:", resAccountGet.status);
  console.log("Body:", JSON.stringify(resAccountGet.data, null, 2));
  if (resAccountGet.status !== 200) {
    throw new Error(`payout-account GET returned status ${resAccountGet.status}`);
  }

  // Test 4: POST /api/trainer/payout-account
  console.log("\n4. POST /api/trainer/payout-account");
  const payload = {
    accountHolderName: "Verify Route Trainer",
    bankName: "HDFC Bank",
    accountNumber: "123456789012",
    confirmAccountNumber: "123456789012",
    ifscCode: "HDFC0001234", // testing alias
    panNumber: "ABCDE1234F",  // testing alias
    phoneNumber: "9876543210"
  };
  const resAccountPost = await client.post("/api/trainer/payout-account", payload);
  console.log("Status:", resAccountPost.status);
  console.log("Body:", JSON.stringify(resAccountPost.data, null, 2));
  if (resAccountPost.status !== 201 && resAccountPost.status !== 200) {
    throw new Error(`payout-account POST returned status ${resAccountPost.status}`);
  }

  // Test 5: GET /api/trainer/payout-account again (should be found now)
  console.log("\n5. GET /api/trainer/payout-account (after create)");
  const resAccountGet2 = await client.get("/api/trainer/payout-account");
  console.log("Status:", resAccountGet2.status);
  console.log("Body:", JSON.stringify(resAccountGet2.data, null, 2));
  if (resAccountGet2.status !== 200) {
    throw new Error(`payout-account GET after create returned status ${resAccountGet2.status}`);
  }

  // Test 6: PATCH /api/trainer/payout-account
  console.log("\n6. PATCH /api/trainer/payout-account");
  const patchPayload = {
    panNumber: "XYZ123456"
  };
  const resAccountPatch = await client.patch("/api/trainer/payout-account", patchPayload);
  console.log("Status:", resAccountPatch.status);
  console.log("Body:", JSON.stringify(resAccountPatch.data, null, 2));
  if (resAccountPatch.status !== 200) {
    throw new Error(`payout-account PATCH returned status ${resAccountPatch.status}`);
  }

  // Clean up
  console.log("\nCleaning up test data...");
  await prisma.trainerPayoutAccountHistory.deleteMany({ where: { trainerId: trainer.id } });
  await prisma.trainerPayoutAccount.deleteMany({ where: { trainerId: trainer.id } });
  await prisma.user.delete({ where: { id: trainer.id } });

  console.log("\n=== VERIFICATION COMPLETED SUCCESSFULLY! ===");
  process.exit(0);
}

// Wait a bit for Prisma self-healing check inside server.js to run
setTimeout(() => {
  runVerification().catch(err => {
    console.error("Verification failed:", err);
    process.exit(1);
  });
}, 2000);
